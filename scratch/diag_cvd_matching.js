// Diagnóstico: verificar matching de códigos entre valoraciones y citas
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const medicalPrisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } }
});

async function main() {
    const y = new Date().getFullYear();
    const fechaDesde = parseInt(`${y}0101`);
    const fechaHasta = parseInt(`${y}1231`);

    // 1. Muestra primeros 10 registros de valoraciones con su código
    const valoraciones = await medicalPrisma.$queryRawUnsafe(`
        SELECT TOP 10
            LTRIM(RTRIM(CAST(v.Codigo_KC AS VARCHAR))) AS codigo,
            LEN(LTRIM(RTRIM(CAST(v.Codigo_KC AS VARCHAR)))) AS longCodigo,
            v.[Fecha HC] AS fechaValoracion,
            LTRIM(RTRIM(v.[NOMBRE ENTIDAD])) AS eps
        FROM VIQ_ALTO_COSTO v
        WHERE v.[Fecha HC] >= ${fechaDesde}
          AND v.[Fecha HC] <= ${fechaHasta}
          AND v.[RIESGO CV] IS NOT NULL
    `);

    console.log('\n=== CÓDIGOS EN VIQ_ALTO_COSTO (valoraciones) ===');
    for (const v of valoraciones) {
        console.log(`  codigo="${v.codigo}" len=${v.longCodigo} eps="${v.eps}"`);
    }

    // 2. Para uno de esos códigos, buscar en TMCITASUSUARIOS con distintas variantes
    if (valoraciones.length > 0) {
        const codRaw = String(valoraciones[0].codigo || '').trim();
        const codSinCeros = codRaw.replace(/^0+/, '');
        const cod14 = codRaw.padStart(14, '0');

        console.log(`\n=== BUSCANDO CITAS PARA código raw="${codRaw}" sin0="${codSinCeros}" 14d="${cod14}" ===`);

        const citas = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 5
                LTRIM(RTRIM(KC3_COD)) AS codigo,
                LEN(LTRIM(RTRIM(KC3_COD))) AS longCodigo,
                KC3_FCH AS fecha,
                KC3_ARTIC AS artic,
                KC3_NUM AS num
            FROM TMCITASUSUARIOS
            WHERE (
                LTRIM(RTRIM(KC3_COD)) = '${codRaw}'
                OR LTRIM(RTRIM(KC3_COD)) = '${codSinCeros}'
                OR LTRIM(RTRIM(KC3_COD)) = '${cod14}'
            )
              AND KC3_NUM > 0
              AND LTRIM(RTRIM(KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13','890301-14','890301-15','890301-16')
            ORDER BY KC3_FCH DESC
        `);

        console.log(`  Citas CVD encontradas: ${citas.length}`);
        for (const c of citas) {
            console.log(`    codigo="${c.codigo}" len=${c.longCodigo} fecha=${c.fecha} artic=${c.artic}`);
        }

        // 3. Ver qué formato usa TMCITASUSUARIOS en citas CVD reales
        const cualquierCita = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 3
                LTRIM(RTRIM(KC3_COD)) AS codigo,
                LEN(LTRIM(RTRIM(KC3_COD))) AS longCodigo
            FROM TMCITASUSUARIOS
            WHERE LTRIM(RTRIM(KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13','890301-14','890301-15','890301-16')
              AND KC3_NUM > 0
            ORDER BY KC3_FCH DESC
        `);
        console.log('\n=== EJEMPLO DE CITAS CVD EN TMCITASUSUARIOS ===');
        for (const c of cualquierCita) {
            console.log(`  codigo="${c.codigo}" len=${c.longCodigo}`);
        }
    }

    // 4. Listar EPS únicas en las valoraciones
    const epsUnicas = await medicalPrisma.$queryRawUnsafe(`
        SELECT DISTINCT LTRIM(RTRIM(v.[NOMBRE ENTIDAD])) AS eps, COUNT(*) AS total
        FROM VIQ_ALTO_COSTO v
        WHERE v.[Fecha HC] >= ${fechaDesde} AND v.[Fecha HC] <= ${fechaHasta}
          AND v.[RIESGO CV] IS NOT NULL
        GROUP BY LTRIM(RTRIM(v.[NOMBRE ENTIDAD]))
        ORDER BY total DESC
    `);
    console.log('\n=== EPS ÚNICAS EN VALORACIONES (año actual) ===');
    for (const e of epsUnicas) {
        console.log(`  "${e.eps}" -> ${e.total} pacientes`);
    }

    await medicalPrisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
