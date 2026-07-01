const { PrismaClient } = require('@prisma/client');
const medicalPrisma = new PrismaClient();

async function testQuery() {
    try {
        const rows = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 10 
                [Fecha HC], [Codigo_KC], [TIENE HTA], [P. Sistolica], [P. Diastolica],
                [TIENE DM], [HEMOGLOBINA GLI], [COLESTEROL LDL], [ESTADIO ERC], [RIESGO CV]
            FROM VIQ_MOVIMIENTO_HC_ALTO_COSTO
            WHERE [Fecha HC] >= 20260101
        `);
        console.log(rows);
    } catch (e) {
        console.error(e);
    } finally {
        await medicalPrisma.$disconnect();
    }
}
testQuery();
