process.env.LOG_LEVEL = 'debug';
const prisma = require('./db');
const availabilityService = require('./availability_service');
const logger = require('./logger');

async function test() {
    console.log(`\n🔍 Buscando slots DIRECTAMENTE el 2026-08-04...`);
    const slots = await availabilityService.getAvailableSlots('2026-08-04', 'medicina general', 'p y p medicos');
    console.log(`Resultado: ${slots.length} slots encontrados.`);
    if (slots.length > 0) {
        const slot = slots[Math.floor(slots.length / 2)];
        console.log('\n🏥 Intentando reservar...', slot);
        const pacData = { KC0_COD: '15261601', zona: '99', KC0_ENTIDAD: 235 }; // Sura o algo, para q pase
        const reserved = await availabilityService.reserveSlot(
            '2026-08-04',
            slot.time,
            'test_wa_id', 
            'medicina general',
            slot.doctorId,
            pacData
        );
        console.log('Resultado reserva:', reserved);
    }
    await prisma.$disconnect();
}
test().catch(console.error);
