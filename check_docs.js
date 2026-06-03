require('dotenv').config();
const prisma = require('./db');

async function verificarTiposDocs() {
    console.log('\n🔍 VERIFICANDO TIPOS DE DOCUMENTO EN XENCO\n');
    console.log('─'.repeat(55));

    const tipos = ['CC', 'TI', 'CE', 'RC', 'PA', 'NUIP', 'PE', 'MS', 'AS'];

    for (const tipo of tipos) {
        // Buscar un ejemplo en TMUSUARIOSASEGURAMIENTO
        const aseg = await prisma.$queryRawUnsafe(`
            SELECT TOP 1
                KC0_TIPO_DOCTO  AS tipo,
                LTRIM(RTRIM(KC0_COD)) AS codigo,
                LTRIM(RTRIM(KC0_NOM)) AS nombre,
                LEN(LTRIM(RTRIM(KC0_COD))) AS largo
            FROM TMUSUARIOSASEGURAMIENTO
            WHERE KC0_TIPO_DOCTO = '${tipo}'
              AND KC0_COD IS NOT NULL
              AND KC0_COD <> ''
        `).catch(() => []);

        // Buscar también en TMUSUARIOSFACTURACION
        const fact = await prisma.$queryRawUnsafe(`
            SELECT TOP 1
                KC2_TIPO_DOCTO  AS tipo,
                LTRIM(RTRIM(KC2_OACOD_NUI)) AS nui,
                LTRIM(RTRIM(KC2_COD))       AS cod_interno,
                LTRIM(RTRIM(KC2_PNOMBRE + ' ' + KC2_PAPELLIDO)) AS nombre
            FROM TMUSUARIOSFACTURACION
            WHERE KC2_TIPO_DOCTO = '${tipo}'
              AND KC2_OACOD_NUI IS NOT NULL
              AND KC2_OACOD_NUI <> ''
        `).catch(() => []);

        if (!aseg.length && !fact.length) continue;  // No hay de ese tipo

        console.log(`\n📄 Tipo: ${tipo}`);
        if (aseg.length) {
            const r = aseg[0];
            console.log(`   KC0 (Aseguramiento): cod="${r.codigo}" | largo=${r.largo} | nombre=${r.nombre}`);
            // Analizar si el código tiene letras o es puro número
            const tieneLetras = /[A-Za-z]/.test(r.codigo);
            console.log(`   → ¿Alfanumérico? ${tieneLetras ? '✅ SÍ (letras + números)' : '❌ No (solo números)'}`);
        }
        if (fact.length) {
            const r = fact[0];
            console.log(`   KC2 (Facturación):  nui="${r.nui}" | cod_interno="${r.cod_interno}" | nombre=${r.nombre}`);
            const tieneLetrasNUI = /[A-Za-z]/.test(r.nui);
            console.log(`   → NUI ¿Alfanumérico? ${tieneLetrasNUI ? '✅ SÍ (letras + números)' : '❌ No (solo números)'}`);
        }
    }

    // Resumen total por tipo
    console.log('\n\n📊 CONTEO TOTAL POR TIPO DE DOCUMENTO:');
    console.log('─'.repeat(55));
    const conteo = await prisma.$queryRawUnsafe(`
        SELECT KC0_TIPO_DOCTO AS tipo, COUNT(*) AS total
        FROM TMUSUARIOSASEGURAMIENTO
        WHERE KC0_TIPO_DOCTO IS NOT NULL AND KC0_TIPO_DOCTO <> ''
        GROUP BY KC0_TIPO_DOCTO
        ORDER BY total DESC
    `).catch(() => []);

    for (const r of conteo) {
        console.log(`   ${r.tipo.padEnd(6)} → ${r.total} pacientes`);
    }

    await prisma.$disconnect();
    process.exit(0);
}

verificarTiposDocs().catch(e => { console.error('❌', e.message); process.exit(1); });
