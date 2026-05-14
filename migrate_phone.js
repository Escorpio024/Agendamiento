require('dotenv').config();
const botPrisma = require('./dbBot');

async function main() {
    try {
        await botPrisma.$executeRawUnsafe(
            `ALTER TABLE AppointmentLog ADD COLUMN patientPhone TEXT`
        );
        console.log('✅ Columna patientPhone agregada correctamente');
    } catch (e) {
        if (e.message && (e.message.includes('duplicate column') || e.message.includes('already exists'))) {
            console.log('ℹ️  La columna patientPhone ya existía');
        } else {
            console.error('❌ Error:', e.message);
        }
    }

    // Verificar que quedó bien
    const cols = await botPrisma.$queryRawUnsafe(`PRAGMA table_info(AppointmentLog)`);
    console.log('\nColumnas actuales de AppointmentLog:');
    cols.forEach(c => console.log(` - ${c.name} (${c.type})`));
}

main().finally(() => process.exit(0));
