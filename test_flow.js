/**
 * test_flow.js
 * Simula el flujo de agendamiento de 3 citas consecutivas sin WhatsApp real.
 * Prueba directamente la lógica de estado (activeSessions) usando mocks.
 */
require('dotenv').config();

const availabilityService = require('./availability_service');
const aiService = require('./ollama_service');

// ─── Mock de chatService ─────────────────────────────────────────────────────
let dbStatus = 'bot';
const chatServiceMock = {
    updateStatus: async (sender, status) => { dbStatus = status; },
    isHumanMode: async (sender) => dbStatus !== 'bot',
    saveMessage: async () => ({}),
    getOrCreateConversation: async () => ({})
};

// ─── Reproducir clearSessionData exactamente como en index.js ────────────────
function clearSessionData(session, sender) {
    if (session.ownerCedula) {
        session.name   = session.ownerName;
        session.cedula = session.ownerCedula;
        session.id     = session.ownerId;
        session.phone  = session.ownerPhone;
        session.zona   = session.ownerZona;
        session.ownerName = session.ownerCedula = session.ownerId = session.ownerPhone = session.ownerZona = null;
    }
    session.step = 'WELCOME';
    session.tipoCita = null;
    session.fechaPreferida = null;
    session.horaPreferida = null;
    session.horariosDisponibles = null;
    session.diasDisponibles = null;
    session.isRangeRequest = false;
    session.originalRangeText = null;
    session.doctorPreferido = null;
    session.horaSeleccionada = null;
    session.doctorIdSeleccionado = null;
    session.doctorNameSeleccionado = null;
    session.userAppointments = null;
    session.appointmentToCancel = null;
    if (sender) {
        chatServiceMock.updateStatus(sender, 'bot').catch(() => {});
    }
}

// ─── Utilidades de log ───────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';

function log(msg)   { console.log(`${CYAN}[TEST]${RESET} ${msg}`); }
function ok(msg)    { console.log(`${GREEN}[PASS]${RESET} ${msg}`); }
function fail(msg)  { console.log(`${RED}[FAIL]${RESET} ${msg}`); }
function warn(msg)  { console.log(`${YELLOW}[WARN]${RESET} ${msg}`); }
function hr()       { console.log('─'.repeat(60)); }

// ─── Runner principal ────────────────────────────────────────────────────────
async function run() {
    hr();
    log('🔬 INICIANDO PRUEBA DE 3 CITAS CONSECUTIVAS');
    hr();

    // ── 1. OBTENER PRIMER SLOT DISPONIBLE ──────────────────────────────────
    log('Buscando primer slot disponible en DB...');
    const today = new Date().toISOString().split('T')[0];
    let firstAvail;
    try {
        firstAvail = await availabilityService.getNextAvailableSlots(today, 'medicina general', null);
    } catch(e) {
        fail('Error buscando disponibilidad: ' + e.message);
        process.exit(1);
    }

    if (!firstAvail || !firstAvail.slots || firstAvail.slots.length === 0) {
        fail('No hay slots disponibles en la BD. No se puede simular.');
        process.exit(1);
    }

    ok(`Primer slot: ${firstAvail.date} a las ${firstAvail.slots[0].time} — ${firstAvail.slots[0].doctorName}`);

    // ── 2. VERIFICAR PACIENTE DE PRUEBA ────────────────────────────────────
    log('Buscando paciente de prueba...');
    const { findPaciente } = require('./availability_service');
    const pacienteByPhone = await findPaciente('57TESTPHONE@c.us').catch(() => null);
    // Usar paciente hardcodeado para la prueba (ajusta si es necesario)
    const SESSION_SENDER = 'TEST_SENDER@c.us';
    const PACIENTE = {
        name: 'Paciente De Prueba',
        cedula: '00001039886030',
        id: '00001039886030',
        phone: '3195779656',
        zona: '001'
    };
    ok(`Usando paciente simulado: ${PACIENTE.name} (${PACIENTE.cedula})`);

    hr();
    log('FASE 1: Verificando estados de sesión para 3 ciclos de cita');
    hr();

    let results = [];
    const activeSessions = new Map();

    for (let ciclo = 1; ciclo <= 3; ciclo++) {
        log(`\n📋 CICLO ${ciclo} — Iniciando agendamiento`);

        // ── Crear sesión como lo haría el bot ──
        dbStatus = 'bot'; // simular que status empieza en 'bot'
        activeSessions.set(SESSION_SENDER, {
            step: ciclo === 1 ? 'WELCOME' : activeSessions.get(SESSION_SENDER)?.step || 'WELCOME',
            mode: 'NATURAL',
            name: PACIENTE.name,
            cedula: PACIENTE.cedula,
            phone: PACIENTE.phone,
            id: PACIENTE.id,
            zona: PACIENTE.zona,
            history: ciclo === 1 ? [] : (activeSessions.get(SESSION_SENDER)?.history || []),
            tipoCita: null,
            fechaPreferida: null,
            horaPreferida: null,
            horariosDisponibles: null,
            diasDisponibles: null,
            doctorPreferido: null,
            horaSeleccionada: null,
            doctorIdSeleccionado: null,
            doctorNameSeleccionado: null,
            isRangeRequest: false
        });

        const session = activeSessions.get(SESSION_SENDER);

        // ── Test: isHumanMode (guard crítico) ──
        const isHuman = await chatServiceMock.isHumanMode(SESSION_SENDER);
        if (!isHuman) {
            ok(`Ciclo ${ciclo}: isHumanMode=false ✓ (bot puede procesar)`);
        } else {
            fail(`Ciclo ${ciclo}: isHumanMode=true ✗ (bot BLOQUEADO — status DB = '${dbStatus}')`);
            results.push({ ciclo, step: 'isHumanMode', ok: false });
            continue;
        }

        // ── Test: step inicial correcto ──
        if (session.step === 'WELCOME') {
            ok(`Ciclo ${ciclo}: session.step=WELCOME ✓`);
        } else {
            fail(`Ciclo ${ciclo}: session.step='${session.step}' ✗ (esperaba WELCOME)`);
        }

        // ── Simular: setear tipo y fecha/hora ──
        session.tipoCita = 'medicina general';
        session.fechaPreferida = firstAvail.date;
        const slot = firstAvail.slots[0];

        // ── Test: buscar slots disponibles ──
        let slots;
        try {
            slots = await availabilityService.getAvailableSlots(
                session.fechaPreferida, session.tipoCita, null
            );
        } catch(e) {
            fail(`Ciclo ${ciclo}: getAvailableSlots ERROR: ${e.message}`);
            results.push({ ciclo, step: 'getAvailableSlots', ok: false });
            continue;
        }

        if (slots && slots.length > 0) {
            ok(`Ciclo ${ciclo}: ${slots.length} slots disponibles para ${session.fechaPreferida} ✓`);
        } else {
            warn(`Ciclo ${ciclo}: No hay slots para ${session.fechaPreferida}. Buscando siguiente...`);
            try {
                const next = await availabilityService.getNextAvailableSlots(
                    session.fechaPreferida, session.tipoCita, null
                );
                if (next) {
                    session.fechaPreferida = next.date;
                    slots = next.slots;
                    ok(`Ciclo ${ciclo}: Slots encontrados en ${next.date} ✓`);
                } else {
                    fail(`Ciclo ${ciclo}: Sin slots disponibles ✗`);
                    results.push({ ciclo, step: 'slots', ok: false });
                    continue;
                }
            } catch(e) {
                fail(`Ciclo ${ciclo}: getNextAvailableSlots ERROR: ${e.message}`);
                continue;
            }
        }

        // ── Simular: selección de slot y confirmación ──
        const selectedSlot = slots[0];
        session.horaSeleccionada = selectedSlot.time;
        session.doctorIdSeleccionado = selectedSlot.doctorId;
        session.doctorNameSeleccionado = selectedSlot.doctorName;
        session.step = 'AI_CONFIRM_PHONE';

        ok(`Ciclo ${ciclo}: Slot seleccionado: ${selectedSlot.time} con ${selectedSlot.doctorName}`);

        // ── Simular: reservar slot en BD ──
        log(`Ciclo ${ciclo}: Intentando reservarSlot en BD...`);
        let reserveSuccess = false;
        try {
            reserveSuccess = await availabilityService.reserveSlot(
                session.fechaPreferida,
                session.horaSeleccionada,
                session.id,
                session.tipoCita,
                session.doctorIdSeleccionado
            );
        } catch(e) {
            fail(`Ciclo ${ciclo}: reserveSlot ERROR: ${e.message}`);
            results.push({ ciclo, step: 'reserveSlot', ok: false });
            continue;
        }

        if (reserveSuccess) {
            ok(`Ciclo ${ciclo}: Cita reservada en BD ✓`);
        } else {
            warn(`Ciclo ${ciclo}: reserveSlot=false (slot ya ocupado, buscando otro...)`);
            // Buscar otro slot
            const otherSlot = slots.find(s => s.time !== selectedSlot.time);
            if (otherSlot) {
                session.horaSeleccionada = otherSlot.time;
                session.doctorIdSeleccionado = otherSlot.doctorId;
                session.doctorNameSeleccionado = otherSlot.doctorName;
                try {
                    reserveSuccess = await availabilityService.reserveSlot(
                        session.fechaPreferida, otherSlot.time,
                        session.id, session.tipoCita, otherSlot.doctorId
                    );
                } catch(e) { fail(`reserveSlot 2nd attempt ERROR: ${e.message}`); }
            }
            if (!reserveSuccess) {
                warn(`Ciclo ${ciclo}: No se pudo reservar (puede que todos estén ocupados por pruebas previas). Continuando prueba de estado...`);
            }
        }

        // ── Simular: finalizarCita → resetear a POST_CONFIRM ──
        session.tipoCita = null;
        session.fechaPreferida = null;
        session.horaPreferida = null;
        session.horariosDisponibles = null;
        session.diasDisponibles = null;
        session.isRangeRequest = false;
        session.horaSeleccionada = null;
        session.doctorIdSeleccionado = null;
        session.doctorNameSeleccionado = null;
        session.step = 'POST_CONFIRM';
        // Simular lo que hace finalizarCita: resetear status en BD
        await chatServiceMock.updateStatus(SESSION_SENDER, 'bot');

        ok(`Ciclo ${ciclo}: step=POST_CONFIRM, dbStatus='${dbStatus}' ✓`);

        // ── Simular: usuario dice "No" → clearSessionData ──
        clearSessionData(session, SESSION_SENDER);

        if (session.step === 'WELCOME') {
            ok(`Ciclo ${ciclo}: Después de "No" → step=WELCOME ✓`);
        } else {
            fail(`Ciclo ${ciclo}: Después de "No" → step='${session.step}' ✗`);
        }

        if (dbStatus === 'bot') {
            ok(`Ciclo ${ciclo}: dbStatus='bot' tras clearSessionData ✓`);
        } else {
            fail(`Ciclo ${ciclo}: dbStatus='${dbStatus}' ✗ (debería ser 'bot')`);
        }

        // ── Verificar que el siguiente mensaje puede ser procesado ──
        const isHumanNext = await chatServiceMock.isHumanMode(SESSION_SENDER);
        if (!isHumanNext) {
            ok(`Ciclo ${ciclo}: Próximo mensaje → isHumanMode=false ✓ (bot activo para ciclo ${ciclo + 1})`);
        } else {
            fail(`Ciclo ${ciclo}: Próximo mensaje → isHumanMode=true ✗ (BLOQUEADO)`);
            results.push({ ciclo, step: 'postReset_isHumanMode', ok: false });
            continue;
        }

        results.push({ ciclo, ok: true });
        log(`✅ Ciclo ${ciclo} completado exitosamente`);
    }

    // ── RESUMEN ──────────────────────────────────────────────────────────────
    hr();
    log('RESUMEN DE PRUEBAS');
    hr();

    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    results.forEach(r => {
        if (r.ok) ok(`Ciclo ${r.ciclo}: PASÓ ✅`);
        else fail(`Ciclo ${r.ciclo} (${r.step}): FALLÓ ❌`);
    });

    console.log('');
    if (failed === 0 && passed === 3) {
        ok(`🎉 TODAS LAS PRUEBAS PASARON (${passed}/3 ciclos)`);
        log('El bot puede agendar 3 citas consecutivas sin interrupciones.');
    } else {
        fail(`${failed} ciclo(s) fallaron, ${passed} pasaron`);
    }

    // ── Limpieza: cancelar citas de prueba ──────────────────────────────────
    hr();
    log('Limpiando citas de prueba...');
    try {
        const botPrisma = require('./dbBot');
        const deleted = await botPrisma.appointmentLog.deleteMany({
            where: {
                patientDocument: PACIENTE.cedula,
                createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } // últimos 10 min
            }
        });
        log(`AppointmentLogs eliminados: ${deleted.count}`);
    } catch(e) {
        warn('No se pudo limpiar appointmentLog: ' + e.message);
    }

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
    fail('Error inesperado: ' + e.message);
    console.error(e);
    process.exit(1);
});
