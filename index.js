require('dotenv').config();
const audioService = require('./audio_service');

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const prisma = require('./db');
const botPrisma = require('./dbBot');
const path = require('path'); // Added path module

// Servicios de IA y horarios
const aiService = require('./ollama_service');
const availabilityService = require('./availability_service');
const { findPaciente, updateCelular, dateToDecimal, codigoToNombreServicio } = require('./availability_service');
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
    // Limpiar JID de WhatsApp
    let cleaned = phone.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
    
    // Si el número es muy largo (ej. 15 dígitos de un LID) o tiene un formato no telefónico, 
    // lo marcamos como no registrado para que la IA no le dé información errónea al paciente.
    if (cleaned.length > 13 || cleaned.length < 7) return 'No registrado';
    
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

// --- LIMPIEZA DE SESIONES INACTIVAS ---
// Revisa cada 2 minutos y borra sesiones sin actividad en los últimos 10 minutos
setInterval(async () => {
    const now = Date.now();
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos
    for (const [sender, session] of activeSessions.entries()) {
        if (session.lastActivity && (now - session.lastActivity > TIMEOUT_MS)) {
            console.log(`[SESSION] 🧹 Limpiando sesión inactiva por más de 10 min: ${sender}`);
            
            // Avisar al paciente solo si dejó el flujo de citas a medias
            if (session.step && session.step !== 'WELCOME') {
                try {
                    await client.sendMessage(sender, "⚠️ Por tu seguridad, he cerrado esta sesión por inactividad ya que pasaron más de 10 minutos.\n\nSi deseas continuar agendando tu cita, por favor escríbeme de nuevo.");
                } catch (error) {
                    console.error('[SESSION] Error enviando mensaje de expiración:', error.message);
                }
            }
            
            activeSessions.delete(sender);
        }
    }
}, 2 * 60 * 1000);

// Helper para limpiar el estado de la sesión y dejarla lista para nuevas solicitudes
function clearSessionData(session, sender) {
    // Restaurar datos del dueño original si se había cambiado a un tercero
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
    // Garantizar que el status en BD esté en 'bot' para que el bot no quede silenciado
    if (sender) {
        chatService.updateStatus(sender, 'bot').catch(() => {});
    }
}

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
        const chatId = chat.id._serialized;
        let mediaUrl = null;
        if (msg.hasMedia) {
            mediaUrl = await mediaHandler.saveMedia(msg);
        }
        const saved = await chatService.saveMessage(chatId, {
            id: msg.id._serialized,
            body: msg.body,
            fromMe: true,
            type: msg.type,
            mediaUrl: mediaUrl,
            timestamp: new Date(msg.timestamp * 1000)
        });
        // Emitir el objeto completo guardado en BD (incluye el id para deduplicación en el frontend)
        server.emitMessage(saved || {
            id: msg.id._serialized,
            conversationId: chatId,
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
    // Si ya hay un proceso activo para este sender, esperar máximo 45 segundos
    const MAX_LOCK_WAIT_MS = 45000;
    const lockStart = Date.now();
    while (processingLocks.get(sender)) {
        if (Date.now() - lockStart > MAX_LOCK_WAIT_MS) {
            console.warn(`[LOCK] ⚠️ Forzando liberación de lock colgado para ${sender} (>${MAX_LOCK_WAIT_MS}ms)`);
            processingLocks.delete(sender);
            break;
        }
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
    const sender = msg.from;
    const textBody = msg.body ? msg.body.trim() : "";
    console.log(`\n======================================================`);
    console.log(`[INBOX LOG MAESTRO] Entrante de ${sender}: "${textBody}"`);
    console.log(`======================================================\n`);

    // Prevent double-processing if WhatsApp Web fires the event twice
    if (processedMessages.has(msg.id._serialized)) return;
    processedMessages.add(msg.id._serialized);
    if (processedMessages.size > 2000) processedMessages.clear();

    const chat = await msg.getChat();

    // Serializar mensajes del mismo sender para evitar race conditions
    await withSenderLock(sender, async () => {

        // Identificamos si es nota de voz (ptt = push to talk) o audio normal
        const isAudio = msg.type === 'ptt' || msg.type === 'audio';

        let text = msg.body ? msg.body.trim() : "";
        let mediaUrl = null;

        if (msg.hasMedia) {
            try {
                mediaUrl = await mediaHandler.saveMedia(msg);

                // Si es un audio y se guardó como MP3, lo transcribimos
                if (isAudio) {
                    chat.sendStateRecording();

                    if (mediaUrl) {
                        const audioFilePath = path.join(__dirname, 'public', mediaUrl);
                        const transcription = await audioService.transcribeAudio(audioFilePath);

                        if (transcription) {
                            text = transcription;
                            console.log(`[Audio] Transcripción exitosa: "${text}"`);
                        } else {
                            // Whisper falló (sin API key o error de red) → pedir texto
                            await client.sendMessage(sender, "Lo siento, no pude procesar tu nota de voz 😔. ¿Podrías escribirme lo que necesitas, por favor? 📝");
                            return;
                        }
                    } else {
                        // saveMedia devolvió null (error en conversión ffmpeg, etc.)
                        await client.sendMessage(sender, "Lo siento, no pude procesar tu audio 🎙️. Por favor escríbeme tu solicitud 📝.");
                        return;
                    }
                }
            } catch (error) {
                console.error('[Media] Error guardando o transcribiendo:', error.message || error);
                if (isAudio) {
                    // Siempre dar feedback al usuario cuando falla el audio
                    await client.sendMessage(sender, "Lo siento, tuve un problema procesando tu nota de voz 😔. Por favor escríbeme lo que necesitas 📝.");
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

        // MODO HUMANO: Solo bloquear el bot si el agente humano tomó el control
        // manualmente (status='pending') Y no hay ninguna sesión activa del bot.
        // Si hay sesión activa, el bot SIEMPRE responde sin importar el status en BD.
        const tieneSessionActiva = activeSessions.has(sender);
        if (!tieneSessionActiva) {
            const isHuman = await chatService.isHumanMode(sender);
            if (isHuman) {
                // Sin sesión activa y en modo humano → respetar al agente.
                return;
            }
        }
        // Si hay sesión activa, garantizar que el status en BD sea 'bot'
        if (tieneSessionActiva) {
            chatService.updateStatus(sender, 'bot').catch(() => {});
        }

        // Solo transferir a humano si el mensaje es EXCLUSIVAMENTE sobre hablar con un agente
        // (Removido 'persona' y 'agente' simples porque bloqueaban "cita para otra persona")
        if (cleanText.match(/\b(quiero un humano|hablar con humano|agente humano|hablar con agente|hablar con asesor|quiero un asesor|comunicarme con un agente)\b/)) {
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
            console.log(`[BOT] 💬 Enviando respuesta (${txt.length} chars): "${txt.substring(0,80)}..."`);
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
                const rawName = paciente.KC0_NOM?.trim() || 'Paciente';
                const nombre = rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                // Usar el teléfono real de la BD, no el sender/LID de Meta
                const realPhone = paciente.KC0_RES_TEL || sender.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
                console.log(`[BOT] Sesión iniciada: nombre=${nombre}, cod=${paciente.KC0_COD}, tel=${realPhone}, zona=${paciente.zona}`);
                activeSessions.set(sender, {
                    step: 'WELCOME',
                    mode: 'NATURAL',
                    name: nombre,
                    cedula: paciente.KC0_COD,
                    phone: realPhone,
                    id: paciente.KC0_COD,
                    zona: paciente.zona || '001',
                    entidad: paciente.KC0_ENTIDAD || null,
                    history: [],
                    doctorPreferido: null,
                    doctorIdSeleccionado: null,
                    lastActivity: Date.now()
                });
                const welcomeMsg = await aiService.generateNaturalResponse(
                    `El paciente ${nombre} regresa. Salúdalo cálidamente y pregunta en qué puedes ayudar.`,
                    { nombre }, text
                );
                await reply(welcomeMsg);
            } else {
                // Paciente no encontrado por teléfono → pedir cédula primero
                activeSessions.set(sender, { step: 'REGISTER_CEDULA', mode: 'STRUCTURED', history: [], lastActivity: Date.now() });
                await reply("👋 ¡Hola! Soy *Aurora* 🤖, tu asistente de citas médicas.\n\nPara atenderte, por favor escribe tu número de *Cédula*:");
            }
            return;
        }

        const session = activeSessions.get(sender);
        // Actualizar la última actividad de la sesión
        if (session) {
            session.lastActivity = Date.now();
        }

        // Alimentar memoria de corto plazo
        session.history = session.history || [];
        session.history.push(`Paciente: ${text}`);
        if (session.history.length > 20) session.history.shift();

        // --- GLOBAL EXIT / RESET GUARD ---
        // Detectar en cualquier fase si el usuario quiere reiniciar o cancelar
        const normalizeForExit = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const cleanExitMsg = normalizeForExit(text);
        const globalExitWords = [
            'chao', 'adios', 'adiós', 'salir', 'dejemos', 'olvida', 'no importa',
            'mejor no', 'cancelar', 'volvamos a empezar', 'empezar de nuevo',
            'reiniciar', 'comenzar de nuevo', 'no quiero cita', 'ya no quiero',
            'no quiero nada', 'no gracias', 'gracias no', 'no me interesa'
        ];
        
        if (globalExitWords.some(w => cleanExitMsg.includes(w))) {
            const isBookingStep = ['AI_ASKING_TYPE', 'AI_ASKING_DATE', 'AI_SELECT_DAY', 'AI_SELECT_TIME', 'AI_CONFIRM_PHONE', 'AI_ENTER_PHONE'].includes(session.step);
            
            // Función auxiliar para resetear global
            clearSessionData(session);

            if (isBookingStep) {
                await reply('Entendido, dejamos eso así. ¿En qué más puedo ayudarte hoy? 😊');
            } else {
                await reply('¡De acuerdo! Empecemos de nuevo. ¿Qué necesitas?');
            }
            return;
        }

        // --- ALWAYS-AVAILABLE GUARD ---
        // Si la sesión está en WELCOME y tenía datos de un tercero (ownerCedula),
        // restaurar automáticamente los datos del dueño del WhatsApp.
        // Esto garantiza que el bot siempre atiende al contacto correcto, sin importar
        // cuánto tiempo haya pasado desde la última conversación.
        if (session.step === 'WELCOME' && session.ownerCedula) {
            session.name   = session.ownerName;
            session.cedula = session.ownerCedula;
            session.id     = session.ownerId;
            session.phone  = session.ownerPhone;
            session.zona   = session.ownerZona;
            // Limpiar los campos de owner para que la próxima sesión comience limpia
            session.ownerName   = null;
            session.ownerCedula = null;
            session.ownerId     = null;
            session.ownerPhone  = null;
            session.ownerZona   = null;
        }

        // --- POST-CONFIRMACIÓN: ¿Agendar otra cita? ---
        // Este estado se activa brevemente después de confirmar una cita.
        // Si el usuario dice "no", cerramos amablemente pero seguimos DISPONIBLES.
        // Si dice cualquier otra cosa (si, hola, quiero, etc.), abrimos el flujo de "para quién".
        if (session.step === 'POST_CONFIRM') {
            const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const clean = normalize(text);
            // Palabras de cierre definitivo
            const isNo = /\b(no|chao|adios|adiós|hasta luego|ya no|no gracias)\b/.test(clean) && !clean.match(/\b(si|sí|ok|quiero|cita|agendar|otra)\b/);

            // Siempre restaurar datos del dueño si se agendó para un tercero
            if (session.ownerCedula) {
                session.name   = session.ownerName;
                session.cedula = session.ownerCedula;
                session.id     = session.ownerId;
                session.phone  = session.ownerPhone;
                session.zona   = session.ownerZona;
                session.ownerName = session.ownerCedula = session.ownerId = session.ownerPhone = session.ownerZona = null;
            }

            if (isNo) {
                clearSessionData(session, sender);
                await reply('¡Fue un placer atenderte! 😊 Recuerda que puedes escribirme en cualquier momento para agendar una cita.');
                return;
            }

            // Cualquier otra respuesta (sí, hola, quiero, o cualquier texto) → preguntar para quién
            session.step = 'POST_CONFIRM_WHO';
            const ownerName = session.name;
            await reply(
                `¡Claro! Con mucho gusto. 😊\n\n¿La nueva cita es para *ti* (${ownerName}) o para otra persona que esté en la clínica?\n\n• *1* → Para mí (${ownerName})\n• *2* → Para otra persona (buscar por cédula)`
            );
            return;
        }

        // --- POST_CONFIRM_WHO: ¿Para quién es la nueva cita? ---
        if (session.step === 'POST_CONFIRM_WHO') {
            const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const clean = normalize(text);
            const forSelf = /^1$|\b(yo|mi|para mi|para mí|mio|mismo|mi cedula|mia|contigo|conmigo)\b/.test(clean) || clean.trim() === '1';
            const forOther = /^2$|\b(otra|otro|alguien|persona|familiar|paciente|nueva cedula|diferente|buscar)\b/.test(clean) || clean.trim() === '2';

            if (forSelf) {
                // Guardar nombre ANTES de limpiar la sesión (clearSessionData puede cambiar session.name)
                const nombrePaciente = session.name;
                // Restaurar los datos del dueño de la sesión y reiniciar el proceso de agendamiento
                clearSessionData(session, sender);
                const resp = await aiService.generateNaturalResponse(
                    `El paciente ${nombrePaciente} quiere agendar otra cita para sí mismo. Salúdalo y pregunta qué tipo de cita necesita.`,
                    { nombre: nombrePaciente }, text
                );
                await reply(resp);
            } else if (forOther) {
                session.step = 'REGISTER_CEDULA_EXTRA';
                // Guardar datos del contacto original por si necesitamos restaurarlos
                if (!session.ownerCedula) {
                    session.ownerName  = session.name;
                    session.ownerCedula= session.cedula;
                    session.ownerId    = session.id;
                    session.ownerPhone = session.phone;
                    session.ownerZona  = session.zona;
                }
                await reply('📋 Por favor escribe el número de *cédula* de la otra persona que deseas registrar la cita:');
            } else {
                await reply(
                    `No entendí bien. Por favor responde:\n• *1* → La cita es para ti\n• *2* → La cita es para otra persona`
                );
            }
            return;
        }

        // --- REGISTER_CEDULA_EXTRA: Buscar cédula de tercero ---
        if (session.step === 'REGISTER_CEDULA_EXTRA') {
            const cedula = text.replace(/\D/g, '');
            if (cedula.length < 5) {
                await reply('⚠️ Por favor escribe un número de cédula válido (mínimo 5 dígitos).');
                return;
            }
            if (!prisma) {
                await reply('⚠️ El sistema de consulta de pacientes no está disponible temporalmente. Por favor intenta de nuevo en unos minutos.');
                return;
            }
            const exactPadded = cedula.padStart(14, ' ');

            let pacienteExiste = null;
            const nuiMatch = await prisma.pacienteNUI.findFirst({
                where: { OR: [{ KCN_COD_NUI: cedula }, { KCN_COD_NUI: exactPadded }] }
            });
            if (nuiMatch) {
                // Buscar datos adicionales en facturación para obtener el teléfono
                const factAdd = await prisma.tMUSUARIOSFACTURACION.findFirst({
                    where: { OR: [{ KC2_OACOD_NUI: cedula }, { KC2_OACOD_NUI: exactPadded }] }
                });
                pacienteExiste = { 
                    KC_NOM: nuiMatch.KCN_NOM, 
                    KC_COD: nuiMatch.KCN_COD || nuiMatch.KCN_COD_NUI, 
                    KC_ZONA: nuiMatch.KCN_ZONA || '001', 
                    KC_TEL1: factAdd?.KC2_TEL_RESP || null 
                };
            } else {
                const factMatch = await prisma.tMUSUARIOSFACTURACION.findFirst({
                    where: { OR: [{ KC2_OACOD_NUI: cedula }, { KC2_OACOD_NUI: exactPadded }] }
                });
                if (factMatch) {
                    pacienteExiste = {
                        KC_NOM: `${factMatch.KC2_PNOMBRE || ''} ${factMatch.KC2_PAPELLIDO || ''}`.trim(),
                        KC_COD: factMatch.KC2_COD,
                        KC_ZONA: factMatch.KC2_ZONA,
                        KC_TEL1: factMatch.KC2_TEL_RESP
                    };
                }
            }
            if (!pacienteExiste) {
                const aseg = await prisma.paciente.findFirst({
                    where: { OR: [{ KC0_COD: cedula }, { KC0_COD: exactPadded }] }
                });
                if (aseg) {
                    pacienteExiste = { KC_NOM: aseg.KC0_NOM, KC_COD: aseg.KC0_COD, KC_ZONA: '001', KC_TEL1: aseg.KC0_RES_TEL };
                }
            }

            if (pacienteExiste) {
                const rawName = pacienteExiste.KC_NOM?.trim() || 'Paciente';
                const nombre  = rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                const realPhone = pacienteExiste.KC_TEL1 || session.ownerPhone;

                // Guardar owner actual
                const currentOwnerName = session.ownerName;
                const currentOwnerCedula = session.ownerCedula;
                const currentOwnerId = session.ownerId;
                const currentOwnerPhone = session.ownerPhone;
                const currentOwnerZona = session.ownerZona;

                // Limpiar la sesión por completo
                clearSessionData(session);

                // Restaurar owner para que la sesión sepa quién está usando el celular
                session.ownerName = currentOwnerName;
                session.ownerCedula = currentOwnerCedula;
                session.ownerId = currentOwnerId;
                session.ownerPhone = currentOwnerPhone;
                session.ownerZona = currentOwnerZona;

                // Cambiar los datos activos de la sesión al del paciente buscado
                session.name   = nombre;
                session.cedula = cedula;
                session.id     = pacienteExiste.KC_COD;
                session.phone  = realPhone;
                session.zona   = pacienteExiste.KC_ZONA || '001';

                const resp = await aiService.generateNaturalResponse(
                    `Se va a agendar una cita para el paciente ${nombre} (diferente al contacto de WhatsApp). Salúdalo e indícale que encontraste su registro y pregunta qué tipo de cita necesita.`,
                    { nombre }, text
                );
                await reply(resp);
            } else {
                await reply(
                    `❌ No encontré la cédula *${cedula}* en nuestra base de datos.\n\n` +
                    `Solo pacientes ya registrados pueden agendar citas. ¿Quieres buscar con otra cédula o prefieres agendar para ti? Responde\n• *1* → Para mí\n• *2* → Intentar con otra cédula`
                );
                session.step = 'POST_CONFIRM_WHO';
            }
            return;
        }

        // --- FLUJO DE REGISTRO ---
        // PASO 1: Pedir cédula y verificar si ya existe
        if (session.step === 'REGISTER_CEDULA') {
            const cedula = text.replace(/\D/g, '');
            if (cedula.length < 5) {
                await reply("⚠️ Por favor escribe un número de cédula válido (mínimo 5 dígitos).");
                return;
            }
            if (!prisma) {
                await reply('⚠️ El sistema de consulta de pacientes no está disponible temporalmente. Por favor intenta de nuevo en unos minutos.');
                return;
            }
            session.cedula = cedula;
            // Estandarizar: Cédula para tablas nuevas, y Cédula con relleno de espacios para tabla antigua (TMUSUARIOSASEGURAMIENTO)
            const exactPadded = cedula.padStart(14, ' ');

            // Buscar en fuentes de NUI y Facturación (reemplazando TKCLIENTES)
            let pacienteExiste = null;
            const nuiMatch = await prisma.pacienteNUI.findFirst({
                where: { OR: [{ KCN_COD_NUI: cedula }, { KCN_COD_NUI: exactPadded }] }
            });

            if (nuiMatch) {
                const internalCod = nuiMatch.KCN_COD || nuiMatch.KCN_COD_NUI;
                const searchTerm  = [cedula, exactPadded, internalCod];
                // Prioridad: TKCLIENTESANEXO5 (celular real de Xenco) > TMUSUARIOSFACTURACION > null
                let celPhone = null;
                try {
                    const kc5 = await prisma.tKCLIENTESANEXO5.findFirst({
                        where: { KC5_RACOD_CLI: { in: searchTerm } }
                    });
                    if (kc5?.KC5_TEL_CEL && !/^0+$/.test(kc5.KC5_TEL_CEL.trim())) celPhone = kc5.KC5_TEL_CEL.trim();
                } catch(_) {}
                if (!celPhone) {
                    const factAdd = await prisma.tMUSUARIOSFACTURACION.findFirst({
                        where: { OR: [{ KC2_OACOD_NUI: cedula }, { KC2_OACOD_NUI: exactPadded }] }
                    });
                    const t = factAdd?.KC2_TEL_RESP;
                    if (t && !/^0+$/.test(t.trim())) celPhone = t.trim();
                }
                pacienteExiste = { 
                    KC_NOM:  nuiMatch.KCN_NOM, 
                    KC_COD:  internalCod, 
                    KC_ZONA: nuiMatch.KCN_ZONA || '001', 
                    KC_SEQK: nuiMatch.KCN_SEQK || '',
                    KC_TEL1: celPhone
                };
            } else {
                const factMatch = await prisma.tMUSUARIOSFACTURACION.findFirst({
                    where: { OR: [{ KC2_OACOD_NUI: cedula }, { KC2_OACOD_NUI: exactPadded }] }
                });
                if (factMatch) {
                    // Buscar celular real en TKCLIENTESANEXO5
                    let celPhone = null;
                    try {
                        const kc5 = await prisma.tKCLIENTESANEXO5.findFirst({
                            where: { KC5_RACOD_CLI: factMatch.KC2_COD }
                        });
                        if (kc5?.KC5_TEL_CEL && !/^0+$/.test(kc5.KC5_TEL_CEL.trim())) celPhone = kc5.KC5_TEL_CEL.trim();
                    } catch(_) {}
                    const telFact = factMatch.KC2_TEL_RESP;
                    pacienteExiste = { 
                        KC_NOM:  `${factMatch.KC2_PNOMBRE || ''} ${factMatch.KC2_PAPELLIDO || ''}`.trim(), 
                        KC_COD:  factMatch.KC2_COD, 
                        KC_ZONA: factMatch.KC2_ZONA, 
                        KC_SEQK: factMatch.KC2_SEQK || '  ',
                        KC_TEL1: celPhone || (telFact && !/^0+$/.test(telFact.trim()) ? telFact.trim() : null)
                    };
                }
            }

            // Buscar en TMUSUARIOSASEGURAMIENTO (Por documento o padding de espacios)
            if (!pacienteExiste) {
                const aseg = await prisma.paciente.findFirst({
                    where: { OR: [{ KC0_COD: cedula }, { KC0_COD: exactPadded }] }
                });
                if (aseg) {
                    pacienteExiste = { KC_NOM: aseg.KC0_NOM, KC_COD: aseg.KC0_COD, KC_ZONA: '001', KC_SEQK: '  ', KC_TEL1: aseg.KC0_RES_TEL };
                }
            }

            if (pacienteExiste) {
                // Ya existe → saludar directamente usando el nombre completo
                let rawName = pacienteExiste.KC_NOM?.trim() || 'Paciente';
                const nombre = rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

                // Usar el número en DB en vez del ID de Meta (sender) que a veces es erróneo ej 2360...
                const realPhone = pacienteExiste.KC_TEL1 || pacienteExiste.KC0_RES_TEL || sender.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');

                console.log(`[BOT] Sesión por cédula: nombre=${nombre}, cod=${pacienteExiste.KC_COD}, tel=${realPhone}, zona=${pacienteExiste.KC_ZONA}`);
                activeSessions.set(sender, {
                    step: 'WELCOME', mode: 'NATURAL',
                    name: nombre, cedula,
                    phone: realPhone,
                    id: pacienteExiste.KC_COD,
                    zona: pacienteExiste.KC_ZONA || '001',
                    entidad: null,
                    history: [], doctorPreferido: null, doctorIdSeleccionado: null
                });
                const welcomeMsg = await aiService.generateNaturalResponse(
                    `El paciente ${nombre} regresa. Salúdalo cálidamente y pregunta en qué puedes ayudar.`,
                    { nombre }, text
                );
                await reply(welcomeMsg);
            } else {
                // No existe → Bloquear registro de nuevos usuarios
                await reply(`❌ Lo siento, no encontré la cédula *${cedula}* en nuestra base de datos.\n\nPor políticas de la clínica, solo los pacientes ya registrados pueden agendar citas por WhatsApp. Si consideras que hay un error, por favor verifica tu número o acércate a nuestras instalaciones para registrarte en el sistema.`);
                activeSessions.delete(sender);
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
                    'AI_ASKING_TYPE', 'AI_ASKING_DATE', 'AI_SUGGEST_NEXT_DATE', 'AI_SELECT_DAY', 'AI_SELECT_TIME',
                    'AI_CONFIRM_PHONE', 'AI_ENTER_PHONE', 'AI_UPDATE_PHONE', 'AI_CONFIRM_NEW_PHONE',
                    'AI_CANCEL_CONFIRM', 'AI_MODIFY_SELECT'
                ];

                // Unir el historial para darle contexto a la IA
                const historyStr = session.history.join('\n');
                console.log(`[BOT] processWithAI: step=${session.step}, msg="${message.substring(0,60)}"`);

                if (contextSteps.includes(session.step)) {
                    // ── GUARD 1: check if user wants to exit ──
                    const exitWords = ['chao', 'adios', 'adiós', 'salir', 'dejemos', 'olvida', 'no importa', 'mejor no', 'cancelar', 'volvamos', 'empezar', 'reiniciar', 'comenzar'];
                    if (exitWords.some(w => message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(w))) {
                        const byeMsg = await aiService.generateNaturalResponse('El usuario quiere cancelar el proceso actual. Despídete amablemente y pregunta si necesita algo más.', {}, message, historyStr);
                        resetAppointmentSession(session);
                        await replyFn(byeMsg);
                        return;
                    }

                    // ── GUARD 2: lightweight topic-switch detection ──
                    // Only for steps where user might change their mind (not phone/waitlist/cancel)
                    const stepsWithTopicSwitch = ['AI_ASKING_TYPE', 'AI_ASKING_DATE', 'AI_SELECT_DAY', 'AI_SELECT_TIME'];
                    // Skip topic-switch for time-preference words, explicit time selection phrases, or dates
                    const isTimePref = /\b(tarde|noche|ma[nñ]ana|manana|morning|afternoon)\b/i.test(message) || 
                                       /(?:a\s+las?|las?)\s+\d{1,2}/i.test(message) || 
                                       /\d{1,2}[:\.]\d{2}/i.test(message) ||
                                       /opci[oó]n|la\s+\d/i.test(message) ||
                                       /primera|segunda|tercera/i.test(message) ||
                                       /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i.test(message) ||
                                       /\b(el\s+\d{1,2})\b/i.test(message);
                                       
                    if (stepsWithTopicSwitch.includes(session.step) && !isTimePref && !message.match(/^\d+$|^[a-cA-C]$|^s[ií]$|^no$/i)) {
                        const newIntent = await aiService.extractIntent(message);
                        // No cambiar tema si el intent es AGENDAR_CITA (continuar en el paso actual)
                        // No cambiar tema si es CONSULTAR_DATOS (responder y volver al paso)
                        const intentsToIgnore = ['OTRO', 'SALUDO', 'AGENDAR_CITA', 'CONSULTAR_DATOS'];
                        if (newIntent && !intentsToIgnore.includes(newIntent)) {
                            // User changed topic — reset and route to new intent
                            resetAppointmentSession(session);
                            const entities = await aiService.extractEntities(message, historyStr);
                            await routeIntent(userId, message, newIntent, entities, session, replyFn, historyStr);
                            return;
                        }
                        // Caso especial: CONSULTAR_DATOS dentro de un flujo de cita
                        // Responde la pregunta del dato pero NO resetea el flujo
                        if (newIntent === 'CONSULTAR_DATOS') {
                            const datosMsg = await aiService.generateNaturalResponse(
                                `El usuario pregunta brevemente por sus datos mientras agenda una cita. Responde solo el dato preguntado (nombre: ${session.name}, cédula: ${session.cedula}, celular: ${session.phone}) y recuérdale que volvemos al proceso de agendamiento.`,
                                { nombre: session.name, cedula: session.cedula, celular: session.phone },
                                message, historyStr
                            );
                            await replyFn(datosMsg);
                            // NO return — continúa en el paso actual (AI_ASKING_TYPE etc)
                        }
                    }

                    // ── Normalize helper (strip accents for matching) ──
                    const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const clean = normalize(message);

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_ASKING_TYPE (REMOVED - always medicina general)
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_ASKING_TYPE') {
                        // Fallback in case old sessions are stuck here
                        session.tipoCita = 'medicina general';
                        session.step = null;
                        await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
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
                            await replyFn('No logré entender la fecha. Por favor, dime para qué día de la semana o fecha exacta quieres tu cita (ejemplo: "mañana", "el próximo viernes" o "25 de octubre").');
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_SUGGEST_NEXT_DATE — user is deciding whether to accept the suggested date
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_SUGGEST_NEXT_DATE') {
                        const entities = await aiService.extractEntities(message, historyStr);
                        
                        // Affirmative answer
                        const isAffirmative = clean.match(/^(s[ií]?|ok|okay|listo|vale|dale|claro|bueno|perfecto|me parece)$/) || clean.includes('si') || clean.includes('perfecto') || clean.includes('bien');
                        
                        // If they explicitly give a new date instead 
                        if (entities.fecha && !isAffirmative && clean.length > 4) {
                            session.fechaPreferida = entities.fecha;
                            if (entities.hora) session.horaPreferida = entities.hora;
                            session.suggestedDate = null;
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } 
                        // If they affirm
                        else if (isAffirmative || clean.includes('esa') || clean.includes('eso')) {
                            session.fechaPreferida = session.suggestedDate;
                            if (entities.hora) session.horaPreferida = entities.hora;
                            session.suggestedDate = null;
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } 
                        // Negation or unknown
                        else {
                            session.step = 'AI_ASKING_DATE';
                            session.suggestedDate = null;
                            await replyFn('Entendido. Por favor, dime para qué otra fecha, día de la semana o mes te gustaría buscar disponibilidad.');
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
                            const dayList = session.diasDisponibles.map((d, i) => {
                                const dateObj = new Date(d.date + 'T12:00:00');
                                const dayNum = dateObj.getDate();
                                const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
                                const mesNom = meses[dateObj.getMonth()];
                                return `${i + 1}) 📅 *${d.dayName} ${dayNum} de ${mesNom}* — ${d.slotCount} horario${d.slotCount > 1 ? 's' : ''} disponible${d.slotCount > 1 ? 's' : ''} (${d.firstSlot} – ${d.lastSlot})`;
                            }).join('\n');
                            await replyFn(`No logré entender qué día elegiste. Por favor, escribe únicamente el *NÚMERO* de tu preferencia de esta lista:\n\n${dayList}`);
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
                            const confirmMsg = phoneClean
                                ? `¡Perfecto! Agendaré tu cita con ${selectedSlot.doctorName} el ${fechaBonita} a las ${selectedSlot.time}.\n\nPara terminar, ¿me confirmas que tu número de contacto es *${phoneClean}*? (Responde SÍ o escribe un número diferente)`
                                : `¡Perfecto! Agendaré tu cita con ${selectedSlot.doctorName} el ${fechaBonita} a las ${selectedSlot.time}.\n\nPara terminar, por favor escribe tu número de celular (10 dígitos).`;
                            await replyFn(confirmMsg);
                        } else if (clean.includes('tarde') || clean.includes('noche')) {
                            session.horaPreferida = 'PM';
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } else if (clean.includes('mana') && !clean.includes('pasado')) {
                            session.horaPreferida = 'AM';
                            await handleAgendarCita(userId, message, session, replyFn, {}, historyStr);
                        } else {
                            const slotsText = session.horariosDisponibles.slice(0, 8).map((s, i) => `${i + 1}. ${s.time} — ${s.doctorName}`).join('\n');
                            
                            const userMentionedHour = /\\b([1-9]|1[0-2])\\b/.test(message) || /\\b(a las|las)\\b/.test(message.toLowerCase());
                            const resp = userMentionedHour 
                                ? 'Ese horario no está disponible o no logré entenderlo. Por favor, escribe únicamente el *NÚMERO* de una de las siguientes opciones:'
                                : 'Por favor, escribe únicamente el *NÚMERO* de la opción que prefieres para poder agendar tu cita:';
                                
                            await replyFn(`${resp}\n\n${slotsText}`);
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_CONFIRM_PHONE — user is confirming phone number
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_CONFIRM_PHONE') {
                        const phoneClean = cleanPhone(session.phone);
                        const confirmRegex = /^(s[ií]?|ok|okay|listo|vale|dale)$/;
                        const isConfirm = confirmRegex.test(clean) || clean.includes('actual') || clean.includes('ese') || clean.includes('confirmo') || clean.includes('ok') || clean.includes('listo') || message.includes(phoneClean);
                        console.log(`[BOT] AI_CONFIRM_PHONE interceptado: message="${clean}", isConfirm=${isConfirm}`);

                        // Detectar si el usuario quiere cancelar/salir antes de hacer cualquier otra cosa
                        const exitPhrasesPhone = ['no quiero', 'no me interesa', 'dejalo', 'olvida', 'cancelar', 'salir', 'no gracias', 'no, gracias', 'ya no', 'mejor no', 'adios', 'chao'];
                        const wantsToExitPhone = exitPhrasesPhone.some(p => clean.includes(p));
                        if (wantsToExitPhone) {
                            clearSessionData(session, userId);
                            await replyFn('¡Entendido! Cancelamos la cita. Si necesitas algo más, aquí estaré. 😊');
                            return;
                        }
                        
                        if (isConfirm) {
                            await finalizarCita(userId, phoneClean);
                        } else {
                            const digits = message.replace(/\D/g, '');
                            if (/^\d{10}$/.test(digits)) {
                                await finalizarCita(userId, digits);
                            } else if (clean.includes('otro') || clean === 'no' || clean === 'b') {
                                session.step = 'AI_ENTER_PHONE';
                                await replyFn('Entendido. Por favor, escribe tu número de celular de 10 dígitos.');
                            } else {
                                await replyFn(`No logré entenderte. ¿Confirmas que tu número es *${phoneClean}*? (Responde SÍ, o escribe el número correcto de 10 dígitos)`);
                            }
                        }
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_ENTER_PHONE — user is typing a new phone number
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_ENTER_PHONE') {
                        const digits = message.replace(/\D/g, '');

                        // Primero verificar si el usuario quiere salir/cancelar
                        const exitPhrasesEnter = ['no quiero', 'no me interesa', 'no gracias', 'no, gracias', 'cancelar', 'salir', 'olvida', 'dejalo', 'adios', 'chao', 'ya no', 'mejor no', 'quiero salir'];
                        const wantsExitEnter = exitPhrasesEnter.some(p => clean.includes(p)) || clean === 'no';
                        if (wantsExitEnter) {
                            clearSessionData(session, userId);
                            await replyFn('¡Entendido! Cancelamos el proceso. ¿Hay algo más en lo que pueda ayudarte? 😊');
                            return;
                        }

                        // Verificar si quiere retomar el flujo normal (sin dar número)
                        const wantsNewFlow = clean.includes('quiero una cita') || clean.includes('agendar') || clean.includes('cita') || clean === 'hola' || clean === 'buenas' || clean === 'buenos dias' || clean.includes('ayuda');
                        if (wantsNewFlow) {
                            clearSessionData(session, userId);
                            // Redirigir al flujo de agendamiento desde cero
                            await replyFn(`¡Claro! Empecemos de nuevo. ¿Para qué fecha, día de la semana o mes te gustaría agendar tu cita de Medicina General?`);
                            return;
                        }

                        if (/^\d{10}$/.test(digits)) {
                            await finalizarCita(userId, digits);
                        } else {
                            await replyFn('Para confirmar la cita necesito un número de celular válido de 10 dígitos. ¿Puedes escribirlo? (Ejemplo: 3001234567) \n\nO si prefieres cancelar, escribe *cancelar*.');
                        }
                        return;
                    }



                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_UPDATE_PHONE — usuario ingresa nuevo número de celular
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_UPDATE_PHONE') {
                        const exitPhrasesUpd = ['no quiero', 'cancelar', 'salir', 'olvida', 'dejalo', 'adios', 'chao', 'no gracias'];
                        if (exitPhrasesUpd.some(p => clean.includes(p)) || clean === 'no') {
                            clearSessionData(session, userId);
                            await replyFn('¡Entendido! No se hicieron cambios. ¿En qué más puedo ayudarte? 😊');
                            return;
                        }
                        const digits = message.replace(/\D/g, '');
                        if (!/^\d{7,15}$/.test(digits)) {
                            await replyFn('⚠️ El número no parece válido. Por favor escribe solo los dígitos (ej: *3016404175*).\n\nO escribe *cancelar* para salir.');
                            return;
                        }
                        session.pendingPhone = digits;
                        session.step = 'AI_CONFIRM_NEW_PHONE';
                        await replyFn(`📱 *Confirmar cambio de celular*\n\n*Nuevo número:* ${digits}\n\n¿Cambiamos tu celular a *${digits}*?\n• Escribe *sí* para confirmar\n• Escribe *no* para cancelar`);
                        return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // STEP: AI_CONFIRM_NEW_PHONE — confirmar antes de guardar en BD
                    // ═══════════════════════════════════════════════════════════
                    if (session.step === 'AI_CONFIRM_NEW_PHONE') {
                        const isConfirm = /^(si|s[ií]|ok|dale|listo|confirmo)$/i.test(clean) || clean.includes('si confirmo') || clean.includes('si, confirmo');
                        const isCancel  = /^(no|cancelar|salir)$/i.test(clean) || clean.includes('no quiero') || clean.includes('cancela');

                        if (isCancel) {
                            session.pendingPhone = null;
                            clearSessionData(session, userId);
                            await replyFn('¡Perfecto! No se hicieron cambios. ¿En qué puedo ayudarte? 😊');
                            return;
                        }

                        if (isConfirm) {
                            const internalCod = session.id || session.cedula;
                            const newPhone = session.pendingPhone;
                            console.log(`[BOT] Actualizando celular: cod=${internalCod}, newPhone=${newPhone}`);
                            const result = await updateCelular(internalCod, newPhone);

                            if (result.ok) {
                                session.phone = result.phone;
                                session.pendingPhone = null;
                                clearSessionData(session, userId);
                                await replyFn(`✅ *¡Celular actualizado exitosamente!*\n\nTu nuevo número de celular registrado es:\n*📱 ${result.phone}*\n\n¿Hay algo más en lo que pueda ayudarte? 😊`);
                            } else if (result.reason === 'formato_invalido') {
                                session.step = 'AI_UPDATE_PHONE';
                                await replyFn('⚠️ El número no tiene un formato válido. Por favor escribe solo los dígitos de tu celular:');
                            } else {
                                session.pendingPhone = null;
                                clearSessionData(session, userId);
                                await replyFn('❌ Lo siento, hubo un problema al actualizar tu celular en el sistema. Por favor acércate a recepción para actualizarlo.');
                            }
                            return;
                        }

                        // Respuesta ambigua — volver a preguntar
                        await replyFn(`¿Confirmas cambiar tu celular a *${session.pendingPhone}*?\n• Escribe *sí* para confirmar\n• Escribe *no* para cancelar`);
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
                                    await replyFn(`✅ ¡Listo! Tu cita de *${session.appointmentToCancel.tipo}* ha sido cancelada exitosamente. Si necesitas algo más, aquí estaré.`);
                                } else {
                                    await replyFn('Hubo un error al cancelar. Por favor intenta de nuevo.');
                                }
                                resetAppointmentSession(session);
                            } else if (clean.match(/no|cancelar|salir/)) {
                                const resp = 'Entendido, no cancelaremos ninguna cita. Todo sigue igual. ¿Hay algo más en lo que pueda ayudarte?';
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
                                    await replyFn(`✅ ¡Listo! Tu cita de *${session.appointmentToCancel.tipo}* ha sido cancelada exitosamente. Si necesitas algo más, avísame.`);
                                } else {
                                    await replyFn('Hubo un error al cancelar. Por favor intenta de nuevo.');
                                }
                                resetAppointmentSession(session);
                            }
                        } else {
                            await replyFn('Entendido, tu cita sigue en pie y no la cancelaré. ¡Te esperamos!');
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
                                await replyFn(`✅ ¡Listo! Tu cita anterior ha sido cancelada para que podamos buscar una nueva.\n\n¿Para qué fecha, día de la semana o mes te gustaría agendar tu nueva cita?`);
                            } else {
                                await replyFn('Hubo un error. Intenta de nuevo.');
                                resetAppointmentSession(session);
                            }
                        } else if (clean.match(/no|cancelar|salir/)) {
                            await replyFn('Entendido, no modificaremos tu cita. Todo sigue igual. ¿Puedo ayudarte en algo más?');
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

                // Tipos de servicio NO disponibles via bot (solo Medicina General)
                const SERVICIOS_NO_DISPONIBLES = [
                    'odont', 'dental', 'dent', 'carie', 'muela',
                    'examen', 'laboratorio', 'lab ', 'sangre', 'orina', 'rayos', 'radiogr', 'ecograf', 'imagen',
                    'pediat', 'gineC', 'ginec', 'gineco',
                    'cardio', 'ortop', 'dermat', 'nutri', 'psico', 'psiqui',
                    'urgencia', 'emergencia',
                    'vacun', 'inyecc',
                    'ciruj', 'operat'
                ];
                const tipoRaw = (entities.tipo_cita || '').toLowerCase();
                const msgLower = message.toLowerCase();
                const esServicioNoDisponible = tipoRaw && SERVICIOS_NO_DISPONIBLES.some(k => tipoRaw.includes(k))
                    || SERVICIOS_NO_DISPONIBLES.some(k => msgLower.includes(k));

                if (esServicioNoDisponible) {
                    await replyFn(
                        `Lo siento 😔, en este momento el agente de citas solo está disponible para *Medicina General*.\n\n` +
                        `Para otros servicios (odontología, exámenes, laboratorios, especialidades, etc.) debes comunicarte directamente con la institución o acercarte a nuestras instalaciones.\n\n` +
                        `¿Te puedo ayudar a agendar una cita de *Medicina General*? 🩺`
                    );
                    return;
                }

                if (entities.tipo_cita) session.tipoCita = 'medicina general';
                // Para AGENDAR_CITA en paso WELCOME (inicio fresco), NO setear fechaPreferida desde la
                // extracción automática de la IA — puede asumir "mañana" aunque el usuario no lo dijo.
                // La semana de disponibilidad se mostrará primero para que el usuario elija.
                const isAgendarFresh = (intent === 'AGENDAR_CITA') && (!session.step || session.step === 'WELCOME');
                if (entities.fecha && !isAgendarFresh) session.fechaPreferida = entities.fecha;
                if (entities.hora) session.horaPreferida = entities.hora;
                if (entities.doctor) session.doctorPreferido = entities.doctor;

                if (availabilityService.isRangeDate(message)) {
                    session.isRangeRequest = true;
                    session.originalRangeText = message;
                }

                await routeIntent(userId, message, intent, entities, session, replyFn, historyStr);

            } catch (error) {
                if (error.code === 'P1001') {
                    console.error('[DB] ❌ Sin conexión a SQL Server (P1001):', error.message);
                    await replyFn('⚠️ En este momento no puedo acceder al sistema de citas porque el servidor de la clínica no está disponible. Por favor intenta en unos minutos o comunícate directamente con la clínica. 🏥');
                } else {
                    console.error('[IA] Error procesando:', error);
                    await replyFn('Lo siento, tuve un pequeño problema técnico. ¿Me repites qué necesitas? 😊');
                }
            }
        }

        function resetAppointmentSession(session) {
            clearSessionData(session);
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
                    const citas = await availabilityService.getUserAppointments(session.id || session.phone);
                    const futuras = citas.filter(c => {
                        const datePart = new Date(c.fecha + 'T12:00:00');
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
                        `El paciente ${session.name} saludó. Responde cálidamente de forma muy corta.`, { nombre: session.name }, message, historyStr);
                    await replyFn(saludoMsg + "\n\n¿Te gustaría agendar, cancelar o consultar una cita médica hoy?");
                    break;
                }
                case 'INFO_GENERAL': {
                    const infoMsg = await aiService.generateNaturalResponse('El usuario pide información general sobre la clínica. Explica brevemente.', {}, message, historyStr);
                    await replyFn(infoMsg + "\n\n¿Deseas que te ayude a agendar una cita de Medicina General?");
                    break;
                }
                case 'CONSULTAR_DATOS': {
                    const datosMsg = await aiService.generateNaturalResponse(
                        `El usuario pregunta por sus datos personales registrados (ej. número de celular, nombre, cédula). Responde de forma cálida dándole la información solicitada usando los siguientes datos: Nombre: ${session.name}, Cédula: ${session.cedula}, Celular: ${session.phone}.`,
                        { nombre: session.name, cedula: session.cedula, celular: session.phone },
                        message, historyStr
                    );
                    await replyFn(datosMsg);
                    break;
                }
                case 'ACTUALIZAR_CELULAR': {
                    const phoneActual = session.phone && !/^0+$/.test(session.phone) ? session.phone : null;
                    const contextoMsg = phoneActual
                        ? `Tu celular actual registrado es *${phoneActual}*.\n\nPor favor escribe el *nuevo número de celular* (solo dígitos, ej: 3001234567):`
                        : `No tienes un número de celular registrado aún.\n\nPor favor escribe tu *número de celular* (solo dígitos, ej: 3001234567):`;
                    session.step = 'AI_UPDATE_PHONE';
                    await replyFn(`📱 *Actualizar Celular*\n\n${contextoMsg}`);
                    break;
                }
                default: {
                    const defaultMsg = await aiService.generateNaturalResponse(
                        `Responde a la pregunta del paciente de forma corta. Si pregunta por sus datos personales, dáselos. Nombre: ${session.name}, Cédula: ${session.cedula}, Celular: ${session.phone}.`,
                        { nombre: session.name, cedula: session.cedula, celular: session.phone },
                        message, historyStr
                    );
                    await replyFn(defaultMsg + "\n\nSi necesitas agendar una cita médica, solo escríbeme *'quiero una cita'*.");
                }
            } // termins switch
        } // termina routeIntent

        async function handleCancelarCita(userId, message, session, replyFn) {
            const citas = await availabilityService.getUserAppointments(session.id || session.phone);
            const now = new Date();
            const futuras = citas.filter(c => {
                const datePart = new Date(c.fecha + 'T12:00:00');
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
            const citas = await availabilityService.getUserAppointments(session.id || session.phone);
            const now = new Date();
            const futuras = citas.filter(c => {
                const datePart = new Date(c.fecha + 'T12:00:00');
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

            // Apply entities to session — solo fecha, hora y doctor (el tipo es siempre Medicina General)
            // Si el paso es WELCOME (inicio fresco), ignorar fecha extraída por IA para mostrar semana antes
            const isFreshStart = !session.step || session.step === 'WELCOME';
            if (entities.fecha && !session.fechaPreferida && !isFreshStart) session.fechaPreferida = entities.fecha;
            if (entities.hora && !session.horaPreferida) session.horaPreferida = entities.hora;
            if (entities.doctor && !session.doctorPreferido) session.doctorPreferido = entities.doctor;

            // Validar que el servicio solicitado sea Medicina General
            // Si el mensaje menciona otro servicio, rechazar educadamente
            const KEYWORDS_NO_DISPONIBLES = [
                'odont', 'dental', 'dent', 'examen', 'laboratorio', 'sangre', 'orina',
                'rayos', 'radiogr', 'ecograf', 'pediat', 'ginec', 'cardio', 'ortop',
                'dermat', 'nutri', 'psico', 'psiqui', 'vacun', 'inyecc', 'ciruj'
            ];
            const msgCheck = message.toLowerCase();
            if (KEYWORDS_NO_DISPONIBLES.some(k => msgCheck.includes(k))) {
                await replyFn(
                    `Lo siento 😔, en este momento solo puedo agendar citas de *Medicina General*.\n\n` +
                    `Para otros servicios, por favor comunícate directamente con la institución. ¿Te agendo una cita de Medicina General? 🩺`
                );
                return;
            }

            // Forzar siempre Medicina General
            session.tipoCita = 'medicina general';

            if (session.fechaPreferida && session.tipoCita && !isFreshStart) {
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

                        await replyFn(`Estos son los días disponibles para *Medicina General*:\n\n${dayList}\n\n¿Qué día prefieres?`);
                    } else {
                        await replyFn(`Lo siento, no encontré disponibilidad para Medicina General en esa semana. 😔\n¿Quieres buscar en otra fecha?`);
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
                    
                    const introMsg = `¡He encontrado estos horarios para ti el ${fechaBonita}${timeContext}!\n\nPor favor, responde únicamente con el *NÚMERO* de la opción que prefieres:`;
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
                        
                        const introMsg = `Lo siento, no encontré cupo disponible en la fecha u hora que pediste. 😔\n\nSin embargo, el próximo espacio libre más cercano es el ${fechaAlternativa}. Aquí están los horarios:\n\nPor favor, responde únicamente con el *NÚMERO* de la opción que prefieres:`;
                        await replyFn(`${introMsg}\n\n${slotsList}`);
                    } else {
                        await replyFn(`Lo siento mucho, no encontré citas disponibles para Medicina General ni en esa fecha ni en los próximos 7 días cercanos a ella. 😔\n\n¿Deseas buscar disponibilidad en otro mes o periodo?`);
                        resetAppointmentSession(session);
                    }
                }

            } else if (!session.fechaPreferida) {
                // Mostrar la semana de días disponibles para que el usuario escoja.
                // Se parte desde el primer día con turnos disponibles (puede ser una fecha futura del cronograma).
                const todayStr = new Date().toISOString().split('T')[0];

                // Buscar el primer día con disponibilidad para encontrar el punto de partida del cronograma
                const firstAvail = await availabilityService.getNextAvailableSlots(todayStr, session.tipoCita, session.doctorPreferido);

                if (firstAvail) {
                    // Con el primer día disponible como ancla, obtener la semana completa (7 días desde ahí)
                    const weekDays = await availabilityService.getWeekAvailability(firstAvail.date, session.tipoCita, session.doctorPreferido, 7);

                    if (weekDays.length > 0) {
                        session.diasDisponibles = weekDays;
                        session.step = 'AI_SELECT_DAY';

                        const dayList = weekDays.map((d, i) => {
                            const dateObj = new Date(d.date + 'T12:00:00');
                            const dayNum = dateObj.getDate();
                            const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
                            const mesNom = meses[dateObj.getMonth()];
                            return `${i + 1}) 📅 *${d.dayName} ${dayNum} de ${mesNom}* — ${d.slotCount} horario${d.slotCount > 1 ? 's' : ''} disponible${d.slotCount > 1 ? 's' : ''} (${d.firstSlot} – ${d.lastSlot})`;
                        }).join('\n');

                        const introMsg = `¡Claro que sí! Tengo los siguientes días disponibles para tu cita.`;
                        await replyFn(`${introMsg}\n\n${dayList}\n\n¿Cuál día te queda mejor? Escribe el *número* de tu preferencia.`);
                    } else {
                        // El primer día con slots existe pero getWeekAvailability no devolvió nada (raro), fallback
                        session.step = 'AI_SUGGEST_NEXT_DATE';
                        session.suggestedDate = firstAvail.date;
                        const fechaBonita = formatDateNatural(firstAvail.date);
                        await replyFn(`La primera disponibilidad que tengo es el *${fechaBonita}*.\n\n¿Deseas ver los horarios de ese día, o prefieres buscar en otra fecha?`);
                    }
                } else {
                    session.step = 'AI_ASKING_DATE';
                    await replyFn('¡Claro que sí! ¿Para qué fecha, día de la semana o mes te gustaría agendar tu cita de Medicina General?');
                }
            }
        }

        async function handleConsultarHorarios(userId, message, session, replyFn, preExtracted = null) {
            const entities = preExtracted || (await aiService.extractAll(message)).entities || {};
            // Siempre Medicina General
            const tipo = 'medicina general';
            const fecha = entities.fecha || 'mañana';

            let slots = await availabilityService.getAvailableSlots(fecha, tipo, entities.doctor);
            let responseMsg = "";

            if (slots.length === 0) {
                const nextData = await availabilityService.getNextAvailableSlots(fecha, tipo, entities.doctor);
                if (nextData) {
                    slots = nextData.slots;
                    session.fechaPreferida = nextData.date;
                    responseMsg = `⚠️ No hay horarios para el ${fecha}. Pero encontré esta disponibilidad el *${nextData.date}*:`;
                } else {
                    await replyFn(`Lo siento, no encontré horarios disponibles para ${tipo} en fechas cercanas.`);
                    return;
                }
            } else {
                session.fechaPreferida = fecha;
                responseMsg = `📅 Claro, aquí tienes los horarios disponibles para el ${fecha}:`;
            }

            const slotsToShow = slots.slice(0, 8);
            const slotsText = slotsToShow.map((s, i) => `${i + 1}. ⏰ ${s.time} - ${s.doctorName}`).join('\n');
            await replyFn(`${responseMsg}\n\n${slotsText}\n\nPor favor, responde únicamente con el *NÚMERO* de la opción si deseas agendar alguno:`);

            session.tipoCita = tipo;
            session.doctorPreferido = entities.doctor;
            session.horariosDisponibles = slots;
            session.step = 'AI_SELECT_TIME';
        }

        async function selectTimeSlot(input, availableSlots) {
            const cleanInput = input.trim().toLowerCase();

            // Buscar si el usuario digitó un número suelto (ej "la 3", "opcion 3", "3 porfa", "3")
            const numMatch = cleanInput.match(/(?:opci[oó]n|el|la|quiero la|numero|número)?\s*(\d{1,2})\b/i);
            if (numMatch) {
                const num = parseInt(numMatch[1]);
                const isTimeFormat = cleanInput.includes(':') || cleanInput.includes('am') || cleanInput.includes('pm') || cleanInput.includes('a.m') || cleanInput.includes('p.m');
                // Solo lo tomamos como índice si es un número válido de la lista y menor a 15 y NO parece una hora
                if (!isNaN(num) && num >= 1 && num <= availableSlots.length && num <= 12 && !isTimeFormat) {
                    // Verificación extra: Si el usuario tipeó algo como "a las 8", no queremos que tome '8' como índice 8,
                    if (!cleanInput.includes('las') && !cleanInput.includes('a las')) {
                        return availableSlots[num - 1];
                    } else if (cleanInput.includes('opcion') || cleanInput.includes('opción')) {
                        return availableSlots[num - 1];
                    }
                }
            }

            const ordinals = { 'primera': 0, 'primer': 0, 'segundo': 1, 'segunda': 1, 'tercera': 2, 'tercero': 2, 'cuarta': 3, 'cuarto': 3, 'quinta': 4, 'quinto': 4, 'última': -1, 'ultimo': -1, 'último': -1 };
            for (const [word, idx] of Object.entries(ordinals)) {
                if (cleanInput.includes(word)) {
                    const i = idx === -1 ? availableSlots.length - 1 : idx;
                    if (i < availableSlots.length) return availableSlots[i];
                }
            }

            const hourPatterns = [
                // 1. Matches "A las 9:30" or "9:30 am" or "14:00"
                /(?:a\s+las?|las?)?\s*(\d{1,2})\s*(?::|\.)\s*(\d{2})\s*(am|pm)?/i,
                // 2. Matches "A las 9 y media" or "A las 9"
                /(?:a\s+las?|las?)\s+(\d{1,2})(?:\s*(?:y\s+media))?(am|pm)?/i,
                // 3. Matches "9 am" or "9pm"
                /(\d{1,2})\s*(am|pm)/i,
                // 4. Matches just "9"
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
            console.log(`[BOT] 🚀 Iniciando finalizarCita para userId=${userId}, contacto=${contacto}...`);
            const userData = activeSessions.get(userId);
            if (!userData) {
                console.error(`[BOT] ❌ Error crítico: no se encontró userData para userId=${userId} en finalizarCita`);
                return;
            }

            // Construir objeto paciente desde la sesión (evita re-buscar por LID que puede fallar)
            const pacienteDesdeSession = {
                KC0_COD:     userData.id || userData.cedula,
                KC0_NOM:     userData.name,
                KC0_RES_TEL: userData.phone,
                KC0_ENTIDAD: userData.entidad || null,
                zona:  userData.zona || '001',
                cod:   userData.id || userData.cedula,
                seqk:  ''
            };

            console.log(`[BOT] Datos paciente sesión: cod=${pacienteDesdeSession.KC0_COD}, zona=${pacienteDesdeSession.zona}, fecha=${userData.fechaPreferida}, hora=${userData.horaSeleccionada}, tipo=${userData.tipoCita}, medicoId=${userData.doctorIdSeleccionado}`);
            
            const success = await availabilityService.reserveSlot(
                userData.fechaPreferida,
                userData.horaSeleccionada,
                userId,
                userData.tipoCita,
                userData.doctorIdSeleccionado,
                pacienteDesdeSession   // ← pasar datos de sesión directamente
            );

            console.log(`[BOT] Resultado de reserveSlot: success=${success}`);

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

            const fechaBonita = formatDateNatural(userData.fechaPreferida);
            const phoneDisplay = cleanPhone(contacto);
            const nombreServicio = codigoToNombreServicio(userData.tipoCita);

            try {
                await botPrisma.appointmentLog.create({
                    data: {
                        patientName: userData.name,
                        patientDocument: userData.cedula,
                        doctorId: userData.doctorIdSeleccionado != null ? String(userData.doctorIdSeleccionado) : null,
                        doctorName: userData.doctorNameSeleccionado,
                        appointmentDate: userData.fechaPreferida,
                        appointmentTime: userData.horaSeleccionada,
                        serviceType: nombreServicio,  // usar el nombre legible ya calculado arriba
                        whatsappId: userId
                    }
                });
                console.log(`[BOT] ✅ AppointmentLog guardado correctamente.`);
                // Notificar al frontend en tiempo real
                server.emitAppointmentCreated && server.emitAppointmentCreated();
            } catch(e) {
                console.error('[BOT] Error guardando AppointmentLog:', e.message);
            }

            await reply(
                `✅ *¡Cita agendada exitosamente!*\n\n` +
                `👤 *Paciente:* ${userData.name}\n` +
                `🏥 *Servicio:* ${nombreServicio}\n` +
                `📅 *Fecha:* ${fechaBonita}\n` +
                `🕐 *Hora:* ${userData.horaSeleccionada}\n` +
                `👨‍⚕️ *Doctor:* ${userData.doctorNameSeleccionado || 'Asignado'}\n` +
                `📱 *Contacto:* ${phoneDisplay}\n\n` +
                `Te enviaremos un recordatorio antes de la cita. 😊\n\n` +
                `¿Necesitas agendar otra cita? Puedo hacerlo para ti o para alguien más de la clínica. Solo escíbeme cuando quieras.`
            );

            // Restaurar datos del dueño si se agendó para un tercero
            if (userData.ownerCedula) {
                userData.name   = userData.ownerName;
                userData.cedula = userData.ownerCedula;
                userData.id     = userData.ownerId;
                userData.phone  = userData.ownerPhone;
                userData.zona   = userData.ownerZona;
                userData.ownerName = userData.ownerCedula = userData.ownerId = userData.ownerPhone = userData.ownerZona = null;
            }

            // Garantizar que el status en BD sea 'bot' para que no quede silenciado
            chatService.updateStatus(userId, 'bot').catch(() => {});
            server.emitConversationUpdate && server.emitConversationUpdate({ id: userId, status: 'bot' });

            // Limpiar campos de la cita y dejar la sesión en POST_CONFIRM para ofrecer
            // agendar otra cita. Si el usuario vuelve a escribir (hoy, mañana, en un mes),
            // el ALWAYS-AVAILABLE GUARD del inicio del handler garantiza respuesta.
            userData.tipoCita           = null;
            userData.fechaPreferida     = null;
            userData.horaPreferida      = null;
            userData.horariosDisponibles= null;
            userData.diasDisponibles    = null;
            userData.isRangeRequest     = false;
            userData.originalRangeText  = null;
            userData.doctorPreferido    = null;
            userData.horaSeleccionada   = null;
            userData.doctorIdSeleccionado   = null;
            userData.doctorNameSeleccionado = null;
            userData.step = 'POST_CONFIRM';
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