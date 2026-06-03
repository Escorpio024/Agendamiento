const medicalPrisma = require('../db');

const CEDULA   = '1054478593';
const CEDULA14 = CEDULA.padStart(14, '0');

async function main() {
    console.log(`\n🔍 Cédula: ${CEDULA} / ${CEDULA14}\n`);

    const facRows = await medicalPrisma.$queryRawUnsafe(`
        SELECT TOP 5
            KC2_COD         AS cod,
            KC2_OACOD_NUI   AS nui,
            KC2_PNOMBRE     AS nombre,
            KC2_PAPELLIDO   AS apellido,
            KC2_TEL_RESP    AS tel_resp,
            KC2_TEL_ACOMP   AS tel_acomp
        FROM TMUSUARIOSFACTURACION
        WHERE KC2_OACOD_NUI = '${CEDULA}'
           OR KC2_COD = '${CEDULA14}'
        ORDER BY KC2_FCH_DIG DESC
    `);

    console.log('📋 TMUSUARIOSFACTURACION:');
    facRows.forEach(r => {
        console.log(`   Nombre     : ${r.apellido ?? ''} ${r.nombre ?? ''}`);
        console.log(`   NUI        : [${r.nui}]   COD: [${r.cod}]`);
        console.log(`   KC2_TEL_RESP  (tel. responsable): [${r.tel_resp ?? 'null'}]`);
        console.log(`   KC2_TEL_ACOMP (tel. acompañante): [${r.tel_acomp ?? 'null'}]`);
        console.log('');
    });
    if (!facRows.length) console.log('   ⚠️ Sin registros\n');

    const kc5 = await medicalPrisma.$queryRawUnsafe(`
        SELECT TOP 3
            KC5_RACOD_CLI AS cod,
            KC5_TEL_CEL   AS tel_cel
        FROM TKCLIENTESANEXO5
        WHERE KC5_RACOD_CLI IN ('${CEDULA}', '${CEDULA14}')
    `);

    console.log('📋 TKCLIENTESANEXO5:');
    kc5.forEach(r => {
        console.log(`   COD: [${r.cod}]`);
        console.log(`   KC5_TEL_CEL (celular Xenco): [${r.tel_cel ?? 'null'}]`);
    });
    if (!kc5.length) console.log('   ⚠️ Sin registros\n');

    await medicalPrisma.$disconnect();
    console.log('\n✅ Listo.\n');
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
