const prisma = require('./db');

async function checkPypTables() {
    try {
        const results = await prisma.$queryRawUnsafe(`
            SELECT name FROM sys.tables WHERE name LIKE '%PYP%' OR name LIKE '%MEDICO%'
        `);
        console.log("Tablas PYP o Medico:", results);
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        process.exit(0);
    }
}

checkPypTables();
