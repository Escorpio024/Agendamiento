/**
 * Script de prueba — SMS Onurix
 * Uso: node test_sms.js
 *
 * Endpoint correcto: POST https://www.onurix.com/api/v1/sms/send
 * Todos los parámetros van en el body (form-urlencoded).
 */

require('dotenv').config();
const https = require('https');

const NUMEROS_PRUEBA = [
    '3016404175',
    '3135834781',
    '3235803966',
];

const MENSAJE_PRUEBA =
    'RECORDATORIO: Hola Angel, tiene cita medica manana ' +
    'martes, 26 de agosto de 2026 a las 9:00 AM con Dr. Juan Perez. ' +
    'Llegue 15 min antes. Cancelaciones: escriba a nuestro WhatsApp. ' +
    'ESE Hospital San Rafael de Ebejico.';

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
            resolve({ success: false });
            return;
        }

        const phone = normalizarNumero(numero);

        // Todos los params en el body (form-urlencoded) — según docs Onurix
        const body = new URLSearchParams({ client, key, phone, sms: mensaje }).toString();

        const options = {
            hostname : 'www.onurix.com',
            path     : '/api/v1/sms/send',   // ← endpoint correcto (no deprecated)
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
                console.log(`  ↳ HTTP ${res.statusCode} | ${data}`);
                try {
                    const json = JSON.parse(data);
                    const entregado = res.statusCode === 200 && json?.data?.phone !== null && json?.data?.phone !== undefined;
                    console.log(`     phone: ${json?.data?.phone} | credits: ${json?.data?.credits} | state: ${json?.data?.state}`);
                    resolve({ success: entregado, json });
                } catch (_) {
                    resolve({ success: false, raw: data });
                }
            });
        });

        req.on('error', (err) => {
            console.error(`  ↳ Error de red: ${err.message}`);
            resolve({ success: false });
        });

        req.write(body);
        req.end();
    });
}

async function main() {
    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('  PRUEBA SMS — Onurix  (/api/v1/sms/send)');
    console.log(`  Client : ${process.env.ONURIX_CLIENT}`);
    console.log(`  Key    : ***${(process.env.ONURIX_KEY || '').slice(-8)}`);
    console.log('════════════════════════════════════════════════');
    console.log('');

    let ok = 0, fail = 0;

    for (const numero of NUMEROS_PRUEBA) {
        const phone = normalizarNumero(numero);
        console.log(`📤 Enviando a ${numero} → ${phone} ...`);
        const result = await enviarSMS(numero, MENSAJE_PRUEBA);

        if (result.success) {
            console.log(`  ✅ SMS ENVIADO correctamente\n`);
            ok++;
        } else {
            console.log(`  ❌ FALLÓ\n`);
            fail++;
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('════════════════════════════════════════════════');
    console.log(`  Resultado: ${ok} enviado(s), ${fail} fallido(s)`);
    console.log('════════════════════════════════════════════════');
    console.log('');
}

main().catch(console.error);
