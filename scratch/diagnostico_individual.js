/**
 * Diagnóstico individual de cada paciente con error
 */
const prisma = require('../db');

const PACIENTES = [
    { nombre: 'ORTIZ GALLEGO MANUEL ALEJANDRO', cedula: '1039886359' },
    { nombre: 'BOLIVAR PATINO SAMUEL',           cedula: '3395435' },
    { nombre: 'CHAVERRA GUERRA HERNANDO ANTONIO', cedula: '3468912' },
    { nombre: 'OSPINA ALVAREZ FRANCY ELENA',      cedula: '43847735' },
    { nombre: 'TEJADA RUIZ BEATRIZ ELENA',        cedula: '43847020' },
    { nombre: 'LONDOÑO PAREJA ANA LUCIA',         cedula: '21707667' },
];

const PEREZ = { nombre: 'PEREZ GONZALEZ LEON DARIO', cedula: '15265576' };

async function checkPaciente(p) {
    const cod14 = p.cedula.padStart(14, '0');
    const cedulaRaw = p.cedula.replace(/^0+/, '');

    console.log(`\n─────────────────────────────────────────`);
    console.log(`👤 ${p.nombre} — CC: ${p.cedula}`);

    // 1. ENT_COD real
    const facRows = await prisma.$queryRawUnsafe(`
        SELECT TOP 1 f.KC2_EPS_POS, f.KC2_ZONA, f.KC2_COD,
               LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
        FROM TMUSUARIOSFACTURACION f
        LEFT JOIN TMENTIDADES e ON e.ENT_COD = f.KC2_EPS_POS
        WHERE f.KC2_COD = '${cod14}' OR f.KC2_OACOD_NUI = '${cedulaRaw}'
        ORDER BY f.KC2_FCH_DIG DESC
    `);
    if (facRows.length > 0) {
        const f = facRows[0];
        console.log(`  EPS: ENT_COD=${f.KC2_EPS_POS} | ${f.ENT_NOMBRE} | Zona=${f.KC2_ZONA} | CodInterno=${f.KC2_COD}`);
    } else {
        console.log(`  ❌ No encontrado en TMUSUARIOSFACTURACION`);
    }

    // 2. Contrato que Xenco usa nativamente para este paciente
    const citasNativas = await prisma.$queryRawUnsafe(`
        SELECT TOP 3 c.KC3_FCH, c.KC3_ENTIDAD, c.KC3_NUM_CONTRATO, c.KC3_SEQ_CONTRATO,
               c.KC3_ARTIC, c.KC3_ZONA, c.KC3_NUM,
               LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
        FROM TMCITASUSUARIOS c
        LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
        WHERE (c.KC3_COD = '${cod14}' OR c.KC3_COD = '${cedulaRaw}' OR LTRIM(RTRIM(c.KC3_COD)) = '${cedulaRaw}')
          AND c.KC3_FCH >= 20260101
          AND c.KC3_NUM > 0
        ORDER BY c.KC3_FCH DESC
    `);
    if (citasNativas.length > 0) {
        console.log(`  Citas FACTURADAS en Xenco (KC3_NUM>0):`);
        for (const c of citasNativas) {
            console.log(`    Fecha=${c.KC3_FCH} | ENT=${c.KC3_ENTIDAD}(${c.ENT_NOMBRE}) | Contrato="${c.KC3_NUM_CONTRATO}" | Seq=${c.KC3_SEQ_CONTRATO} | Zona=${c.KC3_ZONA}`);
        }
    } else {
        console.log(`  ⚠️ Sin citas facturadas KC3_NUM>0 en 2026`);
        // Mostrar citas sin facturar
        const citasSinFact = await prisma.$queryRawUnsafe(`
            SELECT TOP 3 c.KC3_FCH, c.KC3_ENTIDAD, c.KC3_NUM_CONTRATO, c.KC3_SEQ_CONTRATO,
                   c.KC3_ARTIC, c.KC3_ZONA
            FROM TMCITASUSUARIOS c
            WHERE (c.KC3_COD = '${cod14}' OR c.KC3_COD = '${cedulaRaw}')
              AND c.KC3_FCH >= 20260101
            ORDER BY c.KC3_FCH DESC
        `);
        for (const c of citasSinFact) {
            console.log(`    [sin facturar] Fecha=${c.KC3_FCH} | ENT=${c.KC3_ENTIDAD} | Contrato="${c.KC3_NUM_CONTRATO}" | Seq=${c.KC3_SEQ_CONTRATO} | Zona=${c.KC3_ZONA}`);
        }
    }

    // 3. Verificar cita de control futura ya asignada
    const citasFuturas = await prisma.$queryRawUnsafe(`
        SELECT TOP 3 c.KC3_FCH, c.KC3_HH, c.KC3_MM, c.KC3_ARTIC, c.KC3_ESTADO, c.KC3_MEDICO, c.KC3_ENTIDAD
        FROM TMCITASUSUARIOS c
        WHERE (c.KC3_COD = '${cod14}' OR c.KC3_COD = '${cedulaRaw}' OR LTRIM(RTRIM(c.KC3_COD)) = '${cedulaRaw}')
          AND c.KC3_FCH >= 20260607
        ORDER BY c.KC3_FCH ASC
    `);
    if (citasFuturas.length > 0) {
        console.log(`  ✅ YA TIENE CITA FUTURA en Xenco:`);
        for (const c of citasFuturas) {
            console.log(`    Fecha=${c.KC3_FCH} Hora=${c.KC3_HH}:${String(c.KC3_MM||0).padStart(2,'0')} Art=${c.KC3_ARTIC} Est=${c.KC3_ESTADO||'null'} Med=${c.KC3_MEDICO}`);
        }
    } else {
        console.log(`  ℹ️ Sin cita futura asignada`);
    }
}

async function checkSinCupo(p) {
    const cod14 = p.cedula.padStart(14, '0');
    const cedulaRaw = p.cedula.replace(/^0+/, '');

    console.log(`\n═══════════════════════════════════════`);
    console.log(`🔴 SIN CUPO: ${p.nombre} — CC: ${p.cedula}`);

    // EPS
    const fac = await prisma.$queryRawUnsafe(`
        SELECT TOP 1 f.KC2_EPS_POS, LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
        FROM TMUSUARIOSFACTURACION f
        LEFT JOIN TMENTIDADES e ON e.ENT_COD = f.KC2_EPS_POS
        WHERE f.KC2_COD = '${cod14}' OR f.KC2_OACOD_NUI = '${cedulaRaw}'
        ORDER BY f.KC2_FCH_DIG DESC
    `);
    if (fac.length > 0) console.log(`  EPS: ENT_COD=${fac[0].KC2_EPS_POS} | ${fac[0].ENT_NOMBRE}`);

    // Citas futuras en Xenco
    const futuras = await prisma.$queryRawUnsafe(`
        SELECT TOP 5 KC3_FCH, KC3_HH, KC3_MM, KC3_ARTIC, KC3_ESTADO, KC3_MEDICO
        FROM TMCITASUSUARIOS
        WHERE (KC3_COD = '${cod14}' OR KC3_COD = '${cedulaRaw}' OR LTRIM(RTRIM(KC3_COD)) = '${cedulaRaw}')
          AND KC3_FCH >= 20260607
        ORDER BY KC3_FCH ASC
    `);
    if (futuras.length > 0) {
        console.log(`  ✅ SÍ tiene cita futura (puede marcarse presencial):`);
        for (const c of futuras) {
            console.log(`    Fecha=${c.KC3_FCH} Hora=${c.KC3_HH}:${String(c.KC3_MM||0).padStart(2,'0')} Art=${c.KC3_ARTIC} Est=${c.KC3_ESTADO||'null'}`);
        }
    } else {
        console.log(`  ❌ SIN cita futura en Xenco → buscar slots para agosto`);
        // Ver slots disponibles en agosto para PYP
        const slots = await prisma.$queryRaw`
            SELECT TOP 5 TME2_FCH, TME2_HH, TME2_MM, TME2_CODM
            FROM TMTURNOSMEDICOSDETALLE
            WHERE TME2_FCH >= 20260803
              AND TME2_FCH <= 20260831
              AND (
                  TME2_COD IS NULL
                  OR LTRIM(RTRIM(TME2_COD)) = ''
                  OR TME2_COD = '00000000000000'
                  OR TRY_CAST(LTRIM(RTRIM(TME2_COD)) AS BIGINT) = 0
              )
            ORDER BY TME2_FCH ASC
        `;
        if (slots.length > 0) {
            console.log(`  Slots libres agosto: ${slots.length} encontrados`);
        } else {
            console.log(`  ❌ Agenda de agosto NO generada todavía en Xenco → SIN CUPO real`);
        }
    }
}

async function main() {
    console.log('═══ DIAGNÓSTICO INDIVIDUAL POR PACIENTE ═══\n');

    for (const p of PACIENTES) {
        await checkPaciente(p);
    }

    await checkSinCupo(PEREZ);

    // Resumen: ¿Cuál es el ENT_COD más frecuente para ALIANZA en citas reales de PYP 2026?
    console.log('\n\n═══ CONTRATO NATIVO PARA ALIANZA en PYP 2026 ═══');
    const alianzaPYP = await prisma.$queryRaw`
        SELECT TOP 5 c.KC3_ENTIDAD, c.KC3_NUM_CONTRATO, c.KC3_SEQ_CONTRATO, c.KC3_FCH, c.KC3_ZONA,
               LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
        FROM TMCITASUSUARIOS c
        LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
        WHERE c.KC3_ENTIDAD IN (235, 265, 550, 289, 237)
          AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13')
          AND c.KC3_FCH >= 20260601
          AND c.KC3_NUM > 0
        ORDER BY c.KC3_FCH DESC
    `;
    if (alianzaPYP.length > 0) {
        for (const c of alianzaPYP) {
            console.log(`  ENT=${c.KC3_ENTIDAD}(${c.ENT_NOMBRE}) | Contrato="${c.KC3_NUM_CONTRATO}" | Seq=${c.KC3_SEQ_CONTRATO} | Fecha=${c.KC3_FCH} | Zona=${c.KC3_ZONA}`);
        }
    } else {
        console.log('  Sin citas PYP de ALIANZA facturadas en 2026');
        const sinFact = await prisma.$queryRaw`
            SELECT TOP 5 c.KC3_ENTIDAD, c.KC3_NUM_CONTRATO, c.KC3_SEQ_CONTRATO, c.KC3_FCH, c.KC3_ZONA,
                   LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
            FROM TMCITASUSUARIOS c
            LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
            WHERE c.KC3_ENTIDAD IN (235, 265, 550, 289, 237)
              AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13')
              AND c.KC3_FCH >= 20260601
            ORDER BY c.KC3_FCH DESC
        `;
        for (const c of sinFact) {
            console.log(`  [sinFact] ENT=${c.KC3_ENTIDAD}(${c.ENT_NOMBRE}) | Contrato="${c.KC3_NUM_CONTRATO}" | Seq=${c.KC3_SEQ_CONTRATO} | Fecha=${c.KC3_FCH} | Zona=${c.KC3_ZONA}`);
        }
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
