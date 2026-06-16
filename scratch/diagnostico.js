require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('\n========= DIAGNÓSTICO DE HABEJICO =========\n');

    // 1. Médicos activos
    const medicos = await prisma.medico.findMany({ where: { MED_EST_ESTADO: 'A' }, take: 10 });
    console.log(`✅ Médicos activos: ${medicos.length}`);
    medicos.forEach(m => console.log(`   - [${m.MED_COD}] ${m.MED_NOMBRE?.trim()} | Esp: ${m.MED_ESPECIALIDAD_1}`));

    // 2. Especialidades
    const esps = await prisma.especialidad.findMany({ take: 15, orderBy: { ESP_COD: 'asc' } });
    console.log(`\n✅ Especialidades (primeras 15):`);
    esps.forEach(e => console.log(`   - [${e.ESP_COD}] ${e.ESP_NOMBRE?.trim()}`));

    // 3. Turnos existentes
    const today = new Date();
    const todayDecimal = parseInt(`${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`);
    const in30 = new Date(); in30.setDate(today.getDate() + 30);
    const in30Decimal = parseInt(`${in30.getFullYear()}${String(in30.getMonth()+1).padStart(2,'0')}${String(in30.getDate()).padStart(2,'0')}`);

    const turnos = await prisma.turnoMedico.findMany({
        where: { TME_FCH: { lte: todayDecimal }, TME_FCH_FIN: { gte: todayDecimal } }
    });
    console.log(`\n✅ Turnos activos para HOY (${todayDecimal}): ${turnos.length}`);
    turnos.forEach(t => console.log(`   - Médico ${t.TME_CODM} | ${t.TME_HH_I}:${t.TME_MM_I}-${t.TME_HH_F}:${t.TME_MM_F} | Esp: ${t.TME_ESPECIALIDAD}`));

    // 4. Citas agendadas futuras
    const citas = await prisma.cita.count({ where: { KC3_FCH: { gte: todayDecimal } } });
    console.log(`\n✅ Citas futuras en BD: ${citas}`);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
