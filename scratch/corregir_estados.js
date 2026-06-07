/**
 * Corrección manual de estados en BD local:
 * - Los 5 pacientes ALIANZA con ERROR_XENCO ya tienen cita creada en Xenco → BOOKED_PRESENCIAL
 * - PEREZ GONZALEZ ya tiene cita el 4-ago → BOOKED_PRESENCIAL
 */
const { PrismaClient } = require('@prisma/bot-client');
const botPrisma = new PrismaClient();

// Datos verificados directamente de Xenco en el diagnóstico
const CORRECCIONES = [
    { cedula: '1039886359', nombre: 'ORTIZ GALLEGO MANUEL ALEJANDRO',   citaFch: '20260904', citaHora: '15:20', medico: '111' },
    { cedula: '3395435',    nombre: 'BOLIVAR PATINO SAMUEL',             citaFch: '20260904', citaHora: '14:40', medico: '111' },
    { cedula: '3468912',    nombre: 'CHAVERRA GUERRA HERNANDO ANTONIO',  citaFch: '20260905', citaHora: '15:20', medico: '111' },
    { cedula: '43847735',   nombre: 'OSPINA ALVAREZ FRANCY ELENA',       citaFch: '20260905', citaHora: '14:40', medico: '111' },
    { cedula: '43847020',   nombre: 'TEJADA RUIZ BEATRIZ ELENA',         citaFch: '20260906', citaHora: '8:40',  medico: '111' },
    { cedula: '21707667',   nombre: 'LONDOÑO PAREJA ANA LUCIA',          citaFch: '20260906', citaHora: '9:00',  medico: '111' },
    { cedula: '15265576',   nombre: 'PEREZ GONZALEZ LEON DARIO',         citaFch: '20260804', citaHora: '8:40',  medico: '111' },
];

async function main() {
    console.log('Corrigiendo estados en BD local...\n');

    for (const c of CORRECCIONES) {
        // Buscar el registro actual en la BD local
        const registros = await botPrisma.controlReminder.findMany({
            where: {
                cedula: c.cedula,
                estado: { in: ['BOOKING_FAILED_XENCO', 'BOOKING_FAILED_NO_SLOT', 'PENDING'] }
            }
        });

        if (registros.length === 0) {
            console.log(`  ⚠️ ${c.nombre} (${c.cedula}): No se encontró registro con estado de error en BD local.`);
            continue;
        }

        for (const reg of registros) {
            const result = await botPrisma.controlReminder.update({
                where: { id: reg.id },
                data: {
                    estado:       'BOOKED_PRESENCIAL',
                    fechaControl: c.citaFch,
                    citaMedico:   c.medico,
                    citaFch:      c.citaFch,
                    citaHora:     c.citaHora,
                }
            });
            console.log(`  ✅ ${c.nombre} (${c.cedula}): BOOKING_FAILED → BOOKED_PRESENCIAL | Cita: ${c.citaFch} ${c.citaHora}`);
        }
    }

    // Verificar resultado
    const erroresRestantes = await botPrisma.controlReminder.findMany({
        where: { estado: { in: ['BOOKING_FAILED_XENCO', 'BOOKING_FAILED_NO_SLOT'] } }
    });
    console.log(`\nErrores restantes después de corrección: ${erroresRestantes.length}`);
    for (const r of erroresRestantes) {
        console.log(`  → ${r.paciente} (${r.cedula}) | ${r.estado} | EPS: ${r.epsInfo}`);
    }

    await botPrisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
