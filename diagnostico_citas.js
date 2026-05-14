/**
 * DIAGNÓSTICO DE CITAS - HABEJICO
 * ================================
 * Este script se conecta directamente a SQL Server y analiza
 * por qué las citas del bot no aparecen en el Visor de Agenda.
 *
 * Uso: node diagnostico_citas.js
 */

require('dotenv').config();
const sql = require('mssql');

// ─── Parsear la DATABASE_URL al formato que mssql entiende ───
function parseConnectionUrl(url) {
    // sqlserver://HOST:PORT;database=DB;user=U;password=P;...
    const hostPort = url.match(/sqlserver:\/\/([^;]+)/)?.[1] || '';
    const [host, port] = hostPort.split(':');
    const get = (key) => url.match(new RegExp(`${key}=([^;]+)`, 'i'))?.[1] || '';
    return {
        server: host,
        port: parseInt(port) || 1433,
        database: get('database'),
        user: get('user'),
        password: get('password'),
        options: {
            encrypt: true,
            trustServerCertificate: true,
            connectTimeout: 30000,
            requestTimeout: 30000
        }
    };
}

const config = parseConnectionUrl(process.env.DATABASE_URL || '');

// ─── Colores en consola ───
const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m',
    green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', magenta: '\x1b[35m'
};
const ok  = (m) => console.log(`${C.green}✅ ${m}${C.reset}`);
const warn = (m) => console.log(`${C.yellow}⚠️  ${m}${C.reset}`);
const err  = (m) => console.log(`${C.red}❌ ${m}${C.reset}`);
const info = (m) => console.log(`${C.cyan}ℹ️  ${m}${C.reset}`);
const sep  = ()  => console.log(`${C.magenta}${'─'.repeat(70)}${C.reset}`);

async function main() {
    console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════════╗`);
    console.log(`║       DIAGNÓSTICO VISOR DE AGENDA - HABEJICO                     ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════╝${C.reset}\n`);

    let pool;
    try {
        info(`Conectando a ${config.server}:${config.port}/${config.database}...`);
        pool = await sql.connect(config);
        ok('Conexión exitosa a SQL Server\n');
    } catch (e) {
        err(`No se pudo conectar: ${e.message}`);
        process.exit(1);
    }

    const hoy = new Date();
    const hoyDecimal = parseInt(`${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}`);

    // ════════════════════════════════════════════════════════
    // 1. CITAS RECIENTES DEL BOT (últimas 72 horas)
    // ════════════════════════════════════════════════════════
    sep();
    console.log(`${C.bold}1. CITAS AGENDADAS POR EL BOT (usuario = 'BOT')${C.reset}`);
    sep();
    try {
        const r1 = await pool.request().query(`
            SELECT TOP 20
                KC3_MEDICO,
                KC3_FCH,
                KC3_HH,
                KC3_MM,
                KC3_COD,
                KC3_SEQK,
                KC3_ZONA,
                KC3_ESTADO,
                KC3_TIPO,
                KC3_TIPO_SERVICIO,
                KC3_GRUPO_ATENCION,
                KC3_GENERADA,
                KC3_USUARIO,
                KC3_OBSERVACION,
                KC3_CONSULTORIO
            FROM TMUSUARIOSCITAS
            WHERE KC3_USUARIO = 'BOT'
            ORDER BY KC3_FCH_D DESC, KC3_HH_D DESC
        `);

        if (r1.recordset.length === 0) {
            warn('No se encontraron citas con KC3_USUARIO = BOT en TMUSUARIOSCITAS');
            warn('El bot puede estar actualizando registros existentes sin cambiar KC3_USUARIO');
        } else {
            ok(`Se encontraron ${r1.recordset.length} cita(s) del BOT:\n`);
            r1.recordset.forEach((c, i) => {
                console.log(`  Cita #${i+1}:`);
                console.log(`    Médico:      ${c.KC3_MEDICO}`);
                console.log(`    Fecha:       ${c.KC3_FCH}  (${String(c.KC3_FCH).slice(0,4)}-${String(c.KC3_FCH).slice(4,6)}-${String(c.KC3_FCH).slice(6,8)})`);
                console.log(`    Hora:        ${c.KC3_HH}:${String(c.KC3_MM).padStart(2,'0')}`);
                console.log(`    KC3_COD:     |${c.KC3_COD}| (len=${String(c.KC3_COD||'').length})`);
                console.log(`    KC3_SEQK:    |${c.KC3_SEQK}|`);
                console.log(`    KC3_ZONA:    |${c.KC3_ZONA}|`);
                console.log(`    Estado:      |${c.KC3_ESTADO}|`);
                console.log(`    Tipo:        ${c.KC3_TIPO} / Servicio: ${c.KC3_TIPO_SERVICIO} / Grupo: ${c.KC3_GRUPO_ATENCION}`);
                console.log(`    Generada:    ${c.KC3_GENERADA}`);
                console.log(`    Observación: ${c.KC3_OBSERVACION}`);
                console.log(`    Consultorio: ${c.KC3_CONSULTORIO}`);
                console.log('');
            });
        }
    } catch(e) { err(`Query 1 falló: ${e.message}`); }

    // ════════════════════════════════════════════════════════
    // 2. COMPARAR: cita del Visor (que SÍ aparece) vs cita del BOT
    // ════════════════════════════════════════════════════════
    sep();
    console.log(`${C.bold}2. CITAS QUE SÍ APARECEN HOY ${hoyDecimal} (muestra de 5 con nombre)${C.reset}`);
    sep();
    try {
        const r2 = await pool.request()
            .input('fch', sql.Decimal(10,0), hoyDecimal)
            .query(`
                SELECT TOP 5
                    KC3_MEDICO, KC3_FCH, KC3_HH, KC3_MM,
                    KC3_COD, KC3_SEQK, KC3_ZONA,
                    KC3_ESTADO, KC3_TIPO, KC3_TIPO_SERVICIO,
                    KC3_GRUPO_ATENCION, KC3_GENERADA, KC3_USUARIO,
                    KC3_CONSULTORIO
                FROM TMUSUARIOSCITAS
                WHERE KC3_FCH = @fch
                  AND KC3_COD IS NOT NULL
                  AND LEN(LTRIM(RTRIM(KC3_COD))) > 0
                  AND KC3_COD NOT LIKE '%[^0-9]%' -- solo numérico
                  AND CAST(KC3_COD AS BIGINT) > 0
                ORDER BY KC3_HH, KC3_MM
            `);

        if (r2.recordset.length === 0) {
            warn(`No hay citas con nombre en la fecha ${hoyDecimal} hoy`);
        } else {
            ok(`Citas con nombre (referencia del Visor):\n`);
            r2.recordset.forEach((c, i) => {
                console.log(`  Ref #${i+1} (aparece en Visor):`);
                console.log(`    KC3_COD:     |${c.KC3_COD}| (len=${String(c.KC3_COD||'').length})`);
                console.log(`    KC3_SEQK:    |${c.KC3_SEQK}|`);
                console.log(`    KC3_ZONA:    |${c.KC3_ZONA}|`);
                console.log(`    Estado:      |${c.KC3_ESTADO}|`);
                console.log(`    Tipo:        ${c.KC3_TIPO} / Servicio: ${c.KC3_TIPO_SERVICIO} / Grupo: ${c.KC3_GRUPO_ATENCION}`);
                console.log(`    Generada:    ${c.KC3_GENERADA}`);
                console.log(`    Consultorio: ${c.KC3_CONSULTORIO}`);
                console.log(`    Usuario:     ${c.KC3_USUARIO}`);
                console.log('');
            });
        }
    } catch(e) { err(`Query 2 falló: ${e.message}`); }

    // ════════════════════════════════════════════════════════
    // 3. SLOTS VACÍOS (sin paciente) HOY Y MAÑANA
    // ════════════════════════════════════════════════════════
    sep();
    const man = new Date(hoy); man.setDate(hoy.getDate()+1);
    const manDecimal = parseInt(`${man.getFullYear()}${String(man.getMonth()+1).padStart(2,'0')}${String(man.getDate()).padStart(2,'0')}`);
    console.log(`${C.bold}3. SLOTS VACÍOS (sin paciente) PARA MAÑANA ${manDecimal}${C.reset}`);
    sep();
    try {
        const r3 = await pool.request()
            .input('fch', sql.Decimal(10,0), manDecimal)
            .query(`
                SELECT TOP 10
                    KC3_MEDICO, KC3_HH, KC3_MM,
                    KC3_COD, KC3_SEQK, KC3_ZONA,
                    KC3_ESTADO, KC3_GENERADA, KC3_USUARIO,
                    KC3_CONSULTORIO
                FROM TMUSUARIOSCITAS
                WHERE KC3_FCH = @fch
                  AND (KC3_COD IS NULL OR LEN(LTRIM(RTRIM(KC3_COD))) = 0
                       OR KC3_COD LIKE '0%' AND LEN(LTRIM(RTRIM(REPLACE(KC3_COD,'0','')))) = 0)
                ORDER BY KC3_HH, KC3_MM
            `);

        if (r3.recordset.length === 0) {
            warn(`No hay slots vacíos pre-generados por Xenco para mañana ${manDecimal}`);
            warn('→ El bot tendrá que crear registros nuevos (modo INSERT)');
        } else {
            ok(`${r3.recordset.length} slots vacíos encontrados para mañana:\n`);
            r3.recordset.forEach((c, i) => {
                console.log(`  Slot #${i+1}: Médico=${c.KC3_MEDICO} | ${c.KC3_HH}:${String(c.KC3_MM).padStart(2,'0')} | COD=|${c.KC3_COD}| SEQK=|${c.KC3_SEQK}| ZONA=|${c.KC3_ZONA}| Gen=${c.KC3_GENERADA} Usr=${c.KC3_USUARIO} Consul=${c.KC3_CONSULTORIO}`);
            });
        }
    } catch(e) { err(`Query 3 falló: ${e.message}`); }

    // ════════════════════════════════════════════════════════
    // 4. VERIFICAR: ¿Existe la cédula del usuario en TMUSUARIOSNUI?
    //    Ingresa manualmente tu cédula para diagnóstico
    // ════════════════════════════════════════════════════════
    sep();
    const CEDULA_PRUEBA = process.env.CEDULA_PRUEBA || ''; // Poner tu cédula aquí o en .env
    console.log(`${C.bold}4. VERIFICAR CÉDULA EN TABLAS DE PACIENTES${C.reset}`);
    sep();

    if (!CEDULA_PRUEBA) {
        warn('Define CEDULA_PRUEBA en .env o edita este script para probar con tu cédula');
        warn('Ejemplo: agrega CEDULA_PRUEBA=1054478593 en tu .env');
    } else {
        info(`Buscando cédula: ${CEDULA_PRUEBA}`);
        const cedPadded = CEDULA_PRUEBA.padStart(14, '0');
        const cedSpace  = CEDULA_PRUEBA.padStart(14, ' ');

        // TMUSUARIOSNUI
        try {
            const rNUI = await pool.request()
                .input('c1', sql.VarChar, CEDULA_PRUEBA)
                .input('c2', sql.VarChar, cedPadded)
                .input('c3', sql.VarChar, cedSpace)
                .query(`
                    SELECT TOP 3 KCN_COD, KCN_COD_NUI, KCN_NOM, KCN_ZONA, KCN_SEQK
                    FROM TMUSUARIOSNUI
                    WHERE KCN_COD_NUI IN (@c1,@c2,@c3)
                       OR KCN_COD IN (@c1,@c2,@c3)
                `);
            if (rNUI.recordset.length) {
                ok('Encontrado en TMUSUARIOSNUI:');
                rNUI.recordset.forEach(r => console.log(`  → COD=${r.KCN_COD} | NUI=${r.KCN_COD_NUI} | NOMBRE=${r.KCN_NOM} | ZONA=${r.KCN_ZONA} | SEQK=${r.KCN_SEQK}`));
            } else {
                warn('NO encontrado en TMUSUARIOSNUI');
            }
        } catch(e) { err(`TMUSUARIOSNUI: ${e.message}`); }

        // TMUSUARIOSFACTURACION
        try {
            const rFact = await pool.request()
                .input('c1', sql.VarChar, CEDULA_PRUEBA)
                .input('c2', sql.VarChar, cedPadded)
                .input('c3', sql.VarChar, cedSpace)
                .query(`
                    SELECT TOP 3 KC2_COD, KC2_OACOD_NUI, KC2_PNOMBRE, KC2_PAPELLIDO, KC2_ZONA, KC2_SEQK, KC2_EPS_POS
                    FROM TMUSUARIOSFACTURACION
                    WHERE KC2_OACOD_NUI IN (@c1,@c2,@c3)
                       OR KC2_COD IN (@c1,@c2,@c3)
                `);
            if (rFact.recordset.length) {
                ok('Encontrado en TMUSUARIOSFACTURACION:');
                rFact.recordset.forEach(r => console.log(`  → COD=${r.KC2_COD} | NUI=${r.KC2_OACOD_NUI} | NOMBRE=${r.KC2_PNOMBRE} ${r.KC2_PAPELLIDO} | ZONA=${r.KC2_ZONA} | SEQK=${r.KC2_SEQK} | EPS=${r.KC2_EPS_POS}`));
            } else {
                warn('NO encontrado en TMUSUARIOSFACTURACION');
            }
        } catch(e) { err(`TMUSUARIOSFACTURACION: ${e.message}`); }

        // CITAS en KC3 con esa cédula
        try {
            const rCitas = await pool.request()
                .input('c1', sql.VarChar, CEDULA_PRUEBA)
                .input('c2', sql.VarChar, cedPadded)
                .input('c3', sql.VarChar, cedSpace)
                .input('fch', sql.Decimal(10,0), hoyDecimal)
                .query(`
                    SELECT TOP 5 KC3_MEDICO, KC3_FCH, KC3_HH, KC3_MM,
                                 KC3_COD, KC3_SEQK, KC3_ZONA, KC3_ESTADO, KC3_USUARIO
                    FROM TMUSUARIOSCITAS
                    WHERE (KC3_COD IN (@c1,@c2,@c3))
                      AND KC3_FCH >= @fch
                    ORDER BY KC3_FCH, KC3_HH
                `);
            if (rCitas.recordset.length) {
                ok(`Se encontraron ${rCitas.recordset.length} cita(s) para esa cédula (desde hoy):`);
                rCitas.recordset.forEach(r => {
                    const fecha = String(r.KC3_FCH);
                    console.log(`  → ${fecha.slice(0,4)}-${fecha.slice(4,6)}-${fecha.slice(6,8)} ${r.KC3_HH}:${String(r.KC3_MM).padStart(2,'0')} | Médico=${r.KC3_MEDICO} | COD=|${r.KC3_COD}| SEQK=|${r.KC3_SEQK}| ZONA=|${r.KC3_ZONA}| Est=${r.KC3_ESTADO} Usr=${r.KC3_USUARIO}`);
                });
            } else {
                err(`NO se encontraron citas para la cédula ${CEDULA_PRUEBA} desde hoy ${hoyDecimal}`);
                info('→ El bot puede haber guardado la cédula con formato diferente (padding de ceros/espacios)');
            }
        } catch(e) { err(`Citas por cédula: ${e.message}`); }
    }

    // ════════════════════════════════════════════════════════
    // 5. TODAS LAS CITAS FUTURAS (revisar qué cédulas hay guardadas)
    // ════════════════════════════════════════════════════════
    sep();
    console.log(`${C.bold}5. CITAS FUTURAS CON NOMBRE (revisar formato KC3_COD)${C.reset}`);
    sep();
    try {
        const r5 = await pool.request()
            .input('fch', sql.Decimal(10,0), hoyDecimal)
            .query(`
                SELECT TOP 15
                    KC3_MEDICO, KC3_FCH, KC3_HH, KC3_MM,
                    KC3_COD, LEN(KC3_COD) as COD_LEN,
                    KC3_SEQK, LEN(KC3_SEQK) as SEQK_LEN,
                    KC3_ZONA, KC3_ESTADO, KC3_USUARIO,
                    KC3_GENERADA, KC3_TIPO
                FROM TMUSUARIOSCITAS
                WHERE KC3_FCH >= @fch
                  AND KC3_COD IS NOT NULL
                  AND LEN(LTRIM(RTRIM(KC3_COD))) > 0
                  AND LTRIM(RTRIM(KC3_COD)) <> '0'
                ORDER BY KC3_FCH, KC3_HH, KC3_MM
            `);

        if (r5.recordset.length === 0) {
            warn('No hay citas futuras con KC3_COD válido');
        } else {
            ok(`${r5.recordset.length} cita(s) futuras con nombre:\n`);
            r5.recordset.forEach((c, i) => {
                const fecha = String(c.KC3_FCH);
                const esBot = c.KC3_USUARIO === 'BOT' ? `${C.yellow}[BOT]${C.reset}` : `${C.green}[Xenco]${C.reset}`;
                console.log(`  ${i+1}. ${fecha.slice(0,4)}-${fecha.slice(4,6)}-${fecha.slice(6,8)} ${c.KC3_HH}:${String(c.KC3_MM).padStart(2,'0')} | Méd=${c.KC3_MEDICO} | COD=|${c.KC3_COD}|(len=${c.COD_LEN}) | SEQK=|${c.KC3_SEQK}|(len=${c.SEQK_LEN}) | ZONA=${c.KC3_ZONA} | Gen=${c.KC3_GENERADA} | Tipo=${c.KC3_TIPO} ${esBot}`);
            });
        }
    } catch(e) { err(`Query 5 falló: ${e.message}`); }

    // ════════════════════════════════════════════════════════
    // 6. VERIFICAR ESTRUCTURA DE CLAVE PRIMARIA DE TMUSUARIOSCITAS
    // ════════════════════════════════════════════════════════
    sep();
    console.log(`${C.bold}6. ESTRUCTURA DE LA TABLA TMUSUARIOSCITAS (claves y constraints)${C.reset}`);
    sep();
    try {
        const r6 = await pool.request().query(`
            SELECT 
                COL_NAME(ic.object_id, ic.column_id) as COLUMN_NAME,
                i.is_primary_key, i.is_unique, i.name as INDEX_NAME
            FROM sys.index_columns ic
            JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            WHERE ic.object_id = OBJECT_ID('TMUSUARIOSCITAS')
            ORDER BY i.is_primary_key DESC, ic.key_ordinal
        `);
        if (r6.recordset.length) {
            ok('Índices y claves de TMUSUARIOSCITAS:');
            r6.recordset.forEach(r => {
                const tipo = r.is_primary_key ? 'PK' : (r.is_unique ? 'UNIQUE' : 'IDX');
                console.log(`  [${tipo}] ${r.INDEX_NAME}: ${r.COLUMN_NAME}`);
            });
        } else {
            warn('No se encontraron índices (tabla puede no existir con ese nombre exacto)');
        }
    } catch(e) {
        err(`Query 6 falló: ${e.message}`);
        info('Intentando con nombre alternativo TMCITAS...');
        try {
            const r6b = await pool.request().query(`
                SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME LIKE '%CITA%' OR TABLE_NAME LIKE '%AGENDA%'
            `);
            if (r6b.recordset.length) {
                info('Tablas relacionadas con CITA/AGENDA encontradas:');
                r6b.recordset.forEach(r => console.log(`  → ${r.TABLE_NAME}`));
            }
        } catch(_) {}
    }

    // ════════════════════════════════════════════════════════
    // 7. RESUMEN Y DIAGNÓSTICO
    // ════════════════════════════════════════════════════════
    sep();
    console.log(`${C.bold}7. RESUMEN DEL DIAGNÓSTICO${C.reset}`);
    sep();
    console.log(`
Qué buscar en los resultados:

  ✅ Si en la sección 1 (citas del BOT) aparecen registros pero NO en el Visor:
     → Problema con KC3_COD (formato incorrecto: espacios, ceros, longitud)
     → Problema con KC3_SEQK (debe coincidir con el que Xenco espera)
     → Problema con KC3_ZONA (zona incorrecta)
     → Problema con KC3_GENERADA (el Visor puede requerir 'G' o null específico)

  ✅ Si en la sección 3 NO hay slots vacíos para días futuros:
     → Xenco no ha generado los slots — el bot hace INSERTs que Xenco ignora
     → Solución: esperar a que Xenco abra la agenda, o hacer INSERT con la 
       misma estructura exacta que usa Xenco

  ✅ Compara KC3_COD en sección 2 (aparece en Visor) vs sección 1 (del bot):
     → Revisa si hay diferencia de padding (espacios vs ceros vs sin padding)
     → Revisa si KC3_SEQK es '' o ' ' o NULL

  ✅ Si en sección 4 la cédula NO está en las tablas de pacientes:
     → El bot no puede encontrar al paciente → no agenda nada
${C.reset}`);

    await pool.close();
    console.log(`${C.green}${C.bold}✅ Diagnóstico completado.${C.reset}\n`);
}

main().catch(e => {
    err(`Error fatal: ${e.message}`);
    process.exit(1);
});
