const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const cols = await prisma.$queryRawUnsafe(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TQVALORACIONRIESGO'`);
        console.log("COLUMNS:");
        console.log(cols);
        
        const top1 = await prisma.$queryRawUnsafe(`SELECT TOP 1 * FROM TQVALORACIONRIESGO`);
        console.log("TOP 1 ROW:");
        console.log(top1);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
