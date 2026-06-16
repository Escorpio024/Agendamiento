require('dotenv').config();
const prisma = require('./db');

async function run() {
    console.log('\n🔍 DIAGNÓSTICO: Todos los doctores con slots libres el 23 de mayo\n');
    const fch = 20260523;

    // Buscar slots libres (TME2_COD vacío/nulo) para la fecha 20260523 en TME2
    const libres = await prisma.$queryRawUnsafe(`
        SELECT 
            t.TME2_CODM AS cod,
            LTRIM(RTRIM(m.MED_NOMBRE)) AS nombre,
            t.TME2_ESPECIALIDAD AS especialidad,
            e.ESP_NOMBRE AS esp_nombre,
            COUNT(*) AS libres
        FROM TMTURNOSMEDICOSDETALLE t
        INNER JOIN TMMEDICOS m ON m.MED_COD = t.TME2_CODM
        LEFT JOIN TMESPECIALIDADES e ON e.ESP_COD = t.TME2_ESPECIALIDAD
        WHERE t.TME2_FCH = ${fch}
          AND (t.TME2_COD IS NULL OR LTRIM(RTRIM(t.TME2_COD))='' OR t.TME2_COD='00000000000000' OR TRY_CAST(LTRIM(RTRIM(t.TME2_COD)) AS BIGINT)=0)
        GROUP BY t.TME2_CODM, m.MED_NOMBRE, t.TME2_ESPECIALIDAD, e.ESP_NOMBRE
        ORDER BY libres DESC
    `);

    if (!libres.length) {
        console.log(`   ❌ No hay NINGÚN slot libre en NINGUNA especialidad para el 23 de mayo en TME2.`);
    } else {
        console.log(`   ✅ Doctores con slots libres en Xenco el 23 de mayo:\n`);
        for (const s of libres) {
            console.log(`   🩺 Dr(a). ${s.nombre} (Cod: ${s.cod})`);
            console.log(`      Especialidad: ${s.especialidad} - ${s.esp_nombre || '?'}`);
            console.log(`      Cupos libres: ${s.libres}\n`);
        }
    }

    await prisma.$disconnect();
    process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
