const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const top1 = await prisma.$queryRawUnsafe(`SELECT TOP 1 * FROM VIQ_ALTO_COSTO`);
        console.log("VIQ_ALTO_COSTO:");
        console.log(top1);

        const top2 = await prisma.$queryRawUnsafe(`SELECT TOP 1 * FROM VIQ_MOVIMIENTO_HC WHERE [RIESGO CV] IS NOT NULL`);
        console.log("VIQ_MOVIMIENTO_HC (RIESGO CV IS NOT NULL):");
        console.log(top2);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
