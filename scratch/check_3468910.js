require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    console.log("=== Cambiando USUARIO y TERMINAL a valores nativos ===");
    
    // Cambiar la cita de Elkin Marin (1039886030) a las 09:20 para que sea de CINDY
    const updateResult = await prisma.cita.updateMany({
        where: {
            KC3_MEDICO: 1044509466,
            KC3_FCH: 20260924,
            KC3_HH: 9,
            KC3_MM: 20,
            KC3_COD: { contains: '1039886030' }
        },
        data: {
            KC3_USUARIO: 'CINDY',
            KC3_TERMINAL: 'CIN'
        }
    });

    console.log(`✅ Cita actualizada: ${updateResult.count}`);
    
    const verif = await prisma.cita.findFirst({
        where: {
            KC3_MEDICO: 1044509466,
            KC3_FCH: 20260924,
            KC3_HH: 9,
            KC3_MM: 20,
            KC3_COD: { contains: '1039886030' }
        }
    });

    console.log("Quedó así:", JSON.stringify({
        FCH: verif.KC3_FCH,
        HH: verif.KC3_HH,
        USUARIO: verif.KC3_USUARIO,
        TERMINAL: verif.KC3_TERMINAL,
        ESTADO: verif.KC3_ESTADO
    }, null, 2));

    await prisma.$disconnect();
}
check();
