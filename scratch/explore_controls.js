/**
 * Buscar TODAS las tablas que puedan contener datos clínicos CVD
 * incluyendo tablas de historia, controles, variables
 */
const prisma = require('../db');

async function main() {
    console.log('═══ TODAS LAS TABLAS EN HABEJICO ═══\n');

    // Todas las tablas TN (controles)
    try {
        const tn = await prisma.$queryRawUnsafe(`
            SELECT name FROM sys.tables WHERE name LIKE 'TN%' ORDER BY name
        `);
        console.log(`TN (controles): ${tn.map(t=>t.name).join(', ')}`);
    } catch(e) {}

    // Explorar TNCONTROLES - puede tener registros de control CVD
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TNCONTROLES'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TNCONTROLES (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);
        
        const cnt = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS t FROM TNCONTROLES`);
        console.log(`  Registros: ${cnt[0].t}`);
        
        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 2 * FROM TNCONTROLES`);
        console.log(`  Muestra:`, JSON.stringify(sample[0], null, 2).substring(0, 400));
    } catch(e) { console.log('❌ TNCONTROLES:', e.message.substring(0,80)); }

    // TNCONTROLES2
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TNCONTROLES2'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TNCONTROLES2 (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);
        
        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 2 * FROM TNCONTROLES2`);
        console.log(`  Muestra:`, JSON.stringify(sample[0], null, 2).substring(0, 600));
    } catch(e) { console.log('❌ TNCONTROLES2:', e.message.substring(0,80)); }

    // TNFECHASREALESCONTROLES
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TNFECHASREALESCONTROLES'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TNFECHASREALESCONTROLES (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);
        
        const cnt = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS t FROM TNFECHASREALESCONTROLES`);
        console.log(`  Registros: ${cnt[0].t}`);
    } catch(e) { console.log('❌ TNFECHASREALESCONTROLES:', e.message.substring(0,80)); }

    // TMREGISTROATENCIONES - atenciones médicas con diagnósticos
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TMREGISTROATENCIONES'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TMREGISTROATENCIONES (${cols.length} cols) ──`);
        for (const c of cols) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);
        
        const cnt = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS t FROM TMREGISTROATENCIONES WHERE RGA_FCH >= 20260101`);
        console.log(`  Registros 2026: ${cnt[0].t}`);
        
        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 2 * FROM TMREGISTROATENCIONES WHERE RGA_FCH >= 20260101 ORDER BY RGA_FCH DESC`);
        console.log(`  Muestra:`, JSON.stringify(sample[0], null, 2).substring(0, 600));
    } catch(e) { console.log('❌ TMREGISTROATENCIONES:', e.message.substring(0,80)); }

    // TMUSUARIOSASEGURAMIENTO - datos de aseguramiento/programas
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TMUSUARIOSASEGURAMIENTO'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TMUSUARIOSASEGURAMIENTO (${cols.length} cols, primeras 20) ──`);
        for (const c of cols.slice(0,20)) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);
        
        const cnt = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS t FROM TMUSUARIOSASEGURAMIENTO`);
        console.log(`  Total registros: ${cnt[0].t}`);
        
        const sample = await prisma.$queryRawUnsafe(`SELECT TOP 1 * FROM TMUSUARIOSASEGURAMIENTO`);
        console.log(`  Muestra:`, JSON.stringify(sample[0], null, 2).substring(0, 600));
    } catch(e) { console.log('❌ TMUSUARIOSASEGURAMIENTO:', e.message.substring(0,80)); }

    // TMREGISTROADMISION - diagnósticos en admisión
    try {
        const cols = await prisma.$queryRawUnsafe(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'TMREGISTROADMISION'
            ORDER BY ORDINAL_POSITION
        `);
        console.log(`\n── TMREGISTROADMISION (${cols.length} cols) ──`);
        for (const c of cols.slice(0,15)) console.log(`  ${c.COLUMN_NAME} [${c.DATA_TYPE}]`);

        const cnt = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS t FROM TMREGISTROADMISION WHERE RGA_FCH >= 20260101`);
        console.log(`  Registros 2026: ${cnt[0].t}`);
    } catch(e) { console.log('❌ TMREGISTROADMISION:', e.message.substring(0,80)); }

    // Ver tablas con variables tipo FRAMINGHAM (puede ser una vista)
    try {
        const views = await prisma.$queryRawUnsafe(`
            SELECT name, type_desc FROM sys.objects
            WHERE type IN ('V', 'U')
              AND (name LIKE '%FRAMINGHAM%' OR name LIKE '%RIESGO%' OR name LIKE '%CARDIO%' OR name LIKE '%3280%')
        `);
        console.log(`\n\n═══ VISTAS/TABLAS FRAMINGHAM/CARDIO ═══`);
        for (const v of views) console.log(`  ${v.name} [${v.type_desc}]`);
    } catch(e) {}

    await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
