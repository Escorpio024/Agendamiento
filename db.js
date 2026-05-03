let prisma = null;
try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    console.log('[DB] Prisma SQL Server client inicializado correctamente.');
} catch (err) {
    console.warn('[DB] ⚠️  Prisma SQL Server client no disponible. El bot funciona en modo básico:', err.message);
    prisma = null;
}

module.exports = prisma;
