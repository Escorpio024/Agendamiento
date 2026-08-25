/**
 * CLIENTE WHATSAPP — @whiskeysockets/baileys
 * ─────────────────────────────────────────────────────────────
 * Sin Chrome, sin Puppeteer. Conexion directa via WebSocket.
 *
 * Caracteristicas:
 *  - QR en terminal al primer arranque
 *  - Sesion persistente en .baileys_auth/ (no pide QR al reiniciar)
 *  - Solo procesa mensajes NUEVOS (>= timestamp de arranque)
 *  - Exporta la misma interfaz que meta_wa_client.js
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage,
    isJidGroup,
} = require('@whiskeysockets/baileys');
const { Boom }   = require('@hapi/boom');
const qrcode     = require('qrcode-terminal');
const EventEmitter = require('events');
const logger     = require('./logger');

// Timestamp de arranque (segundos Unix) — ignoramos mensajes anteriores
const startupTimestamp = Math.floor(Date.now() / 1000);

// Cache de mensajes raw para descarga de media
const rawMessageCache = new Map();

// Emitter interno de mensajes nuevos — index.js se suscribe aqui
const messageEmitter = new EventEmitter();
messageEmitter.setMaxListeners(20);

// Socket activo y estado de conexion
let sock = null;
let isConnected = false;

// Promesa que se resuelve cuando el cliente esta listo
let readyResolve;
const readyPromise = new Promise(resolve => { readyResolve = resolve; });

// Logger silencioso para Baileys (evita spam de pino en consola)
const baileysLogger = {
    level: 'silent',
    fatal : () => {}, error : () => {}, warn  : () => {},
    info  : () => {}, debug : () => {}, trace : () => {},
    child : () => baileysLogger,
};

// ─── Conexion ──────────────────────────────────────────────────────────────────
async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState('.baileys_auth');
    const { version }          = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth             : state,
        logger           : baileysLogger,
        printQRInTerminal: false,   // manejamos el QR manualmente
        markOnlineOnConnect: false,
    });

    // Guardar credenciales cada vez que cambian
    sock.ev.on('creds.update', saveCreds);

    // ── Ciclo de vida de la conexion ──
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info('[WA] Escanea el QR con WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            logger.info('[WA] Conectado a WhatsApp.');
            isConnected = true;
            if (readyResolve) { readyResolve(); readyResolve = null; }
        }

        if (connection === 'close') {
            isConnected = false;
            const code = lastDisconnect?.error instanceof Boom
                ? lastDisconnect.error.output?.statusCode
                : null;
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            logger.warn(`[WA] Conexion cerrada (codigo ${code}). Reconectar: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(connect, 3000);  // reintento tras 3 seg
            } else {
                logger.error('[WA] Sesion cerrada. Elimina .baileys_auth/ y reinicia para escanear QR nuevo.');
            }
        }
    });

    // ── Mensajes entrantes ──
    sock.ev.on('messages.upsert', ({ messages, type }) => {
        // 'append'  = historial al conectar   → ignorar
        // 'notify'  = mensajes nuevos en tiempo real → procesar
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Ignorar mensajes propios
            if (msg.key.fromMe) continue;

            // Ignorar grupos
            if (isJidGroup(msg.key.remoteJid)) continue;

            // Ignorar mensajes anteriores al arranque del bot
            const msgTs = Number(msg.messageTimestamp);
            if (msgTs < startupTimestamp) {
                logger.debug(`[WA] Mensaje ignorado (antes del arranque): ${msgTs} < ${startupTimestamp}`);
                continue;
            }

            // Guardar en cache para posible descarga de media
            if (msg.message) {
                rawMessageCache.set(msg.key.id, msg);
                // Limitar cache a 200 mensajes
                if (rawMessageCache.size > 200) {
                    const firstKey = rawMessageCache.keys().next().value;
                    rawMessageCache.delete(firstKey);
                }
            }

            // Emitir mensaje para que index.js lo procese
            messageEmitter.emit('message', msg);
        }
    });
}

// Arrancar conexion
connect().catch(e => logger.error('[WA] Error al iniciar conexion:', e.message));

// ─── Interfaz compatible con meta_wa_client.js ─────────────────────────────────

/**
 * Normaliza numero/JID al formato Baileys: 57XXXXXXXXXX@s.whatsapp.net
 */
function normalizePhone(phone) {
    if (!phone) return null;
    // Si ya es un JID valido, devolverlo
    if (typeof phone === 'string' && phone.includes('@')) {
        // Asegurar sufijo correcto para Baileys
        return phone.replace('@c.us', '@s.whatsapp.net');
    }
    const digits = String(phone).replace(/\D/g, '').replace(/^0+/, '');
    if (!digits || digits.length < 7) return null;
    const phone10 = digits.length >= 10 ? digits.slice(-10) : digits;
    const full = digits.startsWith('57') && digits.length >= 12 ? digits : `57${phone10}`;
    return `${full}@s.whatsapp.net`;
}

/**
 * Envia un mensaje de texto o un payload completo de Baileys.
 * @param {string} to              - Numero/JID destino
 * @param {string|object} content  - Texto plano o payload Baileys ({ text, image, document, ... })
 */
async function sendMessage(to, content) {
    if (!sock) { logger.warn('[WA] sendMessage: socket no disponible.'); return false; }
    const jid = normalizePhone(to);
    if (!jid) { logger.warn(`[WA] Numero invalido: ${to}`); return false; }

    // Normalizar: string → { text: string }, objeto → pasar directo
    const payload = typeof content === 'string' ? { text: content } : content;

    try {
        const result = await sock.sendMessage(jid, payload);
        const preview = typeof content === 'string'
            ? `"${content.substring(0, 60)}${content.length > 60 ? '...' : ''}"`
            : `[${Object.keys(payload).join('/')}]`;
        logger.info(`[WA] Enviado a ${jid}: ${preview}`);
        return result;
    } catch (e) {
        logger.error(`[WA] Error sendMessage a ${jid}: ${e.message}`);
        return false;
    }
}

/**
 * Marca un mensaje como leido (doble check azul).
 * @param {string|object} keyOrId - key del mensaje o su ID
 */
async function markAsRead(keyOrId) {
    if (!sock || !keyOrId) return;
    try {
        // Si recibimos el key completo lo usamos; si es un ID string buscamos en cache
        let key = null;
        if (typeof keyOrId === 'object' && keyOrId.remoteJid) {
            key = keyOrId;
        } else {
            const cached = rawMessageCache.get(String(keyOrId));
            if (cached) key = cached.key;
        }
        if (key) await sock.readMessages([key]);
    } catch (_) {}
}

/**
 * Descarga media de un mensaje.
 * @param {string} msgId - ID del mensaje (buscado en cache)
 */
async function downloadMedia(msgId) {
    const rawMsg = rawMessageCache.get(String(msgId));
    if (!rawMsg) {
        logger.warn(`[WA] downloadMedia: no hay cache para msgId=${msgId}`);
        return null;
    }
    try {
        const buffer = await downloadMediaMessage(rawMsg, 'buffer', {});
        return buffer;
    } catch (e) {
        logger.error(`[WA] Error descargando media: ${e.message}`);
        return null;
    }
}

/**
 * Retorna el estado de conexion.
 */
async function getState() {
    return isConnected ? 'CONNECTED' : 'DISCONNECTED';
}

/**
 * Permite cachear manualmente un mensaje raw (para media).
 */
function cacheRawMessage(msgId, rawMsg) {
    rawMessageCache.set(msgId, rawMsg);
}

module.exports = {
    sock: new Proxy({}, {
        get: (_, prop) => sock ? sock[prop] : undefined,
    }),
    messageEmitter,
    readyPromise,
    sendMessage,
    sendTemplate  : async (to, name, params = []) => sendMessage(to, params.join(' ')),
    markAsRead,
    downloadMedia,
    normalizePhone,
    getState,
    cacheRawMessage,
};
