const prisma = require('./db');
const botPrisma = require('./dbBot');
const cron = require('node-cron');
const logger = require('./logger');
const availabilityService = require('./availability_service');

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
        logger.info('✅ Servicio Control CVD a 3 meses iniciado (8 PM Detección, 9 AM Ejecución)');
    }

    startScheduler() {
        if (this.isRunning) return;

        // Detección: Todos los días a las 8:00 PM (Busca citas finalizadas hoy)
        cron.schedule('0 20 * * *', async () => {
            logger.info('🔍 [Control CVD] Ejecutando detección nocturna de citas CVD...');
            await this.detectFinishedAppointments();
        });

        // Ejecución: Todos los días a las 9:00 AM (Ejecuta agendamiento y WP 8 días antes)
        cron.schedule('0 9 * * *', async () => {
            logger.info('🔔 [Control CVD] Ejecutando recordatorios y agendamiento matutino...');
            await this.executeRemindersAndBooking();
        });

        this.isRunning = true;
    }

    /** Formato AAAAMMDD para Xenco */
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

    async detectFinishedAppointments() {
        try {
            const todayDec = this.dateToDecimal(new Date());

            // Buscar citas de CVD ('890301-7' o '890301') de hoy que no estén canceladas
            const citasCvd = await prisma.$queryRaw`
                SELECT KC3_MEDICO, KC3_FCH, KC3_COD, KC3_ESTADO
                FROM TMCITASUSUARIOS
                WHERE KC3_FCH = ${todayDec}
                  AND KC3_NUM > 0
                  AND KC3_COD IS NOT NULL
                  AND (KC3_ARTIC LIKE '%890301%')
                  AND LEN(LTRIM(RTRIM(KC3_COD))) = 14
                  AND KC3_COD <> '00000000000000'
                  AND CAST(KC3_COD AS BIGINT) > 0
            `;

            logger.info(`[Control CVD] Detección finalizada: ${citasCvd.length} citas CVD encontradas hoy (${todayDec})`);

            for (const cita of citasCvd) {
                const cedula = String(cita.KC3_COD).trim().replace(/^0+/, '');
                const nombre = await this.getNombreForPatient(cedula);

                const exists = await botPrisma.controlReminder.findFirst({
                    where: { 
                        cedula: cedula, 
                        fechaCitaOriginal: String(cita.KC3_FCH),
                        estado: 'PENDING'
                    }
                });

                if (exists) continue;

                // Calcular fecha a 3 meses
                const d = new Date();
                d.setMonth(d.getMonth() + 3);

                // Ajustar si cae domingo (pasar a lunes)
                if (d.getDay() === 0) { // 0 es Domingo
                    d.setDate(d.getDate() + 1); // Pasa a Lunes
                }

                const fechaControlStr = this.dateToString(d);

                // Calcular fecha del recordatorio (8 días antes de la fechaControlStr)
                const dRemind = new Date(d);
                dRemind.setDate(dRemind.getDate() - 8);
                const fechaRecordatorioStr = this.dateToString(dRemind);

                await botPrisma.controlReminder.create({
                    data: {
                        cedula: cedula,
                        paciente: nombre,
                        medicoOriginal: String(cita.KC3_MEDICO),
                        fechaCitaOriginal: String(cita.KC3_FCH),
                        fechaControl: fechaControlStr,
                        fechaRecordatorio: fechaRecordatorioStr,
                        estado: 'PENDING'
                    }
                });
                logger.info(`[Control CVD] Registrado futuro control para ${cedula} - Control: ${fechaControlStr}, Recordatorio: ${fechaRecordatorioStr}`);
            }
        } catch (e) {
            logger.error('[Control CVD] Error detectando citas:', e.message);
        }
    }

    async executeRemindersAndBooking() {
        try {
            const todayStr = this.dateToString(new Date());

            const pending = await botPrisma.controlReminder.findMany({
                where: {
                    fechaRecordatorio: todayStr,
                    estado: 'PENDING'
                }
            });

            logger.info(`[Control CVD] Ejecución matutina: ${pending.length} pacientes cumplen 8 días para su control hoy (${todayStr})`);

            for (const record of pending) {
                const waId = await this.getWhatsAppId(record.cedula);
                if (!waId) {
                    logger.warn(`[Control CVD] Sin WhatsApp para paciente ${record.cedula}. Marcando como fallido.`);
                    await botPrisma.controlReminder.update({
                        where: { id: record.id },
                        data: { estado: 'FAILED_NO_PHONE' }
                    });
                    continue;
                }

                // Convertir fechaControl '20260830' a 'YYYY-MM-DD'
                const yyyy = record.fechaControl.substring(0, 4);
                const mm = record.fechaControl.substring(4, 6);
                const dd = record.fechaControl.substring(6, 8);
                const fechaFormat = `${yyyy}-${mm}-${dd}`;

                // Buscar cupos (Medicina General sirve para agendar PYP_CARDIO, buscando exclusivamente al doctor P Y P MEDICOS)
                const slots = await availabilityService.getAvailableSlots(fechaFormat, 'medicina general', 'p y p medicos', true);

                if (!slots || slots.length === 0) {
                    logger.warn(`[Control CVD] No se encontraron horarios el ${fechaFormat} para el paciente ${record.cedula}. No se agendó automáticamente.`);
                    
                    await this.client.sendMessage(waId, 
                        `🔔 *CONTROL RIESGO CARDIOVASCULAR*\n\nHola ${record.paciente},\n\nTe recordamos que aproximadamente en 8 días es tu cita de control a los 3 meses. Por favor, asegúrate de realizar tus *exámenes de laboratorio* a tiempo.\n\nEscríbenos *"quiero agendar mi cita"* para seleccionar la fecha de tu control. 😊`
                    );

                    await botPrisma.controlReminder.update({
                        where: { id: record.id },
                        data: { estado: 'REMINDED_NO_BOOKING' }
                    });
                    continue;
                }

                // Tomar un slot al azar o del medio
                const slot = slots[Math.floor(slots.length / 2)]; 

                const pacData = { KC0_COD: record.cedula, zona: '99' }; 
                
                // Sobrescribimos el tipo en reserveSlot con 'PYP_CARDIO' para que getFieldsByEspecialidad modifique los campos nativos de la cita
                const reserved = await availabilityService.reserveSlot(
                    fechaFormat, 
                    slot.time, 
                    waId, 
                    'PYP_CARDIO', 
                    slot.doctorId, 
                    pacData 
                );

                if (reserved) {
                    logger.info(`[Control CVD] Cita agendada con éxito para ${record.cedula} el ${fechaFormat} a las ${slot.time}`);
                    
                    const fechaObj = new Date(yyyy, parseInt(mm) - 1, dd);
                    const fechaAmigable = fechaObj.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                    const msg = `🔔 *CONTROL RIESGO CARDIOVASCULAR*\n\n` +
                                `Hola ${record.paciente},\n\n` +
                                `Te recordamos que en 8 días es tu control. Hemos reservado automáticamente este espacio para ti:\n\n` +
                                `📅 *Fecha:* ${fechaAmigable}\n` +
                                `🕐 *Hora:* ${slot.time}\n` +
                                `👨‍⚕️ *Médico:* ${slot.doctorName}\n\n` +
                                `⚠️ *Por favor ten listos tus exámenes de laboratorio para esa fecha.*\n\n` +
                                `Si necesitas cambiar la fecha u hora de esta cita, responde a este mensaje diciendo *"modificar cita"*.`;

                    await this.client.sendMessage(waId, msg);

                    await botPrisma.controlReminder.update({
                        where: { id: record.id },
                        data: { estado: 'BOOKED_AND_REMINDED' }
                    });
                } else {
                    logger.warn(`[Control CVD] Falló la reserva interna en Xenco para ${record.cedula}. Enviando recordatorio genérico.`);
                    await this.client.sendMessage(waId, 
                        `🔔 *CONTROL RIESGO CARDIOVASCULAR*\n\nHola ${record.paciente},\n\nTe recordamos que en 8 días corresponde tu control a los 3 meses. Por favor, asegúrate de realizar tus *exámenes de laboratorio* a tiempo.\n\nEscríbenos *"quiero agendar mi cita"* para seleccionar la fecha y hora de tu preferencia. 😊`
                    );
                    await botPrisma.controlReminder.update({
                        where: { id: record.id },
                        data: { estado: 'REMINDED_FAILED_BOOKING' }
                    });
                }
            }
        } catch (e) {
            logger.error('[Control CVD] Error en la ejecución matutina:', e.message);
        }
    }
}

module.exports = new ControlCVDService();
