require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspect() {
    try {
        console.log("Inspeccionando un par de citas reales (estado 01 o null)...");
        const citas = await prisma.cita.findMany({
            where: {
                OR: [
                    { KC3_ESTADO: '01' },
                    { KC3_ESTADO: null }
                ]
            },
            take: 3
        });
        
        console.log(JSON.stringify(citas, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
inspect();
