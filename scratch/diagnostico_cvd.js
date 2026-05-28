require('dotenv').config();
const medicalPrisma = require('../db');

async function main() {
        const d = await medicalPrisma.$queryRawUnsafe(`
                SELECT y.YKL_ARTIC, y.YKL_FECHA, y.YKL_PROCESADA_LAB 
                FROM TYORDENESLABENVIADAS y
                WHERE CAST(TRY_CAST(y.YKL_NUMERO_ID AS BIGINT) AS VARCHAR) = '21711770'
                  AND REPLACE(y.YKL_ARTIC, '*', '') = '903426'
        `);
        console.table(d);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
