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
    // Probar con numero completo 57XXXXXXXXXX Y solo 10 digitos
    if (digits.startsWith('57') && digits.length === 12) return digits;
    if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
    return digits;
}

// Prueba con ambos formatos para identificar cuál acepta Onurix
async function probarFormatos(numero, mensaje) {
    const digits = numero.replace(/\D/g, '');
    const formatos = [
        `57${digits}`,   // Con prefijo Colombia
        digits,          // Solo 10 dígitos
        `+57${digits}`,  // Con +57
    ];

    console.log(`\n🔬 Probando formatos para ${numero}:`);
    for (const fmt of formatos) {
        console.log(`   → Formato: ${fmt}`);
        const result = await enviarSMS(fmt, mensaje);
        if (result.success) {
            console.log(`   ✅ Funciona con: ${fmt}`);
            return fmt;
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    return null;
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

    // ── Paso 1: detectar qué formato de número acepta Onurix ──
    console.log('🔬 Detectando formato de número aceptado por Onurix...');
    const digits0 = NUMEROS_PRUEBA[0].replace(/\D/g, '');
    const formatos = [
        `57${digits0}`,    // Colombia con prefijo
        digits0,           // Solo 10 dígitos
        `+57${digits0}`,   // Con +57
    ];

    let formatoCorrecto = null;
    for (const fmt of formatos) {
        console.log(`   → Probando: ${fmt}`);
        const r = await enviarSMS(fmt, MENSAJE_PRUEBA);
        const esReal = r.success && r.json?.data?.phone !== null;
        console.log(`     credits: ${r.json?.data?.credits ?? r.json?.credits} | phone: ${r.json?.data?.phone}`);
        if (esReal) {
            formatoCorrecto = fmt;
            console.log(`   ✅ Formato que entrega el SMS: ${fmt}\n`);
            break;
        }
        if (r.success) {
            console.log(`   ⚠️  API acepta pero phone=null (posiblemente sin entrega real)`);
        }
        await new Promise(r => setTimeout(r, 1500));
    }

    if (!formatoCorrecto) {
        console.log('');
        console.log('⚠️  Todos los formatos devuelven phone=null.');
        console.log('   Esto indica que los créditos son de WhatsApp, no de SMS.');
        console.log('   Revisa en portal.onurix.com si tienes créditos SMS activos.');
        console.log('');
        return;
    }

    // ── Paso 2: enviar a los demás números con el formato correcto ──
    let ok = 1; // ya contamos el primero
    let fail = 0;
    console.log(`📋 Enviando al resto con formato: ${formatoCorrecto.replace(digits0, 'XXXXXXXXXX')}\n`);

    for (let i = 1; i < NUMEROS_PRUEBA.length; i++) {
        const numero = NUMEROS_PRUEBA[i];
        const digs = numero.replace(/\D/g, '');
        const prefijo = formatoCorrecto.replace(digits0, '');
        const fmt = `${prefijo}${digs}`;
        console.log(`📤 Enviando a ${numero} → ${fmt} ...`);
        const result = await enviarSMS(fmt, MENSAJE_PRUEBA);
        if (result.success && result.json?.data?.phone !== null) {
            console.log(`  ✅ ENVIADO correctamente\n`);
            ok++;
        } else if (result.success) {
            console.log(`  ⚠️  Aceptado pero phone=null (posiblemente no entregado)\n`);
            ok++;
        } else {
            console.log(`  ❌ FALLÓ\n`);
            fail++;
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('════════════════════════════════════════════════');
    console.log(`  Resultado: ${ok} aceptado(s), ${fail} fallido(s)`);
    console.log('════════════════════════════════════════════════');
    console.log('');
}

main().catch(console.error);
