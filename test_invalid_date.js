const sa = require('./availability_service');
require('dotenv').config();

// Restaurar la version antigua de parseRelativeDate para la prueba
const originalCode = sa.parseRelativeDate.toString();

async function run() {
    const res = await sa.getNextAvailableSlots("NaN-NaN-NaN");
    console.log("Result:", res);
    process.exit(0);
}
run();
