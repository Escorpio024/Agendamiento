const prisma = require('./db');

async function run() {
    try {
        const medicos = await prisma.$queryRaw`SELECT MED_COD, MED_EST_ESTADO FROM TMMEDICOS WHERE MED_COD = 111`;
        console.log("Estado del medico 111:");
        console.log(medicos);
    } catch (e) {
        console.log("DB ERROR", e.message);
    }
    await prisma.$disconnect();
}
run();
