require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function purge() {
    console.log("Limpiando citas de prueba (cancelando) generadas por el bot en estado AG...");
    
    // Cambiar las citas de prueba recientes a estado "CA" (Canceladas) para liberar los horarios
    const result = await prisma.cita.updateMany({
        where: { KC3_ESTADO: { in: ['AG', '01'] } }, // Todas las que el bot agendó recientemente que podrían estar tapando slots
        data: { KC3_ESTADO: 'CA' }
    });
    
    console.log(`✅ Se han cancelado (liberado) ${result.count} citas recientes en la Base de Datos para purgar el sistema.`);
    console.log("¡Los horarios (como el de las 9:00 AM) han vuelto a quedar desocupados y libres para agendar!");
    await prisma.$disconnect();
}

purge().catch(console.error);
