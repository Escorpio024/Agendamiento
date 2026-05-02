require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    console.log("--- DIAGNÓSTICO DE CITAS ---");
    
    // 1. Ver todas las citas recientes (últimos 10 registros para ver qué se guardó)
    const lastCitas = await prisma.cita.findMany({
        take: 10,
        orderBy: { KC3_FCH: 'desc' }
    });
    
    console.log("\nÚLTIMAS 10 CITAS EN BD:");
    lastCitas.forEach(c => {
        console.log(`Paciente: ${c.KC3_COD}, Fecha: ${c.KC3_FCH}, Hora: ${c.KC3_HH}:${c.KC3_MM}, Estado: '${c.KC3_ESTADO}', Médico: ${c.KC3_MEDICO}`);
    });

    // 2. Buscar por el médico mencionado en el log (44191600) y fecha (20260323)
    const specificCitas = await prisma.cita.findMany({
        where: {
            KC3_MEDICO: 44191600,
            KC3_FCH: 20260323
        }
    });

    console.log("\nCITAS PARA MÉDICO 44191600 EL 2026-03-23:");
    specificCitas.forEach(c => {
        console.log(`Paciente: ${c.KC3_COD}, Hora: ${c.KC3_HH}:${c.KC3_MM}, Estado: '${c.KC3_ESTADO}'`);
    });

    if (specificCitas.length > 0) {
        const patientId = specificCitas[0].KC3_COD;
        console.log(`\nBuscando paciente con ID: ${patientId}`);
        
        const cliente = await prisma.cliente.findFirst({ where: { KC_COD: patientId } });
        console.log("Datos Cliente:", cliente ? { nom: cliente.KC_NOM, tel: cliente.KC_TEL1 } : "No encontrado");
        
        const pacienteSeg = await prisma.paciente.findFirst({ where: { KC0_COD: patientId } });
        console.log("Datos Paciente (Aseguramiento):", pacienteSeg ? { nom: pacienteSeg.KC0_NOM, tel: pacienteSeg.KC0_RES_TEL } : "No encontrado");
    }

    await prisma.$disconnect();
}

diagnose().catch(e => console.error(e));
