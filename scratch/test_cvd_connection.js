const medicalPrisma = require('../db');

async function main() {
    try {
        const rows = await medicalPrisma.$queryRawUnsafe(
            "SELECT TOP 1 KC2_COD, KC2_PNOMBRE, KC2_PAPELLIDO FROM TMUSUARIOSFACTURACION"
        );
        console.log('✅ Conexión exitosa a la BD médica. Muestra:');
        console.log(rows);
    } catch (err) {
        console.error('❌ Error de conexión:', err.message);
    } finally {
        await medicalPrisma.$disconnect();
    }
}

main();
