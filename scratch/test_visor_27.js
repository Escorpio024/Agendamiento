require('dotenv').config();
const prisma = require('./db');

async function testVisor() {
    console.log("Revisando TMTURNOSMEDICOSDETALLE para Medico Sevilla (444) el 27/05/2026...");
    try {
        const slots = await prisma.$queryRawUnsafe(`
            SELECT 
                TME2_CODM as medico_id,
                TME2_FCH as fecha,
                TME2_HH as hh,
                TME2_MM as mm,
                TME2_ESTADO as estado,
                TME2_COD as paciente_cod
            FROM TMTURNOSMEDICOSDETALLE
            WHERE TME2_CODM = 444
              AND TME2_FCH = 20260527
            ORDER BY TME2_HH, TME2_MM
        `);
        console.log(`Encontrados ${slots.length} registros en TME2 para el 27/05.`);
        if (slots.length > 0) {
            console.log("Muestra de 5 registros:");
            console.log(slots.slice(0, 5));
        }

        const turnos = await prisma.$queryRawUnsafe(`
            SELECT * FROM TMTURNOSMEDICOS
            WHERE TME_CODM = 444
              AND TME_FCH <= 20260527
              AND (TME_FCH_FIN IS NULL OR TME_FCH_FIN >= 20260527)
        `);
        console.log(`Encontrados ${turnos.length} registros en TMTURNOSMEDICOS para el 27/05.`);
        if (turnos.length > 0) {
            console.log(turnos);
        }

    } catch (err) {
        console.error(err);
    } finally {
        prisma.$disconnect();
    }
}

testVisor();
