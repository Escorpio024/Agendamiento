require('dotenv').config();
const prisma = require('../db');

async function main() {
    // Buscar todos los médicos con MED_EST_ESTADO = 'A' (activos)
    const doctors = await prisma.$queryRawUnsafe(`
        SELECT MED_COD, MED_NOMBRE, MED_EST_ESTADO 
        FROM TMMEDICOS 
        WHERE MED_EST_ESTADO = 'A' OR MED_EST_ESTADO IS NULL
        ORDER BY MED_COD
    `);
    console.log("Todos los medicos activos:");
    doctors.forEach(m => console.log(`  COD: ${m.MED_COD} | NOMBRE: "${m.MED_NOMBRE?.trim()}" | ESTADO: ${m.MED_EST_ESTADO}`));
    await prisma.$disconnect();
    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
