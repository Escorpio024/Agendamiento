require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function isertarHorarios() {
    try {
        console.log("Iniciando inserción de horarios masivos...");

        // 1. Asegurar que existe la especialidad 999 (Medicina General) y otras.
        const especialidades = [
            { ESP_COD: '999', ESP_NOMBRE: 'MEDICINA GENERAL', ESP_ACTIVA: 'S' },
            { ESP_COD: '461', ESP_NOMBRE: 'ODONTOLOGIA GENERAL', ESP_ACTIVA: 'S' },
            { ESP_COD: '510', ESP_NOMBRE: 'PEDIATRIA', ESP_ACTIVA: 'S' }
        ];

        for (const esp of especialidades) {
            const e = await prisma.especialidad.findUnique({ where: { ESP_COD: esp.ESP_COD } });
            if (!e) {
                await prisma.especialidad.create({
                    data: {
                        ESP_COD: esp.ESP_COD,
                        ESP_NOMBRE: esp.ESP_NOMBRE,
                        ESP_PUB_WEB: 'S'
                    }
                });
                console.log(`Especialidad creada: ${esp.ESP_COD} - ${esp.ESP_NOMBRE}`);
            }
        }

        // 2. Asegurar que existen algunos médicos.
        const medicos = [
            { MED_COD: 44191600, MED_NOMBRE: 'DR. OSCAR PRUEBA (GENERAL)', ESP: '999' },
            { MED_COD: 88291601, MED_NOMBRE: 'DRA. MARTA GOMEZ (ODONTOLOGIA)', ESP: '461' },
            { MED_COD: 99391602, MED_NOMBRE: 'DR. CARLOS RUIZ (PEDIATRIA)', ESP: '510' }
        ];

        for (const med of medicos) {
            const m = await prisma.medico.findUnique({ where: { MED_COD: med.MED_COD } });
            if (!m) {
                await prisma.medico.create({
                    data: {
                        MED_COD: med.MED_COD,
                        MED_NOMBRE: med.MED_NOMBRE,
                        MED_ESPECIALIDAD_1: med.ESP,
                        MED_EST_ESTADO: 'A', // Activo
                        MED_CONSULTORIO: '101'
                    }
                });
                console.log(`Médico creado: ${med.MED_COD} - ${med.MED_NOMBRE}`);
            }
        }

        // 3. Generar Turnos Médicos (Disponibilidad) para los próximos 60 días.
        console.log("Generando turnos para los próximos 60 días...");
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + 60);

        const dStart = parseInt(`${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`);
        const dEnd = parseInt(`${futureDate.getFullYear()}${String(futureDate.getMonth()+1).padStart(2,'0')}${String(futureDate.getDate()).padStart(2,'0')}`);

        for (const med of medicos) {
            // Delete old overlapping schedules just in case
            await prisma.turnoMedico.deleteMany({
                where: { TME_CODM: med.MED_COD }
            });

            await prisma.turnoMedico.create({
                data: {
                    TME_CODM: med.MED_COD,
                    TME_FCH: dStart,
                    TME_FCH_FIN: dEnd,
                    
                    // Franja de la MAÑANA: 08:00 AM a 12:00 PM
                    TME_HH_I: 8,
                    TME_MM_I: 0,
                    TME_HH_F: 12,
                    TME_MM_F: 0,

                    // Franja de la TARDE: 02:00 PM (14:00) a 06:00 PM (18:00)
                    TME_HH_I_A: 14,
                    TME_MM_I_A: 0,
                    TME_HH_F_A: 18,
                    TME_MM_F_A: 0,

                    TME_DUR_CITA: 30, // 30 minutos por cita
                    TME_ESPECIALIDAD: med.ESP,
                    TME_CONSULTORIO: '101'
                }
            });
            console.log(`Turnos agregados para ${med.MED_NOMBRE} desde ${dStart} hasta ${dEnd}`);
        }

        console.log("¡Horarios insertados correctamente!");
    } catch (e) {
        console.error("Error al insertar horarios:", e);
    } finally {
        await prisma.$disconnect();
    }
}

isertarHorarios();
