const prisma = require('./db');

async function getEspecialidades() {
    try {
        const results = await prisma.$queryRawUnsafe(`
            SELECT ESP_COD, ESP_NOMBRE 
            FROM TMESPECIALIDADES 
            WHERE ESP_NOMBRE LIKE '%PYP%' OR ESP_NOMBRE LIKE '%PROMOCION%' OR ESP_NOMBRE LIKE '%MEDICINA%'
        `);
        console.log("Especialidades encontradas:");
        results.forEach(r => console.log(r));
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        process.exit(0);
    }
}

getEspecialidades();
