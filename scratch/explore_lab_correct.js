/**
 * Consultas correctas para datos de laboratorio y signos vitales CVD
 */
const prisma = require('../db');

async function main() {
    console.log('═══ DATOS REALES PARA INDICADORES CVD ═══\n');

    // 1. Parámetros de laboratorio disponibles en 2026
    try {
        const params = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT 
                LTRIM(RTRIM(d.RL2_COD_PARA)) AS param, 
                LTRIM(RTRIM(d.RL2_NOM_PARAM)) AS nombre,
                COUNT(*) AS total
            FROM TMRESULTADOSLABORATORIOD d
            WHERE d.RL2_FCH >= 20260101
              AND d.RL2_EST_ANULADO <> 'S'
              AND (
                UPPER(d.RL2_NOM_PARAM) LIKE '%GLUCOS%'
                OR UPPER(d.RL2_NOM_PARAM) LIKE '%HBA%'
                OR UPPER(d.RL2_NOM_PARAM) LIKE '%HEMOG%'
                OR UPPER(d.RL2_NOM_PARAM) LIKE '%LDL%'
                OR UPPER(d.RL2_NOM_PARAM) LIKE '%COLEST%'
                OR UPPER(d.RL2_NOM_PARAM) LIKE '%CREATININ%'
                OR UPPER(d.RL2_NOM_PARAM) LIKE '%FILTRAD%'
                OR UPPER(d.RL2_NOM_PARAM) LIKE '%TRIGLI%'
                OR UPPER(d.RL2_NOM_PARAM) LIKE '%HDL%'
              )
            GROUP BY LTRIM(RTRIM(d.RL2_COD_PARA)), LTRIM(RTRIM(d.RL2_NOM_PARAM))
            ORDER BY total DESC
        `);
        console.log(`\n═══ PARÁMETROS LAB RELEVANTES 2026 (${params.length}) ═══`);
        for (const p of params) console.log(`  [${p.param}] "${p.nombre}": ${p.total}`);
    } catch(e) { console.log('❌ params:', e.message.substring(0,150)); }

    // 2. Artículos de laboratorio (RL2_COD_ARTIC) que tienen lab relacionado con CVD
    try {
        const arts = await prisma.$queryRawUnsafe(`
            SELECT TOP 20 
                LTRIM(RTRIM(RL2_COD_ARTIC)) AS artic,
                LTRIM(RTRIM(RL2_NOM_ARTIC)) AS nombre_artic,
                COUNT(*) AS total
            FROM TMRESULTADOSLABORATORIOD
            WHERE RL2_FCH >= 20260101
              AND RL2_EST_ANULADO <> 'S'
            GROUP BY LTRIM(RTRIM(RL2_COD_ARTIC)), LTRIM(RTRIM(RL2_NOM_ARTIC))
            ORDER BY total DESC
        `);
        console.log(`\n═══ TOP 20 ARTÍCULOS LABORATORIO 2026 ═══`);
        for (const a of arts) console.log(`  [${a.artic}] "${a.nombre_artic}": ${a.total}`);
    } catch(e) { console.log('❌ artics:', e.message.substring(0,150)); }

    // 3. Signos vitales: muestra datos reales con PA sistólica/diastólica
    try {
        const sv = await prisma.$queryRawUnsafe(`
            SELECT TOP 5 
                QN6_COD, QN6_FCH, QN6_VR_ARTE_S, QN6_VR_ARTE_D, 
                QN6_NUM_PESO, QN6_COD_ENTIDAD
            FROM TQHOJASIGNOSVITALES
            WHERE QN6_FCH >= 20260101
              AND QN6_VR_ARTE_S > 0
            ORDER BY QN6_FCH DESC
        `);
        console.log(`\n═══ MUESTRA SIGNOS VITALES 2026 ═══`);
        console.log(JSON.stringify(sv, null, 2));
    } catch(e) { console.log('❌ SV:', e.message.substring(0,150)); }

    // 4. Contar pacientes con PA controlada (<140/90) en 2026 por mes
    try {
        const pa = await prisma.$queryRawUnsafe(`
            SELECT 
                LEFT(CAST(QN6_FCH AS VARCHAR), 6) AS mes,
                COUNT(*) AS total_registros,
                SUM(CASE WHEN QN6_VR_ARTE_S < 140 AND QN6_VR_ARTE_D < 90 THEN 1 ELSE 0 END) AS controlados_140_90,
                SUM(CASE WHEN QN6_VR_ARTE_S < 150 AND QN6_VR_ARTE_D < 90 THEN 1 ELSE 0 END) AS controlados_150_90
            FROM TQHOJASIGNOSVITALES
            WHERE QN6_FCH >= 20260101
              AND QN6_VR_ARTE_S > 0
              AND QN6_VR_ARTE_D > 0
            GROUP BY LEFT(CAST(QN6_FCH AS VARCHAR), 6)
            ORDER BY mes
        `);
        console.log(`\n═══ PA POR MES 2026 ═══`);
        for (const r of pa) console.log(`  ${r.mes}: total=${r.total_registros} | <140/90=${r.controlados_140_90} | <150/90=${r.controlados_150_90}`);
    } catch(e) { console.log('❌ PA mes:', e.message.substring(0,150)); }

    // 5. Verificar si hay HbA1c en los resultados de laboratorio
    try {
        const hba = await prisma.$queryRawUnsafe(`
            SELECT TOP 10
                d.RL2_COD_COD AS paciente,
                d.RL2_FCH AS fecha,
                d.RL2_COD_PARA AS param,
                d.RL2_NOM_PARAM AS nombre_param,
                d.RL2_NOM_ARTIC AS artic
            FROM TMRESULTADOSLABORATORIOD d
            WHERE d.RL2_FCH >= 20260101
              AND d.RL2_EST_ANULADO <> 'S'
              AND (
                UPPER(d.RL2_NOM_PARAM) LIKE '%HBA%'
                OR UPPER(d.RL2_NOM_ARTIC) LIKE '%HBA%'
                OR UPPER(d.RL2_NOM_ARTIC) LIKE '%HEMOG%GLICOS%'
                OR UPPER(d.RL2_NOM_ARTIC) LIKE '%A1C%'
              )
            ORDER BY d.RL2_FCH DESC
        `);
        console.log(`\n═══ RESULTADOS HbA1c 2026 (${hba.length}) ═══`);
        console.log(JSON.stringify(hba, null, 2).substring(0, 1000));
    } catch(e) { console.log('❌ HbA1c:', e.message.substring(0,150)); }

    // 6. Diagnósticos disponibles en citas 2026 (CIE-10 de CVD)
    try {
        const cie = await prisma.$queryRawUnsafe(`
            SELECT 
                LTRIM(RTRIM(QN6_COD_TIPOCON)) AS tipo,
                COUNT(*) AS total
            FROM TQHOJASIGNOSVITALES
            WHERE QN6_FCH >= 20260101
            GROUP BY LTRIM(RTRIM(QN6_COD_TIPOCON))
            ORDER BY total DESC
        `);
        console.log(`\n═══ TIPOS CONSULTA EN SIGNOS VITALES 2026 ═══`);
        for (const c of cie) console.log(`  ${c.tipo}: ${c.total}`);
    } catch(e) { console.log('❌ tipos:', e.message.substring(0,80)); }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
