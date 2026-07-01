/**
 * Explorar TQVALORACIONRIESGO - tabla de valoración de riesgo cardiovascular
 */
const prisma = require('../db');

async function main() {
    console.log('═══ EXPLORANDO TQVALORACIONRIESGO ═══\n');

    // Columnas
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TQVALORACIONRIESGO'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`Columnas (${cols.length}):`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? '('+c.CHARACTER_MAXIMUM_LENGTH+')' : ''}]`);
    } catch(e) { console.log('❌', e.message); }

    // Contar registros
    try {
        const cnt = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS t FROM TQVALORACIONRIESGO`);
        console.log(`\nTotal registros: ${cnt[0].t}`);
    } catch(e) { console.log('❌ count:', e.message); }

    // Muestra de datos
    try {
        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 5 * FROM TQVALORACIONRIESGO ORDER BY QNJ_FCH DESC`);
        console.log(`\nMuestra (5 registros recientes):`);
        console.log(JSON.stringify(sample, null, 2).substring(0, 2000));
    } catch(e) { 
        // intentar sin ORDER
        try {
            const sample = await prisma.$queryRawUnsafe(`SELECT TOP 5 * FROM TQVALORACIONRIESGO`);
            console.log(`\nMuestra (5 registros):`);
            console.log(JSON.stringify(sample, null, 2).substring(0, 2000));
        } catch(e2) { console.log('❌ muestra:', e2.message); }
    }

    // Registros en 2026
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TQVALORACIONRIESGO' AND COLUMN_NAME LIKE '%FCH%'
        `);
        console.log(`\nColumnas de fecha: ${cols.map(c=>c.COLUMN_NAME).join(', ')}`);
    } catch(e) {}

    // Ver datos más recientes por mes
    try {
        const byMonth = await prisma.$queryRawUnsafe(`
            SELECT TOP 20
                LEFT(CAST(QNJ_FCH AS VARCHAR), 6) AS mes,
                QNJ_RIESGO AS riesgo,
                COUNT(*) AS total
            FROM TQVALORACIONRIESGO
            WHERE QNJ_FCH >= 20260101
            GROUP BY LEFT(CAST(QNJ_FCH AS VARCHAR), 6), QNJ_RIESGO
            ORDER BY mes DESC, total DESC
        `);
        console.log(`\n\nDatos 2026 por mes y riesgo:`);
        for (const r of byMonth) console.log(`  ${r.mes} | riesgo=${r.riesgo}: ${r.total}`);
    } catch(e) {
        console.log('❌ por mes:', e.message.substring(0,120));
        // Buscar el campo de fecha real
        try {
            const sample = await prisma.$queryRawUnsafe(`SELECT TOP 3 * FROM TQVALORACIONRIESGO`);
            console.log('Todas las claves:', Object.keys(sample[0] || {}));
        } catch(e2) {}
    }

    // Buscar también si hay tabla framingham3280 como sinónimo o alias
    try {
        const synonyms = await prisma.$queryRawUnsafe(`
            SELECT name, base_object_name FROM sys.synonyms WHERE name LIKE '%framingham%' OR name LIKE '%3280%'
        `);
        console.log(`\nSinónimos framingham/3280:`, synonyms);
    } catch(e) {}

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
