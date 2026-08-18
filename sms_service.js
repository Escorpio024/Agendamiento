/**
 * SERVICIO DE MENSAJERÍA — Onurix (SMS + WhatsApp)
 * ─────────────────────────────────────────────────────────────
 * Proveedor : https://portal.onurix.com
 *
 * Variables de entorno requeridas:
 *   ONURIX_CLIENT                → ID de cliente (ej. 8494)
 *   ONURIX_KEY                   → Clave de API
 *   ONURIX_WA_PHONE_SENDER_ID    → ID de la línea WA en Onurix
 *   SMS_REMINDERS_ENABLED        → 'true' para activar SMS
 *   ONURIX_WA_REMINDERS_ENABLED  → 'true' para activar WhatsApp
 *
 * Endpoints:
 *   SMS : POST https://www.onurix.com/api/v1/send-sms
 *   WA  : POST https://www.onurix.com/api/v1/whatsapp/send/no-template
 */

const https  = require('https');
const logger = require('./logger');

const ONURIX_HOST = 'www.onurix.com';

// ─── Utilidades ───────────────────────────────────────────────────────────────

function normalizarTelefono(phoneNumber) {
    const digits = String(phoneNumber).replace(/\D/g, '');
    if (digits.startsWith('57') && digits.length === 12) return digits;
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    return digits;
}

function httpPost(path, queryParams, body, isJSON = false) {
    return new Promise((resolve) => {
        const query   = new URLSearchParams(queryParams).toString();
        const bodyStr = isJSON ? JSON.stringify(body) : new URLSearchParams(body).toString();

        const options = {
            hostname : ONURIX_HOST,
            path     : `${path}?${query}`,
            method   : 'POST',
            headers  : {
                'Content-Type'   : isJSON ? 'application/json' : 'application/x-www-form-urlencoded',
                'Content-Length' : Buffer.byteLength(bodyStr),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, json: JSON.parse(data), raw: data });
                } catch (_) {
                    resolve({ statusCode: res.statusCode, json: null, raw: data });
                }
            });
        });

        req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));
        req.write(bodyStr);
        req.end();
    });
}

// ─── SMS ──────────────────────────────────────────────────────────────────────

/**
 * Envía un SMS a través de Onurix.
 * Solo actúa si SMS_REMINDERS_ENABLED=true en .env.
 */
async function sendSMS(phoneNumber, message) {
    const enabled = (process.env.SMS_REMINDERS_ENABLED || 'false').toLowerCase() === 'true';
    if (!enabled) {
        logger.info(`[SMS] ⏸️  SMS_REMINDERS_ENABLED=false — no enviado a ${phoneNumber}`);
        return { success: false, skipped: true };
    }

    const client = process.env.ONURIX_CLIENT;
    const key    = process.env.ONURIX_KEY;
    if (!client || !key) {
        logger.error('[SMS] ❌ ONURIX_CLIENT o ONURIX_KEY no configurados');
        return { success: false, error: 'Sin credenciales' };
    }

    const phone = normalizarTelefono(phoneNumber);
    const res = await httpPost(
        '/api/v1/sms/send',  // endpoint correcto (el antiguo /send-sms está deprecated)
        {},                  // sin query params
        { client, key, phone, sms: message } // TODO en el body
    );

    if (res.statusCode === 200 && res.json?.status === 1) {
        logger.info(`[SMS] ✅ Enviado a ${phone} | ID: ${res.json.id}`);
        return { success: true, messageId: res.json.id };
    }
    logger.warn(`[SMS] ⚠️  Error (${res.statusCode}): ${res.raw}`);
    return { success: false, error: res.raw };
}

// ─── WhatsApp (Onurix no-template) ───────────────────────────────────────────

/**
 * Envía un mensaje de WhatsApp de texto libre a través de Onurix.
 * Solo actúa si ONURIX_WA_REMINDERS_ENABLED=true en .env.
 *
 * ⚠️  IMPORTANTE: WhatsApp no-template solo funciona si el paciente
 *    inició conversación con la línea en las últimas 24 horas.
 *    Para mensajes proactivos usa sendWhatsAppTemplate().
 */
async function sendWhatsApp(phoneNumber, message) {
    const enabled = (process.env.ONURIX_WA_REMINDERS_ENABLED || 'false').toLowerCase() === 'true';
    if (!enabled) {
        logger.info(`[OnurixWA] ⏸️  ONURIX_WA_REMINDERS_ENABLED=false — no enviado a ${phoneNumber}`);
        return { success: false, skipped: true };
    }

    const client       = process.env.ONURIX_CLIENT;
    const key          = process.env.ONURIX_KEY;
    const phoneSenderId = process.env.ONURIX_WA_PHONE_SENDER_ID;

    if (!client || !key) {
        logger.error('[OnurixWA] ❌ ONURIX_CLIENT o ONURIX_KEY no configurados');
        return { success: false, error: 'Sin credenciales' };
    }
    if (!phoneSenderId || phoneSenderId === 'PENDIENTE') {
        logger.error('[OnurixWA] ❌ ONURIX_WA_PHONE_SENDER_ID no configurado en .env');
        return { success: false, error: 'ONURIX_WA_PHONE_SENDER_ID pendiente' };
    }

    const phone = normalizarTelefono(phoneNumber);

    const body = {
        phone   : phone,
        message : {
            type  : 'text',
            value : message,
        },
    };

    const res = await httpPost(
        '/api/v1/whatsapp/send/no-template',
        { key, client, 'phone-sender-id': phoneSenderId },
        body,
        true // JSON body
    );

    if (res.statusCode === 200 && res.json?.status === 1) {
        logger.info(`[OnurixWA] ✅ WhatsApp enviado a ${phone} | ID: ${res.json.id}`);
        return { success: true, messageId: res.json.id, json: res.json };
    }
    logger.warn(`[OnurixWA] ⚠️  Error (${res.statusCode}): ${res.raw}`);
    return { success: false, error: res.raw, json: res.json };
}

module.exports = { sendSMS, sendWhatsApp, normalizarTelefono };
