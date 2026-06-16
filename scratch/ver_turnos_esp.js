require('dotenv').config();
const prisma = require('./db');

async function checkDates() {
    const fechas = [20260520, 20260523, 20260525, 20260526, 20260528, 20260606];
    
    console.log('\n🏥 DIAGNÓSTICO DE MEDICINA GENERAL (Esp: 999)\n');

    for (const fch of fechas) {
        console.log(`\n📅 FECHA: ${fch}`);
        
        // 1. Médicos de Medicina General (999) con turno maestro activo
        const tme = await prisma.$queryRawUnsafe(`
            SELECT m.MED_COD AS cod, LTRIM(RTRIM(m.MED_NOMBRE)) AS nombre
            FROM TMTURNOSMEDICOS t
            INNER JOIN TMMEDICOS m ON m.MED_COD = t.TME_CODM
            WHERE t.TME_ESPECIALIDAD = 999
              AND m.MED_EST_ESTADO = 'A'
              AND ${fch} BETWEEN t.TME_FCH AND ISNULL(t.TME_FCH_FIN, 99999999)
            GROUP BY m.MED_COD, m.MED_NOMBRE
        `);

        if (!tme.length) {
            console.log(`   ❌ Ningún médico de Medicina General tiene turno maestro programado para hoy.`);
            continue;
        }

        const codigos = tme.map(x => x.cod);
        console.log(`   👨‍⚕️ Médicos programados: ${tme.map(x => x.nombre).join(', ')}`);

        // 2. Verificar slots en TME2 para esos médicos
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
              AND t.TME2_CODM IN (${codigos.join(',')})
            GROUP BY t.TME2_CODM, m.MED_NOMBRE
        `);

        if (!tme2.length) {
            console.log(`   ❌ Xenco NO ha generado los slots (TME2) para estos médicos en esta fecha.`);
        } else {
            for (const s of tme2) {
                const excl = s.cod == 444 ? ' ⛔(Excluido del bot)' : '';
                console.log(`   🩺 Dr. ${s.nombre}${excl}: ${s.libres} libres / ${s.ocupados} ocupados`);
                if (s.libres === 0 && s.cod != 444) {
                    console.log(`      ⚠️  Aparecería en el bot, pero tiene 0 cupos libres (agenda llena).`);
                }
            }
        }
    }

    await prisma.$disconnect();
    process.exit(0);
}

checkDates();
