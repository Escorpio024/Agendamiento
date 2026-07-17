const prisma = require('../db');

async function main() {
  try {
    const hoy = parseInt(new Date().toISOString().slice(0,10).replace(/-/g,''));
    const en7dias = parseInt(new Date(Date.now() + 7*24*3600*1000).toISOString().slice(0,10).replace(/-/g,''));
    
    console.log(`=== SLOTS LIBRES TME2 entre ${hoy} y ${en7dias} ===`);
    const slotsRango = await prisma.$queryRaw`
      SELECT DISTINCT d.TME2_CODM, d.TME2_FCH, m.MED_NOMBRE, t.TME_ESPECIALIDAD
      FROM TMTURNOSMEDICOSDETALLE d
      LEFT JOIN TMMEDICOS m ON CAST(m.MED_COD AS VARCHAR) = CAST(d.TME2_CODM AS VARCHAR)
      LEFT JOIN TMTURNOSMEDICOS t ON CAST(t.TME_CODM AS VARCHAR) = CAST(d.TME2_CODM AS VARCHAR)
        AND t.TME_FCH = (SELECT MAX(t2.TME_FCH) FROM TMTURNOSMEDICOS t2 WHERE CAST(t2.TME_CODM AS VARCHAR) = CAST(d.TME2_CODM AS VARCHAR) AND t2.TME_FCH <= d.TME2_FCH)
      WHERE d.TME2_FCH >= ${hoy}
        AND d.TME2_FCH <= ${en7dias}
        AND (d.TME2_COD IS NULL OR LTRIM(RTRIM(d.TME2_COD)) = '' OR d.TME2_COD = '00000000000000' OR TRY_CAST(LTRIM(RTRIM(d.TME2_COD)) AS BIGINT) = 0)
      ORDER BY d.TME2_FCH, d.TME2_CODM
    `;
    console.log(JSON.stringify(slotsRango, null, 2));

    // Verificar específicamente los odontólogos conocidos
    const odontologosCods = ['999', '1000', '1037636224', '1039884776', '1039886829', '1003177555'];
    console.log('\n=== MÉDICOS ODONTÓLOGOS con slots en los próximos 7 días ===');
    for (const cod of odontologosCods) {
      const codNum = parseInt(cod);
      const slots = await prisma.$queryRaw`
        SELECT COUNT(*) as total, MIN(TME2_FCH) as primera_fecha, MAX(TME2_FCH) as ultima_fecha
        FROM TMTURNOSMEDICOSDETALLE
        WHERE CAST(TME2_CODM AS VARCHAR) = ${cod}
          AND TME2_FCH >= ${hoy}
          AND TME2_FCH <= ${en7dias}
          AND (TME2_COD IS NULL OR LTRIM(RTRIM(TME2_COD)) = '' OR TME2_COD = '00000000000000' OR TRY_CAST(LTRIM(RTRIM(TME2_COD)) AS BIGINT) = 0)
      `;
      console.log(`Cod ${cod}: ${JSON.stringify(slots[0])}`);
    }

  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
