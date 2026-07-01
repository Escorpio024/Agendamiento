const { PrismaClient } = require('@prisma/client');
const medicalPrisma = new PrismaClient();

async function checkCols() {
    try {
        const cols = await medicalPrisma.$queryRaw`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TQMOVIMIENTOHCY'
        `;
        console.log(cols.map(c => c.COLUMN_NAME).filter(c => c.includes('COD')).join(', '));
    } catch (e) {
        console.error(e);
    } finally {
        await medicalPrisma.$disconnect();
    }
}
checkCols();
