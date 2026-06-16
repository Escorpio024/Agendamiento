require('dotenv').config();
const { getWeekAvailability } = require('./availability_service');
const prisma = require('./db');

async function testWeek() {
    console.log("Probando disponibilidad semanal para sede Sevilla...");
    try {
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        console.log("Desde la fecha:", dateStr);
        const slots = await getWeekAvailability(dateStr, 'medicina general', null, 7, 45, 'Sevilla');
        
        console.log(`Se encontraron ${slots.length} días con disponibilidad.`);
        console.log(JSON.stringify(slots, null, 2));
    } catch (err) {
        console.error("Error:", err);
    } finally {
        prisma.$disconnect();
    }
}

testWeek();
