/**
 * Diagnóstico rápido de las partes iniciales del script anterior
 */
const prisma = require('../db');

async function main() {
    // 1. Verificar qué médicos P Y P existen
    console.log('1) MÉDICOS P Y P MEDICOS:');
    const medicos = await prisma.$queryRaw`
        SELECT m.MED_COD, LTRIM(RTRIM(m.MED_NOMBRE)) AS MED_NOMBRE
        FROM TMMEDICOS m
        WHERE LOWER(m.MED_NOMBRE) LIKE '%p%y%p%'
           OR LOWER(m.MED_NOMBRE) LIKE '%pyp%'
    `;
    for (const m of medicos) console.log(`  → MED_COD=${m.MED_COD} | ${m.MED_NOMBRE}`);

    // 2. ¿Cuántos slots libres hay en TME2 para agosto 2026?
    console.log('\n2) SLOTS LIBRES en TME2 para agosto 2026:');
    const slotsAgo = await prisma.$queryRaw`
        SELECT COUNT(*) AS cnt
        FROM TMTURNOSMEDICOSDETALLE
        WHERE TME2_FCH >= 20260803
          AND TME2_FCH <= 20260831
          AND (
              TME2_COD IS NULL
              OR LTRIM(RTRIM(TME2_COD)) = ''
              OR TME2_COD = '00000000000000'
              OR TRY_CAST(LTRIM(RTRIM(TME2_COD)) AS BIGINT) = 0
          )
    `;
    console.log(`  Slots libres en agosto 2026: ${Number(slotsAgo[0].cnt)}`);

    // 3. Turno ACTIVO más reciente de P Y P MEDICOS (sin TME_FCH_FIN expirada)
    console.log('\n3) ÚLTIMO turno ACTIVO de P Y P MEDICOS:');
    const today = new Date();
    const todayDec = parseInt(`${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`);
    const turnoActivo = await prisma.$queryRawUnsafe(`
        SELECT TOP 3 t.TME_CODM, t.TME_FCH, t.TME_FCH_FIN, t.TME_HH_I, t.TME_HH_F,
               LTRIM(RTRIM(m.MED_NOMBRE)) AS MEDICO
        FROM TMTURNOSMEDICOS t
        JOIN TMMEDICOS m ON m.MED_COD = t.TME_CODM
        WHERE (LOWER(m.MED_NOMBRE) LIKE '%p%y%p%' OR LOWER(m.MED_NOMBRE) LIKE '%pyp%')
          AND (t.TME_FCH_FIN IS NULL OR t.TME_FCH_FIN >= ${todayDec})
        ORDER BY t.TME_FCH DESC
    `);
    if (turnoActivo.length === 0) {
        console.log('  ❌ CLAVE: NO hay turno activo para PYP MEDICOS. TME_FCH_FIN ya expiró.');
        console.log('     Esto causa ERROR XENCO: el médico 111 existe pero su agenda está cerrada.');
    } else {
        for (const t of turnoActivo) {
            console.log(`  ✅ ${t.MEDICO} (${t.TME_CODM}) | Turno: ${t.TME_FCH} hasta ${t.TME_FCH_FIN} | Horario: ${t.TME_HH_I}h-${t.TME_HH_F}h`);
        }
    }

    // 4. Verificar KC3 para fecha de agosto con médico 111
    console.log('\n4) SLOTS KC3 para médico 111 (PYP) en agosto 2026:');
    const kc3 = await prisma.$queryRaw`
        SELECT TOP 5 KC3_FCH, KC3_HH, KC3_MM, LTRIM(RTRIM(KC3_COD)) AS KC3_COD, KC3_ESTADO
        FROM TMCITASUSUARIOS
        WHERE KC3_MEDICO = 111
          AND KC3_FCH >= 20260803
          AND KC3_FCH <= 20260831
        ORDER BY KC3_FCH, KC3_HH, KC3_MM
    `;
    if (kc3.length === 0) {
        console.log('  ❌ Sin filas en KC3 para PYP MEDICOS en agosto → Xenco no ha generado la agenda aún');
    } else {
        console.log(`  ${kc3.length} filas en KC3 para agosto:`);
        for (const c of kc3) console.log(`    Fecha=${c.KC3_FCH} Hora=${c.KC3_HH}:${String(c.KC3_MM||0).padStart(2,'0')} Cod=${c.KC3_COD||'(vacío)'} Estado=${c.KC3_ESTADO||'null'}`);
    }

    // 5. Verificar qué contratos hay para NUEVA EPS (141 y 341)
    console.log('\n5) CONTRATOS disponibles en reserveSlot para ENT_COD 141 y 341:');
    const contratoPorEntidad = {
        235: { num: 'RS-0159-2026', seq: 3 },
        141: { num: '01_EVN_890982370', seq: 2 },
        265: { num: 'RC-0160-2026', seq: 3 },
        550: { num: '0474-2025', seq: 1 },
    };
    for (const ent of [141, 341]) {
        const contrato = contratoPorEntidad[ent] || { num: '0152-2025', seq: 2 };
        console.log(`  ENT_COD=${ent}: usa contrato "${contrato.num}" (seq=${contrato.seq}) ${contratoPorEntidad[ent] ? '✅' : '⚠️ FALLBACK'}`);
    }
    
    // Verificar contrato real en citas de NUEVA EPS
    console.log('\n6) Contrato que Xenco usa NATIVAMENTE para NUEVA EPS en citas reales:');
    const citasNueva = await prisma.$queryRaw`
        SELECT TOP 3 KC3_ENTIDAD, KC3_NUM_CONTRATO, KC3_SEQ_CONTRATO, KC3_FCH,
               LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
        FROM TMCITASUSUARIOS c
        LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
        WHERE c.KC3_ENTIDAD IN (141, 341)
          AND c.KC3_FCH >= 20260101
          AND c.KC3_NUM > 0
        ORDER BY c.KC3_FCH DESC
    `;
    for (const c of citasNueva) {
        console.log(`  ENT_COD=${c.KC3_ENTIDAD} (${c.ENT_NOMBRE}): Contrato="${c.KC3_NUM_CONTRATO}" Seq=${c.KC3_SEQ_CONTRATO} Fecha=${c.KC3_FCH}`);
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
