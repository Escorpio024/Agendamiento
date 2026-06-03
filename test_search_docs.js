require('dotenv').config({ quiet: true });
const prisma = require('./db');

async function main() {
    console.log('[DB] Conectando...');

    // Simulando el buildSearchTerms de index.js
    function buildSearchTerms(cedula) {
        const digits = cedula.replace(/\D/g, '');
        const padded = cedula.padStart(14, ' ');
        const digitsPadded = digits ? digits.padStart(14, ' ') : null;
        return [...new Set([cedula, digits, padded, digitsPadded].filter(Boolean))];
    }

    const testDocs = ['AX625900', '445151']; // PA y CE

    for (const doc of testDocs) {
        console.log(`\\n🔍 Buscando documento: ${doc}`);
        const searchTerms = buildSearchTerms(doc);
        console.log(`   Términos generados:`, searchTerms);

        // 1. Buscar en TMUSUARIOSFACTURACION
        const factMatch = await prisma.$queryRawUnsafe(`
            SELECT TOP 1 
                KC2_OACOD_NUI AS nui, 
                KC2_COD AS cod_interno, 
                KC2_PNOMBRE + ' ' + KC2_PAPELLIDO AS nombre
            FROM TMUSUARIOSFACTURACION
            WHERE KC2_OACOD_NUI IN (${searchTerms.map(t => `'${t}'`).join(',')})
               OR KC2_COD IN (${searchTerms.map(t => `'${t}'`).join(',')})
        `).catch(e => { console.error('Error Fact:', e.message); return []; });

        if (factMatch.length > 0) {
            console.log(`   ✅ Encontrado en Facturación:`, factMatch[0]);
        } else {
            console.log(`   ❌ No encontrado en Facturación`);
        }

        // 2. Buscar en TMUSUARIOSASEGURAMIENTO
        const asegMatch = await prisma.$queryRawUnsafe(`
            SELECT TOP 1 
                KC0_COD AS cod, 
                KC0_NOM AS nombre
            FROM TMUSUARIOSASEGURAMIENTO
            WHERE KC0_COD IN (${searchTerms.map(t => `'${t}'`).join(',')})
        `).catch(e => { console.error('Error Aseg:', e.message); return []; });

        if (asegMatch.length > 0) {
            console.log(`   ✅ Encontrado en Aseguramiento:`, asegMatch[0]);
        } else {
            console.log(`   ❌ No encontrado en Aseguramiento`);
        }
    }

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
