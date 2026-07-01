const { PrismaClient } = require('@prisma/client');
const medicalPrisma = new PrismaClient();

async function checkSchema() {
    try {
        console.log("Checking TQMOVIMIENTOHCY columns...");
        const cols1 = await medicalPrisma.$queryRaw`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TQMOVIMIENTOHCY'
            AND COLUMN_NAME LIKE 'QY1_%'
        `;
        console.log(cols1.filter(c => ['QY1_EST_DX_RCARDIO', 'QY1_PORCE_FRAMI', 'QY1_CLA_FRAMI', 'QY1_EST_FUMA', 'QY1_EST_DIABE'].includes(c.COLUMN_NAME)));

        console.log("Checking VIQ_MOVIMIENTO_HC_ALTO_COSTO columns...");
        const cols2 = await medicalPrisma.$queryRaw`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'VIQ_MOVIMIENTO_HC_ALTO_COSTO'
        `;
        console.log(cols2.map(c => c.COLUMN_NAME).join(', '));
        
        console.log("Fetching a sample row from VIQ_MOVIMIENTO_HC_ALTO_COSTO...");
        const sample = await medicalPrisma.$queryRaw`
            SELECT TOP 1 * FROM VIQ_MOVIMIENTO_HC_ALTO_COSTO
        `;
        console.log(sample);
    } catch (e) {
        console.error(e);
    } finally {
        await medicalPrisma.$disconnect();
    }
}
checkSchema();
