const { PrismaClient } = require('@prisma/bot-client');
const botPrisma = new PrismaClient();

async function main() {
    const todos = await botPrisma.controlReminder.findMany({
        where: { estado: { in: ['BOOKING_FAILED_XENCO', 'BOOKING_FAILED_NO_SLOT', 'PENDING'] } },
        orderBy: { createdAt: 'desc' }
    });
    console.log('\n=== ESTADOS PROBLEMÁTICOS ===');
    for (const r of todos) {
        console.log(`[${r.estado}] ${r.paciente} | CC:${r.cedula} | EPS:${r.epsInfo} | entidadCod:${r.entidadCod} | artículo:${r.articuloCita} | fechaControl:${r.fechaControl} | tel:${r.telefono || 'N/A'}`);
    }
    console.log(`\nTotal: ${todos.length}`);

    // Mostrar por estado
    const xenco = todos.filter(r => r.estado === 'BOOKING_FAILED_XENCO');
    const sinCupo = todos.filter(r => r.estado === 'BOOKING_FAILED_NO_SLOT');
    const pending = todos.filter(r => r.estado === 'PENDING');
    console.log(`\nXENCO ERR: ${xenco.length} | SIN CUPO: ${sinCupo.length} | PENDING: ${pending.length}`);
    
    // Cedulas para diagnóstico
    console.log('\nCédulas ERROR XENCO:', xenco.map(r => r.cedula).join(', '));
    console.log('Cédulas SIN CUPO:', sinCupo.map(r => r.cedula).join(', '));
    console.log('Cédulas PENDING:', pending.map(r => r.cedula).join(', '));

    await botPrisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
