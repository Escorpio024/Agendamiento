const { PrismaClient } = require('@prisma/client');
const medicalPrisma = new PrismaClient();

async function testJoin() {
    try {
        const start = 20260101;
        const end = 20261231;
        const rows = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 5 
                v.[TIENE HTA], v.[TIENE DM], v.[ESTADIO ERC],
                v.[HEMOGLOBINA GLI], v.[COLESTEROL LDL],
                v.[P. Sistolica] AS PSistolica, v.[P. Diastolica] AS PDiastolica,
                c.KC3_ENTIDAD, c.KC3_FCH
            FROM TMCITASUSUARIOS c
            INNER JOIN VIQ_MOVIMIENTO_HC_ALTO_COSTO v ON c.KC3_COD = v.Codigo_KC AND c.KC3_FCH = v.[Fecha HC]
            WHERE c.KC3_FCH >= ${start} AND c.KC3_FCH <= ${end}
              AND c.KC3_NUM > 0
              AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13','890301-14','890301-15','890301-16')
        `);
        console.log("Rows returned:", rows.length);
        console.log(rows);
    } catch (e) {
        console.error(e);
    } finally {
        await medicalPrisma.$disconnect();
    }
}
testJoin();
