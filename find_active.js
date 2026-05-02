require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findActiveAppointments() {
    try {
        const todayDecimal = parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
        console.log(`Buscando citas >= ${todayDecimal}...`);
        
        const citas = await prisma.cita.findMany({
            where: { 
                KC3_FCH: { gte: todayDecimal },
                OR: [
                    { KC3_FCH_ANUL: null },
                    { KC3_FCH_ANUL: 0 }
                ]
            },
            take: 5
        });

        console.log(`Citas activas encontradas: ${citas.length}`);
        citas.forEach(c => {
            console.log(`Paciente: '${c.KC3_COD}', Fecha: ${c.KC3_FCH}, Medico: ${c.KC3_MEDICO}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

findActiveAppointments();
