const prisma = require('./db');

async function checkStates() {
    try {
        const results = await prisma.$queryRawUnsafe(`
            SELECT KC3_GENERADA, COUNT(*) as count 
            FROM TMCITASUSUARIOS 
            WHERE KC3_FCH > 20250101 
            GROUP BY KC3_GENERADA
        `);
        console.log("Estados KC3_GENERADA (desde 2025):", results);

        const resultsNum = await prisma.$queryRawUnsafe(`
            SELECT 
                CASE WHEN KC3_NUM > 0 THEN 'FACTURADA' ELSE 'SIN FACTURA' END as estado, 
                COUNT(*) as count 
            FROM TMCITASUSUARIOS 
            WHERE KC3_FCH > 20250101 
            GROUP BY CASE WHEN KC3_NUM > 0 THEN 'FACTURADA' ELSE 'SIN FACTURA' END
        `);
        console.log("Estados KC3_NUM (desde 2025):", resultsNum);

    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        process.exit(0);
    }
}

checkStates();
