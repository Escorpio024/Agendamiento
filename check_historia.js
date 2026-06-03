const prisma = require('./db');

async function checkHistoria() {
    try {
        const results = await prisma.$queryRawUnsafe(`
            SELECT name FROM sys.tables WHERE name LIKE '%HISTORIA%' OR name LIKE '%ATENCION%'
        `);
        console.log("Tablas de Historia/Atención:", results);
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        process.exit(0);
    }
}

checkHistoria();
