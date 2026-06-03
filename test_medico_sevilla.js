require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const todayDecimal = parseInt(`${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`);
    
    console.log("Revisando Turnos Medico Sevilla (444)...");
    const turnos = await prisma.$queryRawUnsafe(`
        SELECT TOP 5 TME_CODM, TME_FCH, TME_FCH_FIN, TME_ACTIVIDAD_M, TME_ACTIVIDAD_T, TME_ESPECIALIDAD
        FROM TMTURNOSMEDICOS
        WHERE TME_CODM = 444
        ORDER BY TME_FCH DESC
    `);
    console.log("TMTURNOSMEDICOS:", turnos);

    const tme2 = await prisma.$queryRawUnsafe(`
        SELECT TOP 5 TME2_CODM, TME2_FCH, TME2_HH, TME2_MM, TME2_COD
        FROM TMTURNOSMEDICOSDETALLE
        WHERE TME2_CODM = 444 AND TME2_FCH >= ${todayDecimal}
    `);
    console.log("TMTURNOSMEDICOSDETALLE:", tme2);
    
    prisma.$disconnect();
}
main();
