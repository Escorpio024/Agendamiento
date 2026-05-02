require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const doc = await prisma.medico.findUnique({
        where: { MED_COD: 1039886829 }
    });
    console.log("Bedoya Lujan:", doc.MED_ESPECIALIDAD_1);
    await prisma.$disconnect();
}
check();
