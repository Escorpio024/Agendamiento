const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("=== Analizando Vistas de Riesgo Cardiovascular ===");
        
        // Revisar columnas de VIQ_MOVIMIENTO_HC_ALTO_COSTO
        const cols = await prisma.$queryRaw`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'VIQ_MOVIMIENTO_HC_ALTO_COSTO'
        `;
        
        console.log("Columnas en VIQ_MOVIMIENTO_HC_ALTO_COSTO:");
        for(let c of cols) {
            console.log(` - ${c.COLUMN_NAME} (${c.DATA_TYPE})`);
        }

        // Consultar un par de registros de ejemplo
        console.log("\nEjemplo de datos en VIQ_MOVIMIENTO_HC_ALTO_COSTO:");
        const data1 = await prisma.$queryRaw`SELECT TOP 2 * FROM VIQ_MOVIMIENTO_HC_ALTO_COSTO`;
        console.log(data1);

        console.log("\n============================================\n");
        
        // Revisar columnas de TQMOVIMIENTOHCY que tiene QY1_EST_DX_RCARDIO
        const cols2 = await prisma.$queryRaw`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TQMOVIMIENTOHCY'
        `;
        console.log("Columnas en TQMOVIMIENTOHCY (donde anota el médico):");
        for(let c of cols2) {
            console.log(` - ${c.COLUMN_NAME} (${c.DATA_TYPE})`);
        }
        
    } catch(e) {
        console.error('DB Error:', e.message);
    }
    process.exit(0);
}
main();
