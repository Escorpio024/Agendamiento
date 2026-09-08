const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const risks = await prisma.$queryRawUnsafe(`SELECT LTRIM(RTRIM([RIESGO CV])) AS risk, COUNT(*) AS c FROM VIQ_ALTO_COSTO WHERE [RIESGO CV] IS NOT NULL AND LTRIM(RTRIM([RIESGO CV])) != '' GROUP BY LTRIM(RTRIM([RIESGO CV]))`);
        console.log("RISKS in VIQ_ALTO_COSTO:");
        console.log(risks);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
