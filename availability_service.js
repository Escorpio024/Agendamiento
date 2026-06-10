const prisma = require('./db');
const logger = require('./logger');

// =========================================
// MÉDICOS EXCLUIDOS DEL BOT (TEMPORAL)
// ─────────────────────────────────────────
// Estos médicos NO serán ofrecidos por el bot a pacientes de Ebejico.
// Razón: están reservados para sedes externas (ej. Sevilla) hasta que
// se implemente la solución multi-sede.
// Para reactivarlos: eliminar su código de este array.
// =========================================
const MEDICOS_EXCLUIDOS_BOT = [
    444,  // MEDICO SEVILLA — reservado para sede Sevilla (pendiente implementación)
];

// =========================================
// CACHE EN MEMORIA (datos semi-estáticos)
// Las CITAS nunca se cachean — siempre tiempo real
// =========================================
const _cache = {
    turnos:       null, turnosExpiry:       0,
    medicos:      null, medicosExpiry:      0,
    especialidades: {}
};
const TTL_TURNOS  = 3  * 60 * 1000; // 3 min  — turnos cambian diario
const TTL_MEDICOS = 30 * 60 * 1000; // 30 min — nombres/estado raramente cambian
const TTL_ESP     = 60 * 60 * 1000; // 60 min — especialidades muy estáticas

/** Devuelve todos los turnos activos/futuros (sin filtro de fecha), cacheados 3 min */
async function _getTurnosCache() {
    const now = Date.now();
    if (_cache.turnos && now < _cache.turnosExpiry) return _cache.turnos;
    try {
        _cache.turnos = await prisma.turnoMedico.findMany({
            orderBy: { TME_FCH: 'desc' }
        });
        _cache.turnosExpiry = now + TTL_TURNOS;
        logger.debug(`[CACHE] Turnos: ${_cache.turnos.length} registros cargados`);
        return _cache.turnos;
    } catch (e) {
        logger.error(`[DB] Error en _getTurnosCache: ${e.message}`);
        return _cache.turnos || [];
    }
}

/** Devuelve todos los médicos activos, cacheados 30 min */
async function _getMedicosCache() {
    const now = Date.now();
    if (_cache.medicos && now < _cache.medicosExpiry) return _cache.medicos;
    try {
        _cache.medicos = await prisma.medico.findMany({ 
            where: { 
                OR: [
                    { MED_EST_ESTADO: 'A' },
                    { MED_EST_ESTADO: null },
                    { MED_EST_ESTADO: '' }
                ]
            } 
        });
        _cache.medicosExpiry = now + TTL_MEDICOS;
        logger.debug(`[CACHE] Médicos: ${_cache.medicos.length} activos cargados`);
        return _cache.medicos;
    } catch (e) {
        logger.error(`[DB] Error en _getMedicosCache: ${e.message}`);
        return _cache.medicos || [];
    }
}

/** Devuelve especialidad por espCod/tipo, cacheada 60 min */
async function _getEspecialidadCache(espCod, tipo) {
    const key = espCod || tipo || '_';
    const now = Date.now();
    if (_cache.especialidades[key] && now < _cache.especialidades[key].exp) {
        return _cache.especialidades[key].val;
    }
    let esp = null;
    try {
        if (espCod) {
            esp = await prisma.especialidad.findFirst({ where: { ESP_COD: espCod } });
            if (!esp && !/^\d+$/.test(tipo || '')) {
                esp = await prisma.especialidad.findFirst({ where: { ESP_NOMBRE: { contains: String(tipo).toUpperCase() } } });
            }
        }
        _cache.especialidades[key] = { val: esp, exp: now + TTL_ESP };
    } catch (e) {
        logger.error(`[DB] Error en _getEspecialidadCache: ${e.message}`);
    }
    return esp;
}

/** Retry automático para errores P1001 (hasta 2 reintentos, 600ms de espera) */
async function _withRetry(fn, label = '') {
    for (let i = 0; i < 3; i++) {
        try { return await fn(); }
        catch (err) {
            if (err.code === 'P1001' && i < 2) {
                logger.warn(`[DB] P1001 en ${label}, reintento ${i + 1}/2...`);
                await new Promise(r => setTimeout(r, 600));
            } else throw err;
        }
    }
}

// =========================================
// UTILIDADES DE FECHA HABEJICO
// Dates stored as Decimal YYYYMMDD
// =========================================

function dateToDecimal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return parseInt(`${y}${m}${d}`);
}

function decimalToDate(decimal) {
    const str = String(Math.trunc(Number(decimal)));
    return new Date(parseInt(str.slice(0, 4)), parseInt(str.slice(4, 6)) - 1, parseInt(str.slice(6, 8)));
}

function toLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function createLocalDate(dateStr, h, m) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const dt = new Date();
    dt.setFullYear(y); dt.setMonth(mo - 1); dt.setDate(d);
    dt.setHours(h, m, 0, 0);
    return dt;
}

function parseRelativeDate(dateStr) {
    const today = new Date();
    const clean = (dateStr || '').toLowerCase().trim();
    if (clean === 'hoy') return toLocalDateStr(today);
    if (clean === 'mañana' || clean === 'manana') {
        const d = new Date(today); d.setDate(today.getDate() + 1); return toLocalDateStr(d);
    }
    if (clean === 'esta semana') return toLocalDateStr(today);
    if (clean === 'próxima semana' || clean === 'proxima semana') {
        const d = new Date(today); d.setDate(today.getDate() + 7); return toLocalDateStr(d);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    
    // Parsear expresiones como "21 de septiembre" si el LLM las devuelve literalmente
    const regexMeses = /(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i;
    const matchMes = clean.match(regexMeses);
    if (matchMes) {
        const day = parseInt(matchMes[1]);
        const mesStr = matchMes[2].toLowerCase();
        const mesesHash = {
            'enero':0, 'febrero':1, 'marzo':2, 'abril':3, 'mayo':4, 'junio':5, 
            'julio':6, 'agosto':7, 'septiembre':8, 'setiembre':8, 'octubre':9, 'noviembre':10, 'diciembre':11
        };
        const month = mesesHash[mesStr];
        let year = today.getFullYear();
        // Si el mes ya pasó en este año (mes < mes actual), asumir el próximo año
        // Comparación corregida: < hoy.getMonth() (no -1) para evitar off-by-one
        if (month < today.getMonth()) year++;
        const d = new Date(year, month, day);
        return toLocalDateStr(d);
    }
    
    // Si la IA devolvió "Viernes" o algo que no es fecha YYYY-MM-DD, intentar parseo manual
    // IMPORTANTE: new Date("YYYY-MM-DD") interpreta como UTC midnight → en Colombia (UTC-5) da el día anterior.
    // Usamos parseo manual local para evitar el desfase de timezone.
    const isoMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        // Parseo local sin conversión UTC
        const parsed = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
        if (!isNaN(parsed) && parsed.getFullYear() > 2000) {
            return toLocalDateStr(parsed);
        }
    }
    // Fallback para strings no-ISO (ej. "May 6, 2026")
    const parsed = new Date(dateStr);
    if (!isNaN(parsed) && parsed.getFullYear() > 2000) {
        // Corregir desfase UTC: agregar offset local en horas
        const localDate = new Date(parsed.getTime() + parsed.getTimezoneOffset() * 60000);
        return toLocalDateStr(localDate);
    }

    // Retorna null explícitamente en lugar de reemplazar silenciosamente por hoy, para evitar 
    // buscar a partir de hoy si el usuario introdujo una fecha no parseable
    return null;
}

function timeLabel(hh, mm) {
    const h12 = hh % 12 || 12;
    const period = hh < 12 ? 'AM' : 'PM';
    return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

// =========================================
// BUSCAR PACIENTE POR TELÉFONO / DOCUMENTO
// =========================================


// =========================================
// HELPER: obtener celular desde TKCLIENTESANEXO5
// Esta tabla almacena KC5_TEL_CEL (campo 'Celular' visible en Xenco > Maestro de Usuarios)
// =========================================
async function getPhoneFromAnexo5(searchTerms) {
    if (!prisma) return null;
    try {
        const rec = await prisma.tKCLIENTESANEXO5.findFirst({
            where: { KC5_RACOD_CLI: { in: searchTerms } }
        });
        if (rec?.KC5_TEL_CEL && !/^0+$/.test(rec.KC5_TEL_CEL.trim())) {
            return rec.KC5_TEL_CEL.trim();
        }
    } catch (_) { /* tabla puede no existir en todos los ambientes */ }
    return null;
}

// =========================================
// ACTUALIZAR CELULAR DEL PACIENTE
// Actualiza KC5_TEL_CEL en TKCLIENTESANEXO5 (campo 'Celular' visible en Xenco)
// =========================================
async function updateCelular(internalCod, newPhone) {
    if (!prisma) return { ok: false, reason: 'db_unavailable' };
    const cleanNew = newPhone.replace(/\D/g, '');
    if (!/^\d{7,15}$/.test(cleanNew)) {
        return { ok: false, reason: 'formato_invalido' };
    }

    // El código puede venir sin padding (ej. 1054478593) o con (00001054478593)
    const padded    = internalCod.padStart(14, '0');
    const spPadded  = internalCod.padStart(14, ' ');
    const searchTerms = [...new Set([internalCod, padded, spPadded])];

    let updated = false;

    // 1. Intentar actualizar en TKCLIENTESANEXO5 (fuente primaria del celular)
    try {
        const result = await prisma.tKCLIENTESANEXO5.updateMany({
            where: { KC5_RACOD_CLI: { in: searchTerms } },
            data:  { KC5_TEL_CEL: cleanNew }
        });
        if (result.count > 0) {
            updated = true;
            logger.info(`[DB] ✅ Celular actualizado en TKCLIENTESANEXO5: cod=${internalCod} -> ${cleanNew} (${result.count} registros)`);
        }
    } catch (e) {
        console.error('[DB] Error actualizando TKCLIENTESANEXO5:', e.message);
    }

    // 2. También actualizar TMUSUARIOSFACTURACION como respaldo
    try {
        const resultFact = await prisma.tMUSUARIOSFACTURACION.updateMany({
            where: { OR: [
                { KC2_COD:      { in: searchTerms } },
                { KC2_OACOD_NUI: internalCod.replace(/^0+/, '') }
            ]},
            data: { KC2_TEL_RESP: cleanNew }
        });
        if (resultFact.count > 0) {
            logger.info(`[DB] ✅ Celular actualizado en TMUSUARIOSFACTURACION: ${resultFact.count} registros`);
            updated = true;
        }
    } catch (e) {
        console.error('[DB] Error actualizando TMUSUARIOSFACTURACION:', e.message);
    }

    return updated
        ? { ok: true, phone: cleanNew }
        : { ok: false, reason: 'no_encontrado' };
}

async function findPaciente(userId) {
    if (!prisma) return null;
    const clean = userId.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
    const phone10 = clean.slice(-10);
    const phone7 = clean.slice(-7);

    // ── 1. Buscar por número de documento o código interno ──
    if (/^\d{5,15}$/.test(clean)) {
        const cleanNoZeros = clean.replace(/^0+/, '');
        const exactPadded = clean.padStart(14, ' ');
        const zeroPadded = clean.padStart(14, '0');
        const searchTerms = [...new Set([clean, cleanNoZeros, exactPadded, zeroPadded])];

        // En TMUSUARIOSNUI
        const byNUI = await prisma.pacienteNUI.findFirst({
            where: { OR: [
                { KCN_COD_NUI: { in: searchTerms } },
                { KCN_COD: { in: searchTerms } }
            ] }
        });
        if (byNUI) {
            const internalCod = byNUI.KCN_COD || byNUI.KCN_COD_NUI;
            // Fuente autoritativa de entidad: TMUSUARIOSASEGURAMIENTO (Maestro de Usuarios)
            const asegParaEntidad = await prisma.paciente.findFirst({ where: { KC0_COD: internalCod } });
            // Fallback: TMUSUARIOSFACTURACION si no hay dato en aseguramiento
            const factParaEntidad = await prisma.tMUSUARIOSFACTURACION.findFirst({
                where: { OR: [
                    { KC2_OACOD_NUI: { in: searchTerms } },
                    { KC2_COD: { in: searchTerms } }
                ] },
                orderBy: { KC2_FCH_DIG: 'desc' }  // Usar el registro más reciente (EPS vigente)
            });
            const entidadFinal = asegParaEntidad?.KC0_ENTIDAD
                ? Number(asegParaEntidad.KC0_ENTIDAD)
                : (factParaEntidad?.KC2_EPS_POS ? Number(factParaEntidad.KC2_EPS_POS) : null);
            // Obtener celular real desde TKCLIENTESANEXO5 (campo visible en Xenco)
            const celularAnexo = await getPhoneFromAnexo5(searchTerms);
            const telFact = factParaEntidad?.KC2_TEL_RESP;
            const realTel = celularAnexo
                || (telFact && !/^0+$/.test(telFact.trim()) ? telFact.trim() : null)
                || null;
            return {
                KC0_COD: internalCod, 
                KC0_NOM: byNUI.KCN_NOM,
                KC0_PNOMBRE: byNUI.KCN_NOM?.split(/[\s,]+/)[0] || 'Paciente',
                KC0_RES_TEL: realTel,
                KC0_ENTIDAD: entidadFinal,
                email: null,
                zona: byNUI.KCN_ZONA || factParaEntidad?.KC2_ZONA || '001',
                cod: internalCod,
                seqk: byNUI.KCN_SEQK || ''
            };
        }

        // En TMUSUARIOSFACTURACION
        const byFact = await prisma.tMUSUARIOSFACTURACION.findFirst({
            where: { OR: [
                { KC2_OACOD_NUI: { in: searchTerms } },
                { KC2_COD: { in: searchTerms } }
            ] },
            orderBy: { KC2_FCH_DIG: 'desc' }  // Usar el registro más reciente
        });
        if (byFact) {
            const nomComp = `${byFact.KC2_PNOMBRE || ''} ${byFact.KC2_PAPELLIDO || ''}`.trim();
            // Obtener celular real desde TKCLIENTESANEXO5
            const celularAnexo = await getPhoneFromAnexo5(searchTerms);
            const telFact = byFact.KC2_TEL_RESP;
            const realTel = celularAnexo
                || (telFact && !/^0+$/.test(telFact.trim()) ? telFact.trim() : null)
                || null;
            return {
                KC0_COD: byFact.KC2_COD, 
                KC0_NOM: nomComp || 'Paciente',
                KC0_PNOMBRE: byFact.KC2_PNOMBRE || byFact.KC2_NOM_RESP?.split(' ')[0] || 'Paciente',
                KC0_RES_TEL: realTel, 
                KC0_ENTIDAD: byFact.KC2_EPS_POS ? Number(byFact.KC2_EPS_POS) : null, 
                email: null,
                zona: byFact.KC2_ZONA, cod: byFact.KC2_COD, seqk: byFact.KC2_SEQK || ''
            };
        }

        // Fallback: TMUSUARIOSASEGURAMIENTO (Por Código)
        const byAseg = await prisma.paciente.findFirst({ 
            where: { KC0_COD: { in: searchTerms } } 
        });
        if (byAseg) {
            return { ...byAseg, email: null, zona: '001', cod: byAseg.KC0_COD, seqk: '' };
        }
    }

    // ── 2. Buscar en TKCLIENTESANEXO5 por celular (fuente principal del número real) ──
    try {
        const kc5ByTel = await prisma.tKCLIENTESANEXO5.findFirst({
            where: { OR: [
                { KC5_TEL_CEL: { contains: phone10 } },
                { KC5_TEL_CEL: { contains: phone7 } }
            ]}
        });
        if (kc5ByTel?.KC5_RACOD_CLI) {
            // Obtener datos completos del paciente por su código interno
            const codPac = kc5ByTel.KC5_RACOD_CLI.trim();
            const nuiByCode  = await prisma.pacienteNUI.findFirst({ where: { KCN_COD: codPac } });
            const factByCode = await prisma.tMUSUARIOSFACTURACION.findFirst({
                where: { KC2_COD: codPac },
                orderBy: { KC2_FCH_DIG: 'desc' }  // Usar el registro más reciente (EPS vigente)
            });
            // Fuente autoritativa de entidad: TMUSUARIOSASEGURAMIENTO (Maestro de Usuarios)
            const asegByCode = await prisma.paciente.findFirst({ where: { KC0_COD: codPac } });
            const entidadFinal = asegByCode?.KC0_ENTIDAD
                ? Number(asegByCode.KC0_ENTIDAD)
                : (factByCode?.KC2_EPS_POS ? Number(factByCode.KC2_EPS_POS) : null);
            const nomComp = nuiByCode?.KCN_NOM
                || (factByCode ? `${factByCode.KC2_PNOMBRE || ''} ${factByCode.KC2_PAPELLIDO || ''}`.trim() : null)
                || 'Paciente';
            return {
                KC0_COD: codPac,
                KC0_NOM: nomComp,
                KC0_PNOMBRE: nomComp.split(/[\s,]+/)[0] || 'Paciente',
                KC0_RES_TEL: kc5ByTel.KC5_TEL_CEL.trim(),
                KC0_ENTIDAD: entidadFinal,
                email: null,
                zona: nuiByCode?.KCN_ZONA || factByCode?.KC2_ZONA || '001',
                cod: codPac,
                seqk: nuiByCode?.KCN_SEQK || factByCode?.KC2_SEQK || ''
            };
        }
    } catch(_) {}

    // ── 3. Buscar en TMUSUARIOSFACTURACION por teléfono ──
    const factByTel = await prisma.tMUSUARIOSFACTURACION.findFirst({
        where: {
            OR: [
                { KC2_TEL_RESP: { contains: phone10 } },
                { KC2_TEL_RESP: { contains: phone7 } }
            ]
        },
        orderBy: { KC2_FCH_DIG: 'desc' }  // Usar el registro más reciente
    });

    if (factByTel) {
        const nomComp = `${factByTel.KC2_PNOMBRE || ''} ${factByTel.KC2_PAPELLIDO || ''}`.trim();
        return {
            KC0_COD: factByTel.KC2_COD, 
            KC0_NOM: nomComp || 'Paciente',
            KC0_PNOMBRE: factByTel.KC2_PNOMBRE || factByTel.KC2_NOM_RESP?.split(' ')[0] || 'Paciente',
            KC0_RES_TEL: factByTel.KC2_TEL_RESP, 
            KC0_ENTIDAD: factByTel.KC2_EPS_POS ? Number(factByTel.KC2_EPS_POS) : null,
            email: null,
            zona: factByTel.KC2_ZONA, cod: factByTel.KC2_COD, seqk: factByTel.KC2_SEQK || ''
        };
    }

    // ── 3. Fallback: TMUSUARIOSASEGURAMIENTO (Por Teléfono) ──
    let aseg = await prisma.paciente.findFirst({ where: { KC0_RES_TEL: { contains: phone10 } } });
    if (!aseg) aseg = await prisma.paciente.findFirst({ where: { KC0_RES_TEL: { contains: phone7 } } });
    if (aseg) {
        const emailRec = await prisma.clienteEmail.findFirst({ where: { KC2_COD: aseg.KC0_COD } });
        return { ...aseg, email: emailRec?.KC2_EMAIL || null, zona: '001', cod: aseg.KC0_COD, seqk: '' };
    }

    return null;
}



// =========================================
// DISPONIBILIDAD
// =========================================

async function getAvailableSlots(fechaStr, tipo = 'medicina general', preferredDoctor = null, skipLimit = false, sede = 'Ebejico', isCVD = false) {
    if (!prisma) return [];
    const dateStr = parseRelativeDate(fechaStr);
    const dateDecimal = dateToDecimal(new Date(dateStr + 'T12:00:00'));

    // 1. Especialidad — cacheada 60 min (muy estática)
    const espCod = normalizeTipoCita(tipo);
    const especialidad = await _getEspecialidadCache(espCod, tipo);

    // 2. Turnos activos — cacheados 3 min, filtrados en JS por fecha
    const allTurnosCache = await _getTurnosCache();
    // Deduplicar: por cada doctor, quedarse solo con el turno MÁS RECIENTE (que define su especialidad actual)
    const turnosPorDoctor = {};
    for (const t of allTurnosCache) {
        if (t.TME_FCH > dateDecimal) continue;
        const key = String(t.TME_CODM);
        if (!turnosPorDoctor[key]) {
            turnosPorDoctor[key] = t;
        }
    }
    
    // Ahora filtramos esos turnos "actuales" por especialidad y sede
    let turnos = Object.values(turnosPorDoctor).filter(t => {
        // El Visor de Agendas SI respeta TME_FCH_FIN. Si un médico se retiró, su FCH_FIN es menor a hoy,
        // aunque siga teniendo slots fantasma generados en TME2 para fechas futuras.
        if (t.TME_FCH_FIN && t.TME_FCH_FIN < dateDecimal) return false;
        
        if (sede === 'Sevilla') return t.TME_CODM == 444;
        return !especialidad || t.TME_ESPECIALIDAD == especialidad.ESP_COD;
    });
    if (sede === 'Sevilla') {
        turnos = turnos.filter(t => t.TME_CODM == 444);
        
        // Fallback vital: Si el médico de Sevilla no tiene cabecera activa en TMTURNOSMEDICOS,
        // lo agregamos manualmente para que pueda leer los slots libres directos del Visor (TME2).
        if (turnos.length === 0) {
            turnos.push({ TME_CODM: 444, TME_DUR_CITA: 20, TME_ESPECIALIDAD: especialidad?.ESP_COD || '999' });
        }
    } else {
        turnos = turnos.filter(t => !MEDICOS_EXCLUIDOS_BOT.includes(Number(t.TME_CODM)));
    }

    // Log de exclusiones para trazabilidad
    const excluidos = Object.values(turnosPorDoctor).filter(t => MEDICOS_EXCLUIDOS_BOT.includes(Number(t.TME_CODM)));
    if (excluidos.length) {
        logger.debug(`[DISPONIBILIDAD] ${excluidos.length} médico(s) excluido(s) del bot en sede ${sede}: ${excluidos.map(t => t.TME_CODM).join(', ')}`);
    }

    if (!turnos.length) return [];

    // 3. Médicos — cacheados 30 min, filtrados en JS
    const allMedicos = await _getMedicosCache();
    const medicoCodes = new Set(turnos.map(t => Number(t.TME_CODM)));
    const medicoMap = {};
    allMedicos.filter(m => medicoCodes.has(Number(m.MED_COD)))
              .forEach(m => { medicoMap[Number(m.MED_COD)] = m; });

    // 4. Filtrar por doctor preferido
    let filteredTurnos = turnos;
    if (preferredDoctor) {
        const name = preferredDoctor.toLowerCase();
        const pref = turnos.filter(t => medicoMap[Number(t.TME_CODM)]?.MED_NOMBRE?.toLowerCase().includes(name));
        if (pref.length) filteredTurnos = pref;
    }

    // 4.5. Filtrar doctores exclusivos de PYP/CVD si no es el bot cardiovascular
    if (!isCVD) {
        const bloqueadosNormal = ['pypmedicos', 'pypenfermeria', 'medicoprueba'];
        filteredTurnos = filteredTurnos.filter(t => {
            const m = medicoMap[Number(t.TME_CODM)];
            if (!m) return true;
            const name = (m.MED_NOMBRE || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
            return !bloqueadosNormal.some(b => name.includes(b));
        });
    }

    // 5. Citas ya agendadas para esa fecha (todas las del día)
    const allCitas = await prisma.cita.findMany({
        where: { KC3_FCH: dateDecimal }
    });

    // Helper: detecta si KC3_COD está vacío (null, espacios, ceros solos, o 0000...)
    const esSlotVacio = (cod) => {
        if (!cod) return true;
        const t = cod.trim();
        return t === '' || /^0+$/.test(t);
    };

    // Separar: citas ocupadas (tienen paciente real, no canceladas)
    const citasOcupadas = allCitas.filter(c => {
        const cancelado = c.KC3_ESTADO && c.KC3_ESTADO.trim() === 'CA';
        if (cancelado) return false;
        return !esSlotVacio(c.KC3_COD);
    });

    // ── FUENTE DE VERDAD: TMTURNOSMEDICOSDETALLE (TME2) ──────────────────────────────────────
    // Lee los slots "Libre" directamente de TME2 — la misma tabla que usa el Visor de Agenda.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    const slotsVaciosPorDoctor = {}; // { doctorId: Set([h*60+m]) }
    let tme2Libres = [];
    try {
        tme2Libres = await prisma.$queryRaw`
            SELECT TME2_CODM, TME2_HH, TME2_MM
            FROM TMTURNOSMEDICOSDETALLE
            WHERE TME2_FCH = ${dateDecimal}
              AND (
                  TME2_COD IS NULL
                  OR LTRIM(RTRIM(TME2_COD)) = ''
                  OR TME2_COD = '00000000000000'
                  OR TRY_CAST(LTRIM(RTRIM(TME2_COD)) AS BIGINT) = 0
              )
        `;
        for (const r of tme2Libres) {
            const key = String(r.TME2_CODM).trim();
            if (!slotsVaciosPorDoctor[key]) slotsVaciosPorDoctor[key] = new Set();
            const tMin = parseInt(r.TME2_HH) * 60 + parseInt(r.TME2_MM);
            slotsVaciosPorDoctor[key].add(tMin);
        }
        logger.debug(`[SLOTS-TME2] ${tme2Libres.length} slots libres en ${Object.keys(slotsVaciosPorDoctor).length} doctores para fecha=${dateDecimal}`);
    } catch (e) {
        logger.warn('[SLOTS-TME2] Error consultando TME2, usando fallback KC3:', e.message);
        // Fallback a KC3 si TME2 falla
        for (const c of allCitas) {
            const cancelado = c.KC3_ESTADO && c.KC3_ESTADO.trim() === 'CA';
            if (esSlotVacio(c.KC3_COD) && !cancelado) {
                const key = String(c.KC3_MEDICO).trim();
                if (!slotsVaciosPorDoctor[key]) slotsVaciosPorDoctor[key] = new Set();
                const tMin = parseInt(c.KC3_HH) * 60 + parseInt(c.KC3_MM);
                slotsVaciosPorDoctor[key].add(tMin);
            }
        }
    }

    // 6. Generar slots
    const now = new Date();
    const slots = [];

    for (const turno of filteredTurnos) {
        const medico = medicoMap[Number(turno.TME_CODM)];
        if (!medico) continue;
        const dur = Number(turno.TME_DUR_CITA) || 20;
        const doctorKey = String(turno.TME_CODM).trim();

        // Log compacto (sin spam por doctor)
        const citasOcupadasDoctor = citasOcupadas.filter(c => String(c.KC3_MEDICO).trim() === doctorKey);
        const todasCitasDoctor = allCitas.filter(c => String(c.KC3_MEDICO).trim() === doctorKey);

        // ── MODO A: Xenco tiene slots pre-generados en KC3 para este doctor ──
        // Usar esos como fuente de verdad (slots vacíos = disponibles en el Visor de Agenda)
        const slotsVaciosDoctor = slotsVaciosPorDoctor[doctorKey];
        if (slotsVaciosDoctor && slotsVaciosDoctor.size > 0) {
            logger.debug(`[SLOTS-KC3] Dr.${medico.MED_NOMBRE?.trim()} | ${slotsVaciosDoctor.size} slots disponibles directo de KC3 (Visor de Agenda)`);
            for (const tMin of [...slotsVaciosDoctor].sort((a, b) => a - b)) {
                const currH = Math.floor(tMin / 60);
                const currM = tMin % 60;
                // Verificar que no esté ocupado por una cita real
                const isBooked = citasOcupadas.some(c => {
                    if (String(c.KC3_MEDICO).trim() !== doctorKey) return false;
                    const cMin = parseInt(c.KC3_HH) * 60 + parseInt(c.KC3_MM);
                    return cMin < tMin + dur && tMin < cMin + dur;
                });
                if (!isBooked) {
                    const slotDate = createLocalDate(dateStr, currH, currM);
                    if (slotDate > now || dateStr !== toLocalDateStr(now)) {
                        slots.push({
                            time: timeLabel(currH, currM),
                            hh: currH, mm: currM,
                            doctorId: Number(turno.TME_CODM),
                            doctorName: medico.MED_NOMBRE?.trim() || `Médico ${turno.TME_CODM}`,
                            especialidadCod: turno.TME_ESPECIALIDAD || especialidad?.ESP_COD,
                            consultorio: turno.TME_CONSULTORIO,
                            duracion: dur,
                            sortValue: tMin
                        });
                    }
                }
            }
            continue; // Ya procesamos este doctor, pasar al siguiente
        }

        if (sede === 'Sevilla') {
            // El usuario requiere que para Sevilla SÓLO se tomen los espacios del Visor (TME2).
            // Si llegamos aquí, el Visor está vacío para este doctor. NO generamos matemáticamente.
            continue;
        }

        // ── MODO B: Xenco no tiene slots pre-generados — generar desde el horario (TMTURNOSMEDICOS) ──
        const franjas = [];
        // Turno mañana: solo si TME_ACTIVIDAD_M está activo (no es null ni 'N')
        const mañanaActiva = turno.TME_ACTIVIDAD_M && turno.TME_ACTIVIDAD_M.trim() !== 'N' && turno.TME_ACTIVIDAD_M.trim() !== '';
        if (mañanaActiva && turno.TME_HH_I != null && turno.TME_HH_F != null) {
            franjas.push({ hi: Number(turno.TME_HH_I), mi: Number(turno.TME_MM_I || 0), hf: Number(turno.TME_HH_F), mf: Number(turno.TME_MM_F || 0) });
        }
        // Turno tarde: solo si TME_ACTIVIDAD_T está activo
        const tardeActiva = turno.TME_ACTIVIDAD_T && turno.TME_ACTIVIDAD_T.trim() !== 'N' && turno.TME_ACTIVIDAD_T.trim() !== '';
        if (tardeActiva && turno.TME_HH_I_A != null && turno.TME_HH_F_A != null) {
            franjas.push({ hi: Number(turno.TME_HH_I_A), mi: Number(turno.TME_MM_I_A || 0), hf: Number(turno.TME_HH_F_A), mf: Number(turno.TME_MM_F_A || 0) });
        }
        // Fallback: si ambos campos de actividad están vacíos, usar las horas directamente
        if (!mañanaActiva && !tardeActiva) {
            if (turno.TME_HH_I != null && turno.TME_HH_F != null) {
                franjas.push({ hi: Number(turno.TME_HH_I), mi: Number(turno.TME_MM_I || 0), hf: Number(turno.TME_HH_F), mf: Number(turno.TME_MM_F || 0) });
            }
            if (turno.TME_HH_I_A != null && turno.TME_HH_F_A != null) {
                franjas.push({ hi: Number(turno.TME_HH_I_A), mi: Number(turno.TME_MM_I_A || 0), hf: Number(turno.TME_HH_F_A), mf: Number(turno.TME_MM_F_A || 0) });
            }
        }

        logger.debug(`[SLOTS-TME] Dr.${medico.MED_NOMBRE?.trim()} | ActM=${turno.TME_ACTIVIDAD_M} ActT=${turno.TME_ACTIVIDAD_T} | Franjas=${franjas.length} | Dur=${dur}min (modo template)`);

        // Tiempos KC3 conocidos para este doctor (slots que realmente existen en el Visor de Agenda)
        const kc3Times = new Set(
            allCitas
                .filter(c => String(c.KC3_MEDICO).trim() === doctorKey)
                .map(c => parseInt(c.KC3_HH) * 60 + parseInt(c.KC3_MM))
        );
        const doctorTieneKC3 = kc3Times.size > 0;

        for (const f of franjas) {
            // Pre-calcular todos los slots posibles de esta franja
            const slotsFragma = [];
            let t = f.hi * 60 + f.mi;
            const endMin = f.hf * 60 + f.mf;
            while (t + dur <= endMin) { slotsFragma.push(t); t += dur; }

            // Si el doctor tiene KC3 para esta fecha, detectar huecos en MEDIO del horario
            // Un hueco "eliminado" es: 2+ slots SIN KC3 que tienen citas ANTES y DESPUÉS
            // Los huecos al FINAL del horario son simplemente slots sin reservar → NO eliminar
            const esHuecoEliminado = new Set();
            if (doctorTieneKC3) {
                let racha = [];
                for (const st of slotsFragma) {
                    if (!kc3Times.has(st)) {
                        racha.push(st);
                    } else {
                        // Hay registro KC3 DESPUÉS del hueco → el hueco es intermedio (almuerzo/pausa)
                        if (racha.length >= 2) {
                            racha.forEach(s => esHuecoEliminado.add(s));
                        }
                        racha = []; // reset
                    }
                }
                // Los slots de racha al final NO se marcan (son disponibles sin reservar)
            }

            for (const totalMin of slotsFragma) {
                const currH = Math.floor(totalMin / 60);
                const currM = totalMin % 60;

                if (esHuecoEliminado.has(totalMin)) {
                    logger.debug(`[SLOT-SKIP] Dr.${medico.MED_NOMBRE?.trim()} ${timeLabel(currH, currM)} → hueco eliminado del Visor (almuerzo/pausa)`);
                    continue;
                }

                const isBooked = citasOcupadas.some(c => {
                    if (String(c.KC3_MEDICO).trim() !== doctorKey) return false;
                    const cMin = parseInt(c.KC3_HH) * 60 + parseInt(c.KC3_MM);
                    return cMin < totalMin + dur && totalMin < cMin + dur;
                });

                if (!isBooked) {
                    const slotDate = createLocalDate(dateStr, currH, currM);
                    if (slotDate > now || dateStr !== toLocalDateStr(now)) {
                        slots.push({
                            time: timeLabel(currH, currM),
                            hh: currH, mm: currM,
                            doctorId: Number(turno.TME_CODM),
                            doctorName: medico.MED_NOMBRE?.trim() || `Médico ${turno.TME_CODM}`,
                            especialidadCod: turno.TME_ESPECIALIDAD || especialidad?.ESP_COD,
                            consultorio: turno.TME_CONSULTORIO,
                            duracion: dur,
                            sortValue: totalMin
                        });
                    }
                }
            }
        }
    }


    slots.sort((a, b) => a.sortValue - b.sortValue);

    // Limitar: seleccionar opciones variadas por hora para no dar solo 7:00 AM
    // Máximo 1 slot por hora exacta (para dar variedad al paciente) y 8~10 en total
    if (!skipLimit) {
        const slotsPorHora = {};
        const slotsFinal = [];

        for (const slot of slots) {
            const timeKey = slot.time;
            if (!slotsPorHora[timeKey]) {
                slotsFinal.push(slot);
                slotsPorHora[timeKey] = true;
                if (slotsFinal.length >= 10) break; // Máximo 10 horas distintas
            }
        }

        return slotsFinal;
    }

    return slots;
}

// =========================================
// RESERVAR CITA
// =========================================

// Mapear especialidad a los campos nativos del Visor de Agenda
function getFieldsByEspecialidad(espCod) {
    const codRaw = String(espCod || '').trim();
    const parts = codRaw.split('|');
    const cod = parts[0];
    const subCodigo = parts[1];

    // Odontología: ESP_COD 461
    if (cod === '461') return {
        KC3_TIPO:           'VOS',  // Visita Odontología
        KC3_TIPO_SERVICIO:  211,
        KC3_GRUPO_ATENCION: 'O',
        KC3_ARTIC:          '*230101',
        KC3_C_COSTO:        '7312',
    };
    // PyP / Riesgo Cardiovascular
    if (cod === 'PYP_CARDIO') return {
        KC3_TIPO:           'VD',
        KC3_TIPO_SERVICIO:  201,
        KC3_GRUPO_ATENCION: 'O',
        KC3_ARTIC:          subCodigo || '890301-7',
        KC3_C_COSTO:        '7310',
    };
    // Medicina General (999), Pediatría (510), Ginecología (280), etc.
    // Valor nativo confirmado: TIPO='VD', GRUPO='O'
    return {
        KC3_TIPO:           'VD',
        KC3_TIPO_SERVICIO:  201,
        KC3_GRUPO_ATENCION: 'O',
        KC3_ARTIC:          '890201',
        KC3_C_COSTO:        '7310',
    };
}

async function reserveSlot(fechaStr, hora, userId, tipo = 'medicina general', medicoId = null, pacienteData = null, sede = 'Ebejico', isCVD = false) {
    if (!prisma) return false;
    try {
        const dateStr = parseRelativeDate(fechaStr);
        const dateDecimal = dateToDecimal(new Date(dateStr + 'T12:00:00'));

        // Resolver hora
        let hh = 0, mm = 0;
        const m12 = hora.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        const m24 = hora.match(/(\d{1,2}):(\d{2})/);
        if (m12) {
            hh = parseInt(m12[1]); mm = parseInt(m12[2]);
            if (m12[3].toUpperCase() === 'PM' && hh < 12) hh += 12;
            if (m12[3].toUpperCase() === 'AM' && hh === 12) hh = 0;
        } else if (m24) {
            hh = parseInt(m24[1]); mm = parseInt(m24[2]);
        } else {
            console.error('[HABEJICO] reserveSlot falló: Formato de hora inválido:', hora);
            return false;
        }

        // Buscar paciente: usar datos de sesión si los tenemos (evita fallo con LIDs de WhatsApp)
        let paciente = pacienteData || null;
        if (!paciente) {
            paciente = await findPaciente(userId);
        }
        if (!paciente) {
            console.error('[HABEJICO] reserveSlot falló: no se encontró paciente para userId=', userId);
            return false;
        }
        logger.debug(`[HABEJICO] reserveSlot: paciente.KC0_COD="${paciente.KC0_COD}" zona="${paciente.zona}" sede="${sede}"`);

        // Validar slot disponible
        const slots = await getAvailableSlots(dateStr, tipo, null, true, sede, isCVD);
        let slot = medicoId
            ? slots.find(s => s.doctorId === Number(medicoId) && s.hh === hh && s.mm === mm)
            : slots.find(s => s.hh === hh && s.mm === mm);
        if (!slot) {
            console.error('[HABEJICO] reserveSlot falló: Slot no encontrado en array de disponibilidad para', { hh, mm, medicoId, tipo, slotsCount: slots.length });
            return false;
        }

        // Xenco por lo general usa string vacío '' para la cita del día independientemente,
        // ya que el horario HH y MM son únicos, permitiendo evitar problemas de correlatividad.
        const seqk = '';

        const zonaUsar = (paciente.zona || '99').substring(0, 3);

        // Generar timestamp Habejico: HHMMSSCC (hora sistema en decimal)
        const now = new Date();
        const hhSist = now.getHours();
        const mmSist = now.getMinutes();
        const ssSist = now.getSeconds();
        const horaSist = hhSist * 1000000 + mmSist * 10000 + ssSist * 100;
        const fchDecimalHoy = dateToDecimal(now);

        // Resolver entidad del paciente — priorizar KC0_ENTIDAD real, fallback 0
        const entidadPac = paciente.KC0_ENTIDAD ? Number(paciente.KC0_ENTIDAD) : 0;

        // Resolver contrato y secuencia según la entidad (EPS) del paciente
        // Mapa de contratos por entidad confirmados desde citas nativas en BD Xenco
        const contratoPorEntidad = {
            235:  { num: 'RS-0159-2026',       seq: 0 },  // ALIANZA MEDELLIN ANTIOQUIA EPS S.A.S (contrato 2026, Seq=0 según citas nativas)
            141:  { num: '01_EVN_890982370',    seq: 2 },  // NUEVA EPS S.A. (con punto)
            341:  { num: 'Contrato',            seq: 0 },  // NUEVA EPS S.A (sin punto, subsidiada)
            265:  { num: 'RC-0160-2026',        seq: 3 },  // ALIANZA CONTRIBUTIVO
            550:  { num: '0474-2025',           seq: 1 },  // ALIANZA otra variante
        };
        const contratoInfo = contratoPorEntidad[entidadPac] || { num: '0152-2025', seq: 2 };

        // Campos nativos según especialidad
        const espCod = slot.especialidadCod || null;
        
        // Usar 'tipo' si viene formateado para un artículo específico (ej. PYP_CARDIO|...), o si es PYP_CARDIO, de lo contrario el espCod del slot
        const tipoArticulo = (tipo && (tipo.includes('|') || tipo === 'PYP_CARDIO')) ? tipo : espCod;
        const fieldsEsp = getFieldsByEspecialidad(tipoArticulo);

        const citaData = {
            KC3_ZONA:             zonaUsar,
            KC3_COD:              String(paciente.KC0_COD).trim().padStart(14, '0'),
            KC3_SEQK:             seqk,
            KC3_ESPECIALISTA:     espCod,
            KC3_ESTADO:           null,
            KC3_TIPO:             fieldsEsp.KC3_TIPO,
            KC3_TIPO_SERVICIO:    fieldsEsp.KC3_TIPO_SERVICIO,
            KC3_CAUSAL_ATENC:     2,
            KC3_CARGART_EPS:      'C',
            KC3_GRUPO_ATENCION:   fieldsEsp.KC3_GRUPO_ATENCION,
            KC3_C_COSTO:          fieldsEsp.KC3_C_COSTO,
            KC3_ARTIC:            fieldsEsp.KC3_ARTIC,
            KC3_OBSERVACION:      `WhatsApp - ${tipo}`.substring(0, 60),
            KC3_USUARIO:          'AURORA',
            KC3_ENTIDAD:          entidadPac,
            KC3_ENTIDAD_OLD:      entidadPac,
            KC3_NUM:              0,              // 0 = sin número de factura → Documento muestra solo 'VD'
            KC3_NUM_TURNO:        0,
            KC3_VALOR:            54600,
            KC3_GENERADA:         'G',
            KC3_FCH_D:            fchDecimalHoy,
            KC3_HH_D:             hhSist,
            KC3_MM_D:             mmSist,
            KC3_HORA_SIST:        horaSist,
            KC3_TERMINAL:         'BOT',   // max 3 chars — no cabe AURORA
            KC3_ONCOD_NUM_CTA:    0,
            KC3_NUM_CONTRATO:     contratoInfo.num,
            KC3_SEQ_TME2:         1,
            KC3_SEQ_CONTRATO:     contratoInfo.seq,
            KC3_COD_PROGRAMA:     0,
            KC3_COD_BARRIO:       0,
            KC3_EDADFIN:          0,
            KC3_FCH_ANUL:         0
        };

        // MODO A: Si Xenco tiene un slot pre-generado vacío para esta hora, ACTUALIZARLO
        // Un slot es "libre" si KC3_COD está vacío/ceros O si fue cancelado (KC3_ESTADO='CA')
        const esSlotVacioFn = (cod, estado) => {
            if (estado === 'CA') return true;  // ← cancelado = disponible para nueva reserva
            if (!cod) return true;
            const t = String(cod).trim();
            return t === '' || /^0+$/.test(t);
        };

        const slotExistente = await prisma.cita.findFirst({
            where: {
                KC3_MEDICO: slot.doctorId,
                KC3_FCH:    dateDecimal,
                KC3_HH:     hh,
                KC3_MM:     mm
            }
        });

        if (slotExistente?.KC3_ESTADO === 'CA') {
            logger.info(`[HABEJICO] 🔄 Slot cancelado encontrado para médico=${slotExistente.KC3_MEDICO} ${hh}:${mm} — se reutilizará`);
        }

        const debeActualizar = slotExistente && esSlotVacioFn(slotExistente.KC3_COD, slotExistente.KC3_ESTADO);

        let slotAActualizar = slotExistente;
        let medicoActualizar = slot.doctorId;

        if (!debeActualizar) {
            // MODO FALLBACK: buscar cualquier slot vacío o cancelado en esa hora
            const slotVacioAlternativo = await prisma.cita.findFirst({
                where: {
                    KC3_FCH: dateDecimal,
                    KC3_HH:  hh,
                    KC3_MM:  mm
                }
            });

            if (slotVacioAlternativo && esSlotVacioFn(slotVacioAlternativo.KC3_COD, slotVacioAlternativo.KC3_ESTADO)) {
                slotAActualizar = slotVacioAlternativo;
                medicoActualizar = slotVacioAlternativo.KC3_MEDICO;
                logger.info(`[HABEJICO] 🔄 Slot vacío alternativo encontrado para médico=${medicoActualizar} ${hh}:${mm} (el slot real de Xenco)`);
            }
        }

        const debeActualizarFinal = slotAActualizar && esSlotVacioFn(slotAActualizar.KC3_COD, slotAActualizar.KC3_ESTADO);

        if (debeActualizarFinal) {
            const whereUpdate = { 
                KC3_MEDICO: medicoActualizar, 
                KC3_FCH: dateDecimal, 
                KC3_HH: hh, 
                KC3_MM: mm 
            };

            // Preservar el médico y consultorio originales del slot de Xenco para no romper la agenda
            const citaDataFinal = {
                ...citaData,
                KC3_MEDICO: medicoActualizar,  // mantener el médico del slot original de Xenco
                KC3_CONSULTORIO: slotAActualizar.KC3_CONSULTORIO || slot.consultorio || null,
            };

            const updateResult = await prisma.cita.updateMany({ where: whereUpdate, data: citaDataFinal });
            
            if (updateResult.count > 0) {
                logger.info(`[HABEJICO] ✅ Slot ACTUALIZADO (médico=${medicoActualizar} ${hh}:${mm}) -> paciente=${paciente.KC0_COD}`);
            } else {
                logger.warn(`[HABEJICO] ⚠️ updateMany no afectó filas. Creando nueva fila...`);
                await prisma.cita.create({
                    data: {
                        KC3_MEDICO: slot.doctorId,
                        KC3_FCH:    dateDecimal,
                        KC3_HH:     hh,
                        KC3_MM:     mm,
                        KC3_CONSULTORIO: slot.consultorio || null,
                        ...citaData
                    }
                });
                logger.info(`[HABEJICO] ✅ Nueva cita CREADA (fallback): médico=${slot.doctorId} ${hh}:${mm}`);
            }
        } else {
            await prisma.cita.create({
                data: {
                    KC3_MEDICO: slot.doctorId,
                    KC3_FCH:    dateDecimal,
                    KC3_HH:     hh,
                    KC3_MM:     mm,
                    KC3_CONSULTORIO: slot.consultorio || null,
                    ...citaData
                }
            });
            logger.info(`[HABEJICO] ✅ Nueva cita CREADA: médico=${slot.doctorId} ${hh}:${mm}`);
        }

        // ════════════════════════════════════════════════════════════════
        // CRÍTICO: Actualizar TMTURNOSMEDICOSDETALLE (TME2)
        // El Visor de Agenda de Xenco lee ESTA tabla para mostrar nombres.
        // Sin este UPDATE, la cita existe en BD pero el Visor la muestra vacía.
        // ════════════════════════════════════════════════════════════════
        const pacCod14 = String(paciente.KC0_COD).trim().padStart(14, '0');
        const pacZona  = zonaUsar;
        try {
            // Intentar UPDATE primero (si Xenco ya generó el slot en TME2)
            const tme2Updated = await prisma.$executeRaw`
                UPDATE TMTURNOSMEDICOSDETALLE
                SET TME2_COD     = ${pacCod14},
                    TME2_ZONA    = ${pacZona},
                    TME2_SEQK    = ${''},
                    TME2_USU     = ${'AURORA'},
                    TME2_FCH_DIG = ${fchDecimalHoy}
                WHERE TME2_CODM = ${slot.doctorId}
                  AND TME2_FCH  = ${dateDecimal}
                  AND TME2_HH   = ${hh}
                  AND TME2_MM   = ${mm}
            `;

            if (tme2Updated > 0) {
                logger.info(`[TME2] ✅ TMTURNOSMEDICOSDETALLE actualizado: médico=${slot.doctorId} ${hh}:${mm} → paciente=${pacCod14}`);
            } else {
                // No existe fila TME2 — calcular SEQ e insertar nueva fila
                const tme2CountResult = await prisma.$queryRaw`
                    SELECT ISNULL(MAX(TME2_SEQ), 0) + 1 as NEXT_SEQ
                    FROM TMTURNOSMEDICOSDETALLE
                    WHERE TME2_CODM = ${slot.doctorId}
                      AND TME2_FCH  = ${dateDecimal}
                `;
                const nextSeq = Number(tme2CountResult[0]?.NEXT_SEQ || 1);
                const espTME2 = slot.especialidadCod ? String(slot.especialidadCod) : '999';
                const consulTME2 = slot.consultorio || null;

                await prisma.$executeRaw`
                    INSERT INTO TMTURNOSMEDICOSDETALLE
                        (TME2_CODM, TME2_FCH, TME2_SEQ, TME2_HH, TME2_MM,
                         TME2_ZONA, TME2_COD, TME2_SEQK,
                         TME2_ACTIVIDAD, TME2_CONSULTORIO,
                         TME2_EDADFIN, TME2_FCH_DIG, TME2_USU,
                         TME2_HORA_SIS, TME2_ESPECIALIDAD, TME2_NUM_CITAS_BL)
                    VALUES
                        (${slot.doctorId}, ${dateDecimal}, ${nextSeq}, ${hh}, ${mm},
                         ${pacZona}, ${pacCod14}, ${''},
                         ${'01'}, ${consulTME2},
                         ${0}, ${fchDecimalHoy}, ${'AURORA'},
                         ${horaSist}, ${espTME2}, ${0})
                `;
                logger.info(`[TME2] ✅ TMTURNOSMEDICOSDETALLE INSERTADO (SEQ=${nextSeq}): médico=${slot.doctorId} ${hh}:${mm} → paciente=${pacCod14}`);
            }
        } catch (tme2Err) {
            // No es fatal — la cita ya fue guardada en TMCITASUSUARIOS
            logger.warn(`[TME2] ⚠️ No se pudo actualizar TMTURNOSMEDICOSDETALLE: ${tme2Err.message}`);
        }

        logger.info(`✅ Cita confirmada en BD: médico=${slot.doctorId} fecha=${dateDecimal} hora=${hh}:${mm} entidad=${entidadPac} zona=${zonaUsar}`);
        return true;
    } catch (err) {
        console.error('❌ Error guardando cita en BD:', err.message);
        return false;
    }
}

// =========================================
// CITAS DEL USUARIO
// =========================================

async function getUserAppointments(userId) {
    if (!prisma) return [];
    try {
        // ─── Resolver el código interno del paciente (14 dígitos con ceros) ───
        let pacienteId = null;
        const cleanId = String(userId).replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
        const isWhatsAppSender = userId.includes('@') || userId.includes('.us');

        if (!isWhatsAppSender && /^\d{5,15}$/.test(cleanId)) {
            const cleanNoZeros = cleanId.replace(/^0+/, '');
            const exactPadded  = cleanId.padStart(14, ' ');
            const zeroPadded   = cleanId.padStart(14, '0');
            const searchTerms  = [...new Set([cleanId, cleanNoZeros, exactPadded, zeroPadded])];

            const nuiMatch = await prisma.pacienteNUI.findFirst({
                where: { OR: [{ KCN_COD_NUI: { in: searchTerms } }, { KCN_COD: { in: searchTerms } }] }
            });
            if (nuiMatch) {
                pacienteId = nuiMatch.KCN_COD || nuiMatch.KCN_COD_NUI;
            } else {
                const factMatch = await prisma.tMUSUARIOSFACTURACION.findFirst({
                    where: { OR: [{ KC2_OACOD_NUI: { in: searchTerms } }, { KC2_COD: { in: searchTerms } }] }
                });
                if (factMatch) {
                    pacienteId = factMatch.KC2_COD;
                } else {
                    const directPac = await prisma.paciente.findFirst({ where: { KC0_COD: { in: searchTerms } } });
                    if (directPac) pacienteId = directPac.KC0_COD;
                }
            }
        }

        if (!pacienteId) {
            const paciente = await findPaciente(userId);
            if (!paciente) {
                logger.warn(`[HABEJICO] getUserAppointments: no se encontró paciente para userId=${userId}`);
                return [];
            }
            pacienteId = paciente.KC0_COD;
        }

        // ─── FUENTE DE VERDAD: TMTURNOSMEDICOSDETALLE (TME2) ────────────────────
        // Se usa TME2 como fuente primaria para ver TODAS las citas del paciente,
        // sin importar si las agendó el bot (AURORA) o el personal de Xenco (CINDY, etc.).
        // TMCITASUSUARIOS (KC3) se hace JOIN solo para obtener el estado de cancelación.
        // ─────────────────────────────────────────────────────────────────────────
        const todayDecimal = dateToDecimal(new Date());
        const pacCod14 = String(pacienteId).trim().padStart(14, '0');

        logger.debug(`[HABEJICO] getUserAppointments: buscando citas para cod=${pacCod14}, fechaGTE=${todayDecimal}`);

        const rows = await prisma.$queryRaw`
            SELECT
                t.TME2_CODM         AS medicoId,
                t.TME2_FCH          AS fecha,
                t.TME2_HH           AS hh,
                t.TME2_MM           AS mm,
                t.TME2_COD          AS cod,
                t.TME2_CONSULTORIO  AS consultorio,
                LTRIM(RTRIM(m.MED_NOMBRE)) AS medicoNombre,
                c.KC3_ESTADO        AS estado,
                c.KC3_OBSERVACION   AS observacion,
                c.KC3_ESPECIALISTA  AS especialidadCod,
                m.MED_ESPECIAL      AS medicoEspecialidad
            FROM TMTURNOSMEDICOSDETALLE t
            INNER JOIN TMMEDICOS m ON m.MED_COD = t.TME2_CODM
            LEFT JOIN TMCITASUSUARIOS c
                ON  c.KC3_MEDICO = t.TME2_CODM
                AND c.KC3_FCH    = t.TME2_FCH
                AND c.KC3_HH     = t.TME2_HH
                AND c.KC3_MM     = t.TME2_MM
            WHERE LTRIM(RTRIM(t.TME2_COD)) = LTRIM(RTRIM(${pacCod14}))
              AND t.TME2_FCH >= ${todayDecimal}
              AND (c.KC3_ESTADO IS NULL OR c.KC3_ESTADO <> 'CA')
            ORDER BY t.TME2_FCH, t.TME2_HH, t.TME2_MM
        `;

        logger.debug(`[HABEJICO] getUserAppointments: ${rows.length} citas encontradas (fuente TME2)`);

        return rows.map(r => {
            const espCod = String(r.medicoEspecialidad || r.especialidadCod || '999').trim();
            const tipoNombre = codigoToNombreServicio(espCod);
            
            return {
                id:            `${Number(r.medicoId)}|${Number(r.fecha)}|${Number(r.hh)}|${Number(r.mm)}`,
                fecha:         toLocalDateStr(decimalToDate(Number(r.fecha))),
                hora:          timeLabel(Number(r.hh), Number(r.mm)),
                medico:        r.medicoNombre || `Médico ${r.medicoId}`,
                tipo:          tipoNombre,
                especialidadCod: espCod,
                estado:        r.estado || null,
                consultorio:   r.consultorio || null,
            };
        });
    } catch (e) {
        console.error('[HABEJICO] getUserAppointments:', e.message);
        return [];
    }
}

// =========================================
// CANCELAR CITA
// =========================================

async function cancelAppointment(appointmentId) {
    if (!prisma) return false;
    try {
        // ID formato robusto: "medicoId|fecha|hh|mm"  (separador '|', nunca aparece en los campos)
        const parts = appointmentId.split('|');
        if (parts.length !== 4) {
            console.error(`[HABEJICO] cancelAppointment: ID inválido "${appointmentId}"`);
            return false;
        }
        const medicoId = parseInt(parts[0]);
        const fch      = parseInt(parts[1]);
        const hh       = parseInt(parts[2]);
        const mm       = parseInt(parts[3]);

        logger.debug(`[HABEJICO] cancelAppointment: médico=${medicoId}, fecha=${fch}, hora=${hh}:${mm}`);

        // 1. Marcar como cancelada en TMCITASUSUARIOS (KC3_ESTADO = 'CA')
        try {
            await prisma.$executeRaw`
                UPDATE TMCITASUSUARIOS
                SET KC3_ESTADO = 'CA'
                WHERE KC3_MEDICO = ${medicoId}
                  AND KC3_FCH    = ${fch}
                  AND KC3_HH     = ${hh}
                  AND KC3_MM     = ${mm}
            `;
            logger.info(`[HABEJICO] ✅ KC3 marcado CA: médico=${medicoId} ${hh}:${mm} fecha=${fch}`);
        } catch (e1) {
            logger.warn(`[HABEJICO] ⚠️ No se pudo marcar CA en KC3: ${e1.message}`);
            // Continuar — puede ser una cita de Xenco sin registro en KC3
        }

        // 2. Liberar el slot en TMTURNOSMEDICOSDETALLE (lo que ve el Visor de Agenda)
        //    TME2_COD = '00000000000000' → el Visor lo mostrará como slot libre
        const fchHoy = dateToDecimal(new Date());
        try {
            const tme2Updated = await prisma.$executeRaw`
                UPDATE TMTURNOSMEDICOSDETALLE
                SET TME2_COD     = '00000000000000',
                    TME2_ZONA    = '001',
                    TME2_SEQK    = '',
                    TME2_USU     = 'AURORA',
                    TME2_FCH_DIG = ${fchHoy}
                WHERE TME2_CODM = ${medicoId}
                  AND TME2_FCH  = ${fch}
                  AND TME2_HH   = ${hh}
                  AND TME2_MM   = ${mm}
            `;
            logger.info(`[HABEJICO] ✅ TME2 liberado: médico=${medicoId} ${hh}:${mm} (${tme2Updated} fila/s)`);
        } catch (e2) {
            logger.warn(`[HABEJICO] ⚠️ No se pudo liberar TME2: ${e2.message}`);
        }

        return true;
    } catch (e) {
        console.error('[HABEJICO] cancelAppointment:', e.message);
        return false;
    }
}

// =========================================
// HELPERS SEMANA
// =========================================

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Escanea hasta maxScanDays días en paralelo (lotes de 3) y devuelve
// hasta maxResults días con disponibilidad real. Las CITAS siempre en tiempo real.
async function getWeekAvailability(startDateStr, tipo = 'medicina general', doctor = null, maxResults = 7, maxScanDays = 45, sede = 'Ebejico', isCVD = false) {
    const results = [];
    const BATCH = 3; // 3 días en paralelo — seguro con connectionLimit=10
    try {
        for (let i = 0; i < maxScanDays && results.length < maxResults; i += BATCH) {
            // Construir lote de fechas
            const batch = [];
            for (let j = i; j < Math.min(i + BATCH, maxScanDays); j++) {
                const d = new Date(startDateStr + 'T12:00:00');
                d.setDate(d.getDate() + j);
                batch.push({ dateStr: toLocalDateStr(d), dayName: DAY_NAMES_ES[d.getDay()] });
            }
            // Ejecutar lote en paralelo con retry automático
            const batchRes = await Promise.all(batch.map(async ({ dateStr, dayName }) => {
                try {
                    const slots = await _withRetry(() => getAvailableSlots(dateStr, tipo, doctor, false, sede), `slots(${dateStr})`);
                    if (slots.length) return { date: dateStr, dayName, slotCount: slots.length, firstSlot: slots[0].time, lastSlot: slots[slots.length - 1].time };
                    return null;
                } catch (err) {
                    if (err.code === 'P1001') { console.error(`[DB] P1001 persistente en ${dateStr}, abortando.`); return 'ABORT'; }
                    console.error(`[DB] Error slots(${dateStr}):`, err.message);
                    return null;
                }
            }));

            let abort = false;
            for (const r of batchRes) {
                if (r === 'ABORT') { abort = true; break; }
                if (r && results.length < maxResults) results.push(r);
            }
            if (abort) break;
        }
    } catch (err) {
        console.error('[DB] Error crítico en getWeekAvailability:', err.message);
    }
    return results;
}

// Busca el primer día con disponibilidad, en lotes de 2 en paralelo.
// isCVD=true → incluye médicos PYP/CVD (p.ej. "P Y P MEDICOS") que normalmente están bloqueados para el bot general.
async function getNextAvailableSlots(startDateStr, tipo, doctor, sede = 'Ebejico', isCVD = false) {
    const BATCH = 2; // Reducido a 2 para no saturar el pool de conexiones de Prisma
    const MAX = 30; // Máximo 30 días hacia adelante
    try {
        for (let i = 0; i <= MAX; i += BATCH) {
            const batch = [];
            for (let j = i; j < Math.min(i + BATCH, MAX + 1); j++) {
                const d = new Date(startDateStr + 'T12:00:00');
                d.setDate(d.getDate() + j);
                batch.push(toLocalDateStr(d));
            }
            const results = await Promise.all(batch.map(async dateStr => {
                try {
                    const slots = await _withRetry(() => getAvailableSlots(dateStr, tipo, doctor, false, sede, isCVD), `next(${dateStr})`);
                    return slots.length ? { date: dateStr, slots } : null;
                } catch (err) {
                    if (err.code === 'P1001') return 'ABORT';
                    return null;
                }
            }));
            for (const r of results) {
                if (r === 'ABORT') return null;
                if (r) return r;
            }
        }
    } catch (err) {
        console.error('[DB] Error crítico en getNextAvailableSlots:', err.message);
    }
    return null;
}

function normalizeTipoCita(tipo) {
    // Retorna ESP_COD del sistema HABEJICO para tipos conocidos
    if (!tipo) return null;
    const t = String(tipo).toLowerCase().trim();

    // Si ya enviaron el código directo
    if (/^\d+$/.test(t)) return t;

    if (t.includes('medicina general') || t.includes('medico general') || t.includes('médico general')) return '999';
    if (t.includes('medicina') || t.includes('general') || t === 'médico' || t === 'medico') return '999';
    
    // PYP Cardio se agenda en Medicina General (P Y P MEDICOS = 999)
    if (t.includes('pyp_cardio')) return '999';
    
    if (t.includes('odont') || t.includes('dent')) return '461';   // ODONTOLOGO GENERAL
    if (t.includes('pediat')) return '510';   // PEDIATRIA (ajustar al ESP_COD real)
    if (t.includes('gineco')) return '280';   // GINECOLOGIA (ajustar al ESP_COD real)
    if (t.includes('urgencia')) return '382';   // MEDICINA DE URGENCIAS
    if (t.includes('familiar')) return '385';   // MEDICINA FAMILIAR
    if (t.includes('interna')) return '387';   // MEDICINA INTERNA
    if (t.includes('cardio')) return '120';   // CARDIOLOGIA
    if (t.includes('ortop')) return null;    // buscar por nombre
    return null; // null = buscar por nombre
}

// Inverso de normalizeTipoCita: convierte código ESP_COD al nombre legible para mostrar al paciente
function codigoToNombreServicio(cod) {
    if (!cod) return 'Consulta Médica';
    const mapa = {
        '999': 'Medicina General',
        '461': 'Odontología',
        '510': 'Pediatría',
        '280': 'Ginecología',
        '382': 'Medicina de Urgencias',
        '385': 'Medicina Familiar',
        '387': 'Medicina Interna',
        '120': 'Cardiología',
    };
    return mapa[String(cod).trim()] || `Especialidad ${cod}`;
}

function isRangeDate(dateText) {
    if (!dateText) return false;
    const lower = dateText.toLowerCase();
    return ['semana', 'esta semana', 'próxima semana', 'proxima semana', 'fin de semana'].some(kw => lower.includes(kw));
}

function getWeekStartDate(rangeText) {
    const today = new Date();
    const lower = (rangeText || '').toLowerCase();
    if (lower.includes('esta semana')) return toLocalDateStr(today);
    if (lower.includes('fin de semana')) {
        const days = today.getDay() === 6 ? 7 : (6 - today.getDay());
        const sat = new Date(today); sat.setDate(today.getDate() + days); return toLocalDateStr(sat);
    }
    const days = today.getDay() === 0 ? 1 : (8 - today.getDay());
    const mon = new Date(today); mon.setDate(today.getDate() + days); return toLocalDateStr(mon);
}

module.exports = {
    getAvailableSlots,
    reserveSlot,
    getUserAppointments,
    cancelAppointment,
    normalizeTipoCita,
    codigoToNombreServicio,
    parseRelativeDate,
    getNextAvailableSlots,
    getWeekAvailability,
    isRangeDate,
    getWeekStartDate,
    findPaciente,
    updateCelular,
    dateToDecimal,
    decimalToDate
};
