const prisma = require('./db');

async function checkAtenciones() {
    try {
        const results = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TMREGISTROATENCIONES'
        `);
        console.log("Columnas de TMREGISTROATENCIONES:", results);
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        process.exit(0);
    }
}

checkAtenciones();
