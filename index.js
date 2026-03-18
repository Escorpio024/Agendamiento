require('dotenv').config();
const audioService = require('./audio_service');

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const prisma = require('./db');
const path = require('path'); // Added path module

// Servicios de IA y horarios
const aiService = require('./ollama_service');
const availabilityService = require('./availability_service');
const { findPaciente, dateToDecimal } = require('./availability_service');
const chatService = require('./chat_service');
const reminderService = require('./reminder_service');
const server = require('./server');
const mediaHandler = require('./media_handler');

// --- HELPERS DE FORMATO ---
function formatDateNatural(dateStr) {
    if (!dateStr) return 'fecha no definida';
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return `${dias[date.getDay()]} ${day} de ${meses[date.getMonth()]} de ${year}`;
    } catch (e) {
        return dateStr;
    }
}

function cleanPhone(phone) {
    if (!phone) return 'No registrado';
    let cleaned = phone.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '');
    if (cleaned.length > 10) cleaned = cleaned.slice(-10);
    return cleaned;
}

// --- CLIENTE WHATSAPP ---
const puppeteerConfig = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
};

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerConfig
});

// SESIÓN ACTIVA (RAM)
const activeSessions = new Map();

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', async () => {
    console.log('✅ Bot médico con IA listo.');
    server.start(client);
    reminderService.init(client);
    await loadHistoricalMessages();
});

client.on('message_create', async (msg) => {
    if (msg.fromMe) {
        const chat = await msg.getChat();
        let mediaUrl = null;
        if (msg.hasMedia) {
            mediaUrl = await mediaHandler.saveMedia(msg);
        }
        await chatService.saveMessage(chat.id._serialized, {
            id: msg.id._serialized,
            body: msg.body,
            fromMe: true,
            type: msg.type,
            mediaUrl: mediaUrl,
            timestamp: new Date(msg.timestamp * 1000)
        });
        server.emitMessage({
            conversationId: chat.id._serialized,
            fromMe: true,
            body: msg.body,
            mediaUrl: mediaUrl,
            timestamp: new Date(msg.timestamp * 1000)
        });
    }
});

const processedMessages = new Set();
// Lock por sender para evitar race conditions (doble confirmación de cita)
const processingLocks = new Map();

async function withSenderLock(sender, fn) {
    // Si ya hay un proceso activo para este sender, esperar
    while (processingLocks.get(sender)) {
        await new Promise(r => setTimeout(r, 150));
    }
    processingLocks.set(sender, true);
    try {
        return await fn();
    } finally {
        processingLocks.delete(sender);
    }
}

client.on('message', async (msg) => {
    // Prevent double-processing if WhatsApp Web fires the event twice
    if (processedMessages.has(msg.id._serialized)) return;
    processedMessages.add(msg.id._serialized);
    if (processedMessages.size > 2000) processedMessages.clear();

    const chat = await msg.getChat();
    const sender = msg.from;

    // Serializar mensajes del mismo sender para evitar race conditions
    await withSenderLock(sender, async () => {

        // Identificamos si es nota de voz (ptt = push to talk) o audio normal
        const isAudio = msg.type === 'ptt' || msg.type === 'audio';

        let text = msg.body ? msg.body.trim() : "";
        let mediaUrl = null;

        if (msg.hasMedia) {
            try {
                mediaUrl = await mediaHandler.saveMedia(msg);

                // Si es un audio y se guardó correctamente, lo transcribimos
                if (isAudio && mediaUrl) {
                    // Simulamos que el bot está "escuchando"
                    chat.sendStateRecording();

                    // mediaUrl is a web-relative path like /media/file.mp3
                    // Resolve to actual filesystem path: ./public/media/file.mp3
                    const audioFilePath = path.join(__dirname, 'public', mediaUrl);
                    const transcription = await audioService.transcribeAudio(audioFilePath);

                    if (transcription) {
                        text = transcription;
                        console.log(`[Audio] Transcripción exitosa: "${text}"`);
                    } else {
                        // Fallback si la IA de audio falla
                        const sess = activeSessions.get(sender);
                        if (sess) {
                            chat.sendStateTyping();
                            await client.sendMessage(sender, "Lo siento, no pude escuchar bien tu nota de voz 😔. ¿Podrías escribírmelo, por favor?");
                        }
                        return;
                    }
                }
            } catch (error) {
                console.error('[Media] Error guardando o transcribiendo:', error);
                if (isAudio && error.message && error.message.includes('ffmpeg')) {
                    chat.sendStateTyping();
                    await client.sendMessage(sender, "Lo siento, mi sistema de audio está en mantenimiento 🛠️ (me falta instalar ffmpeg). Por favor, escríbeme lo que decías 📝.");
                    return;
                }
            }
        }

        // Si después de todo el proceso el texto sigue vacío, ignoramos el mensaje
        if (!text) return;

        const cleanText = text.toLowerCase();

        const savedMsg = await chatService.saveMessage(sender, {
            id: msg.id._serialized,
            body: text, // Guardamos la transcripción en la base de datos como si fuera texto
            fromMe: false,
            type: msg.type,
            mediaUrl: mediaUrl,
            timestamp: new Date(msg.timestamp * 1000)
        });

        server.emitMessage(savedMsg);

        const isHuman = await chatService.isHumanMode(sender);
        if (isHuman) return;

        if (cleanText.includes('humano') || cleanText.includes('agente') || cleanText.includes('asesor') || cleanText.includes('persona')) {
            await chatService.updateStatus(sender, 'pending');
            server.emitConversationUpdate({ id: sender, status: 'pending' });
            await client.sendMessage(sender, "Entendido, te voy a transferir con un agente humano. Espere un momento...");
            return;
        }

        // ── reply: defined early so it can be used everywhere in this callback ──
        const reply = async (txt) => {
            const sess = activeSessions.get(sender);
            if (sess) {
                sess.history = sess.history || [];
                sess.history.push(`Aurora: ${txt}`);
                if (sess.history.length > 20) sess.history.shift();
            }
            chat.sendStateTyping();
            const delay = Math.min(Math.max(txt.length * 22, 900), 3000);
            await new Promise(r => setTimeout(r, delay));
            await client.sendMessage(sender, txt);
        };

        // --- INICIALIZACIÓN DE SESIÓN ---
        if (!activeSessions.has(sender)) {
            // Buscar paciente en HABEJICO (por teléfono/documento)
            const paciente = await findPaciente(sender);

            if (paciente) {
                const nombre = paciente.KC0_PNOMBRE?.trim() ||
                    paciente.KC0_NOM?.split(' ')[0]?.trim() ||
                    paciente.KC0_NOM?.trim() || 'Paciente';
                // Usar el teléfono real de la BD, no el sender/LID de Meta
                const realPhone = paciente.KC0_RES_TEL || sender.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
                activeSessions.set(sender, {
                    step: 'WELCOME',
                    mode: 'NATURAL',
                    name: nombre,
                    cedula: paciente.KC0_COD,
                    phone: realPhone,
                    id: paciente.KC0_COD,
                    history: [],
                    doctorPreferido: null,
                    doctorIdSeleccionado: null
                });
                const welcomeMsg = await aiService.generateNaturalResponse(
                    `El paciente ${nombre} regresa. Salúdalo cálidamente y pregunta en qué puedes ayudar.`,
                    { nombre }, text
                );
                await reply(welcomeMsg);
            } else {
                // Paciente no encontrado por teléfono → pedir cédula primero
                activeSessions.set(sender, { step: 'REGISTER_CEDULA', mode: 'STRUCTURED', history: [] });
                await reply("👋 ¡Hola! Soy *Aurora* 🤖, tu asistente de citas médicas.\n\nPara atenderte, por favor escribe tu número de *Cédula*:");
            }
            return;
        }

        const session = activeSessions.get(sender);

        // Alimentar memoria de corto plazo
        session.history = session.history || [];
        session.history.push(`Paciente: ${text}`);
        if (session.history.length > 20) session.history.shift();

        // --- FLUJO DE REGISTRO ---
        // PASO 1: Pedir cédula y verificar si ya existe
        if (session.step === 'REGISTER_CEDULA') {
            const cedula = text.replace(/\D/g, '');
            if (cedula.length < 5) {
                await reply("⚠️ Por favor escribe un número de cédula válido (mínimo 5 dígitos).");
                return;
            }
            session.cedula = cedula;
            const codPadded = cedula.padStart(14, ' ').trim().slice(0, 14);

            // Buscar en TKCLIENTES (33K pacientes reales)
            let pacienteExiste = await prisma.cliente.findFirst({
                where: {
                    OR: [{ KC_COD: cedula }, { KC_COD: codPadded }]
                }
            });

            // Buscar en TMUSUARIOSASEGURAMIENTO (registros del bot)
            if (!pacienteExiste) {
                const aseg = await prisma.paciente.findFirst({ where: { KC0_COD: { contains: cedula } } });
                if (aseg) pacienteExiste = { KC_NOM: aseg.KC0_NOM, KC_COD: aseg.KC0_COD, KC_ZONA: '001', KC_SEQK: '', KC_TEL1: aseg.KC0_RES_TEL };
            }

            if (pacienteExiste) {
                // Ya existe → saludar directamente
                // Tomar la primera palabra y ponerla en formato Título (ej: Oscar)
                let rawName = pacienteExiste.KC_NOM?.split(' ')[0]?.trim() || 'Paciente';
                const nombre = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

                // Usar el número en DB en vez del ID de Meta (sender) que a veces es erróneo ej 2360...
                const realPhone = pacienteExiste.KC_TEL1 || pacienteExiste.KC0_RES_TEL || sender.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');

                activeSessions.set(sender, {
                    step: 'WELCOME', mode: 'NATURAL',
                    name: nombre, cedula,
                    phone: realPhone,
                    id: pacienteExiste.KC_COD,
                    zona: pacienteExiste.KC_ZONA || '001',
                    history: [], doctorPreferido: null, doctorIdSeleccionado: null
                });
                const welcomeMsg = await aiService.generateNaturalResponse(
                    `El paciente ${nombre} regresa. Salúdalo cálidamente y pregunta en qué puedes ayudar.`,
                    { nombre }, text
                );
                await reply(welcomeMsg);
            } else {
                // No existe → pedir nombre
                session.step = 'REGISTER_NAME';
                await reply(`No encontré tu cédula en el sistema. Voy a registrarte.\n\nEscribe tu *Nombre Completo*:`);
            }
            return;
        }

        // PASO 2: Nombre (solo si es nuevo)
        if (session.step === 'REGISTER_NAME') {
            session.name = text.trim();
            session.step = 'REGISTER_PHONE';
            await reply(`Gracias, ${session.name}. \n\nEscribe tu número de *Celular* (10 dígitos):`);
            return;
        }

        // PASO 3: Teléfono y registrar
        if (session.step === 'REGISTER_PHONE') {
            const cleanPhone = text.replace(/\D/g, '');
            if (cleanPhone.length < 7) {
                await reply("⚠️ Por favor escribe un celular válido.");
                return;
            }
            session.phoneInput = cleanPhone;
            const codPadded = session.cedula.padStart(14, ' ').trim().slice(0, 14);
            try {
                // Guardamos al paciente directamente en TKCLIENTES, que es donde van los pacientes reales
                // y no en TMUSUARIOSASEGURAMIENTO
                await prisma.cliente.create({
                    data: {
                        KC_ZONA: '001',
                        KC_COD: codPadded,
                        KC_SEQK: '  ', // 2 espacios, formato típico de HABEJICO cuando es uno solo
                        KC_NOM: session.name.toUpperCase().slice(0, 60),
                        KC_TEL1: cleanPhone.slice(-15),
                        KC_ESTADO: 'AC',
                        KC_ACTIVO: 'S'
                    }
                });
                activeSessions.set(sender, {
                    step: 'WELCOME', mode: 'NATURAL',
                    name: session.name.split(' ')[0], cedula: session.cedula,
                    phone: cleanPhone, id: codPadded,
                    zona: '001', history: [], doctorPreferido: null, doctorIdSeleccionado: null
                });
                await reply(`✅ Registro completado, ${session.name.split(' ')[0]}.\n\nAhora puedes pedirme una cita.\nPor ejemplo: “Necesito una cita de medicina general para mañana”`);
            } catch (e) {
                console.error('Error registrando paciente:', e.message);
                await reply("⚠️ Error al registrar tus datos en el sistema. Inténtalo de nuevo más tarde.");
            }
            return;
        }

        if (session.step === 'REGISTER_ID') {
            session.cedula = text.replace(/\D/g, '');
            try {
                const phoneToRegister = (session.phoneInput || sender.replace('@c.us', '').replace('@lid', '')).replace(/\D/g, '');
                const fechaNaceDecimal = dateToDecimal(new Date(1990, 0, 1));
                const codPadded = session.cedula.padStart(14, ' ').trim().slice(0, 14);

                // Verificar si ya existe con esa cédula
                const yaExiste = await prisma.paciente.findFirst({ where: { KC0_COD: codPadded } });

                if (yaExiste) {
                    // Actualizar teléfono y continuar
                    await prisma.paciente.updateMany({
                        where: { KC0_COD: codPadded },
                        data: { KC0_RES_TEL: phoneToRegister.slice(-15) }
                    });
                    session.step = 'WELCOME';
                    session.mode = 'NATURAL';
                    session.phone = phoneToRegister;
                    await reply(`✅ ¡Te reconocí, ${session.name}! Ya estás registrado.\n\nAhora puedes pedirme una cita de forma natural.\nPor ejemplo: "Necesito una cita para mañana"`);
                } else {
                    await prisma.paciente.create({
                        data: {
                            KC0_COD: codPadded,
                            KC0_TIPO_DOCTO: 'CC',
                            KC0_TIPO_USUARIO: 'B',
                            KC0_NOM: session.name.toUpperCase().slice(0, 60),
                            KC0_PNOMBRE: session.name.split(' ')[0]?.slice(0, 30) || '',
                            KC0_SNOMBRE: session.name.split(' ')[1]?.slice(0, 30) || null,
                            KC0_PAPELLIDO: session.name.split(' ')[2]?.slice(0, 30) || null,
                            KC0_RES_TEL: phoneToRegister.slice(-15),
                            KC0_ESTADO: 'AC',
                            KC0_FCH_NACE: fechaNaceDecimal
                        }
                    });
                    session.step = 'WELCOME';
                    session.mode = 'NATURAL';
                    session.phone = phoneToRegister;
                    await reply(`✅ Registro completado, ${session.name}.\n\nAhora puedes hablarme de forma natural.\nPor ejemplo: "Necesito una cita para mañana"`);
                }
            } catch (error) {
                console.error('Error registrando paciente:', error);
                await reply("⚠️ Hubo un error registrando tus datos. Intenta de nuevo.");
            }
            return;
        }

        // --- PROCESAMIENTO CON IA ---
        // TODOS los mensajes de pacientes registrados van a IA.
        // No hay "modo silencioso" — si alguien escribe, Aurora responde.
        session.mode = 'NATURAL';
        await processWithAI(sender, text, session, reply);

        // --- FUNCIONES AUXILIARES ---
        async function processWithAI(userId, message, session, replyFn) {
            try {
                const contextSteps = [
                    'AI_ASKING_TYPE', 'AI_ASKING_DATE', 'AI_SELECT_DAY', 'AI_SELECT_TIME',
                    'AI_CONFIRM_PHONE', 'AI_ENTER_PHONE', 'AI_CANCEL_CONFIRM', 'AI_MODIFY_SELECT'
                ];

                // Unir el historial para darle contexto a la IA
                const historyStr = session.history.join('\n');

                if (contextSteps.includes(session.step)) {
                    // ── GUARD 1: check if user wants to exit ──
                    const exitWords = ['chao', 'adios', 'adiós', 'salir', 'dejemos', 'olvida', 'no importa', 'mejor no'];
                    if (exitWords.some(w => message.toLowerCase().includes(w))) {
                        const byeMsg = await aiService.generateNaturalResponse('El usuario quiere cancelar el proceso actual. Despídete amablemente y pregunta si necesita algo más.', {}, message, historyStr);
                        resetAppointmentSession(session);
                        await replyFn(byeMsg);
                        return;
                    }

                    // ── GUARD 2: lightweight topic-switch detection ──
                    // Only for steps where user might change their mind (not phone/waitlist/cancel)
                    const stepsWithTopicSwitch = ['AI_ASKING_TYPE', 'AI_ASKING_DATE', 'AI_SELECT_DAY', 'AI_SELECT_TIME'];
                    // Skip topic-switch for time-preference words (tarde, mañana, noche) — these are slot filters, not new intents
                    const isTimePref = /\b(tarde|noche|ma[nñ]ana|manana|morning|afternoon)\b/i.test(message);
                    if (stepsWithTopicSwitch.includes(session.step) && !isTimePref && !message.match(/^\d+$|^[a-cA-C]$|^s[ií]$|^no$/i)) {
                        const newIntent = await aiService.extractIntent(message);
                        if (newIntent && newIntent !== 'OTRO' && newIntent !== 'SALUDO' && newIntent !== 'AGENDAR_CITA') {
                            // User changed topic — reset and route to new intent
                            resetAppointmentSession(session);
                            const entities = await aiService.extractEntities(message, historyStr);
                            await routeIntent(userId, message, newIntent, entities, session, replyFn, historyStr);
                            return;
                        }
                    }

                    // ── Normalize helper (strip accents for matching) ──
                    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const clean = normalize(message);

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_ASKING_TYPE — user is answering "what type of appointment?"
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_ASKING_TYPE') {
                        let tipo = availabilityService.normalizeTipoCita(message);
                        if (!tipo) {
                            const entities = await aiService.extractEntities(message, historyStr);
                            if (entities.tipo_cita) tipo = availabilityService.normalizeTipoCita(entities.tipo_cita);
                            if (entities.fecha) session.fechaPreferida = entities.fecha;
                            if (entities.hora) session.horaPreferida = entities.hora;
                        }
                        if (tipo) {
                            session.tipoCita = tipo;
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } else {
                            const resp = await aiService.generateNaturalResponse('No entendiste qué tipo de cita necesita. Pregúntale de nuevo amablemente. Opciones: medicina general, odontología, pediatría, especialista.', {}, message, historyStr);
                            await replyFn(resp);
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_ASKING_DATE — user is answering "when do you want it?"
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_ASKING_DATE') {
                        const entities = await aiService.extractEntities(message, historyStr);
                        if (entities.fecha) session.fechaPreferida = entities.fecha;
                        if (entities.hora) session.horaPreferida = entities.hora;
                        if (entities.tipo_cita && !session.tipoCita) {
                            session.tipoCita = availabilityService.normalizeTipoCita(entities.tipo_cita);
                        }
                        if (availabilityService.isRangeDate(message)) {
                            session.isRangeRequest = true;
                            session.originalRangeText = message;
                        }
                        if (session.fechaPreferida) {
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } else {
                            const resp = await aiService.generateNaturalResponse('No entendiste la fecha. Pregúntale para qué día quiere la cita. Ejemplos: mañana, el viernes, esta semana.', {}, message, historyStr);
                            await replyFn(resp);
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_SELECT_DAY — user is picking from a list of days
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_SELECT_DAY') {
                        let selectedDay = null;

                        // 1. Numeric selection
                        const numMatch = clean.match(/\b(\d)\b/);
                        if (numMatch) {
                            const idx = parseInt(numMatch[1]) - 1;
                            if (idx >= 0 && idx < session.diasDisponibles.length) {
                                selectedDay = session.diasDisponibles[idx].date;
                            }
                        }
                        // 2. Day name match (accent-agnostic)
                        if (!selectedDay) {
                            const found = session.diasDisponibles.find(d => clean.includes(normalize(d.dayName)));
                            if (found) selectedDay = found.date;
                        }
                        // 3. AI fallback
                        if (!selectedDay) {
                            const entities = await aiService.extractEntities(message, historyStr);
                            if (entities.fecha) {
                                const match = session.diasDisponibles.find(d => d.date === entities.fecha);
                                if (match) selectedDay = entities.fecha;
                            }
                            if (entities.hora) session.horaPreferida = entities.hora;
                        } else {
                            // Extract hora from same message ("el miércoles a las 10")
                            const horaMatch = message.match(/(?:a\s+las\s+|las\s+)(\d{1,2})(?:\s*(am|pm))?/i);
                            if (horaMatch) {
                                const h = parseInt(horaMatch[1]);
                                const ampm = horaMatch[2]?.toUpperCase() || (h < 12 ? 'AM' : 'PM');
                                session.horaPreferida = `${h}:00 ${ampm}`;
                            } else if (clean.includes('tarde')) {
                                session.horaPreferida = 'PM';
                            } else if (clean.includes('mañana') && !clean.includes('pasado') && selectedDay) {
                                session.horaPreferida = 'AM';
                            }
                        }

                        if (selectedDay) {
                            session.fechaPreferida = selectedDay;
                            session.isRangeRequest = false;
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } else {
                            const dayList = session.diasDisponibles.map((d, i) =>
                                `${i + 1}) ${d.dayName} ${new Date(d.date + 'T12:00:00').getDate()}`
                            ).join('\n');
                            const resp = await aiService.generateNaturalResponse(
                                'El paciente no eligió un día. IMPORTANTE: NO respondas a otras preguntas ni des información adicional. Solo pídele que elija de la lista con el número.',
                                { dias: dayList }, message, historyStr
                            );
                            await replyFn(resp + '\n\n' + dayList);
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_SELECT_TIME — user is picking a time slot
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_SELECT_TIME') {
                        const selectedSlot = await selectTimeSlot(message, session.horariosDisponibles);
                        if (selectedSlot) {
                            session.horaSeleccionada = selectedSlot.time;
                            session.doctorIdSeleccionado = selectedSlot.doctorId;
                            session.doctorNameSeleccionado = selectedSlot.doctorName;
                            session.step = 'AI_CONFIRM_PHONE';

                            const fechaBonita = formatDateNatural(session.fechaPreferida);
                            const phoneClean = cleanPhone(session.phone);
                            const confirmMsg = await aiService.generateNaturalResponse(
                                `El usuario eligió una cita. Dile EXACTAMENTE esto (usa esta fecha y hora literal, no mires el historial para la fecha): Cita con ${selectedSlot.doctorName} el ${fechaBonita} a las ${selectedSlot.time}. Luego pregúntale si confirma y si usará el teléfono ${phoneClean} o si prefiere otro.`,
                                { doctor: selectedSlot.doctorName, fecha: fechaBonita, hora: selectedSlot.time, telefono: phoneClean }, message, historyStr
                            );
                            await replyFn(confirmMsg);
                        } else if (clean.includes('tarde') || clean.includes('noche')) {
                            session.horaPreferida = 'PM';
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } else if (clean.includes('mana') && !clean.includes('pasado')) {
                            session.horaPreferida = 'AM';
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } else {
                            const slotsText = session.horariosDisponibles.slice(0, 8).map((s, i) => `${i + 1}. ${s.time} — ${s.doctorName}`).join('\n');
                            const resp = await aiService.generateNaturalResponse(
                                'El paciente no eligió un horario. IMPORTANTE: NO respondas a otras preguntas ni des información adicional. Solo dile amablemente que para continuar debe elegir un NÚMERO de la lista.',
                                {}, message, historyStr
                            );
                            await replyFn(resp + '\n\n' + slotsText);
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_CONFIRM_PHONE — user is confirming phone number
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_CONFIRM_PHONE') {
                        const phoneClean = cleanPhone(session.phone);
                        if (clean.match(/^s[ií]?$/) || clean.includes('actual') || clean.includes('ese') || clean.includes('confirmo') || message.includes(phoneClean)) {
                            await finalizarCita(userId, phoneClean);
                        } else {
                            const digits = message.replace(/\D/g, '');
                            if (/^\d{10}$/.test(digits)) {
                                await finalizarCita(userId, digits);
                            } else if (clean.includes('otro') || clean === 'no' || clean === 'b') {
                                session.step = 'AI_ENTER_PHONE';
                                const resp = await aiService.generateNaturalResponse('El usuario quiere dar otro número. Pídele el número de celular (10 dígitos).', {}, message, historyStr);
                                await replyFn(resp);
                            } else {
                                const resp = await aiService.generateNaturalResponse(`No entendiste la respuesta. Pregúntale si confirma el número ${phoneClean} o si prefiere otro.`, {}, message, historyStr);
                                await replyFn(resp);
                            }
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_ENTER_PHONE — user is typing a new phone number
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_ENTER_PHONE') {
                        const digits = message.replace(/\D/g, '');
                        if (/^\d{10}$/.test(digits)) {
                            await finalizarCita(userId, digits);
                        } else {
                            const resp = await aiService.generateNaturalResponse('El número no es válido, debe tener 10 dígitos. Pídelo de nuevo amablemente.', {}, message, historyStr);
                            await replyFn(resp);
                        }
                        return;
                    }



                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_CANCEL_CONFIRM
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_CANCEL_CONFIRM') {
                        // Check if user is selecting from a list (numeric)
                        if (session.userAppointments && session.userAppointments.length > 1) {
                            const selectedIndex = parseInt(message.trim()) - 1;
                            if (!isNaN(selectedIndex) && session.userAppointments[selectedIndex]) {
                                session.appointmentToCancel = session.userAppointments[selectedIndex];
                                const success = await availabilityService.cancelAppointment(session.appointmentToCancel.id);
                                if (success) {
                                    const resp = await aiService.generateNaturalResponse(`La cita de ${session.appointmentToCancel.tipo} fue cancelada exitosamente. Confírmale al usuario.`, {}, message, historyStr);
                                    await replyFn(resp);
                                } else {
                                    await replyFn('Hubo un error al cancelar. Por favor intenta de nuevo.');
                                }
                                resetAppointmentSession(session);
                            } else if (clean.match(/no|cancelar|salir/)) {
                                const resp = await aiService.generateNaturalResponse('El usuario decidió no cancelar ninguna cita. Confirma que todo sigue igual.', {}, message, historyStr);
                                await replyFn(resp);
                                resetAppointmentSession(session);
                            } else {
                                await replyFn('No entendí. Escribe el número de la cita que quieres cancelar o escribe "no" para salir.');
                            }
                            return;
                        }

                        // Otherwise, it's a Yes/No confirmation for a single appointment
                        if (clean.match(/s[ií]|confirm|^1$/)) {
                            if (session.appointmentToCancel) {
                                const success = await availabilityService.cancelAppointment(session.appointmentToCancel.id);
                                if (success) {
                                    const resp = await aiService.generateNaturalResponse(`La cita de ${session.appointmentToCancel.tipo} fue cancelada exitosamente. Confírmale al usuario.`, {}, message, historyStr);
                                    await replyFn(resp);
                                } else {
                                    await replyFn('Hubo un error al cancelar. Por favor intenta de nuevo.');
                                }
                                resetAppointmentSession(session);
                            }
                        } else {
                            const resp = await aiService.generateNaturalResponse('El usuario decidió mantener su cita. Confirma que la cita sigue en pie.', {}, message, historyStr);
                            await replyFn(resp);
                            resetAppointmentSession(session);
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_MODIFY_SELECT
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_MODIFY_SELECT') {
                        const selectedIndex = parseInt(message.trim()) - 1;
                        if (!isNaN(selectedIndex) && session.userAppointments && session.userAppointments[selectedIndex]) {
                            const appt = session.userAppointments[selectedIndex];
                            const success = await availabilityService.cancelAppointment(appt.id);
                            if (success) {
                                // Usar el nombre de la especialidad original en texto para que el modelo lo entienda
                                session.tipoCita = appt.tipo || 'Medicina General';
                                session.fechaPreferida = null;
                                session.userAppointments = null;
                                session.appointmentToCancel = null;
                                session.step = 'AI_ASKING_DATE';
                                const resp = await aiService.generateNaturalResponse(`La cita anterior fue cancelada. Ahora pregúntale para qué día quiere la nueva cita.`, {}, message, historyStr);
                                await replyFn(resp);
                            } else {
                                await replyFn('Hubo un error. Intenta de nuevo.');
                                resetAppointmentSession(session);
                            }
                        } else if (clean.match(/no|cancelar|salir/)) {
                            const resp = await aiService.generateNaturalResponse('El usuario decidió no modificar ninguna cita. Confirma que todo sigue igual.', {}, message, historyStr);
                            await replyFn(resp);
                            resetAppointmentSession(session);
                        } else {
                            await replyFn('No entendí. Escribe el número de la cita que quieres cambiar o "no" para salir.');
                        }
                        return;
                    }

                    // Fallback for any unhandled step
                    await handleAgendarCita(userId, message, session, replyFn, null, historyStr);
                    return;
                }

                // ── FREE-FORM MESSAGE (no active context) ────────────────────
                const extracted = await aiService.extractAll(message, historyStr);
                const intent = extracted.intent;
                const entities = extracted.entities || {};

                if (entities.tipo_cita) session.tipoCita = availabilityService.normalizeTipoCita(entities.tipo_cita);
                if (entities.fecha) session.fechaPreferida = entities.fecha;
                if (entities.hora) session.horaPreferida = entities.hora;
                if (entities.doctor) session.doctorPreferido = entities.doctor;

                if (availabilityService.isRangeDate(message)) {
                    session.isRangeRequest = true;
                    session.originalRangeText = message;
                }

                await routeIntent(userId, message, intent, entities, session, replyFn, historyStr);

            } catch (error) {
                console.error('[IA] Error procesando:', error);
                await replyFn('Lo siento, tuve un pequeño problema técnico. ¿Me repites qué necesitas? 😊');
            }
        }

        function resetAppointmentSession(session) {
            session.step = 'WELCOME';
            session.tipoCita = null;
            session.fechaPreferida = null;
            session.horaPreferida = null;
            session.horariosDisponibles = null;
            session.diasDisponibles = null;
            session.isRangeRequest = false;
            session.originalRangeText = null;
            session.doctorPreferido = null;
            session.userAppointments = null;
            session.appointmentToCancel = null;
        }

        async function routeIntent(userId, message, intent, entities, session, replyFn, historyStr) {
            switch (intent) {
                case 'AGENDAR_CITA':
                    await handleAgendarCita(userId, message, session, replyFn, entities, historyStr);
                    break;
                case 'CANCELAR_CITA':
                    await handleCancelarCita(userId, message, session, replyFn);
                    break;
                case 'MODIFICAR_CITA':
                    await handleModificarCita(userId, message, session, replyFn);
                    break;
                case 'CONSULTAR_HORARIOS':
                    await handleConsultarHorarios(userId, message, session, replyFn, entities);
                    break;
                case 'CONSULTAR_CITA': {
                    const citas = await availabilityService.getUserAppointments(session.phone);
                    const futuras = citas.filter(c => {
                        const datePart = new Date(c.fecha);
                        datePart.setHours(23, 59, 59);
                        return datePart >= new Date();
                    });

                    if (futuras.length > 0) {
                        const citasTexto = futuras.map(c => `${formatDateNatural(c.fecha)} a las ${c.hora} (${c.tipo})`).join('\n');
                        const resp = await aiService.generateNaturalResponse(
                            `El usuario pregunta por sus citas. Informale: \n${citasTexto}`, { citas: citasTexto }, message, historyStr);
                        await replyFn(resp);
                    } else {
                        const resp = await aiService.generateNaturalResponse('El usuario pregunta por sus citas pero no tiene ninguna agendada.', {}, message, historyStr);
                        await replyFn(resp);
                    }
                    break;
                }
                case 'URGENCIA': {
                    const analysis = await aiService.analyzeSymptoms(message);
                    const urgResp = await aiService.generateNaturalResponse(
                        `El paciente reporta síntomas de severidad ${analysis.severidad}. Especialidad: ${analysis.especialidad}. ${analysis.recomendacion_texto}`, { severidad: analysis.severidad, especialidad: analysis.especialidad }, message, historyStr);
                    await replyFn(urgResp);
                    if (analysis.severidad === 'URGENTE') {
                        await replyFn('🚨 Si es una emergencia por favor llama al *123* o ve a urgencias inmediatamente.');
                    }
                    break;
                }
                case 'SALUDO': {
                    const saludoMsg = await aiService.generateNaturalResponse(
                        `El paciente ${session.name} saludó. Responde cálidamente.`, { nombre: session.name }, message, historyStr);
                    await replyFn(saludoMsg);
                    break;
                }
                case 'INFO_GENERAL': {
                    const infoMsg = await aiService.generateNaturalResponse('El usuario pide información general sobre la clínica. Explica brevemente.', {}, message, historyStr);
                    await replyFn(infoMsg);
                    break;
                }
                default: {
                    const defaultMsg = await aiService.generateNaturalResponse('No se entendió bien lo que el usuario quiere. Pregunta amablemente.', {}, message, historyStr);
                    await replyFn(defaultMsg);
                }
            } // termins switch
        } // termina routeIntent

        async function handleCancelarCita(userId, message, session, replyFn) {
            const citas = await availabilityService.getUserAppointments(session.phone);
            const now = new Date();
            const futuras = citas.filter(c => {
                const datePart = new Date(c.fecha);
                datePart.setHours(23, 59, 59);
                return datePart >= now;
            });

            if (futuras.length === 0) {
                await replyFn("No tienes citas futuras registradas para cancelar.");
                return;
            }

            if (futuras.length === 1) {
                const cita = futuras[0];
                session.appointmentToCancel = cita;
                session.userAppointments = futuras;
                session.step = 'AI_CANCEL_CONFIRM';
                await replyFn(`¿Confirmas que quieres CANCELAR tu cita de *${cita.tipo}* el *${cita.fecha}* a las *${cita.hora}*?\n\nResponde SI o NO.`);
            } else {
                session.userAppointments = futuras;
                session.step = 'AI_CANCEL_CONFIRM';
                let msg = "Tienes varias citas programadas:\n\n";
                futuras.forEach((c, i) => { msg += `${i + 1}) ${c.fecha} - ${c.hora} (${c.tipo})\n`; });
                msg += "\nEnvía el NÚMERO de la cita que quieres cancelar:";
                await replyFn(msg);
            }
        }

        async function handleModificarCita(userId, message, session, replyFn) {
            const citas = await availabilityService.getUserAppointments(session.phone);
            const now = new Date();
            const futuras = citas.filter(c => {
                const datePart = new Date(c.fecha);
                datePart.setHours(23, 59, 59);
                return datePart >= now;
            });

            if (futuras.length === 0) {
                await replyFn("No encuentro citas futuras para modificar. ¿Seguro que tienes una asignada?");
                return;
            }

            session.userAppointments = futuras;
            session.step = 'AI_MODIFY_SELECT';

            let msg = "Tus citas futuras:\n";
            futuras.forEach((c, i) => { msg += `${i + 1}) ${c.fecha} - ${c.hora} (${c.tipo})\n`; });
            msg += "\nEnvía el NÚMERO de la cita que quieres cambiar:";
            await replyFn(msg);
        }

        async function handleAgendarCita(userId, message, session, replyFn, preExtracted = null, historyStr = "") {
            // Only extract entities if NOT called from a context step handler
            // Context steps pass {} to skip extraction (values already set on session)
            let entities = preExtracted || {};
            const isFromContextStep = preExtracted !== null;

            if (!isFromContextStep) {
                const extracted = await aiService.extractAll(message, historyStr);
                entities = extracted.entities || {};
            }

            // Apply entities to session — only if not already locked
            if (entities.fecha && !session.fechaPreferida) session.fechaPreferida = entities.fecha;
            if (entities.hora && !session.horaPreferida) session.horaPreferida = entities.hora;
            if (entities.tipo_cita && !session.tipoCita) session.tipoCita = availabilityService.normalizeTipoCita(entities.tipo_cita);
            if (entities.doctor && !session.doctorPreferido) session.doctorPreferido = entities.doctor;

            if (session.fechaPreferida && session.tipoCita) {
                const isRange = session.isRangeRequest && session.step !== 'AI_SELECT_DAY';

                if (isRange) {
                    const weekStart = availabilityService.getWeekStartDate(session.originalRangeText || '');
                    const weekDays = await availabilityService.getWeekAvailability(weekStart, session.tipoCita, session.doctorPreferido);

                    if (weekDays.length > 0) {
                        session.diasDisponibles = weekDays;
                        session.step = 'AI_SELECT_DAY';

                        let dayList = weekDays.map((d, i) => {
                            const dateObj = new Date(d.date + 'T12:00:00');
                            const dayNum = dateObj.getDate();
                            return `${i + 1}) 📅 *${d.dayName} ${dayNum}* — ${d.slotCount} horarios (${d.firstSlot} a ${d.lastSlot})`;
                        }).join('\n');

                        await replyFn(`Estos son los días disponibles para *${session.tipoCita}*:\n\n${dayList}\n\n¿Qué día prefieres?`);
                    } else {
                        await replyFn(`Lo siento, no encontré disponibilidad para ${session.tipoCita} en esa semana. 😔\n¿Quieres buscar en otra fecha?`);
                        session.step = 'AI_ASKING_DATE';
                    }
                    return;
                }

                const slots = await availabilityService.getAvailableSlots(session.fechaPreferida, session.tipoCita, session.doctorPreferido);

                if (slots.length > 0) {
                    session.horariosDisponibles = slots;
                    session.step = 'AI_SELECT_TIME';

                    let visibleSlots = slots;
                    let timeContext = '';

                    if (session.horaPreferida) {
                        const pref = session.horaPreferida.toUpperCase();
                        const isPM = pref === 'PM' ||
                            pref.includes('PM') ||
                            pref.includes('TARDE') ||
                            pref.includes('NOCHE') ||
                            (pref.includes(':') && parseInt(pref.split(':')[0]) >= 12);
                        const isAM = pref === 'AM' ||
                            (pref.includes('AM') && !pref.includes('PM')) ||
                            pref.includes('MAÑANA') ||
                            pref.includes('MAÑA');

                        if (isPM) {
                            const pmSlots = slots.filter(s => s.time.toUpperCase().includes('PM'));
                            if (pmSlots.length > 0) { visibleSlots = pmSlots; timeContext = ' (en la tarde)'; }
                        } else if (isAM) {
                            const amSlots = slots.filter(s => s.time.toUpperCase().includes('AM'));
                            if (amSlots.length > 0) { visibleSlots = amSlots; timeContext = ' (en la mañana)'; }
                        }
                    }

                    const slotsToShow = visibleSlots.slice(0, 8);
                    const fechaBonita = formatDateNatural(session.fechaPreferida);
                    const slotsList = slotsToShow.map((s, i) => `${i + 1}. ${s.time} — ${s.doctorName}`).join('\n');
                    const introMsg = await aiService.generateNaturalResponse(
                        `Encontraste horarios de ${session.tipoCita} para el ${fechaBonita}${timeContext}. Dile al usuario que elija uno. NO listes los horarios tú, el sistema los agrega.`,
                        {}, '', historyStr
                    );
                    await replyFn(`${introMsg}\n\n${slotsList}`);
                } else {
                    const nextData = await availabilityService.getNextAvailableSlots(session.fechaPreferida, session.tipoCita, session.doctorPreferido);

                    if (nextData) {
                        session.horariosDisponibles = nextData.slots;
                        session.fechaPreferida = nextData.date;
                        session.step = 'AI_SELECT_TIME';

                        const slotsToShow = nextData.slots.slice(0, 8);
                        const fechaAlternativa = formatDateNatural(nextData.date);
                        const slotsList = slotsToShow.map((s, i) => `${i + 1}. ${s.time} — ${s.doctorName}`).join('\n');
                        const introMsg = await aiService.generateNaturalResponse(
                            `No hay cupo en la fecha que pidió. El próximo disponible es ${fechaAlternativa}. Ofrécele esa fecha. NO listes los horarios.`,
                            {}, '', historyStr
                        );
                        await replyFn(`${introMsg}\n\n${slotsList}`);
                    } else {
                        await replyFn(`Lo siento mucho, no encontré citas disponibles para ${session.tipoCita} ni en esa fecha ni en los próximos 7 días cercanos a ella. 😔\n\n¿Deseas buscar disponibilidad en otro mes o periodo?`);
                        resetAppointmentSession(session);
                    }
                }

            } else if (!session.tipoCita) {
                session.step = 'AI_ASKING_TYPE';
                const resp = await aiService.generateNaturalResponse('Necesitas saber qué tipo de cita quiere. Pregúntale amablemente. Opciones: medicina general, odontología, pediatría, especialista.', {}, message, historyStr);
                await replyFn(resp);
            } else if (!session.fechaPreferida) {
                session.step = 'AI_ASKING_DATE';
                const resp = await aiService.generateNaturalResponse(`Necesitas la fecha para la cita de ${session.tipoCita}. Pregúntale para cuándo la quiere.`, {}, '', historyStr);
                await replyFn(resp);
            }
        }

        async function handleConsultarHorarios(userId, message, session, replyFn, preExtracted = null) {
            const entities = preExtracted || (await aiService.extractAll(message)).entities || {};
            const tipo = entities.tipo_cita ? availabilityService.normalizeTipoCita(entities.tipo_cita) : 'medicina general';
            const fecha = entities.fecha || 'mañana';

            let slots = await availabilityService.getAvailableSlots(fecha, tipo, entities.doctor);
            let responseMsg = "";

            if (slots.length === 0) {
                const nextData = await availabilityService.getNextAvailableSlots(fecha, tipo, entities.doctor);
                if (nextData) {
                    slots = nextData.slots;
                    session.fechaPreferida = nextData.date;
                    responseMsg = `⚠️ No hay horarios para ${fecha}. Pero encontré disponibilidad el *${nextData.date}*:`;
                } else {
                    await replyFn(`Lo siento, no encontré horarios disponibles para ${tipo} en fechas cercanas.`);
                    return;
                }
            } else {
                session.fechaPreferida = fecha;
                responseMsg = `📅 Horarios disponibles para ${fecha}:`;
            }

            const slotsToShow = slots.slice(0, 8);
            const response = await aiService.generateNaturalResponse(`Usuario consulta horarios. ${responseMsg}`, { horarios: slotsToShow.map(s => `${s.time} (${s.doctorName})`) });

            await replyFn(response + "\n\n" + slotsToShow.map(s => `⏰ ${s.time} - ${s.doctorName}`).join('\n') + "\n\n¿Quieres agendar alguno?");

            session.tipoCita = tipo;
            session.doctorPreferido = entities.doctor;
            session.horariosDisponibles = slots;
            session.step = 'AI_SELECT_TIME';
        }

        async function selectTimeSlot(input, availableSlots) {
            const cleanInput = input.trim().toLowerCase();

            const num = parseInt(cleanInput);
            if (!isNaN(num) && num >= 1 && num <= availableSlots.length) return availableSlots[num - 1];

            const ordinals = { 'primera': 0, 'segundo': 1, 'segunda': 1, 'tercera': 2, 'tercero': 2, 'cuarta': 3, 'cuarto': 3, 'quinta': 4, 'última': -1, 'ultimo': -1 };
            for (const [word, idx] of Object.entries(ordinals)) {
                if (cleanInput.includes(word)) {
                    const i = idx === -1 ? availableSlots.length - 1 : idx;
                    if (i < availableSlots.length) return availableSlots[i];
                }
            }

            const hourPatterns = [
                /(?:a\s+(?:las|mas)|las)\s+(\d{1,2})(?:\s*(?:y\s+media))?/i,
                /(\d{1,2})\s*(?::|\.)\s*(\d{2})\s*(am|pm)?/i,
                /(\d{1,2})\s*(am|pm)/i,
                /^(\d{1,2})$/
            ];

            for (const pattern of hourPatterns) {
                const match = cleanInput.match(pattern);
                if (match) {
                    let hours = parseInt(match[1]);
                    let mins = match[2] && !isNaN(parseInt(match[2])) ? parseInt(match[2]) : 0;
                    const ampm = (match[3] || '').toLowerCase();

                    if (cleanInput.includes('y media')) mins = 30;
                    if (ampm === 'pm' && hours < 12) hours += 12;
                    if (ampm === 'am' && hours === 12) hours = 0;

                    const targetTime = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

                    // If ampm was provided, strictly match the 24-hour converted time
                    if (ampm) {
                        const foundStrict = availableSlots.find(s => {
                            const slotMatch = s.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                            if (!slotMatch) return false;
                            let slotH = parseInt(slotMatch[1]);
                            const slotM = parseInt(slotMatch[2]);
                            const slotAmpm = slotMatch[3].toUpperCase();
                            if (slotAmpm === 'PM' && slotH < 12) slotH += 12;
                            if (slotAmpm === 'AM' && slotH === 12) slotH = 0;
                            return slotH === hours && slotM === mins;
                        });
                        if (foundStrict) return foundStrict;
                    } else {
                        // If no ampm, "2" could literally mean 2 AM (02:00) or 2 PM (14:00)
                        // We strongly prefer PM for working hours 1-6.
                        const exactHour = hours;
                        const pmHour = hours < 12 ? hours + 12 : hours;

                        const foundLoose = availableSlots.find(s => {
                            const slotMatch = s.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                            if (!slotMatch) return false;
                            let slotH = parseInt(slotMatch[1]);
                            const slotM = parseInt(slotMatch[2]);
                            const slotAmpm = slotMatch[3].toUpperCase();
                            if (slotAmpm === 'PM' && slotH < 12) slotH += 12;
                            if (slotAmpm === 'AM' && slotH === 12) slotH = 0;

                            return (slotH === pmHour || slotH === exactHour) && slotM === mins;
                        });
                        if (foundLoose) return foundLoose;
                    }
                }
            }

            const directMatch = availableSlots.find(slot => slot.time.toLowerCase().includes(cleanInput));
            if (directMatch) return directMatch;

            try {
                const timeStr = await aiService.extractTimeSlot(input, availableSlots.map(s => s.time));
                if (timeStr) return availableSlots.find(s => s.time === timeStr);
            } catch (e) { }

            return null;
        }

        async function finalizarCita(userId, contacto) {
            const userData = activeSessions.get(userId);
            // Usar el ID (cédula) o teléfono de la sesión en vez del userId/sender ruidoso
            const patientSearchId = userData.id || userData.cedula || userData.phone || userId;
            const success = await availabilityService.reserveSlot(
                userData.fechaPreferida, userData.horaSeleccionada, patientSearchId, userData.tipoCita, userData.doctorIdSeleccionado
            );

            if (!success) {
                // El turno fue tomado milisegundos atrás
                const updatedSlots = await availabilityService.getAvailableSlots(userData.fechaPreferida, userData.tipoCita, userData.doctorPreferido);
                if (updatedSlots && updatedSlots.length > 0) {
                    userData.horariosDisponibles = updatedSlots;
                    userData.step = 'AI_SELECT_TIME';

                    const slotsToShow = updatedSlots.slice(0, 8);
                    const slotsList = slotsToShow.map((s, i) => `${i + 1}. ${s.time} — ${s.doctorName}`).join('\n');
                    await reply(`Lo siento, ese horario acaba de ser ocupado por otra persona. 😔\n\nAquí tienes los horarios actualizados que quedan disponibles:\n\n${slotsList}\n\nPor favor, responde con el número del nuevo horario.`);
                } else {
                    userData.step = 'AI_ASKING_DATE';
                    await reply(`Lo siento, ese horario acaba de ser ocupado y ya no quedan más citas para ese día. 😔\n\n¿Para qué otra fecha u otro día te gustaría buscar?`);
                }
                return;
            }

            userData.step = 8;
            const fechaBonita = formatDateNatural(userData.fechaPreferida);
            const phoneDisplay = cleanPhone(contacto);

            await reply(
                `✅ *¡Cita agendada!*\n\n` +
                `👤 *Paciente:* ${userData.name}\n` +
                `🏥 *Servicio:* ${userData.tipoCita}\n` +
                `📅 *Fecha:* ${fechaBonita}\n` +
                `🕐 *Hora:* ${userData.horaSeleccionada}\n` +
                `👨‍⚕️ *Doctor:* ${userData.doctorNameSeleccionado || 'Asignado'}\n` +
                `📱 *Contacto:* ${phoneDisplay}\n\n` +
                `Te enviaremos un recordatorio antes de la cita. ¡Cuídate! 😊`
            );
            setTimeout(() => {
                const finalSession = activeSessions.get(userId);
                if (finalSession) finalSession.step = 'WELCOME';
            }, 5000);
        }
    }); // cierra el con-lock

});

async function loadHistoricalMessages() {
    try {
        console.log('📥 Sincronizando chats de WhatsApp...');
        const chats = await client.getChats();
        const recentChats = chats.slice(0, 10);

        for (const chat of recentChats) {
            try {
                const contact = await chat.getContact();
                const chatId = chat.id._serialized;
                const contactName = contact.pushname || contact.name || chatId;

                await chatService.getOrCreateConversation(chatId, contactName);
                const messages = await chat.fetchMessages({ limit: 50 });

                for (const msg of messages) {
                    try {
                        await chatService.saveMessage(chatId, {
                            id: msg.id._serialized,
                            body: msg.body || '',
                            fromMe: msg.fromMe,
                            type: msg.type,
                            mediaUrl: null,
                            timestamp: new Date(msg.timestamp * 1000),
                            senderName: contactName
                        });
                    } catch (e) { }
                }
                await new Promise(r => setTimeout(r, 100));
            } catch (chatError) { }
        }
        console.log(`✅ Sincronización completa.`);
    } catch (error) {
        console.error('❌ Error general en carga histórica:', error);
    }
}

client.initialize();