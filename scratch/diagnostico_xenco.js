/**
 * Diagnóstico v2: Busca citas PYP CVD sin restricción de KC3_NUM
 */
const prisma = require('./db');

const CEDULAS = ['21707271','15265576','21708477','15261601','21711378','15262126','21708138'];

async function diagnosticar() {
    const hoy = new Date();
    const desdeDecimal = parseInt(`${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}`);
    const hasta = new Date(hoy); hasta.setMonth(hoy.getMonth() + 5);
    const hastaDecimal = parseInt(`${hasta.getFullYear()}${String(hasta.getMonth()+1).padStart(2,'0')}${String(hasta.getDate()).padStart(2,'0')}`);

    console.log(`\n🔍 Buscando citas CVD entre ${desdeDecimal} y ${hastaDecimal} (SIN filtro KC3_NUM)\n`);
    console.log('='.repeat(90));

    for (const cedula of CEDULAS) {
        const cod14 = cedula.padStart(14, '0');
        console.log(`\n👤 Cédula: ${cedula}  (código 14 dígitos: ${cod14})`);

        // 1. Buscar citas CVD específicas (890301-x) sin filtro KC3_NUM
        try {
            const citasCVD = await prisma.$queryRaw`
                SELECT TOP 5
                    c.KC3_COD, c.KC3_FCH, c.KC3_HH, c.KC3_MM,
                    c.KC3_ARTIC, c.KC3_MEDICO, c.KC3_NUM, c.KC3_ESTADO,
                    c.KC3_ENTIDAD
                FROM TMCITASUSUARIOS c
                WHERE c.KC3_COD = ${cod14}
                  AND c.KC3_FCH >= ${desdeDecimal}
                  AND c.KC3_FCH <= ${hastaDecimal}
                  AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13','890301-14','890301-15','890301-16')
                ORDER BY c.KC3_FCH ASC
            `;
            if (citasCVD.length > 0) {
                console.log(`  ✅ CITAS CVD (890301-x) encontradas:`);
                for (const c of citasCVD) {
                    console.log(`     → Fecha: ${c.KC3_FCH} | Hora: ${c.KC3_HH}:${String(c.KC3_MM).padStart(2,'0')} | Artículo: "${c.KC3_ARTIC}" | KC3_NUM: ${c.KC3_NUM} | Estado: ${c.KC3_ESTADO}`);
                }
            } else {
                console.log(`  ❌ Sin citas 890301-x en ese rango`);
            }
        } catch(e) { console.log(`  ⚠️ Error CVD: ${e.message}`); }

        // 2. Buscar CUALQUIER cita futura sin filtro artículo ni KC3_NUM
        try {
            const todasCitas = await prisma.$queryRaw`
                SELECT TOP 5
                    c.KC3_FCH, c.KC3_HH, c.KC3_MM,
                    c.KC3_ARTIC, c.KC3_MEDICO, c.KC3_NUM, c.KC3_ESTADO
                FROM TMCITASUSUARIOS c
                WHERE c.KC3_COD = ${cod14}
                  AND c.KC3_FCH >= ${desdeDecimal}
                  AND c.KC3_FCH <= ${hastaDecimal}
                ORDER BY c.KC3_FCH ASC
            `;
            if (todasCitas.length > 0) {
                console.log(`  📋 TODAS las citas futuras (${todasCitas.length}):`);
                for (const c of todasCitas) {
                    console.log(`     → Fecha: ${c.KC3_FCH} | Hora: ${c.KC3_HH}:${String(c.KC3_MM||0).padStart(2,'0')} | Artículo: "${c.KC3_ARTIC}" | KC3_NUM: ${c.KC3_NUM} | Estado: ${c.KC3_ESTADO}`);
                }
            } else {
                console.log(`  📋 Sin ninguna cita futura en Xenco`);
            }
        } catch(e) { console.log(`  ⚠️ Error general: ${e.message}`); }

        // 3. Buscar en TME2 (Visor de Agenda) si hay slots con su código
        try {
            const tme2 = await prisma.$queryRaw`
                SELECT TOP 5
                    TME2_FCH, TME2_HH, TME2_MM, TME2_COD, TME2_CODM
                FROM TMTURNOSMEDICOSDETALLE
                WHERE TME2_COD = ${cod14}
                  AND TME2_FCH >= ${desdeDecimal}
                ORDER BY TME2_FCH ASC
            `;
            if (tme2.length > 0) {
                console.log(`  🗓️ TME2 (Visor de Agenda) - slots asignados:`);
                for (const t of tme2) {
                    console.log(`     → Fecha: ${t.TME2_FCH} | Hora: ${t.TME2_HH}:${String(t.TME2_MM||0).padStart(2,'0')} | Médico: ${t.TME2_CODM}`);
                }
            } else {
                console.log(`  🗓️ TME2: sin slots asignados a futuro`);
            }
        } catch(e) { console.log(`  ⚠️ Error TME2: ${e.message}`); }
    }

    console.log('\n' + '='.repeat(90));
    await prisma.$disconnect();
}

diagnosticar().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
