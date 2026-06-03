const prisma = require('./db');
const botPrisma = require('./dbBot');
const cron = require('node-cron');
const logger = require('./logger');
const availabilityService = require('./availability_service');

// Códigos válidos de control CVD
const CVD_CONTROL_CODES = ['890301-7', '890301-8', '890301-12', '890301-13', '890301-14', '890301-15', '890301-16'];

class ControlCVDService {
    constructor() {
        this.client = null;
        this.isRunning = false;
    }

    init(whatsappClient) {
        this.client = whatsappClient;
        if (!whatsappClient) {
            logger.warn('[Control CVD] NO_WHATSAPP=true — scheduler desactivado.');
            return;
        }

        this.startScheduler();
        logger.info('✅ Servicio Control CVD iniciado. Flujo: 8 PM Detección → 9 AM Agendamiento Inmediato + Aviso → 8 días antes Recordatorio.');
    }

    startScheduler() {
        if (this.isRunning) return;

        // Fase 1 — Detección: Todos los días a las 8:00 PM
        // Detecta citas CVD finalizadas hoy y las registra para agendar mañana.
        cron.schedule('0 20 * * 1-6', async () => {
            logger.info('🔍 [Control CVD] Fase 1: Detección nocturna de citas CVD...');
            await this.detectFinishedAppointments();
        });

        // Fase 2 — Agendamiento Inmediato: Todos los días a las 9:00 AM
        // Agenda la cita futura HOY mismo y le avisa al paciente.
        cron.schedule('0 9 * * 1-6', async () => {
            logger.info('📅 [Control CVD] Fase 2: Agendamiento inmediato de controles PENDIENTES...');
            await this.executeImmediateBooking();
        });

        // Fase 3 — Recordatorio: 8 días antes del control
        // Envía recordatorio de laboratorios al paciente.
        cron.schedule('0 10 * * 1-6', async () => {
            logger.info('🔔 [Control CVD] Fase 3: Recordatorio de laboratorios 8 días antes...');
            await this.executeLaboratoryReminder();
        });

        this.isRunning = true;
    }

    /** Formato AAAAMMDD para Xenco como número */
    dateToDecimal(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return parseInt(`${y}${m}${day}`);
    }

    dateToString(d) {
        return String(this.dateToDecimal(d));
    }

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

    async getWhatsAppId(codigoPac) {
        const cod = codigoPac.trim();
        const codSinCeros = cod.replace(/^0+/, '');

        let telFinal = null;
        try {
            const kc5 = await prisma.tKCLIENTESANEXO5.findFirst({
                where: { KC5_RACOD_CLI: { in: [cod, codSinCeros] } }
            });
            const tel5 = kc5?.KC5_TEL_CEL?.trim();
            if (tel5 && tel5.replace(/\D/g, '').length >= 7) telFinal = tel5.replace(/\D/g, '');
        } catch (_) {}

        if (!telFinal) {
            try {
                const fact = await prisma.tMUSUARIOSFACTURACION.findFirst({
                    where: { OR: [{ KC2_COD: cod }, { KC2_OACOD_NUI: codSinCeros }] },
                    orderBy: { KC2_FCH_DIG: 'desc' }
                });
                const tel2 = fact?.KC2_TEL_RESP?.trim();
                if (tel2 && tel2.replace(/\D/g, '').length >= 7) telFinal = tel2.replace(/\D/g, '');
            } catch (_) {}
        }

        if (telFinal) {
            const phone10 = telFinal.slice(-10);
            return `57${phone10}@c.us`;
        }

        try {
            const appLog = await botPrisma.appointmentLog.findFirst({
                where: { patientDocument: { in: [cod.padStart(14, '0'), codSinCeros, cod] } },
                orderBy: { createdAt: 'desc' }
            });
            if (appLog && appLog.whatsappId) return appLog.whatsappId;
        } catch (_) {}

        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 1: DETECCIÓN (8 PM) — Busca controles CVD finalizados hoy
    // ─────────────────────────────────────────────────────────────────────────
    async detectFinishedAppointments() {
        try {
            const todayDec = this.dateToDecimal(new Date());

            // Buscar citas de CVD de control válido, facturadas hoy
            const citasCvd = await prisma.$queryRaw`
                SELECT c.KC3_MEDICO, c.KC3_FCH, c.KC3_COD, c.KC3_ARTIC, e.ENT_NOMBRE
                FROM TMCITASUSUARIOS c
                LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
                WHERE c.KC3_FCH = ${todayDec}
                  AND c.KC3_NUM > 0
                  AND c.KC3_COD IS NOT NULL
                  AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7', '890301-8', '890301-12', '890301-13', '890301-14', '890301-15', '890301-16')
                  AND LEN(LTRIM(RTRIM(c.KC3_COD))) = 14
                  AND c.KC3_COD <> '00000000000000'
                  AND CAST(c.KC3_COD AS BIGINT) > 0
            `;

            logger.info(`[Control CVD] Detección: ${citasCvd.length} controles CVD encontrados hoy (${todayDec})`);

            for (const cita of citasCvd) {
                const cedula = String(cita.KC3_COD).trim().replace(/^0+/, '');
                const nombre = await this.getNombreForPatient(cedula);

                // Evitar duplicados
                const exists = await botPrisma.controlReminder.findFirst({
                    where: {
                        cedula: cedula,
                        fechaCitaOriginal: String(cita.KC3_FCH),
                        estado: { in: ['PENDING', 'BOOKED'] }
                    }
                });
                if (exists) {
                    logger.info(`[Control CVD] Ya existe registro para ${cedula} (${cita.KC3_FCH}). Saltando.`);
                    continue;
                }

                // Determinar meses según EPS (Savia=3, Nueva EPS=2, Otras=3)
                const entName = String(cita.ENT_NOMBRE || '').toUpperCase();
                let monthsToAdd = 3; // Por defecto: 3 meses (Savia u otras EPS)
                if (entName.includes('NUEVA EPS')) {
                    monthsToAdd = 2; // Nueva EPS: 2 meses
                }
                // Savia explicitamente también es 3, no necesita condición aparte
                const epsLabel = entName.includes('NUEVA EPS') ? 'NUEVA EPS (2 meses)' : (entName.includes('SAVIA') ? 'SAVIA (3 meses)' : `${entName || 'OTRA EPS'} (3 meses)`);

                // Calcular fecha objetivo del control
                const dControl = new Date();
                dControl.setMonth(dControl.getMonth() + monthsToAdd);
                if (dControl.getDay() === 0) dControl.setDate(dControl.getDate() + 1); // No domingos

                const fechaControlStr = this.dateToString(dControl);

                // Calcular fecha del recordatorio (8 días antes del control)
                const dRemind = new Date(dControl);
                dRemind.setDate(dRemind.getDate() - 8);
                if (dRemind.getDay() === 0) dRemind.setDate(dRemind.getDate() + 1);
                const fechaRecordatorioStr = this.dateToString(dRemind);

                const articuloValido = String(cita.KC3_ARTIC || '').trim();

                await botPrisma.controlReminder.create({
                    data: {
                        cedula,
                        paciente: nombre,
                        medicoOriginal: String(cita.KC3_MEDICO),
                        fechaCitaOriginal: String(cita.KC3_FCH),
                        articuloCita: articuloValido,
                        fechaControl: fechaControlStr,
                        fechaRecordatorio: fechaRecordatorioStr,
                        estado: 'PENDING',
                        epsInfo: epsLabel
                    }
                });
                logger.info(`[Control CVD] Registrado: ${cedula} | EPS: ${epsLabel} | Control: ${fechaControlStr} | Código: ${articuloValido}`);
            }
        } catch (e) {
            logger.error('[Control CVD] Error en detección:', e.message);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 2: AGENDAMIENTO INMEDIATO (9 AM del día siguiente)
    // Agenda la cita futura y le avisa al paciente de una vez.
    // ─────────────────────────────────────────────────────────────────────────
    async executeImmediateBooking() {
        try {
            // Buscar controles PENDING (detectados pero sin agendar aún)
            const pending = await botPrisma.controlReminder.findMany({
                where: { estado: 'PENDING' }
            });

            logger.info(`[Control CVD] Agendamiento inmediato: ${pending.length} controles pendientes.`);

            for (const record of pending) {
                const waId = await this.getWhatsAppId(record.cedula);

                if (!waId) {
                    logger.warn(`[Control CVD] Sin teléfono para ${record.cedula}. Marcando FAILED_NO_PHONE.`);
                    await botPrisma.controlReminder.update({
                        where: { id: record.id },
                        data: { estado: 'FAILED_NO_PHONE' }
                    });
                    continue;
                }

                // Convertir fechaControl '20260901' → 'YYYY-MM-DD'
                const yyyy = record.fechaControl.substring(0, 4);
                const mm   = record.fechaControl.substring(4, 6);
                const dd   = record.fechaControl.substring(6, 8);
                const fechaFormat = `${yyyy}-${mm}-${dd}`;

                // Buscar cupos en la agenda de P Y P MEDICOS
                const slots = await availabilityService.getAvailableSlots(
                    fechaFormat, 'medicina general', 'p y p medicos', true
                );

                if (!slots || slots.length === 0) {
                    logger.warn(`[Control CVD] Sin horarios disponibles el ${fechaFormat} para ${record.cedula}. Marcando BOOKING_FAILED_NO_SLOT.`);
                    await botPrisma.controlReminder.update({
                        where: { id: record.id },
                        data: { estado: 'BOOKING_FAILED_NO_SLOT' }
                    });

                    // Avisarle que no se pudo agendar, que llame a la clínica
                    await this.client.sendMessage(waId,
                        `🏥 *AURORA - Clínica*\n\n` +
                        `Hola ${record.paciente}, 😊\n\n` +
                        `Ayer asististe a tu control de Riesgo Cardiovascular. ¡Gracias por tu compromiso con tu salud!\n\n` +
                        `Intentamos apartarte tu cita de control a los próximos meses automáticamente, pero por el momento no encontramos horarios disponibles en la agenda.\n\n` +
                        `Por favor, comunícate con nosotros para programar tu cita de seguimiento. 📞`
                    );
                    continue;
                }

                // Elegir un slot del medio para no saturar primero o último turno
                const slot = slots[Math.floor(slots.length / 2)];

                const pacData = { KC0_COD: record.cedula, zona: '99' };
                const tipoEspecialidad = record.articuloCita ? `PYP_CARDIO|${record.articuloCita}` : 'PYP_CARDIO';

                const reserved = await availabilityService.reserveSlot(
                    fechaFormat,
                    slot.time,
                    waId,
                    tipoEspecialidad,
                    slot.doctorId,
                    pacData
                );

                if (reserved) {
                    const fechaObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
                    const fechaAmigable = fechaObj.toLocaleDateString('es-CO', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    });

                    logger.info(`[Control CVD] ✅ Cita agendada: ${record.cedula} → ${fechaFormat} ${slot.time}`);

                    // Guardar datos de la cita para rastrear si fue cancelada
                    await botPrisma.controlReminder.update({
                        where: { id: record.id },
                        data: {
                            estado:     'BOOKED',
                            citaMedico: String(slot.doctorId),
                            citaFch:    record.fechaControl,
                            citaHora:   slot.time,
                        }
                    });

                    // Mensaje al paciente: cita confirmada
                    const msgConfirmacion =
                        `🏥 *AURORA - Clínica*\n\n` +
                        `Hola ${record.paciente}, 😊\n\n` +
                        `Ayer asististe a tu control de Riesgo Cardiovascular. ¡Gracias por cuidar tu salud!\n\n` +
                        `✅ Hemos agendado automáticamente tu *cita de control de seguimiento:*\n\n` +
                        `📅 *Fecha:* ${fechaAmigable}\n` +
                        `🕐 *Hora:* ${slot.time}\n` +
                        `👨‍⚕️ *Médico:* ${slot.doctorName}\n\n` +
                        `Te enviaremos un recordatorio 8 días antes con las instrucciones sobre tus exámenes de laboratorio. 🔬\n\n` +
                        `Si necesitas cambiar esta cita, escríbenos o comunícate con la clínica. 📞`;

                    await this.client.sendMessage(waId, msgConfirmacion);

                } else {
                    logger.warn(`[Control CVD] Falló reserva en Xenco para ${record.cedula}.`);
                    await botPrisma.controlReminder.update({
                        where: { id: record.id },
                        data: { estado: 'BOOKING_FAILED_XENCO' }
                    });

                    await this.client.sendMessage(waId,
                        `🏥 *AURORA - Clínica*\n\n` +
                        `Hola ${record.paciente}, 😊\n\n` +
                        `Ayer asististe a tu control de Riesgo Cardiovascular.\n\n` +
                        `Intentamos apartar tu cita de seguimiento automáticamente pero ocurrió un inconveniente técnico. Por favor comunícate con la clínica para programarla. 📞`
                    );
                }
            }
        } catch (e) {
            logger.error('[Control CVD] Error en agendamiento inmediato:', e.message);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FASE 3: RECORDATORIO DE LABORATORIOS (8 días antes del control)
    // Solo para citas que ya están agendadas (estado BOOKED).
    // ─────────────────────────────────────────────────────────────────────────
    async executeLaboratoryReminder() {
        try {
            const todayStr = this.dateToString(new Date());

            const booked = await botPrisma.controlReminder.findMany({
                where: {
                    fechaRecordatorio: todayStr,
                    estado: 'BOOKED'
                }
            });

            logger.info(`[Control CVD] Recordatorio: ${booked.length} pacientes reciben aviso de laboratorios hoy.`);

            for (const record of booked) {
                const waId = await this.getWhatsAppId(record.cedula);
                if (!waId) continue;

                const yyyy = record.fechaControl.substring(0, 4);
                const mm   = record.fechaControl.substring(4, 6);
                const dd   = record.fechaControl.substring(6, 8);
                const fechaObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
                const fechaAmigable = fechaObj.toLocaleDateString('es-CO', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });

                const msgRecordatorio =
                    `🔔 *RECORDATORIO - Control Cardiovascular*\n\n` +
                    `Hola ${record.paciente},\n\n` +
                    `Te recordamos que en *8 días* tienes tu cita de control de Riesgo Cardiovascular:\n\n` +
                    `📅 *Fecha:* ${fechaAmigable}\n` +
                    `🕐 *Hora:* ${record.citaHora || 'Consultar en clínica'}\n\n` +
                    `⚠️ *Por favor ten listos tus exámenes de laboratorio antes de esa fecha.*\n\n` +
                    `Si necesitas cancelar o cambiar la cita, comunícate con nosotros. 📞`;

                await this.client.sendMessage(waId, msgRecordatorio);

                await botPrisma.controlReminder.update({
                    where: { id: record.id },
                    data: { estado: 'BOOKED_AND_REMINDED' }
                });

                logger.info(`[Control CVD] Recordatorio enviado a ${record.cedula} para control el ${record.fechaControl}`);
            }
        } catch (e) {
            logger.error('[Control CVD] Error en recordatorio de laboratorios:', e.message);
        }
    }
}

module.exports = new ControlCVDService();
