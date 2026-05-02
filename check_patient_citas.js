require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPatient(cedula) {
    try {
        console.log(`--- Verificando Paciente: ${cedula} ---`);
        const exactPadded = cedula.padStart(14, ' ');

        // 1. Buscar en NUI
        const nui = await prisma.pacienteNUI.findFirst({
            where: { OR: [{ KCN_COD_NUI: cedula }, { KCN_COD_NUI: exactPadded }] }
        });
        if (nui) console.log(`[NUI] Encontrado: ${nui.KCN_NOM}, Codigo Interno: ${nui.KCN_COD}`);

        // 2. Buscar en Facturación
        const fact = await prisma.tMUSUARIOSFACTURACION.findFirst({
            where: { OR: [{ KC2_OACOD_NUI: cedula }, { KC2_OACOD_NUI: exactPadded }] }
        });
        if (fact) console.log(`[Factura] Encontrado: ${fact.KC2_PNOMBRE} ${fact.KC2_PAPELLIDO}, Codigo Interno: ${fact.KC2_COD}`);

        // 3. Buscar en Aseguramiento (Fallback)
        const aseg = await prisma.paciente.findFirst({
            where: { OR: [{ KC0_COD: cedula }, { KC0_COD: exactPadded }] }
        });
        if (aseg) console.log(`[Asegura] Encontrado: ${aseg.KC0_NOM}, Codigo Interno: ${aseg.KC0_COD}`);

        const internalId = (fact?.KC2_COD) || (nui?.KCN_COD) || (aseg?.KC0_COD) || cedula;

        // 4. Buscar Citas para el ID interno o la cédula
        const todayDecimal = parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
        const appointments = await prisma.cita.findMany({
            where: {
                KC3_COD: { in: [cedula, exactPadded, internalId, internalId.padStart(14, ' ')] },
                KC3_FCH: { gte: todayDecimal }
            },
            take: 10
        });

        console.log(`\nCitas futuras encontradas (${appointments.length}):`);
        appointments.forEach(c => {
            console.log(`- Fecha: ${c.KC3_FCH}, Hora: ${c.KC3_HH}:${c.KC3_MM}, Medico: ${c.KC3_MEDICO}, Estado: ${c.KC3_ESTADO}, Seq: ${c.KC3_SEQK}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

const targetCedula = "1054478593";
checkPatient(targetCedula);
