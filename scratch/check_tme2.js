const prisma = require('../db');

async function check() {
    try {
        const columns = await prisma.$queryRaw`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TMTURNOSMEDICOS'
        `;
        console.log("Columns in TMTURNOSMEDICOS:", columns);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
check();
