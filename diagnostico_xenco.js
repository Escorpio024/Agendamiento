/**
 * Script de diagnóstico: Verifica si los pacientes tienen citas futuras en Xenco
 * Uso: node diagnostico_xenco.js
 */

const prisma = require('./db');

const CEDULAS_PRUEBA = [
    '21707271',   // VASQUEZ DE RESTREPO MARIA OLIVA - SIN CUPO
    '15265576',   // PEREZ GONZALEZ LEON DARIO - SIN CUPO
    '21708477',   // RAMIREZ MUÑOZ ALBA MERY - ERROR XENCO
    '15261601',   // ARIAS PULGARIN ALCIDES DE JESUS - ERROR XENCO
    '21711378',   // OSPINA MUÑOZ MARIA DEL CARMEN - SIN CUPO
    '21707271',   // Extra
    '15262126',   // BUILES SIERRA LEON DARIO - SIN CUPO
];

async function diagnosticar() {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    const desdeDecimal = parseInt(`${yyyy}${mm}${dd}`);

    const hasta = new Date(hoy);
    hasta.setMonth(hoy.getMonth() + 5);
    const yyyyH = hasta.getFullYear();
    const mmH = String(hasta.getMonth() + 1).padStart(2, '0');
    const ddH = String(hasta.getDate()).padStart(2, '0');
    const hastaDecimal = parseInt(`${yyyyH}${mmH}${ddH}`);

    console.log(`\n🔍 Buscando citas futuras entre ${desdeDecimal} y ${hastaDecimal}\n`);
    console.log('='.repeat(80));

    for (const cedula of [...new Set(CEDULAS_PRUEBA)]) {
        // Probar diferentes formatos de código
        const formatos = [
            cedula,                          // sin ceros: 21707271
            cedula.padStart(14, '0'),        // con 14 ceros: 00000021707271
            cedula.padStart(10, '0'),        // con 10 ceros: 0021707271
        ];

        console.log(`\n👤 Cédula: ${cedula}`);

        for (const cod of formatos) {
            try {
                const citas = await prisma.$queryRaw`
                    SELECT TOP 3 
                        c.KC3_COD,
                        c.KC3_FCH,
                        c.KC3_HH,
                        c.KC3_MM,
                        c.KC3_ARTIC,
                        c.KC3_MEDICO,
                        c.KC3_NUM,
                        c.KC3_ESTADO
                    FROM TMCITASUSUARIOS c
                    WHERE c.KC3_COD = ${cod}
                      AND c.KC3_FCH >= ${desdeDecimal}
                      AND c.KC3_FCH <= ${hastaDecimal}
                    ORDER BY c.KC3_FCH ASC
                `;

                if (citas && citas.length > 0) {
                    console.log(`  ✅ Encontrado con formato "${cod}":`);
                    for (const c of citas) {
                        console.log(`     → Fecha: ${c.KC3_FCH} | Hora: ${c.KC3_HH}:${c.KC3_MM} | Artículo: ${c.KC3_ARTIC} | Médico: ${c.KC3_MEDICO} | KC3_NUM: ${c.KC3_NUM} | Estado: ${c.KC3_ESTADO}`);
                    }
                } else {
                    console.log(`  ❌ Sin citas con formato "${cod}"`);
                }
            } catch (e) {
                console.log(`  ⚠️ Error con formato "${cod}": ${e.message}`);
            }
        }

        // También buscar sin filtro de fecha para ver si EXISTE en la tabla
        try {
            const codFull = cedula.padStart(14, '0');
            const totalCitas = await prisma.$queryRaw`
                SELECT COUNT(*) as total FROM TMCITASUSUARIOS WHERE KC3_COD = ${codFull}
            `;
            const totalSin = await prisma.$queryRaw`
                SELECT COUNT(*) as total FROM TMCITASUSUARIOS WHERE KC3_COD = ${cedula}
            `;
            console.log(`  📊 Total citas históricas (14 dígitos): ${totalCitas[0]?.total ?? 0} | (sin ceros): ${totalSin[0]?.total ?? 0}`);
        } catch (e) {
            console.log(`  ⚠️ No se pudo contar citas: ${e.message}`);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Diagnóstico terminado.\n');
    await prisma.$disconnect();
}

diagnosticar().catch(e => {
    console.error('Error fatal:', e.message);
    process.exit(1);
});
