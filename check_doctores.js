const prisma = require('./db');

async function getDoctorEsp() {
    try {
        const results = await prisma.$queryRawUnsafe(`
            SELECT MED_ESPECIALIDAD_1 FROM TMMEDICOS WHERE MED_COD='111'
        `);
        console.log("Especialidad:", results);
    } catch (e) {
        console.error("Error:", e.message);
    } finally {
        process.exit(0);
    }
}

getDoctorEsp();
