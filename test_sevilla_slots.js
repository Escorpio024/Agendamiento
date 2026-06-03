require('dotenv').config();
const { getAvailableSlots } = require('./availability_service');
const prisma = require('./db');

async function testSevilla() {
    console.log("Probando disponibilidad para sede Sevilla...");
    try {
        const slots = await getAvailableSlots('hoy', 'medicina general', null, false, 'Sevilla');
        console.log(`Se encontraron ${slots.length} slots para Sevilla hoy.`);
        if (slots.length > 0) {
            console.log(slots.slice(0, 5)); // Mostrar los primeros 5
        } else {
            console.log("No hay slots hoy. Buscando mañana...");
            const slotsManana = await getAvailableSlots('mañana', 'medicina general', null, false, 'Sevilla');
            console.log(`Se encontraron ${slotsManana.length} slots para Sevilla mañana.`);
            if (slotsManana.length > 0) {
                console.log(slotsManana.slice(0, 5));
            }
        }
    } catch (err) {
        console.error("Error probando disponibilidad:", err);
    } finally {
        prisma.$disconnect();
    }
}

testSevilla();
