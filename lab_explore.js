require('dotenv').config();
const prisma = require('./db');

const CEDULA = '43150002';
const CEDULA_14 = CEDULA.padStart(14, '0');

async function main() {

    // ─── 1. Campos de lab en TQORDENESMEDICAS ───────────────────────────────
    console.log('\n=== CAMPOS QLO_*LB* (relación con laboratorio) ===');
    const colsLb = await prisma.$queryRawUnsafe(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'TQORDENESMEDICAS'
          AND COLUMN_NAME LIKE '%LB%'
        ORDER BY ORDINAL_POSITION
    `);
    colsLb.forEach(c => console.log(` ${c.COLUMN_NAME.padEnd(30)} ${c.DATA_TYPE}`));

    // ─── 2. Valores distintos de QLO_EST_ESTADOLB y QLO_EST_GEN_LB ─────────
    console.log('\n=== ESTADOS LAB (QLO_EST_ESTADOLB y QLO_EST_GEN_LB) ===');
    const estadosLb = await prisma.$queryRawUnsafe(`
        SELECT
            QLO_EST_ESTADOLB, QLO_EST_GEN_LB,
            COUNT(*) as total
        FROM TQORDENESMEDICAS
        WHERE QLO_FCH >= 20260101
          AND QLO_COD_ARTIC LIKE '*%'
        GROUP BY QLO_EST_ESTADOLB, QLO_EST_GEN_LB
        ORDER BY total DESC
    `);
    estadosLb.forEach(r => console.log(` ESTADOLB=${JSON.stringify(r.QLO_EST_ESTADOLB)} | GEN_LB=${JSON.stringify(r.QLO_EST_GEN_LB)} → ${r.total} órdenes`));

    // ─── 3. ÓRDENES DE LAB DE HOY: generadas desde HC, pendientes en TYORDENESLABENVIADAS ─
    console.log('\n=== ÓRDENES LAB DE HOY (TQORDENESMEDICAS) — solo exámenes (*) ===');
    const labHoy = await prisma.$queryRawUnsafe(`
        SELECT TOP 20
            o.QLO_FCH,
            o.QLO_COD,
            o.QLO_COD_ARTIC,
            o.QLO_NOM_DESC,
            o.QLO_EST_ESTADOLB,
            o.QLO_EST_GEN_LB,
            o.QLO_NUM_LB,
            o.QLO_EST_EJECUTADA,
            o.QLO_EST_ANULADO
        FROM TQORDENESMEDICAS o
        WHERE o.QLO_FCH = CAST(CONVERT(VARCHAR(8), GETDATE(), 112) AS DECIMAL(10,0))
          AND o.QLO_COD_ARTIC LIKE '*%'
          AND (o.QLO_EST_ANULADO IS NULL OR o.QLO_EST_ANULADO = '')
        ORDER BY o.QLO_FCH DESC, o.QLO_COD
    `);
    console.log(`Total órdenes de lab hoy: ${labHoy.length}`);
    console.log(JSON.stringify(labHoy.slice(0, 5), null, 2));

    // ─── 4. Para paciente específico (por código interno 14 dígitos) ─────────
    console.log(`\n=== TQORDENESMEDICAS: paciente ${CEDULA} (cod14=${CEDULA_14}) ===`);
    const pacLab = await prisma.$queryRawUnsafe(`
        SELECT TOP 10
            QLO_FCH, QLO_COD_ARTIC, QLO_NOM_DESC,
            QLO_EST_ESTADOLB, QLO_EST_GEN_LB, QLO_NUM_LB,
            QLO_EST_EJECUTADA, QLO_EST_ANULADO
        FROM TQORDENESMEDICAS
        WHERE QLO_COD = '${CEDULA_14}'
          AND QLO_COD_ARTIC LIKE '*%'
        ORDER BY QLO_FCH DESC
    `);
    console.log(`Encontradas: ${pacLab.length}`);
    console.log(JSON.stringify(pacLab, null, 2));

    // ─── 5. QUERY FINAL: LAB ORDENADOS que NO están en TYORDENESLABENVIADAS ─
    // = el médico ordenó el examen pero el paciente AÚN no ha llegado a la institución
    console.log('\n=== ÓRDENES LAB PENDIENTES (en HC pero NO en facturación) — hoy ===');
    const pendientes = await prisma.$queryRawUnsafe(`
        SELECT TOP 20
            o.QLO_COD                                           AS cod_paciente,
            LTRIM(RTRIM(CAST(CAST(o.QLO_COD AS BIGINT) AS VARCHAR))) AS cedula,
            o.QLO_COD_ARTIC                                     AS cod_examen,
            o.QLO_NOM_DESC                                      AS nombre_examen,
            o.QLO_FCH                                           AS fecha_orden,
            o.QLO_EST_ESTADOLB                                  AS estado_lab,
            o.QLO_NUM_LB                                        AS num_orden_lab
        FROM TQORDENESMEDICAS o
        WHERE o.QLO_FCH = CAST(CONVERT(VARCHAR(8), GETDATE(), 112) AS DECIMAL(10,0))
          AND o.QLO_COD_ARTIC LIKE '*%'
          AND (o.QLO_EST_ANULADO IS NULL OR o.QLO_EST_ANULADO = '')
          AND NOT EXISTS (
              SELECT 1
              FROM TYORDENESLABENVIADAS y
              WHERE y.YKL_FECHA = CAST(CONVERT(VARCHAR(8), GETDATE(), 112) AS INT)
                AND y.YKL_ARTIC = o.QLO_COD_ARTIC
                AND CAST(CAST(y.YKL_NUMERO_ID AS BIGINT) AS VARCHAR) =
                    CAST(CAST(o.QLO_COD AS BIGINT) AS VARCHAR)
          )
        ORDER BY o.QLO_COD, o.QLO_COD_ARTIC
    `);
    console.log(`✅ Total órdenes pendientes (ordenadas pero no en facturación): ${pendientes.length}`);
    if (pendientes.length > 0) {
        console.log(JSON.stringify(pendientes.slice(0, 5), null, 2));
    }

    // ─── 6. Comparar: órdenes que SÍ llegaron a facturación hoy ─────────────
    console.log('\n=== ÓRDENES LAB QUE YA LLEGARON A FACTURACIÓN hoy ===');
    const facturadas = await prisma.$queryRawUnsafe(`
        SELECT TOP 10
            y.YKL_NUMERO_ID, y.YKL_ARTIC, y.YKL_NOM_ARTIC,
            y.YKL_PROCESADA_LAB, y.YKL_NOM_USUARIO
        FROM TYORDENESLABENVIADAS y
        WHERE y.YKL_FECHA = CAST(CONVERT(VARCHAR(8), GETDATE(), 112) AS INT)
          AND y.YKL_ARTIC LIKE '*%'
        ORDER BY y.YKL_NUM DESC
    `);
    console.log(`Total en facturación hoy: ${facturadas.length}`);
    console.log(JSON.stringify(facturadas.slice(0, 3), null, 2));
}

main()
    .catch(e => console.error('ERROR:', e.message))
    .finally(() => process.exit(0));
