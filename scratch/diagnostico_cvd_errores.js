/**
 * Diagnóstico completo de los controles fallidos:
 * - Por qué fallan en Xenco (ERROR XENCO)
 * - Por qué no hay cupo (SIN CUPO)
 * - Por qué los PENDING no se agendaron
 */
const prisma = require('../db');  // Xenco DB

// ── Cédulas vistas en el screenshot como SIN CUPO ──
const CEDULAS_SIN_CUPO = [
    '21708138',  // PINEDA DE AGUDELO NORELA
    '21711378',  // OSPINA MUÑOZ MARIA DEL CARMEN
    '21707271',  // VASQUEZ DE RESTREPO MARIA OLIVA
    '15265576',  // PEREZ GONZALEZ LEON DARIO
];

// Fecha objetivo aproximada: 03/04 agosto 2026
const FECHA_CONTROL_DEC = 20260803;
const FECHA_HASTA = 20260901;

async function main() {
    console.log('\n════════════════════════════════════════');
    console.log('DIAGNÓSTICO CVD - ERRORES Y SIN CUPO');
    console.log('════════════════════════════════════════\n');

    // 1. Verificar qué médicos P Y P existen y cuáles tienen agenda futura
    console.log('1) MÉDICOS P Y P MEDICOS en Xenco:');
    try {
        const medicos = await prisma.$queryRaw`
            SELECT m.MED_COD, LTRIM(RTRIM(m.MED_NOMBRE)) AS MED_NOMBRE
            FROM TMMEDICOS m
            WHERE LOWER(m.MED_NOMBRE) LIKE '%p%y%p%'
               OR LOWER(m.MED_NOMBRE) LIKE '%pyp%'
               OR LOWER(m.MED_NOMBRE) LIKE '%cardiovascular%'
               OR LOWER(m.MED_NOMBRE) LIKE '%riesgo%'
        `;
        if (medicos.length === 0) {
            console.log('  ❌ NO se encontraron médicos con "P Y P" en su nombre');
        } else {
            for (const m of medicos) {
                console.log(`  → MED_COD=${m.MED_COD} | ${m.MED_NOMBRE}`);
            }
        }
    } catch(e) { console.log('  Error:', e.message); }

    // 2. Verificar slots disponibles para agosto 2026 en agenda PYP
    console.log('\n2) SLOTS LIBRES en TME2 para agosto 2026 (fecha >= 20260803):');
    try {
        const slots = await prisma.$queryRaw`
            SELECT TOP 10 
                TME2_FCH, TME2_HH, TME2_MM, TME2_CODM,
                LTRIM(RTRIM(TME2_COD)) AS TME2_COD_TRIM
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
        if (slots.length === 0) {
            console.log('  ❌ NO hay slots libres en agosto en TME2');
            console.log('  → Esto confirma el SIN CUPO: la agenda no fue generada aún para agosto.');
        } else {
            console.log(`  ✅ Hay ${slots.length} slots libres (muestra):`);
            for (const s of slots) {
                console.log(`     Fecha=${s.TME2_FCH} Hora=${s.TME2_HH}:${String(s.TME2_MM||0).padStart(2,'0')} Médico=${s.TME2_CODM}`);
            }
        }
    } catch(e) { console.log('  Error:', e.message); }

    // 3. Verificar turnos del médico PYP en TMTURNOSMEDICOS
    console.log('\n3) TURNOS del médico PYP en TMTURNOSMEDICOS:');
    try {
        const turnos = await prisma.$queryRaw`
            SELECT t.TME_CODM, t.TME_FCH, t.TME_FCH_FIN, 
                   t.TME_HH_I, t.TME_HH_F, t.TME_ACTIVIDAD_M, t.TME_ACTIVIDAD_T,
                   LTRIM(RTRIM(m.MED_NOMBRE)) AS MEDICO
            FROM TMTURNOSMEDICOS t
            JOIN TMMEDICOS m ON m.MED_COD = t.TME_CODM
            WHERE LOWER(m.MED_NOMBRE) LIKE '%p%y%p%'
               OR LOWER(m.MED_NOMBRE) LIKE '%pyp%'
            ORDER BY t.TME_FCH DESC
        `;
        for (const t of turnos) {
            console.log(`  → ${t.MEDICO} (${t.TME_CODM}) | Desde: ${t.TME_FCH} Hasta: ${t.TME_FCH_FIN} | Horario: ${t.TME_HH_I}h-${t.TME_HH_F}h | ActM=${t.TME_ACTIVIDAD_M}`);
        }
        if (turnos.length === 0) console.log('  ❌ Sin turnos PYP definidos');
    } catch(e) { console.log('  Error:', e.message); }

    // 4. Verificar entidad de los pacientes SIN CUPO
    console.log('\n4) ENTIDAD (EPS) de los pacientes SIN CUPO:');
    for (const cedula of CEDULAS_SIN_CUPO) {
        const cod14 = cedula.padStart(14, '0');
        try {
            const rows = await prisma.$queryRawUnsafe(`
                SELECT TOP 1 
                    f.KC2_EPS_POS, f.KC2_ZONA,
                    LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
                FROM TMUSUARIOSFACTURACION f
                LEFT JOIN TMENTIDADES e ON e.ENT_COD = f.KC2_EPS_POS
                WHERE f.KC2_COD = '${cod14}' OR f.KC2_OACOD_NUI = '${cedula}'
                ORDER BY f.KC2_FCH_DIG DESC
            `);
            if (rows.length > 0) {
                console.log(`  CC ${cedula}: ENT_COD=${rows[0].KC2_EPS_POS} | ${rows[0].ENT_NOMBRE} | Zona=${rows[0].KC2_ZONA}`);
            } else {
                console.log(`  CC ${cedula}: ❌ No encontrado en TMUSUARIOSFACTURACION`);
            }
        } catch(e) { console.log(`  CC ${cedula}: Error: ${e.message}`); }
    }

    // 5. Ver qué citas ya existen para estos pacientes en Xenco
    console.log('\n5) CITAS EXISTENTES para pacientes SIN CUPO:');
    for (const cedula of CEDULAS_SIN_CUPO) {
        const cod14 = cedula.padStart(14, '0');
        const cedulaRaw = cedula.replace(/^0+/, '');
        try {
            const citas = await prisma.$queryRawUnsafe(`
                SELECT TOP 3 KC3_FCH, KC3_HH, KC3_MM, KC3_ARTIC, KC3_ESTADO, KC3_MEDICO
                FROM TMCITASUSUARIOS
                WHERE (KC3_COD = '${cod14}' OR KC3_COD = '${cedulaRaw}' OR LTRIM(RTRIM(KC3_COD)) = '${cedulaRaw}')
                  AND KC3_FCH >= 20260601
                ORDER BY KC3_FCH ASC
            `);
            if (citas.length > 0) {
                console.log(`  CC ${cedula}: Tiene ${citas.length} cita(s) futuras en Xenco:`);
                for (const c of citas) {
                    console.log(`     → Fecha=${c.KC3_FCH} Hora=${c.KC3_HH}:${String(c.KC3_MM||0).padStart(2,'0')} Art=${c.KC3_ARTIC} Estado=${c.KC3_ESTADO || 'null'}`);
                }
            } else {
                console.log(`  CC ${cedula}: Sin citas futuras → VERDADERAMENTE sin cupo asignado`);
            }
        } catch(e) { console.log(`  CC ${cedula}: Error: ${e.message}`); }
    }

    // 6. Intentar buscar slots para el artículo 890301-7 en los próximos 30 días
    console.log('\n6) ¿HAY SLOTS LIBRES para MEDICINA GENERAL en los próximos 30 días?');
    const today = new Date();
    for (let i = 0; i <= 30; i += 5) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dec = parseInt(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`);
        try {
            const libre = await prisma.$queryRawUnsafe(`
                SELECT COUNT(*) AS cnt
                FROM TMTURNOSMEDICOSDETALLE
                WHERE TME2_FCH = ${dec}
                  AND (
                      TME2_COD IS NULL
                      OR LTRIM(RTRIM(TME2_COD)) = ''
                      OR TME2_COD = '00000000000000'
                      OR TRY_CAST(LTRIM(RTRIM(TME2_COD)) AS BIGINT) = 0
                  )
            `);
            const cnt = Number(libre[0]?.cnt || 0);
            console.log(`  ${d.toISOString().slice(0,10)} (dec=${dec}): ${cnt > 0 ? `✅ ${cnt} slots libres` : '❌ Sin slots'}`);
        } catch(e) { console.log(`  ${dec}: Error`); }
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
