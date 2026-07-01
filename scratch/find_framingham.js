/**
 * Buscar la tabla framingham3280 en TODAS las bases de datos del servidor
 */
const prisma = require('../db');

async function main() {
    console.log('═══ BUSCANDO framingham3280 EN TODAS LAS BDs ═══\n');

    // 1. Listar todas las bases de datos disponibles
    try {
        const dbs = await prisma.$queryRawUnsafe(`
            SELECT name FROM sys.databases 
            WHERE state_desc = 'ONLINE'
            ORDER BY name
        `);
        console.log(`📂 Bases de datos disponibles (${dbs.length}):`);
        for (const db of dbs) {
            console.log(`  - ${db.name}`);
        }
    } catch (e) {
        console.error('❌ Error listando BDs:', e.message);
    }

    // 2. Buscar la tabla en todas las BDs accesibles
    console.log('\n🔍 Buscando framingham3280 en todas las BDs...');
    try {
        const found = await prisma.$queryRawUnsafe(`
            SELECT 
                DB_NAME() AS currentDb,
                name AS tableName
            FROM sys.tables
            WHERE name LIKE '%framingham%'
        `);
        if (found.length > 0) {
            console.log('✅ Encontrada en BD actual:');
            console.log(JSON.stringify(found, null, 2));
        } else {
            console.log('⚠️ No encontrada en la BD actual (HABEJICO)');
        }
    } catch (e) {
        console.error('❌ Error:', e.message);
    }

    // 3. Buscar en sys.all_objects por si tiene schema diferente
    try {
        const objs = await prisma.$queryRawUnsafe(`
            SELECT o.name, s.name AS schema_name, o.type_desc
            FROM sys.objects o
            JOIN sys.schemas s ON s.schema_id = o.schema_id
            WHERE o.name LIKE '%framingham%'
              OR o.name LIKE '%3280%'
        `);
        if (objs.length > 0) {
            console.log('\n📋 Objetos encontrados:');
            console.log(JSON.stringify(objs, null, 2));
        } else {
            console.log('\n⚠️ Ningún objeto con "framingham" o "3280" en la BD actual');
        }
    } catch (e) {
        console.error('❌ Error buscando objetos:', e.message);
    }

    // 4. Intentar acceder con schema dbo explícito
    try {
        const test = await prisma.$queryRawUnsafe(`SELECT TOP 1 * FROM dbo.framingham3280`);
        console.log('\n✅ dbo.framingham3280 existe!');
        console.log(JSON.stringify(test, null, 2));
    } catch (e) {
        console.log('\n❌ dbo.framingham3280 no accesible:', e.message.substring(0, 100));
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
