/**
 * Explorar la tabla framingham3280 en la base de datos
 */
const prisma = require('../db');

async function main() {
    console.log('═══ EXPLORANDO TABLA framingham3280 ═══\n');

    // 1. Verificar que existe y ver columnas
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'framingham3280'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`✅ Tabla framingham3280 encontrada. Columnas (${cols.length}):`);
        for (const c of cols) {
            console.log(`  - ${c.COLUMN_NAME} [${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''}] ${c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        }
    } catch (e) {
        console.error('❌ Error leyendo columnas:', e.message);
    }

    // 2. Ver cuántos registros hay
    try {
        const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS total FROM framingham3280`);
        console.log(`\n📊 Total registros: ${count[0].total}`);
    } catch (e) {
        console.error('❌ Error contando registros:', e.message);
    }

    // 3. Ver muestra de datos
    try {
        const rows = await prisma.$queryRawUnsafe(`SELECT TOP 5 * FROM framingham3280`);
        console.log('\n📋 Muestra de datos (primeros 5 registros):');
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error('❌ Error leyendo datos:', e.message);
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
