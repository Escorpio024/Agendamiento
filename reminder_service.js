/**
 * SERVICIO DE RECORDATORIOS v2
 * ─────────────────────────────────────────────────────────────
 * Canal activo: SMS vía Onurix (controlado por SMS_REMINDERS_ENABLED en .env)
 * WhatsApp eliminado — se envían SOLO recordatorios por SMS.
 *
 * Lógica:
 *  1. Envía solo 1 recordatorio por cita (deduplicación por clave única)
 *  2. Lee TODAS las citas (bot + Xenco) desde TMCITASUSUARIOS
 *  3. Busca teléfono desde TKCLIENTESANEXO5 (fuente real de Xenco)
 *     → fallback a TMUSUARIOSFACTURACION → TMUSUARIOSASEGURAMIENTO
 *  4. Corre UNA vez al día a las 8 AM
 */
const fs        = require('fs');
const path      = require('path');
const prisma    = require('./db');
const cron      = require('node-cron');
const logger    = require('./logger');
const { sendSMS } = require('./sms_service'); // Solo SMS — WhatsApp eliminado

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

    init() {
        // El servicio de recordatorios ya no depende del cliente de WhatsApp.
        // Solo envía SMS vía Onurix (controlado por SMS_REMINDERS_ENABLED en .env).
        this.startScheduler();
        logger.info('✅ Servicio de recordatorios v2 iniciado (8 AM, solo SMS, sin duplicados)');
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
        if (!prisma) {
            logger.warn('[Recordatorios] Prisma no disponible — omitiendo envío.');
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

                const nombre = await this.getNombreForPatient(cod);
                const medico = await prisma.medico.findFirst({
                    where: { MED_COD: Number(cita.KC3_MEDICO) }
                }).catch(() => null);

                // ── Envío por SMS (Onurix) — único canal activo ──
                const rawPhone = await this.getPhoneForPatient(cod);
                let ok = false;
                if (rawPhone) {
                    const msgText = this.buildSMSText(cita, nombre, medico);
                    const smsResult = await sendSMS(rawPhone, msgText);
                    if (smsResult.success) {
                        logger.info(`[Recordatorios] 📱 SMS enviado a ${cod} (${rawPhone})`);
                        ok = true;
                    } else if (!smsResult.skipped) {
                        logger.warn(`[Recordatorios] ⚠️  SMS falló para ${cod}: ${smsResult.error}`);
                    }
                } else {
                    logger.warn(`[Recordatorios] ⚠️  Sin teléfono para: ${cod}`);
                }

                if (ok) {
                    this.sentToday.add(clave);
                    this.saveSentReminders();
                    sent++;
                    // Delay corto entre mensajes para no saturar la API
                    const delaySeg = Math.floor(Math.random() * 5 + 3); // 3-8 seg
                    logger.debug(`[Recordatorios] ⏳ Esperando ${delaySeg}s...`);
                    await new Promise(r => setTimeout(r, delaySeg * 1000));
                }
            }

        } catch (error) {
            logger.error('[Recordatorios] ❌ Error:', error.message);
        }

        logger.info(`[Recordatorios] ✅ ${sent} recordatorio(s) enviado(s).`);
        return sent;
    }

    /** Construir el texto del recordatorio para SMS (sin emojis ni Markdown) */
    buildSMSText(cita, nombre, medico) {
        const fchStr  = String(cita.KC3_FCH);
        const fechaObj = new Date(
            parseInt(fchStr.slice(0, 4)),
            parseInt(fchStr.slice(4, 6)) - 1,
            parseInt(fchStr.slice(6, 8))
        );
        const fechaFmt = fechaObj.toLocaleDateString('es-CO', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const hh   = Number(cita.KC3_HH);
        const mm   = Number(cita.KC3_MM);
        const h12  = hh % 12 || 12;
        const per  = hh < 12 ? 'AM' : 'PM';
        const hora = `${h12}:${String(mm).padStart(2, '0')} ${per}`;
        const primer = nombre.split(/[\s,]+/)[0] || 'Paciente';
        const nomMed = medico?.MED_NOMBRE?.trim() || 'su medico asignado';
        return (
            `RECORDATORIO: Hola ${primer}, tiene cita medica manana ` +
            `${fechaFmt} a las ${hora} con ${nomMed}. ` +
            `Llegue 15 min antes. Cancelaciones: escriba a nuestro WhatsApp. ` +
            `ESE Hospital San Rafael de Ebejico.`
        );
    }

}

module.exports = new ReminderService();
