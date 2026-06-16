/**
 * migrate_bot_db.js
 * 
 * Crea las tablas CVD que faltan en bot.db usando el PrismaClient ya instalado.
 * Ejecutar en la VM: node migrate_bot_db.js
 */

const botPrisma = require('./dbBot');

async function main() {
    console.log('[migrate] Conectando a bot.db...');

    // Usar $executeRawUnsafe para crear tablas directamente en SQLite
    const queries = [
        `CREATE TABLE IF NOT EXISTS "CvdProgramadoHistorial" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "cedula"     TEXT NOT NULL,
            "examCodigo" TEXT NOT NULL,
            "tipoExamen" TEXT NOT NULL,
            "fecha"      TEXT,
            "doctor"     TEXT,
            "accion"     TEXT NOT NULL,
            "motivo"     TEXT,
            "creadoEn"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS "CvdCitaProgramada" (
            "id"           TEXT NOT NULL PRIMARY KEY,
            "cedula"       TEXT NOT NULL,
            "paciente"     TEXT NOT NULL,
            "doctorId"     TEXT,
            "doctorNombre" TEXT,
            "examCodigo"   TEXT NOT NULL,
            "tipoExamen"   TEXT NOT NULL,
            "fecha"        TEXT,
            "hora"         TEXT,
            "notas"        TEXT,
            "creadoEn"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
    ];

    for (const q of queries) {
        const nombre = q.match(/"(\w+)"/)?.[1] || 'tabla';
        try {
            await botPrisma.$executeRawUnsafe(q);
            console.log(`  ✅ ${nombre} — OK`);
        } catch (e) {
            if (e.message.includes('already exists')) {
                console.log(`  ℹ️  ${nombre} — ya existe`);
            } else {
                console.error(`  ❌ ${nombre} — ERROR:`, e.message);
            }
        }
    }

    // Verificar tablas existentes
    const tablas = await botPrisma.$queryRawUnsafe(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    );
    console.log('\n[migrate] Tablas en bot.db:');
    tablas.forEach(t => console.log(`  · ${t.name}`));

    await botPrisma.$disconnect();
    console.log('\n[migrate] ¡Listo! Reinicia el servidor (node index.js).');
}

main().catch(e => {
    console.error('[migrate] Error fatal:', e.message);
    process.exit(1);
});
