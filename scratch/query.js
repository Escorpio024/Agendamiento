const prisma = require('./db');

async function run() {
    try {
        const t = await prisma.$queryRaw`SELECT TME_CODM, TME_HH_I, TME_HH_F, TME_HH_I_A, TME_HH_F_A, TME_DUR_CITA, TME_ACTIVIDAD_M, TME_ACTIVIDAD_T FROM TMTURNOSMEDICOS WHERE TME_CODM = 1143366001`;
        console.log("Config de 1143366001:");
        console.log(t.slice(0, 5));
    } catch (e) {
        console.log("DB ERROR", e.message);
    }
    await prisma.$disconnect();
}
run();
