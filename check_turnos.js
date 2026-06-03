const prisma = require('./db');

async function checkTurnos() {
    try {
        const results = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT e.ESP_NOMBRE, e.ESP_COD
            FROM TMTURNOSMEDICOSDETALLE t
            JOIN TMESPECIALIDADES e ON t.TME_ESPECIALIDAD = e.ESP_COD
            WHERE t.TME_FCH > 20260101
        `);
        console.log("Especialidades activas en turnos desde 2026:");
        results.forEach(r => console.log(r));
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        process.exit(0);
    }
}

checkTurnos();
