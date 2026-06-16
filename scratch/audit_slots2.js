const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const availabilityService = require('../availability_service');

async function main() {
    try {
        // Probar varios días hacia adelante
        const dias = ['2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-23'];

        console.log('\n=== PROBANDO EBEJICO (Medico 1=333, Medico 2=123, Medico 3=555) ===');
        for (const dia of dias) {
            const slots = await availabilityService.getAvailableSlots(dia, 'medicina general', null, false, 'Ebejico', false);
            console.log(`${dia}: ${slots.length} slots | Doctores: ${[...new Set(slots.map(s=>s.doctorId))].join(', ') || 'NINGUNO'}`);
        }

        console.log('\n=== PROBANDO SEVILLA (Medico Sevilla=444, Medico Sevilla 1=777) ===');
        for (const dia of dias) {
            const slots = await availabilityService.getAvailableSlots(dia, 'medicina general', null, false, 'Sevilla', false);
            console.log(`${dia}: ${slots.length} slots | Doctores: ${[...new Set(slots.map(s=>s.doctorId))].join(', ') || 'NINGUNO'}`);
        }

        // Verificar qué turnos en TME tienen esos médicos
        console.log('\n=== TURNOS ACTIVOS EN TMTURNOSMEDICOS para 333, 123, 555, 444, 777 ===');
        const hoyDec = parseInt(new Date().toISOString().slice(0,10).replace(/-/g,''));
        const turnos = await prisma.$queryRaw`
            SELECT TME_CODM, TME_FCH, TME_FCH_FIN, TME_ESPECIALIDAD
            FROM TMTURNOSMEDICOS
            WHERE TME_CODM IN (333, 123, 555, 444, 777)
              AND (TME_FCH_FIN IS NULL OR TME_FCH_FIN >= ${hoyDec})
            ORDER BY TME_CODM, TME_FCH DESC
        `;
        if (turnos.length === 0) {
            console.log('⚠️  NINGÚN turno activo en TMTURNOSMEDICOS para los doctores de la lista blanca!');
        } else {
            console.table(turnos);
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
main();
