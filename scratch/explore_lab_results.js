/**
 * Explorar resultados de laboratorio TMRESULTADOSLABORATORIOD/E
 * y signos vitales TQHOJASIGNOSVITALES para construir indicadores CVD
 */
const prisma = require('../db');

async function main() {
    console.log('═══ EXPLORANDO RESULTADOS LABORATORIO ═══\n');

    // Columnas de TMRESULTADOSLABORATORIOE (encabezado)
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TMRESULTADOSLABORATORIOE'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TMRESULTADOSLABORATORIOE (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);

        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 2 * FROM TMRESULTADOSLABORATORIOE WHERE QMK_FCH >= 20260101 ORDER BY QMK_FCH DESC`);
        console.log('  Muestra 2026:', JSON.stringify(sample, null, 2).substring(0, 800));
    } catch(e) { console.log('❌', e.message.substring(0,80)); }

    // Columnas de TMRESULTADOSLABORATORIOD (detalle)
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TMRESULTADOSLABORATORIOD'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TMRESULTADOSLABORATORIOD (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);

        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 3 * FROM TMRESULTADOSLABORATORIOD`);
        console.log('  Muestra:', JSON.stringify(sample, null, 2).substring(0, 800));
    } catch(e) { console.log('❌', e.message.substring(0,80)); }

    // TQHOJASIGNOSVITALES - signos vitales (PA)
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TQHOJASIGNOSVITALES'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TQHOJASIGNOSVITALES (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);

        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 2 * FROM TQHOJASIGNOSVITALES WHERE QHG_FCH >= 20260101 ORDER BY QHG_FCH DESC`);
        console.log('  Muestra 2026:', JSON.stringify(sample, null, 2).substring(0, 800));
    } catch(e) { console.log('❌', e.message.substring(0,80)); }

    // TQHOJASIGNOSVITALESD - signos vitales detalle
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TQHOJASIGNOSVITALESD'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TQHOJASIGNOSVITALESD (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);

        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 2 * FROM TQHOJASIGNOSVITALESD WHERE QHJ_FCH >= 20260101 ORDER BY QHJ_FCH DESC`);
        console.log('  Muestra 2026:', JSON.stringify(sample, null, 2).substring(0, 800));
    } catch(e) { console.log('❌', e.message.substring(0,80)); }

    // Ver qué parámetros de laboratorio hay disponibles con HbA1c o LDL
    try {
        const params = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT LTRIM(RTRIM(QML_COD_PARA)) AS param, LTRIM(RTRIM(QML_NOM_PARA)) AS nombre, COUNT(*) AS total
            FROM TMRESULTADOSLABORATORIOD
            WHERE QML_FCH >= 20260101
              AND (
                UPPER(QML_NOM_PARA) LIKE '%GLUCOS%'
                OR UPPER(QML_NOM_PARA) LIKE '%HBA%'
                OR UPPER(QML_NOM_PARA) LIKE '%HEMOG%'
                OR UPPER(QML_NOM_PARA) LIKE '%LDL%'
                OR UPPER(QML_NOM_PARA) LIKE '%COLEST%'
                OR UPPER(QML_NOM_PARA) LIKE '%CREATININ%'
                OR UPPER(QML_NOM_PARA) LIKE '%FILTRAD%'
              )
            GROUP BY LTRIM(RTRIM(QML_COD_PARA)), LTRIM(RTRIM(QML_NOM_PARA))
            ORDER BY total DESC
        `);
        console.log(`\n\n═══ PARÁMETROS LAB RELEVANTES (2026) ═══`);
        for (const p of params) console.log(`  [${p.param}] ${p.nombre}: ${p.total}`);
    } catch(e) { console.log('❌', e.message.substring(0,80)); }

    // Muestra de resultados de HbA1c
    try {
        const hba = await prisma.$queryRawUnsafe(`
            SELECT TOP 5 d.QML_COD_PARA, d.QML_NOM_PARA, d.QML_RES_NUM, d.QML_COD, d.QML_FCH,
                   e.QMK_ENTIDAD
            FROM TMRESULTADOSLABORATORIOD d
            JOIN TMRESULTADOSLABORATORIOE e ON e.QMK_TIPO = d.QML_TIPO AND e.QMK_NUM = d.QML_NUM
            WHERE d.QML_FCH >= 20260101
              AND UPPER(d.QML_NOM_PARA) LIKE '%HBA%'
            ORDER BY d.QML_FCH DESC
        `);
        console.log(`\n\n═══ MUESTRA HbA1c (2026) ═══`);
        console.log(JSON.stringify(hba, null, 2).substring(0, 800));
    } catch(e) { console.log('❌ HbA1c:', e.message.substring(0,120)); }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
