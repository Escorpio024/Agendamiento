/**
 * Busca el contrato correcto para ENT_COD 341 (NUEVA EPS S.A sin punto)
 */
const prisma = require('../db');

async function main() {
    console.log('Buscando contrato nativo de ENT_COD=341 en citas PYP de Xenco...\n');

    // Ver todas las citas de ENT_COD 341 con sus contratos
    const rows = await prisma.$queryRaw`
        SELECT TOP 10
            c.KC3_ENTIDAD, c.KC3_NUM_CONTRATO, c.KC3_SEQ_CONTRATO,
            c.KC3_FCH, c.KC3_ARTIC, c.KC3_NUM,
            LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
        FROM TMCITASUSUARIOS c
        LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
        WHERE c.KC3_ENTIDAD = 341
        ORDER BY c.KC3_FCH DESC
    `;
    for (const r of rows) {
        console.log(`Fecha=${r.KC3_FCH} | ENT=${r.KC3_ENTIDAD} (${r.ENT_NOMBRE}) | Contrato="${r.KC3_NUM_CONTRATO}" | Seq=${r.KC3_SEQ_CONTRATO} | Art=${r.KC3_ARTIC} | KC3_NUM=${r.KC3_NUM}`);
    }

    // También buscar qué citas de 341 SÍ son de PYP
    console.log('\nCitas PYP de ENT_COD=341:');
    const pypRows = await prisma.$queryRaw`
        SELECT TOP 5
            c.KC3_ENTIDAD, c.KC3_NUM_CONTRATO, c.KC3_SEQ_CONTRATO, c.KC3_FCH
        FROM TMCITASUSUARIOS c
        WHERE c.KC3_ENTIDAD = 341
          AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13','890301-14','890301-15','890301-16')
        ORDER BY c.KC3_FCH DESC
    `;
    for (const r of pypRows) {
        console.log(`Fecha=${r.KC3_FCH} | Contrato="${r.KC3_NUM_CONTRATO}" | Seq=${r.KC3_SEQ_CONTRATO}`);
    }

    // Ver también citas de ALIANZA (235) para no mezclar contratos
    console.log('\nCitas recientes de ALIANZA (235) para comparar:');
    const aliRows = await prisma.$queryRaw`
        SELECT TOP 3
            KC3_ENTIDAD, KC3_NUM_CONTRATO, KC3_SEQ_CONTRATO, KC3_FCH
        FROM TMCITASUSUARIOS
        WHERE KC3_ENTIDAD = 235
          AND KC3_FCH >= 20260101
        ORDER BY KC3_FCH DESC
    `;
    for (const r of aliRows) {
        console.log(`Fecha=${r.KC3_FCH} | Contrato="${r.KC3_NUM_CONTRATO}" | Seq=${r.KC3_SEQ_CONTRATO}`);
    }

    await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
