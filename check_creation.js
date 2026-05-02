require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRecentCreation() {
    try {
        console.log("Buscando citas creadas hoy para 1054478593/00001054478593...");
        const appointments = await prisma.cita.findMany({
            where: {
                KC3_COD: { in: ['1054478593', '00001054478593', '    1054478593'] },
                KC3_FCH: 20260406 // La fecha que salió en el log
            }
        });

        console.log(`Citas encontradas: ${appointments.length}`);
        appointments.forEach(c => {
            console.log(JSON.stringify(c, null, 2));
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkRecentCreation();
