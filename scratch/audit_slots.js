const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const availabilityService = require('../availability_service');

async function main() {
    try {
        const hoy = new Date();
        const todayStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
        const manaStr = `${manana.getFullYear()}-${String(manana.getMonth()+1).padStart(2,'0')}-${String(manana.getDate()).padStart(2,'0')}`;

        console.log(`\n=== TEST DISPONIBILIDAD SEDE EBEJICO (Medico 1/2/3) ===`);
        console.log(`Fecha de prueba: ${manaStr}\n`);
        const ebejico = await availabilityService.getAvailableSlots(manaStr, 'medicina general', null, false, 'Ebejico', false);
        if (!ebejico || ebejico.length === 0) {
            console.log('⚠️  Sin slots disponibles para Ebejico mañana');
        } else {
            console.log(`✅ ${ebejico.length} slots disponibles para Ebejico`);
            // Mostrar doctores únicos
            const doctoresUnicos = [...new Set(ebejico.map(s => `${s.doctorName} (cod:${s.doctorId})`))];
            console.log('Doctores:', doctoresUnicos.join('\n         '));
            console.log('Primeros 5 slots:');
            ebejico.slice(0, 5).forEach(s => console.log(` - ${s.time} | ${s.doctorName} | ${s.date}`));
        }

        console.log(`\n=== TEST DISPONIBILIDAD SEDE SEVILLA (Medico Sevilla/Sevilla 1) ===`);
        const sevilla = await availabilityService.getAvailableSlots(manaStr, 'medicina general', null, false, 'Sevilla', false);
        if (!sevilla || sevilla.length === 0) {
            console.log('⚠️  Sin slots disponibles para Sevilla mañana');
        } else {
            console.log(`✅ ${sevilla.length} slots disponibles para Sevilla`);
            const doctoresSevillaUnicos = [...new Set(sevilla.map(s => `${s.doctorName} (cod:${s.doctorId})`))];
            console.log('Doctores:', doctoresSevillaUnicos.join('\n         '));
            console.log('Primeros 5 slots:');
            sevilla.slice(0, 5).forEach(s => console.log(` - ${s.time} | ${s.doctorName} | ${s.date}`));
        }

    } catch (e) {
        console.error('Error:', e.message);
        console.error(e.stack);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
main();
