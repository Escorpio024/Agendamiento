/**
 * explore_facturacion_xenco.js
 * 
 * Explora las tablas de facturación de la BD HABEJICO (Xenco) vía ZeroTier.
 * Uso: node explore_facturacion_xenco.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
    log: [{ level: 'error', emit: 'stdout' }],
    datasources: { db: { url: process.env.DATABASE_URL } }
});

async function explorar(titulo, query) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`📋 ${titulo}`);
    console.log('='.repeat(70));
    try {
        const rows = await prisma.$queryRawUnsafe(query);
        if (rows.length === 0) {
            console.log('   (Sin resultados)');
        } else {
            console.table(rows.slice(0, 15)); // Máximo 15 filas para no saturar
            if (rows.length > 15) console.log(`   ... y ${rows.length - 15} filas más.`);
        }
    } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
    }
}

async function main() {
    console.log('\n🔍 EXPLORACIÓN DE FACTURACIÓN - XENCO (HABEJICO)');
    console.log('   Conectando a:', process.env.DATABASE_URL?.substring(0, 50) + '...');

    // 1. Columnas de la tabla principal de facturas de entidades (salud)
    await explorar(
        'Columnas de TMFACTURAENTIDADE (Factura Entidad Encabezado)',
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'TMFACTURAENTIDADE'
         ORDER BY ORDINAL_POSITION`
    );

    // 2. Columnas del detalle de factura de entidad
    await explorar(
        'Columnas de TMFACTURAENTIDADANEXO (Detalle/Anexo de Factura)',
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'TMFACTURAENTIDADANEXO'
         ORDER BY ORDINAL_POSITION`
    );

    // 3. Columnas de TKMOVIMIENTOFACTURACIONE (Movimientos de facturación - encabezado)
    await explorar(
        'Columnas de TMMOVIMIENTOFACTURACIONE (Encabezado Movimiento Facturación)',
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'TMMOVIMIENTOFACTURACIONE'
         ORDER BY ORDINAL_POSITION`
    );

    // 4. Columnas de TMMOVIMIENTOFACTURACIOND (Detalle movimientos facturación)
    await explorar(
        'Columnas de TMMOVIMIENTOFACTURACIOND (Detalle Movimiento Facturación)',
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'TMMOVIMIENTOFACTURACIOND'
         ORDER BY ORDINAL_POSITION`
    );

    // 5. Columnas de TMFACTURAENTIDADRADICARE (Radicación de facturas)
    await explorar(
        'Columnas de TMFACTURAENTIDADRADICARE (Radicación de Facturas)',
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'TMFACTURAENTIDADRADICARE'
         ORDER BY ORDINAL_POSITION`
    );

    // 6. Columnas de TKFACTURAS (Facturas comerciales)
    await explorar(
        'Columnas de TKFACTURAS (Facturas Comerciales/Particulares)',
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'TKFACTURAS'
         ORDER BY ORDINAL_POSITION`
    );

    // 7. Últimas facturas a entidades para ver datos reales
    await explorar(
        'Últimas 10 facturas a entidades (datos reales)',
        `SELECT TOP 10 *
         FROM TMFACTURAENTIDADE
         ORDER BY 1 DESC`
    );

    // 8. Conteo de facturas por estado (si existe campo de estado)
    await explorar(
        'Conteo de facturas a entidades (total registros)',
        `SELECT COUNT(*) AS total_facturas FROM TMFACTURAENTIDADE`
    );

    // 9. Tablas RIPS disponibles
    await explorar(
        'Tablas de RIPS disponibles en el sistema',
        `SELECT TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_NAME LIKE 'TMRIPS%'
         ORDER BY TABLE_NAME`
    );

    // 10. Columnas de TMRIPSCONSULTAEXTERNA
    await explorar(
        'Columnas de TMRIPSCONSULTAEXTERNA (RIPS - Consulta Externa)',
        `SELECT COLUMN_NAME, DATA_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'TMRIPSCONSULTAEXTERNA'
         ORDER BY ORDINAL_POSITION`
    );

    // 11. Columnas de TMRIPSUSUARIO (Usuario RIPS)
    await explorar(
        'Columnas de TMRIPSUSUARIO (RIPS - Tabla de Usuarios/Pacientes)',
        `SELECT COLUMN_NAME, DATA_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_NAME = 'TMRIPSUSUARIO'
         ORDER BY ORDINAL_POSITION`
    );

    // 12. Entidades pagadoras activas
    await explorar(
        'Entidades pagadoras (TMENTIDADES)',
        `SELECT TOP 20 ENT_NUI, ENT_NOMBRE, ENT_TIPO, ENT_TEL
         FROM TMENTIDADES
         ORDER BY ENT_NOMBRE`
    );

    // 13. Contratos con entidades
    await explorar(
        'Contratos con entidades (TMCONTRATOENTIDAD)',
        `SELECT TOP 10 *
         FROM TMCONTRATOENTIDAD`
    );

    console.log('\n\n✅ Exploración completa. Revisa los resultados arriba.\n');
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('\n❌ Error fatal:', e.message);
    await prisma.$disconnect();
    process.exit(1);
});
