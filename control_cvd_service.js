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

        // Fase 2 — Agendamiento Inmediato: Todos los días a las 7:30 AM
        // Agenda la cita futura HOY mismo y le avisa al paciente.
        cron.schedule('30 7 * * 1-6', async () => {
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
    // HELPER: Verifica si el paciente ya tiene una cita de control CVD
    // agendada en Xenco dentro del rango 1-4 meses a futuro.
    // Si existe → fue agendada presencialmente por la clínica.
    // ─────────────────────────────────────────────────────────────────────────
    async hasExistingControlCita(cedulaRaw) {
        try {
            // Construir código interno de 14 dígitos (mismo formato que Xenco)
            const codigoPac = String(cedulaRaw).padStart(14, '0');

            // Rango: desde hoy + 25 días hasta hoy + 4 meses (para capturar 2 y 3 meses)
            const hoy = new Date();
            const desde = new Date(hoy); desde.setDate(hoy.getDate() + 25);
            const hasta = new Date(hoy); hasta.setMonth(hoy.getMonth() + 4);

            const desdeDecimal = this.dateToDecimal(desde);
            const hastaDecimal = this.dateToDecimal(hasta);

            const citasFuturas = await prisma.$queryRaw`
                SELECT TOP 1 c.KC3_FCH, c.KC3_ARTIC, c.KC3_MEDICO
                FROM TMCITASUSUARIOS c
                WHERE c.KC3_COD = ${codigoPac}
                  AND c.KC3_FCH >= ${desdeDecimal}
                  AND c.KC3_FCH <= ${hastaDecimal}
                  AND c.KC3_NUM > 0
                  AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7', '890301-8', '890301-12', '890301-13', '890301-14', '890301-15', '890301-16')
            `;

            if (citasFuturas && citasFuturas.length > 0) {
                const c = citasFuturas[0];
                return {
                    found: true,
                    fecha: String(c.KC3_FCH),
                    artic: String(c.KC3_ARTIC || '').trim(),
                    medico: String(c.KC3_MEDICO || '')
                };
            }
            return { found: false };
        } catch (e) {
            logger.warn(`[Control CVD] No se pudo verificar cita existente para ${cedulaRaw}: ${e.message}`);
            return { found: false }; // Si falla la consulta, continuar normalmente
        }
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

                // Evitar duplicados (incluye BOOKED_PRESENCIAL para no re-procesar)
                const exists = await botPrisma.controlReminder.findFirst({
                    where: {
                        cedula: cedula,
                        fechaCitaOriginal: String(cita.KC3_FCH),
                        estado: { in: ['PENDING', 'BOOKED', 'BOOKED_PRESENCIAL'] }
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

                // ── Verificar si el paciente YA tiene cita agendada en Xenco ──
                const citaExistente = await this.hasExistingControlCita(cedula);

                if (citaExistente.found) {
                    // Ya fue agendado presencialmente en la clínica
                    logger.info(`[Control CVD] Paciente ${cedula} ya tiene cita en Xenco el ${citaExistente.fecha}. Marcando BOOKED_PRESENCIAL.`);
                    await botPrisma.controlReminder.create({
                        data: {
                            cedula,
                            paciente: nombre,
                            medicoOriginal: String(cita.KC3_MEDICO),
                            fechaCitaOriginal: String(cita.KC3_FCH),
                            articuloCita: articuloValido,
                            fechaControl: citaExistente.fecha,   // fecha real en Xenco
                            fechaRecordatorio: fechaRecordatorioStr,
                            estado: 'BOOKED_PRESENCIAL',
                            epsInfo: epsLabel,
                            citaMedico: citaExistente.medico,
                            citaFch: citaExistente.fecha,
                        }
                    });
                    logger.info(`[Control CVD] Presencial registrado: ${cedula} | Cita Xenco: ${citaExistente.fecha} | Artículo: ${citaExistente.artic}`);
                } else {
                    // No tiene cita → el bot la intentará agendar mañana a las 9 AM
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
                    logger.info(`[Control CVD] Pendiente para bot: ${cedula} | EPS: ${epsLabel} | Control: ${fechaControlStr}`);
                }
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
            // Buscar controles PENDING o SIN_CUPO (detectados pero sin agendar aún, o que fallaron por cupo antes)
            const pending = await botPrisma.controlReminder.findMany({
                where: { estado: { in: ['PENDING', 'BOOKING_FAILED_NO_SLOT'] } }
            });

            logger.info(`[Control CVD] Agendamiento inmediato: ${pending.length} controles pendientes.`);

            for (const record of pending) {
                // ── try individual por paciente: si uno falla, sigue con el siguiente ──
                try {
                    // 1. Verificación de última hora: ¿El paciente ya sacó cita presencialmente?
                    const citaExistente = await this.hasExistingControlCita(record.cedula);
                    if (citaExistente.found) {
                        logger.info(`[Control CVD] Paciente ${record.cedula} ya sacó cita en Xenco el ${citaExistente.fecha} antes de que el bot agendara. Marcando BOOKED_PRESENCIAL.`);
                        await botPrisma.controlReminder.update({
                            where: { id: record.id },
                            data: {
                                estado: 'BOOKED_PRESENCIAL',
                                fechaControl: citaExistente.fecha,
                                citaMedico: citaExistente.medico,
                                citaFch: citaExistente.fecha
                            }
                        });
                        continue;
                    }

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

                    // Buscar cupos en la agenda de P Y P MEDICOS (busca desde la fecha de control hacia adelante)
                    const availResult = await availabilityService.getNextAvailableSlots(
                        fechaFormat, 'medicina general', 'p y p medicos'
                    );

                    if (!availResult || !availResult.slots || availResult.slots.length === 0) {
                        logger.warn(`[Control CVD] Sin horarios disponibles a partir del ${fechaFormat} para ${record.cedula}. Marcando BOOKING_FAILED_NO_SLOT.`);
                        
                        // Solo enviar el mensaje de WhatsApp si el paciente estaba PENDING.
                        // Si ya estaba en SIN_CUPO, no volver a enviarle el mensaje para no hacer spam.
                        const enviarMensaje = record.estado === 'PENDING';

                        await botPrisma.controlReminder.update({
                            where: { id: record.id },
                            data: { estado: 'BOOKING_FAILED_NO_SLOT' }
                        });

                        if (enviarMensaje) {
                            try {
                                await this.client.sendMessage(waId,
                                    `🏥 *AURORA - Clínica*\n\n` +
                                    `Hola ${record.paciente}, 😊\n\n` +
                                    `Ayer asististe a tu control de Riesgo Cardiovascular. ¡Gracias por tu compromiso con tu salud!\n\n` +
                                    `Intentamos apartarte tu cita de control a los próximos meses automáticamente, pero por el momento no encontramos horarios disponibles en la agenda.\n\n` +
                                    `Por favor, comunícate con nosotros para programar tu cita de seguimiento. 📞`
                                );
                            } catch (sendErr) {
                                logger.warn(`[Control CVD] No se pudo enviar WhatsApp SIN CUPO a ${record.cedula}: ${sendErr.message}`);
                            }
                        }
                        continue;
                    }

                    // Extraer los slots y la fecha real en la que se encontró disponibilidad
                    const slots = availResult.slots;
                    const finalFechaFormat = availResult.date; // La fecha en la que realmente se va a agendar

                    // Elegir un slot del medio para no saturar primero o último turno
                    const slot = slots[Math.floor(slots.length / 2)];

                    const pacData = { KC0_COD: record.cedula, zona: '99' };
                    const tipoEspecialidad = record.articuloCita ? `PYP_CARDIO|${record.articuloCita}` : 'PYP_CARDIO';

                    const reserved = await availabilityService.reserveSlot(
                        finalFechaFormat,
                        slot.time,
                        waId,
                        tipoEspecialidad,
                        slot.doctorId,
                        pacData
                    );

                    if (reserved) {
                        // Parsear la fecha final en la que se agendó para el mensaje
                        const [fYear, fMonth, fDay] = finalFechaFormat.split('-');
                        const fechaObj = new Date(parseInt(fYear), parseInt(fMonth) - 1, parseInt(fDay));
                        const fechaAmigable = fechaObj.toLocaleDateString('es-CO', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        });

                        logger.info(`[Control CVD] ✅ Cita agendada: ${record.cedula} → ${fechaFormat} ${slot.time}`);

                        const newFechaSinGuiones = finalFechaFormat.replace(/-/g, '');

                        // Guardar datos de la cita para rastrear si fue cancelada
                        await botPrisma.controlReminder.update({
                            where: { id: record.id },
                            data: {
                                estado:       'BOOKED',
                                citaMedico:   String(slot.doctorId),
                                citaFch:      newFechaSinGuiones,
                                fechaControl: newFechaSinGuiones,
                                citaHora:     slot.time,
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

                        try {
                            await this.client.sendMessage(waId, msgConfirmacion);
                        } catch (sendErr) {
                            logger.warn(`[Control CVD] No se pudo enviar WhatsApp CONFIRMACIÓN a ${record.cedula}: ${sendErr.message}`);
                        }

                    } else {
                        logger.warn(`[Control CVD] Falló reserva en Xenco para ${record.cedula}.`);
                        await botPrisma.controlReminder.update({
                            where: { id: record.id },
                            data: { estado: 'BOOKING_FAILED_XENCO' }
                        });

                        try {
                            await this.client.sendMessage(waId,
                                `🏥 *AURORA - Clínica*\n\n` +
                                `Hola ${record.paciente}, 😊\n\n` +
                                `Ayer asististe a tu control de Riesgo Cardiovascular.\n\n` +
                                `Intentamos apartar tu cita de seguimiento automáticamente pero ocurrió un inconveniente técnico. Por favor comunícate con la clínica para programarla. 📞`
                            );
                        } catch (sendErr) {
                            logger.warn(`[Control CVD] No se pudo enviar WhatsApp ERROR XENCO a ${record.cedula}: ${sendErr.message}`);
                        }
                    }

                    // Pausa entre pacientes para no saturar WhatsApp
                    await new Promise(r => setTimeout(r, 1500));

                } catch (patientErr) {
                    logger.error(`[Control CVD] Error procesando paciente ${record.cedula}: ${patientErr.message}`);
                    // Continúa con el siguiente paciente
                }
            }
            logger.info(`[Control CVD] ✅ Agendamiento inmediato finalizado. Procesados: ${pending.length}`);
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
    // ─────────────────────────────────────────────────────────────────────────
    // ESCANEO MASIVO: Verifica todos los SIN CUPO contra Xenco
    // Marca como BOOKED_PRESENCIAL si el paciente ya tiene cita futura.
    // No filtra por artículo — sirve para cualquier tipo de control agendado.
    // ─────────────────────────────────────────────────────────────────────────
    async scanAndMarkPresencial() {
        try {
            const sinCupo = await botPrisma.controlReminder.findMany({
                where: { estado: { in: ['BOOKING_FAILED_NO_SLOT', 'PENDING', 'BOOKING_FAILED_XENCO', 'FAILED_NO_PHONE'] } }
            });

            logger.info(`[Control CVD] Escaneando ${sinCupo.length} pacientes sin cupo contra Xenco...`);

            const hoy = new Date();
            const desdeDecimal = this.dateToDecimal(hoy); // desde hoy mismo en adelante
            const hasta = new Date(hoy); hasta.setMonth(hoy.getMonth() + 5);
            const hastaDecimal = this.dateToDecimal(hasta);

            let marcados = 0;
            for (const record of sinCupo) {
                try {
                    // Formato de 14 dígitos que usa Xenco
                    const codigoPac = String(record.cedula).padStart(14, '0');

                    // Buscar CUALQUIER cita futura (no filtra por artículo)
                    const citasFuturas = await prisma.$queryRaw`
                        SELECT TOP 1 c.KC3_FCH, c.KC3_ARTIC, c.KC3_MEDICO, c.KC3_HH, c.KC3_MM
                        FROM TMCITASUSUARIOS c
                        WHERE c.KC3_COD = ${codigoPac}
                          AND c.KC3_FCH >= ${desdeDecimal}
                          AND c.KC3_FCH <= ${hastaDecimal}
                          AND c.KC3_NUM > 0
                          AND ISNULL(LTRIM(RTRIM(c.KC3_COD)), '') <> ''
                          AND c.KC3_COD <> '00000000000000'
                        ORDER BY c.KC3_FCH ASC
                    `;

                    if (citasFuturas && citasFuturas.length > 0) {
                        const c = citasFuturas[0];
                        const fechaStr = String(c.KC3_FCH);
                        const horaStr = c.KC3_HH != null ? `${String(c.KC3_HH).padStart(2,'0')}:${String(c.KC3_MM||0).padStart(2,'0')}` : null;

                        await botPrisma.controlReminder.update({
                            where: { id: record.id },
                            data: {
                                estado:       'BOOKED_PRESENCIAL',
                                fechaControl: fechaStr,
                                citaMedico:   String(c.KC3_MEDICO || ''),
                                citaFch:      fechaStr,
                                citaHora:     horaStr,
                            }
                        });
                        logger.info(`[Control CVD] ✅ Presencial detectado: ${record.cedula} → ${fechaStr} (artic: ${c.KC3_ARTIC})`);
                        marcados++;
                    }
                } catch (innerErr) {
                    logger.warn(`[Control CVD] Error escaneando ${record.cedula}: ${innerErr.message}`);
                }
            }
            logger.info(`[Control CVD] Escaneo completado: ${marcados} pacientes marcados como BOOKED_PRESENCIAL de ${sinCupo.length} revisados.`);
            return { total: sinCupo.length, marcados };
        } catch (e) {
            logger.error('[Control CVD] Error en escaneo masivo presencial:', e.message);
            return { total: 0, marcados: 0 };
        }
    }
}

module.exports = new ControlCVDService();
