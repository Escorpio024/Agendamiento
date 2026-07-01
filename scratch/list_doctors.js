require('dotenv').config();
const prisma = require('../db');

async function main() {
    const doctors = await prisma.medico.findMany({
        select: { MED_COD: true, MED_NOMBRE: true },
        orderBy: { MED_COD: 'asc' }
    });
    doctors.forEach(m => console.log(m.MED_COD, '-', m.MED_NOMBRE?.trim()));
    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
