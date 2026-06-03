const medicalPrisma = require('../db');

async function main() {
    // Ver una cita real con cada código -7 para entender qué es
    for (const artic of ['890201-7', '890301-7', '890305-7']) {
        const rows = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 3
                c.KC3_ARTIC         AS artic,
                c.KC3_TIPO_SERVICIO AS tipo_servicio,
                c.KC3_ESPECIALISTA  AS especialista,
                c.KC3_TIPO          AS tipo,
                c.KC3_FCH           AS fecha,
                c.KC3_ESTADO        AS estado,
                LTRIM(RTRIM(m.MED_NOMBRE)) AS medico,
                m.MED_ESPECIALIDAD_1 AS esp_medico
            FROM TMCITASUSUARIOS c
            LEFT JOIN TMMEDICOS m ON m.MED_COD = c.KC3_MEDICO
            WHERE c.KC3_ARTIC = '${artic}'
              AND c.KC3_FCH >= 20250101
            ORDER BY c.KC3_FCH DESC
        `);
        console.log(`\n📋 Código [${artic}]:`);
        rows.forEach(r => {
            console.log(`   Fecha=${r.fecha}  Estado=${r.estado}  Tipo=${r.tipo}`);
            console.log(`   Tipo_servicio=${r.tipo_servicio}  Especialista=${r.especialista}`);
            console.log(`   Médico: ${r.medico}  Esp_medico=${r.esp_medico}`);
        });
    }

    // Ver descripción del tipo_servicio 801 si existe tabla
    const ts = await medicalPrisma.$queryRawUnsafe(`
        SELECT DISTINCT
            KC3_TIPO_SERVICIO AS ts,
            KC3_ARTIC         AS artic,
            KC3_ESPECIALISTA  AS especialista,
            COUNT(*) AS cnt
        FROM TMCITASUSUARIOS
        WHERE KC3_TIPO_SERVICIO IN (201, 801)
          AND KC3_FCH >= 20250101
        GROUP BY KC3_TIPO_SERVICIO, KC3_ARTIC, KC3_ESPECIALISTA
        ORDER BY ts, cnt DESC
    `);
    console.log('\n📋 Todos los ARTICs para tipo_servicio 201 y 801 en 2025:');
    ts.forEach(r => console.log(`   ts=${r.ts}  artic=[${r.artic}]  esp=${r.especialista}  cantidad=${r.cnt}`));

    await medicalPrisma.$disconnect();
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
