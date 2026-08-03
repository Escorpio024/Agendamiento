/**
 * META WHATSAPP CLOUD API CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Capa de abstracción sobre la API oficial de Meta WhatsApp Business Cloud API.
 * Reemplaza whatsapp-web.js (Puppeteer) con llamadas HTTP estándar.
 *
 * Ventajas sobre whatsapp-web.js:
 *  - Sin Puppeteer ni Chrome — cero desconexiones
 *  - Sin QR — token permanente en .env
 *  - Escalable — no hay límite de sesión
 *  - Siempre disponible — API serverless de Meta
 * ─────────────────────────────────────────────────────────────────────────────
 */

const https = require('https');
const logger = require('./logger');

const PHONE_NUMBER_ID  = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN     = process.env.WHATSAPP_TOKEN;
const API_VERSION      = 'v20.0';
const API_BASE_HOST    = 'graph.facebook.com';
const API_BASE_PATH    = `/${API_VERSION}`;

if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.error('[META WA] ⚠️  WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN no definidos en .env');
}

// ─── HTTP HELPER (sin dependencias externas) ─────────────────────────────────
function apiRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: API_BASE_HOST,
            port: 443,
            path,
            method,
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type':  'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// ─── NORMALIZAR NÚMERO ────────────────────────────────────────────────────────
/**
 * Convierte cualquier formato de número/JID al formato que espera Meta API:
 * solo dígitos con código de país (ej: 573054321098)
 */
function normalizePhone(phone) {
    if (!phone) return null;

    // Eliminar sufijos de WhatsApp: @c.us, @lid, @s.whatsapp.net
    let digits = String(phone).replace(/@[^@]+$/, '').replace(/\D/g, '');

    if (!digits || digits.length < 7) return null;

    // Quitar ceros al inicio (ej: 0057...)
    digits = digits.replace(/^0+/, '');

    // Si es celular colombiano sin código de país (10 dígitos empezando en 3)
    if (digits.length === 10 && digits.startsWith('3')) {
        digits = `57${digits}`;
    }

    // Mínimo 10 dígitos totales para ser un número válido
    if (digits.length < 10) return null;

    return digits;
}

// ─── ENVIAR MENSAJE DE TEXTO ─────────────────────────────────────────────────
/**
 * Envía un mensaje de texto libre.
 * Solo funciona dentro de la ventana de 24 horas después de que el usuario escribió.
 * @param {string} to   - Número destino (cualquier formato: 573XXX, @c.us, @lid, etc.)
 * @param {string} text - Texto a enviar
 * @returns {Promise<boolean>}
 */
async function sendMessage(to, text) {
    const phone = normalizePhone(to);
    if (!phone) {
        logger.warn(`[META WA] Número inválido para sendMessage: ${to}`);
        return false;
    }

    try {
        const result = await apiRequest(
            `${API_BASE_PATH}/${PHONE_NUMBER_ID}/messages`,
            'POST',
            {
                messaging_product: 'whatsapp',
                recipient_type:    'individual',
                to:                phone,
                type:              'text',
                text: {
                    preview_url: false,
                    body:        text
                }
            }
        );

        if (result.status === 200) {
            logger.info(`[META WA] ✅ Enviado a ${phone}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
            return true;
        } else {
            logger.warn(`[META WA] ❌ Error ${result.status} enviando a ${phone}: ${JSON.stringify(result.body)}`);
            return false;
        }
    } catch (e) {
        logger.error(`[META WA] ❌ Error HTTP sendMessage: ${e.message}`);
        return false;
    }
}

// ─── ENVIAR PLANTILLA ─────────────────────────────────────────────────────────
/**
 * Envía un mensaje de plantilla aprobada por Meta.
 * Obligatorio para mensajes proactivos (recordatorios, campañas) fuera de la ventana 24h.
 *
 * @param {string}   to           - Número destino
 * @param {string}   templateName - Nombre exacto de la plantilla en Meta Business Manager
 * @param {string[]} params       - Variables de la plantilla en orden ({{1}}, {{2}}, ...)
 * @param {string}   langCode     - Código de idioma (default: 'es_CO')
 * @returns {Promise<boolean>}
 */
async function sendTemplate(to, templateName, params = [], langCode = 'es_CO') {
    const phone = normalizePhone(to);
    if (!phone) {
        logger.warn(`[META WA] Número inválido para sendTemplate: ${to}`);
        return false;
    }

    const components = params.length > 0 ? [{
        type:       'body',
        parameters: params.map(p => ({ type: 'text', text: String(p) }))
    }] : [];

    try {
        const result = await apiRequest(
            `${API_BASE_PATH}/${PHONE_NUMBER_ID}/messages`,
            'POST',
            {
                messaging_product: 'whatsapp',
                to:                phone,
                type:              'template',
                template: {
                    name:       templateName,
                    language:   { code: langCode },
                    components
                }
            }
        );

        if (result.status === 200) {
            logger.info(`[META WA] ✅ Template '${templateName}' enviado a ${phone}`);
            return true;
        } else {
            logger.warn(`[META WA] ❌ Error ${result.status} enviando template '${templateName}' a ${phone}: ${JSON.stringify(result.body)}`);
            return false;
        }
    } catch (e) {
        logger.error(`[META WA] ❌ Error HTTP sendTemplate: ${e.message}`);
        return false;
    }
}

// ─── MARCAR COMO LEÍDO ────────────────────────────────────────────────────────
/**
 * Marca un mensaje entrante como leído (genera los dos ✓✓ azules)
 */
async function markAsRead(messageId) {
    if (!messageId) return;
    try {
        await apiRequest(
            `${API_BASE_PATH}/${PHONE_NUMBER_ID}/messages`,
            'POST',
            {
                messaging_product: 'whatsapp',
                status:            'read',
                message_id:        messageId
            }
        );
    } catch (_) {}
}

// ─── DESCARGAR MEDIA ─────────────────────────────────────────────────────────
/**
 * Descarga un archivo multimedia a partir de su media_id de Meta.
 * @param {string} mediaId - ID de la media en el payload del webhook
 * @returns {Promise<Buffer|null>}
 */
async function downloadMedia(mediaId) {
    if (!mediaId) return null;
    try {
        // Paso 1: obtener URL de descarga
        const urlResult = await apiRequest(`${API_BASE_PATH}/${mediaId}`, 'GET');
        if (!urlResult.body?.url) return null;

        // Paso 2: descargar el archivo
        return new Promise((resolve, reject) => {
            const mediaUrl = new URL(urlResult.body.url);
            const options = {
                hostname: mediaUrl.hostname,
                path:     mediaUrl.pathname + mediaUrl.search,
                headers:  { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
            };
            https.get(options, (res) => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            }).on('error', reject);
        });
    } catch (e) {
        logger.error(`[META WA] Error descargando media ${mediaId}: ${e.message}`);
        return null;
    }
}

// ─── VERIFICAR ESTADO (compatibilidad) ────────────────────────────────────────
/**
 * Stub de compatibilidad con el código que usaba client.getState().
 * Con Meta API no existe el concepto de "estado de conexión" — siempre está listo.
 */
function getState() {
    return Promise.resolve('CONNECTED');
}

module.exports = {
    sendMessage,
    sendTemplate,
    markAsRead,
    downloadMedia,
    normalizePhone,
    getState
};
