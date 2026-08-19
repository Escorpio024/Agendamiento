/**
 * TEST - Meta WhatsApp Business API
 * ──────────────────────────────────
 * Lee credenciales desde .env
 * Uso: node scratch/test_meta_api.js <numero_destino>
 *      node scratch/test_meta_api.js 573106413385
 */

require('dotenv').config();

const PHONE_NUMBER_ID = process.env.META_WA_PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.META_WA_TOKEN;
const API_VERSION     = process.env.META_WA_API_VERSION || 'v19.0';
const GRAPH_API_URL   = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const destino = process.argv[2];

if (!destino) {
    console.error('\n❌ Uso: node scratch/test_meta_api.js <numero_con_codigo_pais>');
    console.error('   Ejemplo: node scratch/test_meta_api.js 573106413385\n');
    process.exit(1);
}

const toNumber = destino.replace(/\D/g, '');

async function sendTestMessage(to) {
    console.log('\n📡 Meta WhatsApp Business API — Test de Envío');
    console.log('═══════════════════════════════════════════════');
    console.log(`📱 Número destino : ${to}`);
    console.log(`🔑 Phone Number ID: ${PHONE_NUMBER_ID}`);
    console.log(`🌐 URL            : ${GRAPH_API_URL}`);
    console.log(`🔐 Token (inicio) : ${ACCESS_TOKEN?.slice(0, 20)}...`);
    console.log('───────────────────────────────────────────────\n');

    const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
            name: 'hello_world',
            language: { code: 'en_US' }
        }
    };

    console.log('📤 Payload:\n', JSON.stringify(payload, null, 2), '\n');
    console.log('⏳ Enviando...\n');

    try {
        const response = await fetch(GRAPH_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ ¡ÉXITO! Mensaje enviado correctamente.\n');
            console.log('📨 Respuesta Meta:', JSON.stringify(data, null, 2));
            console.log('\n🎉 Message ID:', data?.messages?.[0]?.id);
        } else {
            console.error(`❌ Error HTTP ${response.status}:`);
            console.error(JSON.stringify(data, null, 2));

            // Diagnóstico de errores comunes
            const code = data?.error?.code;
            const msg  = data?.error?.message || '';
            if (code === 190)    console.error('\n💡 Token expirado. Genera uno nuevo en Graph API Explorer.');
            if (code === 133010) {
                console.error('\n💡 El número destino no está en la lista de test recipients.');
                console.error('   → Ve a Meta Developers → WhatsApp → Paso 1 → Destinatario → agrega el número.');
                console.error('   → URL: https://developers.facebook.com/apps/1396738645687561/whatsapp-business/wa-dev-console/');
            }
            if (code === 100)    console.error('\n💡 Parámetro inválido. Verifica Phone Number ID y número destino.');
            if (msg.includes('permission')) console.error('\n💡 Falta permiso. Asegúrate de tener whatsapp_business_messaging.');
        }
    } catch (err) {
        console.error('❌ Error de red:', err.message);
    }
}

sendTestMessage(toNumber);
