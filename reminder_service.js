const prisma = require('./db');
const cron = require('node-cron');
const { dateToDecimal, decimalToDate } = require('./availability_service');

/**
 * Servicio para enviar recordatorios automáticos de citas
 * Adaptado a tablas reales de HABEJICO
 */
class ReminderService {
    constructor() {
        this.client = null;
        this.isRunning = false;
    }

    init(whatsappClient) {
        this.client = whatsappClient;
        this.startScheduler();
        console.log('✅ Servicio de recordatorios iniciado');
    }

    setClient(whatsappClient) {
        this.client = whatsappClient;
    }

    startScheduler() {
        if (this.isRunning) return;
        // Ejecutar cada hora
        cron.schedule('0 * * * *', async () => {
            console.log('🔔 Verificando recordatorios pendientes...');
            await this.sendReminders();
        });
        // También ejecutar al iniciar (5 segundos después)
        setTimeout(() => this.sendReminders(), 5000);
        this.isRunning = true;
    }

    async sendReminders() {
        if (!prisma) {
            console.log('[ReminderService] Prisma no disponible, omitiendo recordatorios.');
            return;
        }
        try {
            // Calcular fecha de mañana en formato decimal YYYYMMDD
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowDecimal = dateToDecimal(tomorrow);

            // Buscar citas de mañana en TMCITASUSUARIOS
            const citas = await prisma.cita.findMany({
                where: {
                    KC3_FCH: tomorrowDecimal,
                    KC3_ESTADO: { not: 'CA' }  // No canceladas
                }
            });

            console.log(`📅 Encontradas ${citas.length} citas para mañana`);

            for (const cita of citas) {
                const pacienteId = cita.KC3_COD;

                // 1. Buscar en TMUSUARIOSFACTURACION (Reemplaza TKCLIENTES)
                // Buscamos tanto por código interno como por documento (OACOD_NUI)
                let factMatch = await prisma.tMUSUARIOSFACTURACION.findFirst({
                    where: { OR: [{ KC2_COD: pacienteId }, { KC2_OACOD_NUI: pacienteId }] }
                });

                let tel = null;
                let nom = 'Paciente';

                if (factMatch) {
                    tel = factMatch.KC2_TEL_RESP || factMatch.KC2_TEL_ACOMP;
                    nom = `${factMatch.KC2_PNOMBRE || ''} ${factMatch.KC2_PAPELLIDO || ''}`.trim() || factMatch.KC2_NOM_RESP;
                }

                // 2. Si no se encontró o no tiene teléfono, buscar en TMUSUARIOSASEGURAMIENTO (Paciente)
                if (!tel) {
                    const asegMatch = await prisma.paciente.findFirst({
                        where: { KC0_COD: pacienteId }
                    });
                    if (asegMatch) {
                        tel = asegMatch.KC0_RES_TEL;
                        nom = asegMatch.KC0_NOM || nom;
                    }
                }

                // 3. Si no hay teléfono, no se puede enviar recordatorio
                if (!tel) {
                    console.log(`⚠️ Paciente ${pacienteId} sin teléfono registrado en Facturación o Aseguramiento`);
                    continue;
                }

                // Objeto simulado para compatibilidad con el resto de la función
                const paciente = {
                    KC_TEL1: tel,
                    KC_NOM: nom
                };

                // Buscar médico
                const medico = await prisma.medico.findFirst({
                    where: { MED_COD: cita.KC3_MEDICO }
                });

                await this.sendReminderMessage(cita, paciente, medico);
                // Esperar entre mensajes
                await new Promise(r => setTimeout(r, 2000));
            }

        } catch (error) {
            console.error('❌ Error enviando recordatorios:', error);
        }
    }

    async sendReminderMessage(cita, paciente, medico) {
        if (!this.client) {
            console.error('❌ Cliente de WhatsApp no inicializado');
            return;
        }

        const rawPhone = paciente.KC_TEL1?.replace(/\D/g, '');
        if (!rawPhone || rawPhone.length < 10) return;

        // Asume prefijo colombiano si son exactamente 10 dígitos (típico en HABEJICO)
        const phone = rawPhone.length === 10 ? `57${rawPhone}` : rawPhone;

        const fechaDate = decimalToDate(cita.KC3_FCH);
        const fechaFormateada = fechaDate.toLocaleDateString('es-CO', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const hh = Number(cita.KC3_HH);
        const mm = Number(cita.KC3_MM);
        const h12 = hh % 12 || 12;
        const period = hh < 12 ? 'AM' : 'PM';
        const horaFormateada = `${h12}:${String(mm).padStart(2, '0')} ${period}`;

        // Almacenado en TKCLIENTES
        const nombrePaciente = paciente.KC_NOM?.split(' ')[0] || 'Paciente';
        const nombreMedico = medico?.MED_NOMBRE?.trim() || 'tu médico asignado';
        const consultorio = cita.KC3_CONSULTORIO || '';

        const mensaje =
            `🔔 *RECORDATORIO DE CITA MÉDICA*\n\n` +
            `Hola *${nombrePaciente}*,\n\n` +
            `Te recordamos que tienes una cita programada para *mañana*:\n\n` +
            `📅 *Fecha:* ${fechaFormateada}\n` +
            `🕐 *Hora:* ${horaFormateada}\n` +
            `👨‍⚕️ *Médico:* ${nombreMedico}\n` +
            (consultorio ? `🚪 *Consultorio:* ${consultorio}\n` : '') +
            `\nPor favor, llega 15 minutos antes de tu cita.\n\n` +
            `Si necesitas cancelar o reprogramar, dímelo por este chat.\n\n` +
            `_Mensaje automático_ 🤖`;

        const whatsappId = `${phone}@c.us`;

        try {
            await this.client.sendMessage(whatsappId, mensaje);
            console.log(`✅ Recordatorio enviado a ${nombrePaciente} (${phone})`);
        } catch (error) {
            console.error(`❌ Error enviando recordatorio a ${phone}:`, error.message);
        }
    }
}

module.exports = new ReminderService();
