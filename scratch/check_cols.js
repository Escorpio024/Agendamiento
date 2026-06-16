require('dotenv').config({ quiet: true });
const prisma = require('./db');

async function main() {
    console.log('[DB] Conectando...');
    
    // Ver columnas de TMUSUARIOSASEGURAMIENTO
    const cols0 = await prisma.$queryRawUnsafe(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'TMUSUARIOSASEGURAMIENTO'
        AND (COLUMN_NAME LIKE '%TIP%' OR COLUMN_NAME LIKE '%DOC%' OR COLUMN_NAME LIKE '%NUI%' OR COLUMN_NAME LIKE '%COD%')
        ORDER BY COLUMN_NAME
    `);
    console.log('=== TMUSUARIOSASEGURAMIENTO (KC0) columnas tipo/doc ===');
    cols0.forEach(c => console.log(' ' + c.COLUMN_NAME));

    // Ver columnas de TMUSUARIOSFACTURACION
    const cols2 = await prisma.$queryRawUnsafe(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'TMUSUARIOSFACTURACION'
        AND (COLUMN_NAME LIKE '%TIP%' OR COLUMN_NAME LIKE '%DOC%' OR COLUMN_NAME LIKE '%NUI%')
        ORDER BY COLUMN_NAME
    `);
    console.log('\n=== TMUSUARIOSFACTURACION (KC2) columnas tipo/doc ===');
    cols2.forEach(c => console.log(' ' + c.COLUMN_NAME));

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
