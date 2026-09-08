const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const tables = await prisma.$queryRawUnsafe(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%RIESGO%' OR TABLE_NAME LIKE '%FRAMINGHAM%' OR TABLE_NAME LIKE '%VALORACION%'`);
        console.log("TABLES:");
        console.log(tables);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
