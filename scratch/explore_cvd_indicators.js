/**
 * Explorar tablas clave para construir indicadores CVD
 */
const prisma = require('../db');

async function exploreCols(tableName) {
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = '${tableName}'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── ${tableName} (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);
        return cols;
    } catch(e) { console.log(`  ❌ ${tableName}: ${e.message.substring(0,80)}`); return []; }
}

async function sampleTable(tableName, limit=2) {
    try {
        const rows = await prisma.$queryRawUnsafe(`SELECT TOP ${limit} * FROM ${tableName}`);
        console.log(`  Muestra:`, JSON.stringify(rows, null, 2).substring(0, 500));
    } catch(e) { console.log(`  ❌ Muestra ${tableName}: ${e.message.substring(0,80)}`); }
}

async function main() {
    console.log('═══ EXPLORANDO TABLAS INDICADORES CVD ═══\n');

    // Resultados de laboratorio
    await exploreCols('TMRESULTADOSLABORATORIOE');
    await sampleTable('TMRESULTADOSLABORATORIOE', 2);

    await exploreCols('TMRESULTADOSLABORATORIOD');
    await sampleTable('TMRESULTADOSLABORATORIOD', 2);

    // Signos vitales
    await exploreCols('TQHOJASIGNOSVITALES');
    await sampleTable('TQHOJASIGNOSVITALES', 2);

    await exploreCols('TQHOJASIGNOSVITALESD');
    await sampleTable('TQHOJASIGNOSVITALESD', 2);

    // Tabla diabetes (para HbA1c)
    await exploreCols('TQTABLADIABETESMIENC');
    await sampleTable('TQTABLADIABETESMIENC', 2);

    await exploreCols('TQTABLADIABETESMIDET');
    await sampleTable('TQTABLADIABETESMIDET', 2);

    // Historia dinámica (puede tener variables de resultados)
    await exploreCols('TQHISTORIADINAMICAD');
    await sampleTable('TQHISTORIADINAMICAD', 2);

    await exploreCols('TQHISTORIADINAMICAE');
    await sampleTable('TQHISTORIADINAMICAE', 2);

    // Examenes y parámetros
    await exploreCols('TMEXAMENESYPARAMETROS');
    await sampleTable('TMEXAMENESYPARAMETROS', 3);

    // Resultados laboratorio online (TYRESULTADOS)
    await exploreCols('TYRESULTADOSLABENC');
    await sampleTable('TYRESULTADOSLABENC', 2);

    await exploreCols('TYRESULTADOSLABDET');
    await sampleTable('TYRESULTADOSLABDET', 2);

    // TMUSUARIOSPROGRAMAS - programas de salud por paciente
    await exploreCols('TMUSUARIOSPROGRAMAS');
    await sampleTable('TMUSUARIOSPROGRAMAS', 3);

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
