const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('=== BUSCANDO MÉDICOS POR NOMBRE ===\n');

        // Buscar por todos los nombres candidatos
        const docs = await prisma.$queryRaw`
            SELECT 
                MED_COD, 
                LTRIM(RTRIM(MED_NOMBRE)) as nombre, 
                MED_ESPECIALIDAD_1,
                MED_CONSULTORIO,
                MED_EST_ESTADO
            FROM TMMEDICOS 
            WHERE MED_NOMBRE LIKE '%Medico%' 
               OR MED_NOMBRE LIKE '%Sevilla%'
               OR MED_NOMBRE LIKE '%PYP%'
               OR MED_NOMBRE LIKE '%prueba%'
               OR MED_NOMBRE LIKE '%test%'
            ORDER BY MED_COD
        `;
        console.log('Doctores encontrados en TMMEDICOS:');
        console.table(docs);

        console.log('\n=== VERIFICANDO TURNOS ACTIVOS (TMTURNOSMEDICOS) ===\n');
        // Verificar si esos doctores tienen turnos activos en el sistema
        if (docs.length > 0) {
            const codigos = docs.map(d => Number(d.MED_COD));
            for (const cod of codigos) {
                const turnos = await prisma.$queryRaw`
                    SELECT TOP 3 TME_CODM, TME_FCH, TME_FCH_FIN, TME_ESPECIALIDAD, TME_DUR_CITA
                    FROM TMTURNOSMEDICOS
                    WHERE TME_CODM = ${cod}
                    ORDER BY TME_FCH DESC
                `;
                if (turnos.length > 0) {
                    console.log(`\nDoctor COD=${cod} — Turnos recientes:`);
                    console.table(turnos);
                } else {
                    console.log(`\nDoctor COD=${cod} — ⚠️ SIN TURNOS en TMTURNOSMEDICOS`);
                }
            }
        }

        console.log('\n=== VERIFICANDO SLOTS (TMTURNOSMEDICOSDETALLE / TME2) ===\n');
        // Buscar slots de hoy en adelante
        const hoy = new Date();
        const todayDec = parseInt(`${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}`);
        console.log(`Fecha de hoy decimal: ${todayDec}`);
        
        if (docs.length > 0) {
            const codigos = docs.map(d => Number(d.MED_COD));
            for (const cod of codigos) {
                const slots = await prisma.$queryRaw`
                    SELECT TOP 3 TME2_CODM, TME2_FCH, TME2_HH, TME2_MM, LTRIM(RTRIM(TME2_COD)) as TME2_COD
                    FROM TMTURNOSMEDICOSDETALLE
                    WHERE TME2_CODM = ${cod}
                      AND TME2_FCH >= ${todayDec}
                    ORDER BY TME2_FCH, TME2_HH, TME2_MM
                `;
                if (slots.length > 0) {
                    console.log(`\nDoctor COD=${cod} — Slots próximos:`);
                    console.table(slots);
                } else {
                    console.log(`\nDoctor COD=${cod} — ⚠️ SIN SLOTS FUTUROS en TME2`);
                }
            }
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
