/**
 * Explorar tablas médicas disponibles en HABEJICO relacionadas con CVD
 */
const prisma = require('../db');

async function main() {
    console.log('═══ TABLAS MÉDICAS EN HABEJICO ═══\n');

    // Ver todas las tablas del sistema médico (TM = Tablas Médicas en Xenco)
    try {
        const tables = await prisma.$queryRawUnsafe(`
            SELECT name FROM sys.tables 
            WHERE name LIKE 'TM%' OR name LIKE 'KC%' OR name LIKE 'TK%'
            ORDER BY name
        `);
        console.log(`Tablas médicas (${tables.length}):`);
        for (const t of tables) console.log(`  - ${t.name}`);
    } catch(e) { console.error(e.message); }

    // Buscar tablas de exámenes o resultados clínicos
    console.log('\n\n═══ TABLAS CON EXÁMENES / RESULTADOS / CVD ═══');
    try {
        const relevant = await prisma.$queryRawUnsafe(`
            SELECT name FROM sys.tables 
            WHERE name LIKE '%EXAM%' 
               OR name LIKE '%RESULT%'
               OR name LIKE '%LABORA%'
               OR name LIKE '%CONTROL%'
               OR name LIKE '%SIGNOS%'
               OR name LIKE '%VITAL%'
               OR name LIKE '%CLINIC%'
               OR name LIKE '%HISTORIA%'
               OR name LIKE '%ANTECED%'
               OR name LIKE '%DIABET%'
               OR name LIKE '%HIPERT%'
               OR name LIKE '%CARDIO%'
               OR name LIKE '%FRAMINGHAM%'
            ORDER BY name
        `);
        console.log(`(${relevant.length}):`);
        for (const t of relevant) console.log(`  - ${t.name}`);
    } catch(e) { console.error(e.message); }

    // Explorar estructura de TMCITASUSUARIOS (citas, que es la principal)
    console.log('\n\n═══ COLUMNAS TMCITASUSUARIOS ═══');
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TMCITASUSUARIOS'
            ORDER BY ORDINAL_POSITION
        `);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);
    } catch(e) { console.error(e.message); }

    // Ver artículos CVD reales disponibles en el sistema
    console.log('\n\n═══ ARTÍCULOS CVD DISPONIBLES (últimos 6 meses) ═══');
    try {
        const arts = await prisma.$queryRawUnsafe(`
            SELECT LTRIM(RTRIM(KC3_ARTIC)) AS artic, COUNT(*) AS total
            FROM TMCITASUSUARIOS
            WHERE KC3_FCH >= 20260101
              AND KC3_NUM > 0
              AND LTRIM(RTRIM(KC3_ARTIC)) IN (
                '890301-7','890301-8','890301-12','890301-13',
                '890301-14','890301-15','890301-16'
              )
            GROUP BY LTRIM(RTRIM(KC3_ARTIC))
            ORDER BY total DESC
        `);
        console.log(`Artículos CVD facturados en 2026 (${arts.length}):`);
        for (const a of arts) console.log(`  ${a.artic}: ${a.total} citas`);
    } catch(e) { console.error(e.message); }

    // Ver citas por mes y EPS en 2026
    console.log('\n\n═══ CITAS CVD POR MES Y EPS (2026) ═══');
    try {
        const byMonth = await prisma.$queryRawUnsafe(`
            SELECT 
                LEFT(CAST(c.KC3_FCH AS VARCHAR), 6) AS mes,
                c.KC3_ENTIDAD,
                LTRIM(RTRIM(e.ENT_NOMBRE)) AS eps,
                COUNT(*) AS total
            FROM TMCITASUSUARIOS c
            LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
            WHERE c.KC3_FCH >= 20260101
              AND c.KC3_NUM > 0
              AND LTRIM(RTRIM(c.KC3_ARTIC)) IN (
                '890301-7','890301-8','890301-12','890301-13',
                '890301-14','890301-15','890301-16'
              )
            GROUP BY LEFT(CAST(c.KC3_FCH AS VARCHAR), 6), c.KC3_ENTIDAD, LTRIM(RTRIM(e.ENT_NOMBRE))
            ORDER BY mes, total DESC
        `);
        console.log(`Resultados (${byMonth.length} filas):`);
        for (const r of byMonth) console.log(`  ${r.mes} | EPS ${r.KC3_ENTIDAD}(${r.eps}): ${r.total}`);
    } catch(e) { console.error(e.message); }

    // Ver tablas de formularios / historia clínica
    console.log('\n\n═══ TABLAS DE HISTORIA CLÍNICA / FÓRMULAS ═══');
    try {
        const hc = await prisma.$queryRawUnsafe(`
            SELECT name FROM sys.tables
            WHERE name LIKE 'TH%' OR name LIKE 'TA%' OR name LIKE 'TF%'
            ORDER BY name
        `);
        console.log(`(${hc.length}):`);
        for (const t of hc) console.log(`  - ${t.name}`);
    } catch(e) { console.error(e.message); }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
