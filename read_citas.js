require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const today = parseInt(new Date().toISOString().split('T')[0].replace(/-/g, ''));
    console.log("Searching from date:", today);
    
    const citas = await prisma.cita.findMany({
        where: { KC3_FCH: { gte: today } },
        orderBy: { KC3_FCH: 'desc' },
        take: 20
    });
    
    console.log(`Found ${citas.length} appointments.`);
    citas.forEach(c => {
        console.log(`ID: ${c.KC3_COD}, FCH: ${c.KC3_FCH}, HH: ${c.KC3_HH}, EST: ${c.KC3_ESTADO}, MED: ${c.KC3_MEDICO}`);
    });
    
    await prisma.$disconnect();
}
check();
