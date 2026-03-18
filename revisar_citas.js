require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function revisarCitas() {
    try {
        console.log("Verificando citas recientes en TMCITASUSUARIOS...");
        // Get all appointments created or scheduled for today
        const todayDecimal = parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
        const citas = await prisma.cita.findMany({
            where: { KC3_FCH: { gte: todayDecimal } },
            take: 20
        });

        console.log(`Citas encontradas del día actual o futuro: ${citas.length}`);
        citas.forEach(c => {
            console.log(`[Cita] Medico: ${c.KC3_MEDICO}, Paciente: ${c.KC3_COD}, Fecha: ${c.KC3_FCH}, Hora: ${c.KC3_HH}:${c.KC3_MM}, Estado: '${c.KC3_ESTADO}', Generada: '${c.KC3_GENERADA}'`);
        });

        const estados = await prisma.cita.groupBy({
            by: ['KC3_ESTADO'],
            _count: { KC3_ESTADO: true }
        });
        console.log("\nEstados usados históricamente:");
        console.log(estados);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
revisarCitas();
