/**
 * DIAGNÓSTICO DE RECORDATORIOS
 * Simula el envío sin mandar mensajes reales.
 * Muestra cuántas citas encontraría y si tiene teléfono para cada paciente.
 * Uso: node test_reminders.js
 */
require('dotenv').config();
const prisma = require('./db');
const botPrisma = require('./dbBot');

async function main() {
    // 1. Citas de mañana (misma query que el servicio real)
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrowDec = parseInt(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`);

    console.log(`\n=== DIAGNÓSTICO RECORDATORIOS ===`);
    console.log(`📅 Buscando citas para mañana: ${tomorrowDec}\n`);

    const citas = await prisma.$queryRaw`
        SELECT KC3_MEDICO, KC3_FCH, KC3_HH, KC3_MM,
               KC3_COD, KC3_CONSULTORIO, KC3_USUARIO, KC3_ESTADO
        FROM TMCITASUSUARIOS
        WHERE KC3_FCH = ${tomorrowDec}
          AND (KC3_ESTADO IS NULL OR KC3_ESTADO <> 'CA')
          AND KC3_COD IS NOT NULL
          AND LEN(LTRIM(RTRIM(KC3_COD))) = 14
          AND KC3_COD <> '00000000000000'
          AND CAST(KC3_COD AS BIGINT) > 0
        ORDER BY KC3_HH, KC3_MM
    `;

    console.log(`📊 Total citas encontradas para mañana: ${citas.length}`);

    if (citas.length === 0) {
        console.log('\n⚠️  No hay citas para mañana. Probando con los próximos 7 días...\n');

        // Buscar en próximos 7 días
        for (let i = 2; i <= 8; i++) {
            const dx = new Date();
            dx.setDate(dx.getDate() + i);
            const dec = parseInt(`${dx.getFullYear()}${String(dx.getMonth()+1).padStart(2,'0')}${String(dx.getDate()).padStart(2,'0')}`);

            const c = await prisma.$queryRawUnsafe(`
                SELECT COUNT(*) as total FROM TMCITASUSUARIOS
                WHERE KC3_FCH = ${dec}
                  AND (KC3_ESTADO IS NULL OR KC3_ESTADO <> 'CA')
                  AND KC3_COD <> '00000000000000'
                  AND CAST(KC3_COD AS BIGINT) > 0
            `);
            const total = Number(c[0].total);
            if (total > 0) console.log(`  +${i} días (${dec}): ${total} cita(s)`);
        }
        console.log('');
    }

    // 2. Para cada cita, verificar si tiene teléfono y WA ID
    let sinTelefono = 0, conWhatsApp = 0, soloTel = 0;

    for (const cita of citas) {
        const cod = String(cita.KC3_COD).trim();
        const codSinCeros = cod.replace(/^0+/, '');
        const hh = Number(cita.KC3_HH), mm = Number(cita.KC3_MM);
        const h12 = hh % 12 || 12;
        const period = hh < 12 ? 'AM' : 'PM';
        const hora = `${h12}:${String(mm).padStart(2,'0')} ${period}`;

        // Buscar teléfono
        let telefono = null;
        try {
            const kc5 = await prisma.tKCLIENTESANEXO5.findFirst({
                where: { KC5_RACOD_CLI: { in: [cod, codSinCeros] } }
            });
            const t = kc5?.KC5_TEL_CEL?.trim();
            if (t && !/^0+$/.test(t) && t.replace(/\D/g,'').length >= 7) telefono = t.replace(/\D/g,'');
        } catch (_) {}

        if (!telefono) {
            try {
                const fact = await prisma.tMUSUARIOSFACTURACION.findFirst({
                    where: { OR: [{ KC2_COD: cod }, { KC2_OACOD_NUI: codSinCeros }] }
                });
                const t = fact?.KC2_TEL_RESP?.trim();
                if (t && !/^0+$/.test(t) && t.replace(/\D/g,'').length >= 7) telefono = t.replace(/\D/g,'');
            } catch (_) {}
        }

        // Buscar WA ID en SQLite
        let waId = null;
        if (telefono) {
            try {
                const phone10 = telefono.slice(-10);
                const convs = await botPrisma.conversation.findMany({
                    where: { id: { contains: phone10 } }, take: 1
                });
                if (convs.length > 0) waId = convs[0].id;
            } catch (_) {}
        }

        const status = !telefono ? '❌ SIN TELÉFONO'
            : waId ? `✅ WA: ${waId}`
            : `📱 Solo tel: ${telefono} → ${telefono.length === 10 ? '57'+telefono : telefono}@c.us`;

        console.log(`  [${hora}] Cód: ${cod} | ${status}`);

        if (!telefono) sinTelefono++;
        else if (waId) conWhatsApp++;
        else soloTel++;
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`  ✅ Con WA ID exacto (SQLite):  ${conWhatsApp}`);
    console.log(`  📱 Con teléfono (fallback @c.us): ${soloTel}`);
    console.log(`  ❌ Sin teléfono (no se enviaría): ${sinTelefono}`);
    console.log(`  📨 Total que SE ENVIARÍAN: ${conWhatsApp + soloTel} / ${citas.length}`);

    // 3. Estado del cron (solo informa, no ejecuta)
    console.log(`\n=== ESTADO DEL SERVICIO ===`);
    console.log(`  ⏰ Los recordatorios se envían automáticamente a las 9:00 AM`);
    console.log(`  📋 Para ver el log en VM: pm2 logs aurora-bot | grep Recordatorio`);
}

main()
    .catch(e => console.error('ERROR:', e.message))
    .finally(() => process.exit(0));
