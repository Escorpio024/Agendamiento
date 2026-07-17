const prisma = require('../db');

async function main() {
  try {
    // Buscar médicos con nombre que incluya odontolog o profesional
    const medicos = await prisma.medico.findMany({
      where: {
        OR: [
          { MED_NOMBRE: { contains: 'ODONT' } },
          { MED_NOMBRE: { contains: 'DENTAL' } },
          { MED_NOMBRE: { contains: 'PROFESIONAL' } }
        ]
      }
    });
    console.log('=== MEDICOS ODONTOLOGIA/PROFESIONAL ===');
    console.log(JSON.stringify(medicos, null, 2));

    // Ver slots TME2 de hoy para todos los médicos
    const hoy = parseInt(new Date().toISOString().slice(0,10).replace(/-/g,''));
    console.log('\n=== SLOTS LIBRES HOY (TME2_FCH=' + hoy + ') ===');
    const slotsHoy = await prisma.$queryRaw`
      SELECT DISTINCT TME2_CODM 
      FROM TMTURNOSMEDICOSDETALLE 
      WHERE TME2_FCH = ${hoy}
        AND (TME2_COD IS NULL OR LTRIM(RTRIM(TME2_COD)) = '' OR TME2_COD = '00000000000000' OR TRY_CAST(LTRIM(RTRIM(TME2_COD)) AS BIGINT) = 0)
    `;
    console.log('Códigos con slots libres hoy:', JSON.stringify(slotsHoy, null, 2));

    // Buscar a qué médico corresponden esos códigos
    console.log('\n=== TURNOS ACTIVOS HOY (únicos por código) ===');
    const turnosUnicos = await prisma.$queryRaw`
      SELECT DISTINCT t.TME_CODM, t.TME_ESPECIALIDAD, m.MED_NOMBRE
      FROM TMTURNOSMEDICOS t
      LEFT JOIN TMMEDICOS m ON CAST(m.MED_COD AS VARCHAR) = CAST(t.TME_CODM AS VARCHAR)
      WHERE (t.TME_FCH_FIN IS NULL OR t.TME_FCH_FIN >= ${hoy})
      ORDER BY t.TME_CODM
    `;
    console.log(JSON.stringify(turnosUnicos, null, 2));

  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
