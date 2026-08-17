/**
 * Script de prueba de SMS — Onurix
 * Uso: node test_sms.js
 *
 * Envía un SMS de prueba a los números indicados usando
 * las credenciales de Onurix del .env, ignorando SMS_REMINDERS_ENABLED.
 */

require('dotenv').config();
const https = require('https');

const ONURIX_BASE_URL = 'www.onurix.com';
const ONURIX_PATH     = '/api/v1/send-sms';

const NUMEROS_PRUEBA = [
    '3016404175',
    '3135834781',
    '3235803966',
];

const MENSAJE_PRUEBA =
    'PRUEBA - Hospital San Rafael de Ebejico: ' +
    'Este es un mensaje de prueba del sistema de recordatorios de citas medicas. ' +
    'Si lo recibio correctamente, el sistema esta funcionando. Gracias.';

function normalizarNumero(num) {
    const digits = num.replace(/\D/g, '');
    if (digits.startsWith('57') && digits.length === 12) return digits;
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    return digits;
}

function enviarSMS(numero, mensaje) {
    return new Promise((resolve) => {
        const client = process.env.ONURIX_CLIENT;
        const key    = process.env.ONURIX_KEY;

        if (!client || !key) {
            console.error('❌  ONURIX_CLIENT u ONURIX_KEY no están en el .env');
            resolve({ success: false, error: 'Sin credenciales' });
            return;
        }

        const normalizado = normalizarNumero(numero);
        const query = `key=${encodeURIComponent(key)}&client=${encodeURIComponent(client)}`;
        const body  = new URLSearchParams({ number: normalizado, sms: mensaje }).toString();

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
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                console.log(`  ↳ HTTP ${res.statusCode} | Respuesta: ${data}`);
                try {
                    const json = JSON.parse(data);
                    resolve({ success: res.statusCode === 200, json, raw: data });
                } catch (_) {
                    resolve({ success: false, raw: data });
                }
            });
        });

        req.on('error', (err) => {
            console.error(`  ↳ Error de red: ${err.message}`);
            resolve({ success: false, error: err.message });
        });

        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('  PRUEBA DE SMS — Onurix');
    console.log(`  Client : ${process.env.ONURIX_CLIENT}`);
    console.log(`  Key    : ${process.env.ONURIX_KEY ? '***' + process.env.ONURIX_KEY.slice(-8) : 'NO CONFIGURADA'}`);
    console.log('════════════════════════════════════════════════');
    console.log('');

    let ok = 0;
    let fail = 0;

    for (const numero of NUMEROS_PRUEBA) {
        const normalizado = normalizarNumero(numero);
        console.log(`📤 Enviando a ${numero} → ${normalizado} ...`);
        const result = await enviarSMS(numero, MENSAJE_PRUEBA);
        if (result.success) {
            console.log(`  ✅ ENVIADO correctamente\n`);
            ok++;
        } else {
            console.log(`  ❌ FALLÓ\n`);
            fail++;
        }
        // Pausa de 2s entre envíos para no saturar la API
        if (NUMEROS_PRUEBA.indexOf(numero) < NUMEROS_PRUEBA.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log('════════════════════════════════════════════════');
    console.log(`  Resultado: ${ok} enviado(s), ${fail} fallido(s)`);
    console.log('════════════════════════════════════════════════');
    console.log('');
}

main().catch(console.error);
