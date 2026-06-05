const prisma = require('./db');
async function check() {
    const med = await prisma.$queryRaw`SELECT MED_COD, MED_EST_ESTADO FROM TMMEDICOS WHERE MED_COD = 111`;
    console.log(med);
    await prisma.$disconnect();
}
check();
