let prisma = null;
try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({
        // Logs de errores de BD en consola (sin spam de queries)
        log: [{ level: 'error', emit: 'stdout' }],
        datasources: {
            db: {
                url: process.env.DATABASE_URL
            }
        }
    });

    // Verificar conexión al iniciar (sin bloquear el arranque del bot)
    prisma.$connect()
        .then(() => console.log('[DB] ✅ Conexión SQL Server verificada.'))
        .catch(err => console.warn('[DB] ⚠️  No se pudo pre-conectar a SQL Server:', err.message));

    console.log('[DB] Prisma SQL Server client inicializado correctamente.');
} catch (err) {
    console.warn('[DB] ⚠️  Prisma SQL Server client no disponible. El bot funciona en modo básico:', err.message);
    prisma = null;
}

module.exports = prisma;
