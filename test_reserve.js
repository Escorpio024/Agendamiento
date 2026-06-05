process.env.LOG_LEVEL = 'debug';
const prisma = require('./db');
const availabilityService = require('./availability_service');
const logger = require('./logger');
logger.level = 'debug';

async function test() {
    console.log(`\n🔍 Buscando slots DIRECTAMENTE el 2026-08-04...`);
    const slots = await availabilityService.getAvailableSlots('2026-08-04', 'medicina general', 'p y p medicos');
    console.log(`Resultado: ${slots.length} slots encontrados.`);
    if (slots.length > 0) console.log(slots.slice(0, 5));
    await prisma.$disconnect();
}
test();
