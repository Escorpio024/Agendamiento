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
                // Buscar paciente por KC3_COD en TKCLIENTES
                let paciente = await prisma.cliente.findFirst({
                    where: { KC_COD: cita.KC3_COD }
                });

                // Si no está o no tiene teléfono, buscar en TMUSUARIOSASEGURAMIENTO
                if (!paciente?.KC_TEL1) {
                    const pacienteAlt = await prisma.paciente.findFirst({
                        where: { KC0_COD: cita.KC3_COD }
                    });

                    if (pacienteAlt?.KC0_RES_TEL) {
                        paciente = {
                            KC_TEL1: pacienteAlt.KC0_RES_TEL,
                            KC_NOM: pacienteAlt.KC0_NOM
                        };
                    } else {
                        console.log(`⚠️ Paciente ${cita.KC3_COD} sin teléfono registrado ni en TKCLIENTES ni en TMUSUARIOSASEGURAMIENTO`);
                        continue;
                    }
                }

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
