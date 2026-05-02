/**
 * Script diagnóstico v2: busca celular en TODAS las tablas posibles
 * Ejecutar con:  node find_phone.js
 */
require('dotenv').config();
const prisma = require('./db');

const CEDULA = '1054478593';
const PHONE  = '3016404175';

const paddedCedula    = CEDULA.padStart(14, ' ');
const paddedCedulaZero= CEDULA.padStart(14, '0');
const searchTerms     = [...new Set([CEDULA, paddedCedula, paddedCedulaZero])];

async function main() {
    console.log(`\n🔍 Buscando teléfono/celular del paciente: ${CEDULA}`);
    console.log(`📞 Número esperado: ${PHONE}`);
    console.log('='.repeat(65));

    // ── 1. TMUSUARIOSASEGURAMIENTO ────────────────────────────────
    console.log('\n[1] TMUSUARIOSASEGURAMIENTO (KC0_RES_TEL / KC0_EM_TEL)');
    const aseg = await prisma.paciente.findFirst({
        where: { OR: searchTerms.map(t => ({ KC0_COD: t })) }
    });
    if (aseg) {
        console.log(`   ✅ KC0_COD="${aseg.KC0_COD}"  KC0_RES_TEL="${aseg.KC0_RES_TEL}"  KC0_EM_TEL="${aseg.KC0_EM_TEL}"`);
    } else {
        console.log('   ❌ No encontrado');
    }

    // ── 2. TMUSUARIOSNUI ──────────────────────────────────────────
    console.log('\n[2] TMUSUARIOSNUI (sin campo celular — solo nombre/código)');
    const nui = await prisma.pacienteNUI.findFirst({
        where: { OR: [
            ...searchTerms.map(t => ({ KCN_COD_NUI: t })),
            ...searchTerms.map(t => ({ KCN_COD: t })),
        ]}
    });
    if (nui) {
        console.log(`   ✅ KCN_COD_NUI="${nui.KCN_COD_NUI}"  KCN_COD="${nui.KCN_COD}"  KCN_NOM="${nui.KCN_NOM}"`);
        console.log(`   KCN_COD_ALT="${nui.KCN_COD_ALT}" (puede ser código de Tercero)`);
    } else {
        console.log('   ❌ No encontrado');
    }

    // ── 3. TMUSUARIOSFACTURACION (KC2_TEL_RESP) ──────────────────
    console.log('\n[3] TMUSUARIOSFACTURACION (KC2_TEL_RESP)');
    try {
        const fact = await prisma.tMUSUARIOSFACTURACION.findFirst({
            where: { OR: [
                ...searchTerms.map(t => ({ KC2_OACOD_NUI: t })),
                ...searchTerms.map(t => ({ KC2_COD: t })),
            ]}
        });
        if (fact) {
            console.log(`   ✅ KC2_COD="${fact.KC2_COD}"  KC2_OACOD_NUI="${fact.KC2_OACOD_NUI}"`);
            console.log(`   KC2_TEL_RESP="${fact.KC2_TEL_RESP}"  KC2_NOM_RESP="${fact.KC2_NOM_RESP}"`);
            console.log(`   KC2_PNOMBRE="${fact.KC2_PNOMBRE}"  KC2_PAPELLIDO="${fact.KC2_PAPELLIDO}"`);
        } else {
            console.log('   ❌ No encontrado');
        }
    } catch (e) {
        console.log(`   ⚠️  ${e.message}`);
    }

    // ── 4. TKCLIENTES (KC_TEL1 a KC_TEL4) ────────────────────────
    console.log('\n[4] TKCLIENTES (KC_TEL1-4)');
    const cliente = await prisma.cliente.findFirst({
        where: { OR: searchTerms.map(t => ({ KC_COD: t })) }
    });
    if (cliente) {
        console.log(`   ✅ KC_COD="${cliente.KC_COD}"  KC_NOM="${cliente.KC_NOM}"`);
        console.log(`   KC_TEL1="${cliente.KC_TEL1}" | KC_TEL2="${cliente.KC_TEL2}" | KC_TEL3="${cliente.KC_TEL3}" | KC_TEL4="${cliente.KC_TEL4}"`);
    } else {
        console.log('   ❌ No encontrado en TKCLIENTES por KC_COD');
    }

    // ── 5. TCTERCEROS3 → TR3_CELULAR ─────────────────────────────
    //    El NUI tiene KCN_COD_ALT que puede ser el código de tercero
    console.log('\n[5] TCTERCEROS3 (TR3_CELULAR) — busca por cédula como tercero');
    try {
        const ter3 = await prisma.tCTERCEROS3.findFirst({
            where: { TR3_TERCERO: { in: searchTerms } }
        });
        if (ter3) {
            console.log(`   ✅ TR3_TERCERO="${ter3.TR3_TERCERO}"  TR3_CELULAR="${ter3.TR3_CELULAR}"  TR3_NOM_MAIL="${ter3.TR3_NOM_MAIL}"`);
        } else {
            console.log('   ❌ No encontrado en TCTERCEROS3');
        }
    } catch(e) {
        console.log(`   ⚠️  ${e.message}`);
    }

    // ── 6. TKCLIENTESADICION (KC6_TEL_CEL) ───────────────────────
    console.log('\n[6] TKCLIENTESADICION (KC6_TEL_CEL)');
    try {
        const kc6 = await prisma.tKCLIENTESADICION.findFirst({
            where: { OR: searchTerms.map(t => ({ KC6_COD: t })) }
        });
        if (kc6) {
            console.log(`   ✅ KC6_COD="${kc6.KC6_COD}"  KC6_TEL_CEL="${kc6.KC6_TEL_CEL}"`);
        } else {
            console.log('   ❌ No encontrado en TKCLIENTESADICION');
        }
    } catch(e) {
        console.log(`   ⚠️  ${e.message}`);
    }

    // ── 7. TKCLIENTESANEXO5 (KC5_TEL_CEL) ───────────────────────
    console.log('\n[7] TKCLIENTESANEXO5 (KC5_TEL_CEL)');
    try {
        const kc5 = await prisma.tKCLIENTESANEXO5.findFirst({
            where: { OR: searchTerms.map(t => ({ KC5_RACOD_CLI: t })) }
        });
        if (kc5) {
            console.log(`   ✅ KC5_RACOD_CLI="${kc5.KC5_RACOD_CLI}"  KC5_TEL_CEL="${kc5.KC5_TEL_CEL}"`);
        } else {
            console.log('   ❌ No encontrado en TKCLIENTESANEXO5');
        }
    } catch(e) {
        console.log(`   ⚠️  ${e.message}`);
    }

    // ── 8. BÚSQUEDA INVERSA por número 3016404175 ─────────────────
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`🔄 BÚSQUEDA INVERSA: ¿En qué tabla está "${PHONE}"?`);

    const asegInv = await prisma.paciente.findFirst({ where: { OR: [
        { KC0_RES_TEL: { contains: PHONE } },
        { KC0_EM_TEL:  { contains: PHONE } },
    ]}});
    console.log(`   TMUSUARIOSASEGURAMIENTO : ${asegInv ? `✅ "${asegInv.KC0_NOM}" (${asegInv.KC0_COD})` : '❌'}`);

    try {
        const factInv = await prisma.tMUSUARIOSFACTURACION.findFirst({ where: { KC2_TEL_RESP: { contains: PHONE } } });
        console.log(`   TMUSUARIOSFACTURACION   : ${factInv ? `✅ "${factInv.KC2_PNOMBRE} ${factInv.KC2_PAPELLIDO}" (NUI: ${factInv.KC2_OACOD_NUI})` : '❌'}`);
    } catch(e) { console.log(`   TMUSUARIOSFACTURACION   : ⚠️  ${e.message}`); }

    const cliInv = await prisma.cliente.findFirst({ where: { OR: [
        { KC_TEL1: { contains: PHONE } }, { KC_TEL2: { contains: PHONE } },
        { KC_TEL3: { contains: PHONE } }, { KC_TEL4: { contains: PHONE } },
    ]}});
    console.log(`   TKCLIENTES              : ${cliInv ? `✅ "${cliInv.KC_NOM}" (${cliInv.KC_COD})` : '❌'}`);

    try {
        const ter3Inv = await prisma.tCTERCEROS3.findFirst({ where: { TR3_CELULAR: { contains: PHONE } } });
        console.log(`   TCTERCEROS3 (TR3_CELULAR): ${ter3Inv ? `✅ Tercero="${ter3Inv.TR3_TERCERO}"` : '❌'}`);
    } catch(e) { console.log(`   TCTERCEROS3             : ⚠️  ${e.message}`); }

    try {
        const kc6Inv = await prisma.tKCLIENTESADICION.findFirst({ where: { KC6_TEL_CEL: { contains: PHONE } } });
        console.log(`   TKCLIENTESADICION (KC6) : ${kc6Inv ? `✅ KC6_COD="${kc6Inv.KC6_COD}"` : '❌'}`);
    } catch(e) { console.log(`   TKCLIENTESADICION       : ⚠️  ${e.message}`); }

    try {
        const kc5Inv = await prisma.tKCLIENTESANEXO5.findFirst({ where: { KC5_TEL_CEL: { contains: PHONE } } });
        console.log(`   TKCLIENTESANEXO5 (KC5)  : ${kc5Inv ? `✅ KC5_RACOD_CLI="${kc5Inv.KC5_RACOD_CLI}"` : '❌'}`);
    } catch(e) { console.log(`   TKCLIENTESANEXO5        : ⚠️  ${e.message}`); }

    console.log('\n' + '='.repeat(65));
    console.log('✅ Diagnóstico completo.');
    await prisma.$disconnect();
}

main().catch(e => {
    console.error('Error fatal:', e.message);
    prisma.$disconnect();
    process.exit(1);
});
