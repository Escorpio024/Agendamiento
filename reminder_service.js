/**
 * SERVICIO DE RECORDATORIOS v2
 * ─────────────────────────────────────────────────────────────
 * Fixes aplicados:
 *  1. Envía solo 1 recordatorio por cita (deduplicación por clave única)
 *  2. Lee TODAS las citas (bot + Xenco) desde TMCITASUSUARIOS
 *  3. Busca teléfono desde TKCLIENTESANEXO5 (fuente real de Xenco)
 *     → fallback a TMUSUARIOSFACTURACION → TMUSUARIOSASEGURAMIENTO
 *  4. Corre UNA vez al día a las 9 AM (no cada hora)
 *  5. Fix: variables phone/telefono → whatsappId (evitaba crash silencioso)
 */
const fs        = require('fs');
const path      = require('path');
const prisma    = require('./db');
const botPrisma = require('./dbBot');  // SQLite del bot (conversaciones WhatsApp reales)
const cron      = require('node-cron');
const logger    = require('./logger');

class ReminderService {
    constructor() {
        this.client = null;
        this.isRunning = false;
        // Claves de recordatorios ya enviados hoy: "COD-FCH-HH-MM"
        // Se limpia automáticamente a medianoche
        this.sentToday = new Set();
        this.sentFilePath = path.join(__dirname, 'sent_reminders.json');
        this.loadSentReminders();
    }

    loadSentReminders() {
        try {
            if (fs.existsSync(this.sentFilePath)) {
                const data = JSON.parse(fs.readFileSync(this.sentFilePath, 'utf8'));
                // Verificar si es del mismo día
                const today = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
                if (data.date === today && Array.isArray(data.sent)) {
                    this.sentToday = new Set(data.sent);
                    logger.info(`[Recordatorios] Cargados ${this.sentToday.size} recordatorios previamente enviados hoy.`);
                }
            }
        } catch(e) {
            logger.warn(`[Recordatorios] No se pudo cargar sent_reminders.json: ${e.message}`);
        }
    }

    saveSentReminders() {
        try {
            const today = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
            const data = {
                date: today,
                sent: Array.from(this.sentToday)
            };
            fs.writeFileSync(this.sentFilePath, JSON.stringify(data));
        } catch(e) {
            logger.warn(`[Recordatorios] No se pudo guardar sent_reminders.json: ${e.message}`);
        }
    }

    init(whatsappClient) {
        this.client = whatsappClient;

        // En modo NO_WHATSAPP no hay cliente real — no iniciar el scheduler
        if (!whatsappClient) {
            logger.warn('[Recordatorios] NO_WHATSAPP=true — scheduler de recordatorios desactivado.');
            return;
        }

        this.startScheduler();
        logger.info('✅ Servicio de recordatorios v2 iniciado (9 AM + 6 PM, sin duplicados)');
    }

    setClient(whatsappClient) {
        this.client = whatsappClient;
    }

    startScheduler() {
        if (this.isRunning) return;

        // Zona horaria del servidor — verificar que sea America/Bogota en la VM
        const tzOffset = new Date().toLocaleTimeString('es-CO', { timeZoneName: 'short' });
        logger.info(`[Recordatorios] Cron activo. Hora del servidor: ${tzOffset}`);

        // ── 8 AM diariamente — enviar recordatorios del día siguiente ──
        cron.schedule('0 8 * * *', async () => {
            logger.info('🔔 [Recordatorios] Envío automático diario a las 8 AM...');
            await this.sendReminders();
        });

        // ── Medianoche — limpiar deduplicación ──
        cron.schedule('0 0 * * *', () => {
            this.sentToday.clear();
            this.saveSentReminders();
            logger.debug('[Recordatorios] Set de deduplicación limpiado para el nuevo día.');
        });

        this.isRunning = true;
    }

    /** Calcular la fecha de mañana en formato decimal YYYYMMDD */
    getTomorrowDecimal() {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return parseInt(`${y}${m}${day}`);
    }

    /** Buscar el teléfono del paciente usando las 3 fuentes disponibles */
    async getPhoneForPatient(codigoPac) {
        if (!codigoPac || !codigoPac.trim()) return null;
        const cod = codigoPac.trim();
        const codSinCeros = cod.replace(/^0+/, '');

        // 1ª fuente: TKCLIENTESANEXO5 (celular real de Xenco — la más confiable)
        try {
            const kc5 = await prisma.tKCLIENTESANEXO5.findFirst({
                where: { KC5_RACOD_CLI: { in: [cod, codSinCeros] } }
            });
            const tel5 = kc5?.KC5_TEL_CEL?.trim();
            if (tel5 && !/^0+$/.test(tel5) && tel5.replace(/\D/g, '').length >= 7) {
                return tel5.replace(/\D/g, '');
            }
        } catch (_) {}

        // 2ª fuente: TMUSUARIOSFACTURACION
        try {
            const fact = await prisma.tMUSUARIOSFACTURACION.findFirst({
                where: { OR: [{ KC2_COD: cod }, { KC2_OACOD_NUI: codSinCeros }] },
                orderBy: { KC2_FCH_DIG: 'desc' }
            });
            let tel2 = fact?.KC2_TEL_RESP?.trim();
            if (!tel2 || /^0+$/.test(tel2) || tel2.replace(/\D/g, '').length < 7) {
                tel2 = fact?.KC2_TEL_ACOMP?.trim();
            }
            if (tel2 && !/^0+$/.test(tel2) && tel2.replace(/\D/g, '').length >= 7) {
                return tel2.replace(/\D/g, '');
            }
        } catch (_) {}

        // 3ª fuente: TMUSUARIOSASEGURAMIENTO
        try {
            const aseg = await prisma.paciente.findFirst({ where: { KC0_COD: cod } });
            const tel3 = aseg?.KC0_RES_TEL?.trim();
            if (tel3 && !/^0+$/.test(tel3) && tel3.replace(/\D/g, '').length >= 7) {
                return tel3.replace(/\D/g, '');
            }
        } catch (_) {}

        return null;
    }

    async getWhatsAppId(codigoPac) {
        // 1. SIEMPRE buscar primero en el historial de agendamientos del bot (SQLite).
        // Si el paciente agendó recientemente por el bot, tenemos su ID exacto (incluso si es @lid).
        try {
            const pacCod14 = String(codigoPac).trim().padStart(14, '0');
            const codNoZeros = String(codigoPac).trim().replace(/^0+/, '');
            
            const appLog = await botPrisma.appointmentLog.findFirst({
                where: { 
                    patientDocument: { in: [pacCod14, codNoZeros, String(codigoPac).trim()] }
                },
                orderBy: { createdAt: 'desc' }
            });
            
            if (appLog && appLog.whatsappId) {
                logger.debug(`[Recordatorios] 📱 WA ID desde AppointmentLog: ${appLog.whatsappId} (paciente ${codigoPac})`);
                return appLog.whatsappId;
            }
        } catch (e) {
            logger.warn('[Recordatorios] No se pudo consultar AppointmentLog SQLite:', e.message);
        }

        // 2. Si no agendó por el bot, buscar su teléfono en Xenco
        let rawPhone = await this.getPhoneForPatient(codigoPac);
        if (!rawPhone) {
            return null;
        }

        // 3. Formatear el teléfono de Xenco de manera estricta
        // Si es celular (10 dígitos en Colombia), agregar el 57. 
        // Si es otro número, dejarlo tal cual pero probablemente falle si es fijo.
        let phone;
        const phone10 = rawPhone.slice(-10);
        if (rawPhone.length >= 10) {
            phone = `57${phone10}`;
        } else {
            phone = rawPhone;
        }
        
        const finalWaId = `${phone}@c.us`;
        logger.debug(`[Recordatorios] 📱 WA ID desde Xenco: ${finalWaId} (paciente ${codigoPac})`);
        return finalWaId;
    }

    /** Buscar nombre del paciente */
    async getNombreForPatient(codigoPac) {
        const cod = codigoPac.trim();
        const codSinCeros = cod.replace(/^0+/, '');
        try {
            const nui = await prisma.pacienteNUI.findFirst({
                where: { OR: [{ KCN_COD: cod }, { KCN_COD_NUI: codSinCeros }] }
            });
            if (nui?.KCN_NOM) return nui.KCN_NOM.trim();
        } catch (_) {}
        try {
            const fact = await prisma.tMUSUARIOSFACTURACION.findFirst({
                where: { OR: [{ KC2_COD: cod }, { KC2_OACOD_NUI: codSinCeros }] },
                orderBy: { KC2_FCH_DIG: 'desc' }
            });
            if (fact) return `${fact.KC2_PNOMBRE || ''} ${fact.KC2_PAPELLIDO || ''}`.trim();
        } catch (_) {}
        return 'Paciente';
    }

    async sendReminders() {
        if (!prisma || !this.client) {
            logger.warn('[Recordatorios] Prisma o cliente WA no disponible — omitiendo envío.');
            return 0;
        }

        const tomorrowDec = this.getTomorrowDecimal();
        logger.info(`[Recordatorios] Buscando citas para mañana (${tomorrowDec})...`);

        let sent = 0;
        try {
            // ─── TODAS las citas de mañana: bot + Xenco ───
            const citas = await prisma.$queryRaw`
                SELECT KC3_MEDICO, KC3_FCH, KC3_HH, KC3_MM,
                       KC3_COD, KC3_CONSULTORIO, KC3_USUARIO
                FROM TMCITASUSUARIOS
                WHERE KC3_FCH = ${tomorrowDec}
                  AND (KC3_ESTADO IS NULL OR KC3_ESTADO <> 'CA')
                  AND KC3_COD IS NOT NULL
                  AND LEN(LTRIM(RTRIM(KC3_COD))) = 14
                  AND KC3_COD <> '00000000000000'
                  AND TRY_CAST(KC3_COD AS BIGINT) > 0
            `;

            logger.info(`📅 [Recordatorios] ${citas.length} cita(s) encontradas para mañana`);

            for (const cita of citas) {
                const cod = String(cita.KC3_COD).trim();
                const clave = `${cod}-${cita.KC3_FCH}-${cita.KC3_HH}-${cita.KC3_MM}`;

                // ── DEDUPLICACIÓN: saltar si ya se envió este recordatorio hoy ──
                if (this.sentToday.has(clave)) {
                    logger.debug(`[Recordatorios] ⏭️  Ya enviado hoy: ${clave}`);
                    continue;
                }

                const waId = await this.getWhatsAppId(cod);
                if (!waId) {
                    logger.warn(`[Recordatorios] ⚠️  Sin teléfono/WA: ${cod}`);
                    continue;
                }

                const nombre = await this.getNombreForPatient(cod);
                const medico = await prisma.medico.findFirst({
                    where: { MED_COD: Number(cita.KC3_MEDICO) }
                }).catch(() => null);

                const ok = await this.sendReminderMessage(cita, nombre, waId, medico);
                if (ok) {
                    this.sentToday.add(clave);
                    this.saveSentReminders();
                    sent++;

                    // ── ANTI-BAN: Pausas escalonadas para no ser detectado como spam ──
                    // Pausa mediana cada 20 mensajes: 5-8 minutos
                    if (sent > 0 && sent % 20 === 0) {
                        const pausaMin = Math.floor(Math.random() * 3 + 5); // 5-8 min
                        logger.info(`[Recordatorios] 🧘 Pausa anti-ban (20 enviados): ${pausaMin} minutos...`);
                        await new Promise(r => setTimeout(r, pausaMin * 60 * 1000));
                    } else {
                        // Delay variable entre mensajes: 30-60 segundos
                        const delaySeg = Math.floor(Math.random() * 30 + 30);
                        logger.debug(`[Recordatorios] ⏳ Esperando ${delaySeg}s...`);
                        await new Promise(r => setTimeout(r, delaySeg * 1000));
                    }
                } else {
                    // Si no se envió (ej. número no reconocido), pausa corta
                    await new Promise(r => setTimeout(r, 3000));
                }
            }

        } catch (error) {
            logger.error('[Recordatorios] ❌ Error:', error.message);
        }

        logger.info(`[Recordatorios] ✅ ${sent} recordatorio(s) enviado(s).`);
        return sent;
    }

    async sendReminderMessage(cita, nombre, waId, medico) {
        try {
            if (!waId) return false;
            // Asegurar que tiene sufijo @...
            const whatsappId = waId.includes('@') ? waId : `57${waId}@c.us`;

            // Formatear fecha
            const fchStr = String(cita.KC3_FCH);
            const fechaObj = new Date(
                parseInt(fchStr.slice(0, 4)),
                parseInt(fchStr.slice(4, 6)) - 1,
                parseInt(fchStr.slice(6, 8))
            );
            const fechaFmt = fechaObj.toLocaleDateString('es-CO', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            // Formatear hora
            const hh = Number(cita.KC3_HH);
            const mm = Number(cita.KC3_MM);
            const h12 = hh % 12 || 12;
            const period = hh < 12 ? 'AM' : 'PM';
            const horaFmt = `${h12}:${String(mm).padStart(2, '0')} ${period}`;

            const primerNombre = nombre.split(/[\s,]+/)[0] || 'Paciente';
            const nomMedico = medico?.MED_NOMBRE?.trim() || 'tu médico asignado';
            const consultorio = cita.KC3_CONSULTORIO?.trim() || '';

            const mensaje =
                `🔔 *RECORDATORIO DE CITA MÉDICA*\n\n` +
                `Hola *${primerNombre}*,\n\n` +
                `Te recordamos que tienes una cita programada para *mañana*:\n\n` +
                `📅 *Fecha:* ${fechaFmt}\n` +
                `🕐 *Hora:* ${horaFmt}\n` +
                `👨‍⚕️ *Médico:* ${nomMedico}\n` +
                (consultorio ? `🚪 *Consultorio:* ${consultorio}\n` : '') +
                `\nPor favor, llega *15 minutos antes* de tu cita.\n\n` +
                `Si necesitas cancelar o reprogramar, escríbeme por este chat.\n\n` +
                `_ESE Hospital San Rafael de Ebéjico_ 🏥`;

            // Verificar que WhatsApp esté conectado antes de enviar
            const waState = await this.client.getState().catch(() => null);
            if (waState !== 'CONNECTED') {
                logger.warn(`[Recordatorios] ⚠️  WA no conectado (${waState}), omitiendo envío a ${whatsappId}`);
                return false;
            }

            // Los IDs tipo @lid ya son IDs válidos de WhatsApp — enviar directamente.
            // getNumberId() sólo funciona con números de teléfono (@c.us), no con @lid.
            if (whatsappId.includes('@lid')) {
                await this.client.sendMessage(whatsappId, mensaje);
                logger.info(`[Recordatorios] ✅ Enviado vía @lid a ${primerNombre} (${whatsappId})`);
                return true;
            }

            // Para @c.us: verificar que el número exista en WhatsApp antes de enviar
            const cleanPhone = whatsappId.replace('@c.us', '').replace('@s.whatsapp.net', '');
            const numberId = await this.client.getNumberId(cleanPhone).catch(() => null);
            
            if (numberId) {
                // getNumberId encontró el número — usar su ID serializado (puede ser @lid o @c.us)
                await this.client.sendMessage(numberId._serialized, mensaje);
                logger.info(`[Recordatorios] ✅ Enviado a ${primerNombre} (${numberId._serialized})`);
                return true;
            }

            // getNumberId devolvió null — puede ocurrir con cuentas @lid en versiones nuevas de WhatsApp.
            // Si el número tiene formato válido de celular colombiano (57 + 10 dígitos empezando con 3),
            // intentar enviar directamente. WhatsApp enruta correctamente aunque use @lid internamente.
            const localNum = cleanPhone.startsWith('57') ? cleanPhone.slice(2) : cleanPhone;
            const esMovilColombia = localNum.length === 10 && localNum.startsWith('3');

            if (esMovilColombia) {
                logger.debug(`[Recordatorios] ⚠️ getNumberId null para ${cleanPhone} — intentando envío directo @c.us`);
                await this.client.sendMessage(`${cleanPhone}@c.us`, mensaje);
                logger.info(`[Recordatorios] ✅ Enviado (directo) a ${primerNombre} (${cleanPhone}@c.us)`);
                return true;
            }

            logger.warn(`[Recordatorios] ❌ WhatsApp no reconoce el número ${cleanPhone} y no es un celular colombiano válido — omitiendo`);
            return false;
        } catch (error) {
            logger.warn(`[Recordatorios] ❌ Error enviando a ${waId}: ${error.message}`);
            return false;
        }
    }
}

module.exports = new ReminderService();
