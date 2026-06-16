require('dotenv').config();
const prisma = require('./db');

async function run() {
    const fechas = [20260520, 20260521, 20260522, 20260523, 20260525, 20260526, 20260528, 20260606];
    const dias   = ['Mié','Jue','Vie','Sáb','Lun','Mar','Jue','Sáb'];

    console.log('\n🔍 DIAGNÓSTICO POR FECHA — TME2 vs TMTURNOSMEDICOS\n');

    for (let i = 0; i < fechas.length; i++) {
        const fch = fechas[i];
        const dia = dias[i];

        // ¿Cuántos slots (libres y ocupados) tiene TME2 para esta fecha?
        const tme2 = await prisma.$queryRawUnsafe(`
            SELECT 
                t.TME2_CODM AS cod,
                LTRIM(RTRIM(m.MED_NOMBRE)) AS nombre,
                COUNT(*) AS total,
                SUM(CASE WHEN (t.TME2_COD IS NULL OR LTRIM(RTRIM(t.TME2_COD))='' OR t.TME2_COD='00000000000000' OR TRY_CAST(LTRIM(RTRIM(t.TME2_COD)) AS BIGINT)=0) THEN 1 ELSE 0 END) AS libres,
                SUM(CASE WHEN NOT (t.TME2_COD IS NULL OR LTRIM(RTRIM(t.TME2_COD))='' OR t.TME2_COD='00000000000000' OR TRY_CAST(LTRIM(RTRIM(t.TME2_COD)) AS BIGINT)=0) THEN 1 ELSE 0 END) AS ocupados
            FROM TMTURNOSMEDICOSDETALLE t
            INNER JOIN TMMEDICOS m ON m.MED_COD = t.TME2_CODM
            WHERE t.TME2_FCH = ${fch}
            GROUP BY t.TME2_CODM, m.MED_NOMBRE
            ORDER BY m.MED_NOMBRE
        `);

        // ¿Qué médicos tienen turno activo en TMTURNOSMEDICOS para esta fecha?
        const tme = await prisma.$queryRawUnsafe(`
            SELECT LTRIM(RTRIM(m.MED_NOMBRE)) AS nombre, m.MED_EST_ESTADO AS estado, t.TME_ESPECIALIDAD AS esp
            FROM TMTURNOSMEDICOS t
            INNER JOIN TMMEDICOS m ON m.MED_COD = t.TME_CODM
            WHERE ${fch} BETWEEN t.TME_FCH AND ISNULL(t.TME_FCH_FIN, 99999999)
            ORDER BY m.MED_NOMBRE
        `);

        console.log(`📅 ${dia} ${fch}:`);

        if (!tme.length) {
            console.log(`   TMTURNOSMEDICOS: ❌ Sin médicos con turno activo`);
        } else {
            const activos = tme.filter(x => x.estado === 'A');
            console.log(`   TMTURNOSMEDICOS: ${activos.length} activo(s) → ${activos.map(x => x.nombre.trim() + '(esp:' + x.esp + ')').join(', ')}`);
        }

        if (!tme2.length) {
            console.log(`   TME2 (Visor):   ❌ Sin slots generados por Xenco`);
        } else {
            for (const s of tme2) {
                const excl = s.cod == 444 ? ' ⛔EXCLUIDO' : '';
                console.log(`   TME2 Dr.${s.nombre.trim()}${excl}: ${s.libres} libres / ${s.ocupados} ocupados (total ${s.total})`);
            }
        }
        console.log();
    }

    await prisma.$disconnect();
    process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
