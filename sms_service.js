/**
 * SERVICIO DE SMS — Onurix
 * ─────────────────────────────────────────────────────────────
 * Proveedor : https://portal.onurix.com
 * Endpoint  : POST https://www.onurix.com/api/v1/send-sms
 *
 * Variables de entorno requeridas:
 *   ONURIX_CLIENT          → ID de cliente (ej. 8494)
 *   ONURIX_KEY             → Clave de API
 *   SMS_REMINDERS_ENABLED  → 'true' para activar envíos reales
 *
 * IMPORTANTE: SMS_REMINDERS_ENABLED=false por defecto para no
 * gastar créditos en pruebas o mientras no se necesite.
 */

const https  = require('https');
const logger = require('./logger');

const ONURIX_BASE_URL = 'www.onurix.com';
const ONURIX_PATH     = '/api/v1/send-sms';

/**
 * Envía un SMS a través de Onurix.
 *
 * @param {string} phoneNumber  Número destino con código de país (ej. "573001234567")
 * @param {string} message      Texto del mensaje (máx ~160 caracteres recomendado)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendSMS(phoneNumber, message) {
    // ── Guard: recordatorios desactivados ──
    const enabled = (process.env.SMS_REMINDERS_ENABLED || 'false').toLowerCase() === 'true';
    if (!enabled) {
        logger.info(`[SMS] ⏸️  SMS_REMINDERS_ENABLED=false — SMS simulado (NO enviado) a ${phoneNumber}`);
        return { success: false, skipped: true, reason: 'SMS_REMINDERS_ENABLED=false' };
    }

    const client = process.env.ONURIX_CLIENT;
    const key    = process.env.ONURIX_KEY;

    if (!client || !key) {
        logger.error('[SMS] ❌ ONURIX_CLIENT o ONURIX_KEY no configurados en .env');
        return { success: false, error: 'Credenciales Onurix no configuradas' };
    }

    // Normalizar número: solo dígitos, agregar 57 si es celular colombiano de 10 dígitos
    const rawDigits = String(phoneNumber).replace(/\D/g, '');
    let normalizedPhone;
    if (rawDigits.startsWith('57') && rawDigits.length === 12) {
        normalizedPhone = rawDigits;
    } else if (rawDigits.length === 10 && rawDigits.startsWith('3')) {
        normalizedPhone = `57${rawDigits}`;
    } else {
        normalizedPhone = rawDigits;
    }

    const query   = `key=${encodeURIComponent(key)}&client=${encodeURIComponent(client)}`;
    const body    = new URLSearchParams({ number: normalizedPhone, sms: message }).toString();

    return new Promise((resolve) => {
        const options = {
            hostname : ONURIX_BASE_URL,
            path     : `${ONURIX_PATH}?${query}`,
            method   : 'POST',
            headers  : {
                'Content-Type'   : 'application/x-www-form-urlencoded',
                'Content-Length' : Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode === 200 && json.status === 'success') {
                        logger.info(`[SMS] ✅ Enviado a ${normalizedPhone} | ID: ${json.id || 'N/A'}`);
                        resolve({ success: true, messageId: json.id });
                    } else {
                        logger.warn(`[SMS] ⚠️  Respuesta Onurix (${res.statusCode}): ${data}`);
                        resolve({ success: false, error: json.message || data });
                    }
                } catch (_) {
                    logger.warn(`[SMS] ⚠️  Respuesta no-JSON (${res.statusCode}): ${data}`);
                    resolve({ success: false, error: data });
                }
            });
        });

        req.on('error', (err) => {
            logger.error(`[SMS] ❌ Error de red enviando SMS a ${normalizedPhone}: ${err.message}`);
            resolve({ success: false, error: err.message });
        });

        req.write(body);
        req.end();
    });
}

module.exports = { sendSMS };
