/**
 * CLIENTE WHATSAPP — whatsapp-web.js (QR + LocalAuth)
 * ─────────────────────────────────────────────────────────────
 * Reemplaza meta_wa_client.js usando whatsapp-web.js con Puppeteer.
 *
 * Características:
 *  - Muestra QR en terminal al primer arranque
 *  - Guarda sesión en disco (.wwebjs_auth/) — no pide QR al reiniciar
 *  - Compatible con Linux headless (--no-sandbox, --disable-gpu)
 *  - Exporta la misma interfaz que meta_wa_client.js
 *
 * En el servidor Linux instalar Chromium antes de correr:
 *   sudo apt-get install -y chromium-browser
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const logger  = require('./logger');

// ─── Crear cliente ─────────────────────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
        ],
    },
});

// ─── Eventos del ciclo de vida ─────────────────────────────────────────────────

client.on('qr', (qr) => {
    logger.info('[WA] Escanea el codigo QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    logger.info('[WA] Autenticado correctamente.');
});

client.on('auth_failure', (msg) => {
    logger.error(`[WA] Fallo de autenticacion: ${msg}`);
});

client.on('ready', () => {
    logger.info('[WA] Cliente WhatsApp listo y conectado.');
});

client.on('disconnected', (reason) => {
    logger.warn(`[WA] Desconectado: ${reason}. Reiniciando...`);
    client.initialize().catch(e =>
        logger.error('[WA] Error al reiniciar tras desconexion:', e.message)
    );
});

// ─── Inicializar ───────────────────────────────────────────────────────────────
client.initialize();

// ─── Promesa "ready" — para esperar antes de usar el cliente ──────────────────
const readyPromise = new Promise((resolve) => {
    client.once('ready', resolve);
});

// ─── Interfaz compatible con meta_wa_client.js ─────────────────────────────────

function normalizePhone(phone) {
    if (!phone) return null;
    if (typeof phone === 'string' && phone.includes('@')) return phone;
    const digits = String(phone).replace(/\D/g, '').replace(/^0+/, '');
    if (!digits || digits.length < 7) return null;
    const phone10 = digits.length >= 10 ? digits.slice(-10) : digits;
    const full = digits.length >= 12 ? digits : `57${phone10}`;
    return `${full}@c.us`;
}

async function sendMessage(to, text) {
    const waId = normalizePhone(to);
    if (!waId) {
        logger.warn(`[WA] Numero invalido para sendMessage: ${to}`);
        return false;
    }
    try {
        await client.sendMessage(waId, text);
        logger.info(`[WA] Enviado a ${waId}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
        return true;
    } catch (e) {
        logger.error(`[WA] Error sendMessage a ${waId}: ${e.message}`);
        return false;
    }
}

async function sendTemplate(to, templateName, params = []) {
    let text = `[${templateName}]`;
    if (params.length > 0) text += ' ' + params.join(' | ');
    return sendMessage(to, text);
}

async function markAsRead(messageId) {
    if (!messageId) return;
    try {
        const chat = await client.getChatById(messageId).catch(() => null);
        if (chat) await chat.sendSeen();
    } catch (_) {}
}

async function downloadMedia(mediaId) {
    logger.warn('[WA] downloadMedia() — descarga directamente en el handler con msg.downloadMedia().');
    return null;
}

async function getState() {
    try {
        return await client.getState();
    } catch (_) {
        return 'DISCONNECTED';
    }
}

module.exports = {
    client,
    readyPromise,
    sendMessage,
    sendTemplate,
    markAsRead,
    downloadMedia,
    normalizePhone,
    getState,
};
