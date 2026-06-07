/**
 * Busca el ENT_COD de ALIANZA MEDELLIN y contratos activos en Xenco
 */
const prisma = require('../db');

async function check() {
    console.log('\n🔍 Buscando entidades EPS relevantes...\n');

    // 1. Buscar todas las EPS que tienen alias ALIANZA
    const entidades = await prisma.$queryRaw`
        SELECT ENT_COD, LTRIM(RTRIM(ENT_NOMBRE)) AS ENT_NOMBRE
        FROM TMENTIDADES
        WHERE ENT_NOMBRE LIKE '%ALIANZA%'
           OR ENT_NOMBRE LIKE '%NUEVA EPS%'
           OR ENT_NOMBRE LIKE '%SAVIA%'
           OR ENT_NOMBRE LIKE '%SURA%'
        ORDER BY ENT_NOMBRE
    `;
    console.log('📋 EPS encontradas:');
    for (const e of entidades) {
        console.log(`  ENT_COD=${e.ENT_COD}  →  ${e.ENT_NOMBRE}`);
    }

    // 2. Buscar contratos vigentes para ALIANZA (buscar por nombre en TMENTIDADES primero)
    const alianza = entidades.find(e => String(e.ENT_NOMBRE).toUpperCase().includes('ALIANZA'));
    if (alianza) {
        console.log(`\n✅ ALIANZA MEDELLIN encontrada: ENT_COD=${alianza.ENT_COD}`);

        try {
            const contratos = await prisma.$queryRaw`
                SELECT TOP 5 KC9_NUM_CONTRATO, KC9_DESC, KC9_FCH_INI, KC9_FCH_FIN, KC9_SEQ
                FROM TKCONTRATOS
                WHERE KC9_ENTIDAD = ${Number(alianza.ENT_COD)}
                ORDER BY KC9_FCH_FIN DESC
            `;
            if (contratos.length > 0) {
                console.log(`\n📄 Contratos vigentes para ALIANZA (ENT_COD=${alianza.ENT_COD}):`);
                for (const c of contratos) {
                    console.log(`  Contrato: "${c.KC9_NUM_CONTRATO}" | Seq: ${c.KC9_SEQ} | Vigencia: ${c.KC9_FCH_INI} - ${c.KC9_FCH_FIN} | Desc: ${c.KC9_DESC}`);
                }
            } else {
                console.log(`  ⚠️ Sin contratos en TKCONTRATOS para ENT_COD=${alianza.ENT_COD}`);
            }
        } catch(e) {
            console.log(`  ⚠️ No se pudo consultar TKCONTRATOS: ${e.message}`);
            // Intentar tabla alternativa
            try {
                const alt = await prisma.$queryRaw`
                    SELECT TOP 5 * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%CONTRAT%'
                `;
                console.log('  Tablas de contratos disponibles:', alt.map(t => t.TABLE_NAME).join(', '));
            } catch(_) {}
        }
    } else {
        console.log('\n❌ ALIANZA MEDELLIN no encontrada en TMENTIDADES');
    }

    // 3. Revisar una cita reciente de ALIANZA para ver qué contrato usa nativamente
    console.log('\n🔍 Buscando citas recientes de pacientes de ALIANZA en Xenco...');
    try {
        const citasAlianza = await prisma.$queryRaw`
            SELECT TOP 3
                c.KC3_COD, c.KC3_ENTIDAD, c.KC3_NUM_CONTRATO, c.KC3_SEQ_CONTRATO,
                c.KC3_FCH, c.KC3_ARTIC,
                LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
            FROM TMCITASUSUARIOS c
            LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
            WHERE e.ENT_NOMBRE LIKE '%ALIANZA%'
              AND c.KC3_FCH >= 20260101
            ORDER BY c.KC3_FCH DESC
        `;
        if (citasAlianza.length > 0) {
            console.log('✅ Citas de ALIANZA encontradas:');
            for (const c of citasAlianza) {
                console.log(`  → ENT_COD=${c.KC3_ENTIDAD} | Contrato="${c.KC3_NUM_CONTRATO}" | Seq=${c.KC3_SEQ_CONTRATO} | Fecha=${c.KC3_FCH} | EPS=${c.ENT_NOMBRE}`);
            }
        } else {
            console.log('  ❌ No hay citas recientes de ALIANZA en 2026');
        }
    } catch(e) {
        console.log(`  ⚠️ Error buscando citas: ${e.message}`);
    }

    // 4. Revisar también el ENT_COD de pacientes que están en la lista con ALIANZA
    console.log('\n🔍 Verificando ENT_COD de pacientes afectados...');
    const cedulasAlianza = ['42878492', '3393402'];
    for (const cedula of cedulasAlianza) {
        const cod14 = cedula.padStart(14, '0');
        try {
            const pac = await prisma.$queryRaw`
                SELECT TOP 1
                    f.KC2_OACOD_NUI, f.KC2_EPS_POS,
                    LTRIM(RTRIM(e.ENT_NOMBRE)) AS ENT_NOMBRE
                FROM TMUSUARIOSFACTURACION f
                LEFT JOIN TMENTIDADES e ON e.ENT_COD = f.KC2_EPS_POS
                WHERE f.KC2_COD = ${cod14} OR f.KC2_OACOD_NUI = ${cedula}
                ORDER BY f.KC2_FCH_DIG DESC
            `;
            if (pac.length > 0) {
                console.log(`  Cédula ${cedula}: ENT_COD=${pac[0].KC2_EPS_POS} → ${pac[0].ENT_NOMBRE}`);
            } else {
                console.log(`  Cédula ${cedula}: No encontrado en TMUSUARIOSFACTURACION`);
            }
        } catch(e) {
            console.log(`  ⚠️ Error para cédula ${cedula}: ${e.message}`);
        }
    }

    await prisma.$disconnect();
}

check().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
