require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    console.log("Checking appointments for March 23, 2026...");
    const citas = await prisma.cita.findMany({
        where: { KC3_FCH: 20260323 }
    });
    
    console.log(`Found ${citas.length} appointments.`);
    citas.forEach(c => {
        console.log("CITA:", JSON.stringify(c));
    });

    await prisma.$disconnect();
}
check();
