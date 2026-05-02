require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPhone(cedula) {
    try {
        console.log(`--- Teléfonos del Paciente: ${cedula} ---`);
        const fact = await prisma.tMUSUARIOSFACTURACION.findFirst({
            where: { OR: [{ KC2_OACOD_NUI: cedula }, { KC2_COD: cedula }, { KC2_OACOD_NUI: cedula.padStart(14, ' ') }] }
        });
        if (fact) {
            console.log(`[Facturación] Nombre: ${fact.KC2_PNOMBRE}, Tel Resp: '${fact.KC2_TEL_RESP}', Tel Acomp: '${fact.KC2_TEL_ACOMP}'`);
        }

        const aseg = await prisma.paciente.findFirst({
            where: { OR: [{ KC0_COD: cedula }, { KC0_COD: cedula.padStart(14, ' ') }] }
        });
        if (aseg) {
            console.log(`[Aseguramiento] Nombre: ${aseg.KC0_NOM}, Tel: '${aseg.KC0_RES_TEL}'`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkPhone("1054478593");
checkPhone("00001054478593");
