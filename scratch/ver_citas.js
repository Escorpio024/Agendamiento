require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const today = new Date();
    const todayDecimal = parseInt(`${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`);
    
    const citas = await prisma.cita.findMany({
        where: { KC3_ESTADO: 'AG', KC3_FCH: { gte: todayDecimal } }
    });
    console.log("CITAS EN LA BASE DE DATOS:", citas.length);
    citas.forEach(c => console.log(c));
    
    // Almacenar el output en un archivo para fácil lectura
    require('fs').writeFileSync('citas_dump.txt', JSON.stringify(citas, null, 2));
    await prisma.$disconnect();
}
check();
