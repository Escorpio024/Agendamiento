require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deepCheck(cedula) {
    try {
        console.log(`--- Análisis Profundo: ${cedula} ---`);
        const exactPadded = cedula.padStart(14, ' ');

        const nui = await prisma.pacienteNUI.findFirst({
            where: { OR: [{ KCN_COD_NUI: cedula }, { KCN_COD_NUI: exactPadded }] }
        });
        if (nui) console.log(`[TMUSUARIOSNUI] KCN_ZONA: '${nui.KCN_ZONA}', KCN_COD: '${nui.KCN_COD}'`);

        const fact = await prisma.tMUSUARIOSFACTURACION.findFirst({
            where: { OR: [{ KC2_OACOD_NUI: cedula }, { KC2_OACOD_NUI: exactPadded }] }
        });
        if (fact) console.log(`[TMUSUARIOSFACTURACION] KC2_ZONA: '${fact.KC2_ZONA}', KC2_COD: '${fact.KC2_COD}'`);

        const internalId = fact?.KC2_COD || nui?.KCN_COD || cedula;

        const appointments = await prisma.cita.findMany({
            where: {
                KC3_COD: { in: [cedula, exactPadded, internalId, internalId.padStart(14, ' ')] }
            }
        });

        console.log(`\nCitas encontradas en TMCITASUSUARIOS (${appointments.length}):`);
        appointments.forEach(c => {
            console.log(JSON.stringify(c, null, 2));
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

deepCheck("1054478593");
