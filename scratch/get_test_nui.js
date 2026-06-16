require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findNUI(internalId) {
    try {
        const nui = await prisma.pacienteNUI.findFirst({
            where: { OR: [{ KCN_COD: internalId }, { KCN_COD: internalId.padStart(14, ' ') }] }
        });
        if (nui) console.log(`Cédula NUI para ${internalId}: ${nui.KCN_COD_NUI}`);
        else console.log(`No se encontró NUI para ${internalId}`);
    } catch (e) { console.error(e); }
    finally { await prisma.$disconnect(); }
}

findNUI("00000000504448");
findNUI("00000000639697");
