/**
 * Buscar framingham3280 en otras bases de datos del servidor
 */
const prisma = require('../db');

async function main() {
    console.log('═══ BUSCANDO framingham3280 EN OTRAS BDs ═══\n');

    const otherDbs = ['Paisoft', 'VIG_2023HSRE', 'KiaiIntegrador', 'master'];

    for (const dbName of otherDbs) {
        console.log(`\n🔍 Buscando en ${dbName}...`);
        try {
            const found = await prisma.$queryRawUnsafe(`
                SELECT '${dbName}' AS bd, name AS tableName
                FROM [${dbName}].sys.tables
                WHERE name LIKE '%framingham%'
                   OR name LIKE '%3280%'
                   OR name LIKE '%cardio%'
                   OR name LIKE '%riesgo%'
            `);
            if (found.length > 0) {
                console.log(`✅ Encontrado en ${dbName}:`);
                console.log(JSON.stringify(found, null, 2));

                // Explorar columnas si se encontró
                for (const t of found) {
                    try {
                        const cols = await prisma.$queryRawUnsafe(`
                            SELECT COLUMN_NAME, DATA_TYPE
                            FROM [${dbName}].INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_NAME = '${t.tableName}'
                            ORDER BY ORDINAL_POSITION
                        `);
                        console.log(`\n  Columnas de [${dbName}].[${t.tableName}]:`);
                        for (const c of cols) {
                            console.log(`    - ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);
                        }

                        // Muestra de datos
                        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 3 * FROM [${dbName}].dbo.[${t.tableName}]`);
                        console.log(`\n  Muestra de datos:`);
                        console.log(JSON.stringify(sample, null, 2));
                    } catch (ce) {
                        console.log(`  Error leyendo ${t.tableName}: ${ce.message.substring(0, 100)}`);
                    }
                }
            } else {
                console.log(`  ⚠️ No encontrada en ${dbName}`);
            }
        } catch (e) {
            console.log(`  ❌ Sin acceso a ${dbName}: ${e.message.substring(0, 100)}`);
        }
    }

    // Buscar también en VIG_2023HSRE con todas las tablas que tenga
    console.log('\n\n═══ TABLAS EN VIG_2023HSRE ═══');
    try {
        const vigTables = await prisma.$queryRawUnsafe(`
            SELECT name FROM [VIG_2023HSRE].sys.tables ORDER BY name
        `);
        console.log(`Total tablas: ${vigTables.length}`);
        for (const t of vigTables) {
            console.log(`  - ${t.name}`);
        }
    } catch (e) {
        console.log('❌ Error:', e.message.substring(0, 150));
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
