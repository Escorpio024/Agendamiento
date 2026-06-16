/**
 * VERIFICACIÓN DE CITAS DE MAYO 2026
 * Usa la misma conexión DATABASE_URL del .env (Prisma + SQL Server vía ZeroTier 10.32.93.90)
 * Ejecutar DESDE el servidor donde corre el bot o con ZeroTier activo.
 */
require('dotenv').config();

// ── 1. Verificar conectividad antes de proceder ──────────────────────────────
const net = require('net');

function testTcpConnection(host, port, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port, timeout: timeoutMs });
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
}

async function main() {
    console.log('\n=== VERIFICACIÓN CITAS MAYO 2026 ===');
    console.log(`Hora local: ${new Date().toLocaleString('es-CO')}\n`);

    // Test TCP a la IP del bot
    const DB_HOST = '10.32.93.90';
    const DB_PORT = 1433;
    console.log(`🔌 Verificando conexión TCP a ${DB_HOST}:${DB_PORT}...`);
    const reachable = await testTcpConnection(DB_HOST, DB_PORT, 5000);

    if (!reachable) {
        console.error(`❌ NO se puede llegar a ${DB_HOST}:${DB_PORT}.`);
        console.error('   Esta máquina NO está en la red ZeroTier o el servidor de BD está apagado.');
        console.error('   Para ejecutar este diagnóstico:');
        console.error('   1. Asegúrate de tener ZeroTier activo con la red del servidor.');
        console.error('   2. O copia este script al servidor donde corre el bot y ejecútalo ahí.');
        console.error('\n   DATABASE_URL usada:', process.env.DATABASE_URL?.replace(/password=[^;]+/, 'password=***'));
        process.exit(1);
    }
    console.log(`✅ Conexión TCP OK a ${DB_HOST}:${DB_PORT}\n`);

    // ── 2. Cargar clientes Prisma (misma config que el bot) ──────────────────
    const botPrisma = require('./dbBot');
    const prisma    = require('./db');

    // ── 3. AppointmentLog del bot (visor frontend) ──────────────────────────
    console.log('─'.repeat(60));
    console.log('📋 [1] AppointmentLog del Bot  →  lo que muestra el Visor de Agenda');
    console.log('─'.repeat(60));
    try {
        const allLogs = await botPrisma.appointmentLog.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Detectar citas de mayo por appointmentDate
        const mayoLogs = allLogs.filter(l => {
            const d = String(l.appointmentDate || '');
            return d.startsWith('2026-05') || d.startsWith('05/2026');
        });

        console.log(`\n  Total registros en AppointmentLog : ${allLogs.length}`);
        console.log(`  Citas con fecha en mayo 2026      : ${mayoLogs.length}`);

        if (mayoLogs.length > 0) {
            console.log('\n  ✅ CITAS DE MAYO VISIBLES EN EL VISOR:');
            console.log('  ' + '─'.repeat(56));
            mayoLogs.forEach((l, i) => {
                console.log(`  ${String(i+1).padStart(2)}. ${l.patientName?.padEnd(25)} | ${String(l.appointmentDate).padEnd(12)} | ${String(l.appointmentTime).padEnd(10)} | Dr: ${l.doctorName || 'N/A'}`);
            });
        } else {
            console.log('\n  ⚠️  NO hay citas de mayo en el Visor de Agenda (AppointmentLog vacío para mayo).');
            console.log('\n  Últimas 8 citas registradas (cualquier mes):');
            console.log('  ' + '─'.repeat(56));
            allLogs.slice(0, 8).forEach((l, i) => {
                console.log(`  ${String(i+1).padStart(2)}. ${String(l.patientName||'').padEnd(25)} | ${String(l.appointmentDate).padEnd(12)} | ${String(l.appointmentTime).padEnd(10)} | Creada: ${l.createdAt?.toISOString?.().split('T')[0] || '?'}`);
            });
        }
    } catch (e) {
        console.error('  ❌ Error leyendo AppointmentLog:', e.message);
    }

    // ── 4. KC3 — citas en HABEJICO para mayo ────────────────────────────────
    console.log('\n' + '─'.repeat(60));
    console.log('📋 [2] Tabla KC3 de HABEJICO  →  citas reales en la BD clínica');
    console.log('─'.repeat(60));
    try {
        const mayoStart = 20260501;
        const mayoEnd   = 20260531;

        const citasMayo = await prisma.cita.findMany({
            where: { KC3_FCH: { gte: mayoStart, lte: mayoEnd } },
            orderBy: [{ KC3_FCH: 'asc' }, { KC3_HH: 'asc' }]
        });

        const esVacio = (cod) => !cod || String(cod).trim() === '' || /^0+$/.test(String(cod).trim());
        const conPaciente = citasMayo.filter(c => !esVacio(c.KC3_COD));
        const slotsVacios = citasMayo.filter(c =>  esVacio(c.KC3_COD));

        console.log(`\n  Total KC3 en mayo 2026              : ${citasMayo.length}`);
        console.log(`  Con paciente real (agendadas)       : ${conPaciente.length}`);
        console.log(`  Slots vacíos Xenco (disponibles)    : ${slotsVacios.length}`);

        if (conPaciente.length > 0) {
            console.log('\n  ✅ CITAS AGENDADAS EN MAYO (KC3):');
            console.log('  ' + '─'.repeat(56));
            conPaciente.forEach((c, i) => {
                const estado = c.KC3_ESTADO?.trim() || 'activa';
                console.log(`  ${String(i+1).padStart(2)}. Fecha=${c.KC3_FCH} | ${String(c.KC3_HH).padStart(2)}:${String(c.KC3_MM).padStart(2,'0')} | Médico=${c.KC3_MEDICO} | Pac="${c.KC3_COD?.trim()}" | Estado=${estado} | User=${c.KC3_USUARIO?.trim()||'?'}`);
            });
        }

        if (slotsVacios.length > 0) {
            console.log('\n  📅 Fechas con slots vacíos disponibles en mayo:');
            const fechas = [...new Set(slotsVacios.map(c => c.KC3_FCH))].sort();
            fechas.slice(0, 15).forEach(f => {
                const count = slotsVacios.filter(c => c.KC3_FCH === f).length;
                const sample = slotsVacios.filter(c => c.KC3_FCH === f)[0];
                // Convertir decimal YYYYMMDD → fecha legible
                const str = String(f);
                const legible = `${str.slice(6,8)}/${str.slice(4,6)}/${str.slice(0,4)}`;
                console.log(`     ${legible} (${f}) → ${count} slots | Médico${count>1?'s':''}: ${
                    [...new Set(slotsVacios.filter(c=>c.KC3_FCH===f).map(c=>c.KC3_MEDICO))].join(', ')
                }`);
            });
        } else if (citasMayo.length === 0) {
            console.log('\n  ⚠️  KC3 no tiene ningún registro en mayo 2026.');
            console.log('  Esto significa que Xenco NO generó slots para este mes.');
            console.log('  El bot busca hacia adelante y encuentra los primeros slots disponibles');
            console.log('  que en este caso son los de SEPTIEMBRE.');
        }
    } catch (e) {
        console.error('  ❌ Error leyendo KC3:', e.message);
    }

    // ── 5. Turnos médicos activos para hoy ──────────────────────────────────
    console.log('\n' + '─'.repeat(60));
    console.log('📋 [3] TMTURNOSMEDICOS  →  turnos activos para hoy 20260505');
    console.log('─'.repeat(60));
    try {
        const hoyDecimal = 20260505;

        const turnos = await prisma.turnoMedico.findMany({
            where: {
                AND: [
                    { TME_FCH: { lte: hoyDecimal } },
                    {
                        OR: [
                            { TME_FCH_FIN: { gte: hoyDecimal } },
                            { TME_FCH_FIN: null }
                        ]
                    }
                ]
            }
        });

        console.log(`\n  Turnos activos para ${hoyDecimal}: ${turnos.length}`);

        if (turnos.length > 0) {
            console.log('\n  ✅ TURNOS ENCONTRADOS (el bot SÍ debería dar citas en mayo):');
            console.log('  ' + '─'.repeat(56));
            turnos.forEach(t => {
                const mañana = `${t.TME_HH_I}:${String(t.TME_MM_I||0).padStart(2,'0')}–${t.TME_HH_F}:${String(t.TME_MM_F||0).padStart(2,'0')} (${t.TME_ACTIVIDAD_M||'?'})`;
                const tarde  = `${t.TME_HH_I_A}:${String(t.TME_MM_I_A||0).padStart(2,'0')}–${t.TME_HH_F_A}:${String(t.TME_MM_F_A||0).padStart(2,'0')} (${t.TME_ACTIVIDAD_T||'?'})`;
                console.log(`  Médico=${t.TME_CODM} | Ini=${t.TME_FCH} Fin=${t.TME_FCH_FIN||'NULL'} | Esp=${t.TME_ESPECIALIDAD}`);
                console.log(`    Mañana: ${mañana} | Tarde: ${tarde}`);
            });
        } else {
            console.log('\n  ❌ NINGÚN turno activo para hoy.');
            console.log('  El primer turno activo está en el futuro (septiembre).');
            console.log('\n  Buscando el turno más próximo activo...');
            const proximos = await prisma.turnoMedico.findMany({
                where: { TME_FCH: { gt: hoyDecimal } },
                orderBy: { TME_FCH: 'asc' },
                take: 5
            });
            if (proximos.length > 0) {
                console.log('  Próximos turnos en BD:');
                proximos.forEach(t => {
                    const str = String(t.TME_FCH);
                    const legible = `${str.slice(6,8)}/${str.slice(4,6)}/${str.slice(0,4)}`;
                    console.log(`    Médico=${t.TME_CODM} | Inicio=${legible} (${t.TME_FCH}) | Fin=${t.TME_FCH_FIN||'NULL'} | Esp=${t.TME_ESPECIALIDAD}`);
                });
                console.log('\n  👆 CAUSA CONFIRMADA: Los turnos en HABEJICO solo inician en esas fechas.');
                console.log('  Para dar citas en mayo, debes ajustar TME_FCH a una fecha <= 20260505');
                console.log('  o crear nuevos turnos con fechas de inicio en mayo.');
            }
        }
    } catch (e) {
        console.error('  ❌ Error leyendo turnos:', e.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('FIN DE VERIFICACIÓN');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
}

main().catch(e => {
    console.error('\n❌ Error fatal:', e.message);
    process.exit(1);
});
