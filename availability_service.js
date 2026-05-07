const prisma = require('./db');

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
    const todayDec = dateToDecimal(new Date());
    _cache.turnos = await prisma.turnoMedico.findMany({
        where: { OR: [{ TME_FCH_FIN: { gte: todayDec } }, { TME_FCH_FIN: null }] },
        orderBy: { TME_FCH: 'desc' }
    });
    _cache.turnosExpiry = now + TTL_TURNOS;
    console.log(`[CACHE] Turnos: ${_cache.turnos.length} registros cargados`);
    return _cache.turnos;
}

/** Devuelve todos los médicos activos, cacheados 30 min */
async function _getMedicosCache() {
    const now = Date.now();
    if (_cache.medicos && now < _cache.medicosExpiry) return _cache.medicos;
    _cache.medicos = await prisma.medico.findMany({ where: { MED_EST_ESTADO: 'A' } });
    _cache.medicosExpiry = now + TTL_MEDICOS;
    console.log(`[CACHE] Médicos: ${_cache.medicos.length} activos cargados`);
    return _cache.medicos;
}

/** Devuelve especialidad por espCod/tipo, cacheada 60 min */
async function _getEspecialidadCache(espCod, tipo) {
    const key = espCod || tipo || '_';
    const now = Date.now();
    if (_cache.especialidades[key] && now < _cache.especialidades[key].exp) {
        return _cache.especialidades[key].val;
    }
    let esp = null;
    if (espCod) {
        esp = await prisma.especialidad.findFirst({ where: { ESP_COD: espCod } });
        if (!esp && !/^\d+$/.test(tipo || '')) {
            esp = await prisma.especialidad.findFirst({ where: { ESP_NOMBRE: { contains: String(tipo).toUpperCase() } } });
        }
    }
    _cache.especialidades[key] = { val: esp, exp: now + TTL_ESP };
    return esp;
}

/** Retry automático para errores P1001 (hasta 2 reintentos, 600ms de espera) */
async function _withRetry(fn, label = '') {
    for (let i = 0; i < 3; i++) {
        try { return await fn(); }
        catch (err) {
            if (err.code === 'P1001' && i < 2) {
                console.warn(`[DB] P1001 en ${label}, reintento ${i + 1}/2...`);
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
        // Si el mes ya pasó en este año, asumir el próximo año
        if (month < today.getMonth() - 1) year++;
        const d = new Date(year, month, day);
        return toLocalDateStr(d);
    }
    
    // Si la IA devolvió "Viernes" o algo que no es fecha YYYY-MM-DD, intentar parseo manual
    const parsed = new Date(dateStr);
    if (!isNaN(parsed) && parsed.getFullYear() > 2000) {
        return toLocalDateStr(parsed);
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
            console.log(`[DB] ✅ Celular actualizado en TKCLIENTESANEXO5: cod=${internalCod} -> ${cleanNew} (${result.count} registros)`);
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
            console.log(`[DB] ✅ Celular actualizado en TMUSUARIOSFACTURACION: ${resultFact.count} registros`);
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
            // Buscar entidad (EPS) en TMUSUARIOSFACTURACION
            const factParaEntidad = await prisma.tMUSUARIOSFACTURACION.findFirst({
                where: { OR: [
                    { KC2_OACOD_NUI: { in: searchTerms } },
                    { KC2_COD: { in: searchTerms } }
                ] }
            });
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
                KC0_ENTIDAD: factParaEntidad?.KC2_EPS_POS ? Number(factParaEntidad.KC2_EPS_POS) : null,
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
            ] }
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
            const nuiByCode = await prisma.pacienteNUI.findFirst({ where: { KCN_COD: codPac } });
            const factByCode = await prisma.tMUSUARIOSFACTURACION.findFirst({ where: { KC2_COD: codPac } });
            const nomComp = nuiByCode?.KCN_NOM
                || (factByCode ? `${factByCode.KC2_PNOMBRE || ''} ${factByCode.KC2_PAPELLIDO || ''}`.trim() : null)
                || 'Paciente';
            return {
                KC0_COD: codPac,
                KC0_NOM: nomComp,
                KC0_PNOMBRE: nomComp.split(/[\s,]+/)[0] || 'Paciente',
                KC0_RES_TEL: kc5ByTel.KC5_TEL_CEL.trim(),
                KC0_ENTIDAD: factByCode?.KC2_EPS_POS ? Number(factByCode.KC2_EPS_POS) : null,
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
        }
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

async function getAvailableSlots(fechaStr, tipo = 'medicina general', preferredDoctor = null, skipLimit = false) {
    if (!prisma) return [];
    const dateStr = parseRelativeDate(fechaStr);
    const dateDecimal = dateToDecimal(new Date(dateStr + 'T12:00:00'));

    // 1. Especialidad — cacheada 60 min (muy estática)
    const espCod = normalizeTipoCita(tipo);
    const especialidad = await _getEspecialidadCache(espCod, tipo);

    // 2. Turnos activos — cacheados 3 min, filtrados en JS por fecha
    const allTurnosCache = await _getTurnosCache();
    const turnosRaw = allTurnosCache.filter(t =>
        t.TME_FCH <= dateDecimal &&
        (!t.TME_FCH_FIN || t.TME_FCH_FIN >= dateDecimal) &&
        (!especialidad || t.TME_ESPECIALIDAD == especialidad.ESP_COD)
    );

    // Deduplicar: por cada doctor, quedarse solo con el turno MÁS RECIENTE
    const turnosPorDoctor = {};
    for (const t of turnosRaw) {
        const key = String(t.TME_CODM);
        if (!turnosPorDoctor[key]) turnosPorDoctor[key] = t;
    }
    const turnos = Object.values(turnosPorDoctor);

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

    // Slots pre-generados por Xenco para cada doctor (sin paciente = disponibles reales del Visor)
    const slotsVaciosPorDoctor = {}; // { doctorId: Set([h*60+m]) }
    for (const c of allCitas) {
        const cancelado = c.KC3_ESTADO && c.KC3_ESTADO.trim() === 'CA';
        if (esSlotVacio(c.KC3_COD) && !cancelado) {
            const key = String(c.KC3_MEDICO).trim();
            if (!slotsVaciosPorDoctor[key]) slotsVaciosPorDoctor[key] = new Set();
            const tMin = parseInt(c.KC3_HH) * 60 + parseInt(c.KC3_MM);
            slotsVaciosPorDoctor[key].add(tMin);
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
            console.log(`[SLOTS-KC3] Dr.${medico.MED_NOMBRE?.trim()} | ${slotsVaciosDoctor.size} slots disponibles directo de KC3 (Visor de Agenda)`);
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

        console.log(`[SLOTS-TME] Dr.${medico.MED_NOMBRE?.trim()} | ActM=${turno.TME_ACTIVIDAD_M} ActT=${turno.TME_ACTIVIDAD_T} | Franjas=${franjas.length} | Dur=${dur}min (modo template)`);

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
                    console.log(`[SLOT-SKIP] Dr.${medico.MED_NOMBRE?.trim()} ${timeLabel(currH, currM)} → hueco eliminado del Visor (almuerzo/pausa)`);
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
    const cod = String(espCod || '').trim();
    // Odontología: ESP_COD 461
    if (cod === '461') return {
        KC3_TIPO:           'VOS',  // Visita Odontología
        KC3_TIPO_SERVICIO:  211,
        KC3_GRUPO_ATENCION: 'O',
        KC3_ARTIC:          '*230101',
        KC3_C_COSTO:        '7312',
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

async function reserveSlot(fechaStr, hora, userId, tipo = 'medicina general', medicoId = null, pacienteData = null) {
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
        console.log(`[HABEJICO] reserveSlot: paciente.KC0_COD="${paciente.KC0_COD}" zona="${paciente.zona}"`);

        // Validar slot disponible
        const slots = await getAvailableSlots(dateStr, tipo, null, true);
        let slot = medicoId
            ? slots.find(s => s.doctorId === Number(medicoId) && s.hh === hh && s.mm === mm)
            : slots.find(s => s.hh === hh && s.mm === mm);
        if (!slot) {
            console.error('[HABEJICO] reserveSlot falló: Slot no encontrado en array de disponibilidad para', { hh, mm, medicoId, tipo, slotsCount: slots.length });
            return false;
        }

        // Helper para agregar puntos a la cédula (ej. 1054478593 -> 1.054.478.593)
        // ya que el Visor de Agenda de Xenco cruza la información con este formato.
        const formatCedulaPuntos = (ced) => {
            if (!ced) return ced;
            const cedStr = String(ced).trim();
            // Solo formatear si es numérico
            if (/^\d+$/.test(cedStr)) {
                return cedStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            }
            return cedStr;
        };

        const cedulaConPuntos = formatCedulaPuntos(paciente.KC0_COD);

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
        // Mapa de contratos por entidad confirmados desde la BD nativa
        const contratoPorEntidad = {
            235:  { num: 'RS-0159-2026',     seq: 3 },  // SURA EPS
            141:  { num: '01_EVN_890982370', seq: 2 },  // NUEVA EPS
            265:  { num: 'RC-0160-2026',     seq: 3 },  // (otra EPS)
            550:  { num: '0474-2025',         seq: 1 },  // (otra EPS)
        };
        const contratoInfo = contratoPorEntidad[entidadPac] || { num: '0152-2025', seq: 2 };

        // Campos nativos según especialidad
        const espCod = slot.especialidadCod || null;
        const fieldsEsp = getFieldsByEspecialidad(espCod);

        const citaData = {
            KC3_ZONA:             zonaUsar,
            KC3_COD:              cedulaConPuntos,
            KC3_SEQK:             seqk,
            KC3_ESPECIALISTA:     espCod,
            KC3_ESTADO:           '01',
            KC3_TIPO:             fieldsEsp.KC3_TIPO,
            KC3_TIPO_SERVICIO:    fieldsEsp.KC3_TIPO_SERVICIO,
            KC3_CAUSAL_ATENC:     2,
            KC3_CARGART_EPS:      'N',
            KC3_GRUPO_ATENCION:   fieldsEsp.KC3_GRUPO_ATENCION,
            KC3_C_COSTO:          fieldsEsp.KC3_C_COSTO,
            KC3_ARTIC:            fieldsEsp.KC3_ARTIC,
            KC3_OBSERVACION:      `WhatsApp - ${tipo}`.substring(0, 60),
            KC3_USUARIO:          'BOT',
            KC3_ENTIDAD:          entidadPac,
            KC3_ENTIDAD_OLD:      entidadPac,
            KC3_NUM:              0,              // 0 = sin número de factura → Documento muestra solo 'VD'
            KC3_NUM_TURNO:        0,
            KC3_VALOR:            54600,
            KC3_GENERADA:         'S',
            KC3_FCH_D:            fchDecimalHoy,
            KC3_HH_D:             hhSist,
            KC3_MM_D:             mmSist,
            KC3_HORA_SIST:        horaSist,
            KC3_TERMINAL:         'BOT',
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
        // Se busca cualquier registro existente y se verifica en JS con esSlotVacio()
        // para evitar falsos positivos de SQL con códigos que empiecen por 0.
        const esSlotVacioFn = (cod) => {
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

        const debeActualizar = slotExistente && esSlotVacioFn(slotExistente.KC3_COD);

        if (debeActualizar) {
            // Actualizar usando solo las claves principales para evitar fallos de matching por espacios en blanco en KC3_COD
            const whereUpdate = { 
                KC3_MEDICO: slot.doctorId, 
                KC3_FCH: dateDecimal, 
                KC3_HH: hh, 
                KC3_MM: mm 
            };

            const updateResult = await prisma.cita.updateMany({ where: whereUpdate, data: citaData });
            
            if (updateResult.count > 0) {
                console.log(`[HABEJICO] ✅ Slot ACTUALIZADO (KC3_COD era: "${slotExistente.KC3_COD}"): médico=${slot.doctorId} ${hh}:${mm}`);
            } else {
                console.log(`[HABEJICO] ⚠️ updateMany no afectó filas. Forzando creación...`);
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
                console.log(`[HABEJICO] ✅ Nueva cita CREADA (fallback): médico=${slot.doctorId} ${hh}:${mm}`);
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
            console.log(`[HABEJICO] ✅ Nueva cita CREADA: médico=${slot.doctorId} ${hh}:${mm}`);
        }

        console.log(`✅ Cita confirmada en BD: médico=${slot.doctorId} fecha=${dateDecimal} hora=${hh}:${mm} entidad=${entidadPac} zona=${zonaUsar}`);
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
        // Estrategia dual: si el userId parece una cédula/ID directo de paciente,
        // buscar directamente en lugar de pasar por findPaciente (que busca por teléfono)
        let pacienteId = null;
        const cleanId = String(userId).replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
        const isWhatsAppSender = userId.includes('@') || userId.includes('.us');

        if (!isWhatsAppSender && /^\d{5,15}$/.test(cleanId)) {
            const cleanNoZeros = cleanId.replace(/^0+/, '');
            const exactPadded = cleanId.padStart(14, ' ');
            const zeroPadded = cleanId.padStart(14, '0');
            const searchTerms = [...new Set([cleanId, cleanNoZeros, exactPadded, zeroPadded])];

            const nuiMatch = await prisma.pacienteNUI.findFirst({
                where: { OR: [
                    { KCN_COD_NUI: { in: searchTerms } },
                    { KCN_COD: { in: searchTerms } }
                ] }
            });
            if (nuiMatch) {
                pacienteId = nuiMatch.KCN_COD || nuiMatch.KCN_COD_NUI;
            } else {
                const factMatch = await prisma.tMUSUARIOSFACTURACION.findFirst({
                    where: { OR: [
                        { KC2_OACOD_NUI: { in: searchTerms } },
                        { KC2_COD: { in: searchTerms } }
                    ] }
                });
                if (factMatch) {
                    pacienteId = factMatch.KC2_COD;
                } else {
                    const directPac = await prisma.paciente.findFirst({
                        where: { KC0_COD: { in: searchTerms } }
                    });
                    if (directPac) pacienteId = directPac.KC0_COD;
                }
            }
        }

        if (!pacienteId) {
            const paciente = await findPaciente(userId);
            if (!paciente) {
                console.warn(`[HABEJICO] getUserAppointments: no se encontró paciente para userId=${userId}`);
                return [];
            }
            pacienteId = paciente.KC0_COD;
        }

        const todayDecimal = dateToDecimal(new Date());
        const cleanPacId = String(pacienteId).trim().replace(/^0+/, '');
        const allCitas = await prisma.cita.findMany({
            where: {
                OR: [
                    { KC3_COD: pacienteId },
                    { KC3_COD: cleanPacId },
                    { KC3_COD: String(pacienteId).padStart(14, ' ') },
                    { KC3_COD: String(pacienteId).padStart(14, '0') }
                ],
                KC3_FCH: { gte: todayDecimal }
            },
            orderBy: [{ KC3_FCH: 'asc' }, { KC3_HH: 'asc' }]
        });
        
        // Filtrar 'CA' (Cancelada) en JS para evadir problemas de collation o espacios en SQL
        const citas = allCitas.filter(c => !c.KC3_ESTADO || c.KC3_ESTADO.trim() !== 'CA');

        console.log(`[HABEJICO] getUserAppointments: ID=${pacienteId}, FechaGTE=${todayDecimal}, DB=${allCitas.length}, Validas=${citas.length}`);

        const medicoCodes = [...new Set(citas.map(c => parseInt(c.KC3_MEDICO)))];
        const medicos = medicoCodes.length
            ? await prisma.medico.findMany({ where: { MED_COD: { in: medicoCodes } } })
            : [];
        const medicoMap = {};
        medicos.forEach(m => { medicoMap[parseInt(m.MED_COD)] = m; });

        return citas.map(c => ({
            id: `${c.KC3_MEDICO}-${c.KC3_COD}-${c.KC3_SEQK}-${c.KC3_FCH}-${c.KC3_HH}-${c.KC3_MM}`,
            fecha: toLocalDateStr(decimalToDate(parseInt(c.KC3_FCH))),
            hora: timeLabel(parseInt(c.KC3_HH), parseInt(c.KC3_MM)),
            medico: medicoMap[parseInt(c.KC3_MEDICO)]?.MED_NOMBRE?.trim() || `Médico ${c.KC3_MEDICO}`,
            // KC3_TIPO suele decir 'EXT'. La especialidad real (texto) la intentaremos sacar de la observación
            tipo: c.KC3_OBSERVACION ? c.KC3_OBSERVACION.replace('WhatsApp - ', '') : 'Medicina General',
            // La especialidad real en código (ej: 999) para restaurar al modificar
            especialidadCod: c.KC3_ESPECIALISTA || null,
            estado: c.KC3_ESTADO,
            consultorio: c.KC3_CONSULTORIO
        }));
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
        // id = "medico-cod-seqk-fch-hh-mm"
        const parts = appointmentId.split('-');
        const medico = parts[0];
        const cod = parts[1];
        const seqk = parts[2]; // puede tener espacios del padding
        const fch = parts[3];
        await prisma.cita.updateMany({
            where: {
                KC3_MEDICO: parseInt(medico),
                KC3_COD: cod,
                KC3_SEQK: { contains: seqk.trim() },
                KC3_FCH: parseInt(fch)
            },
            data: {
                KC3_ESTADO: 'CA'
            }
        });
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
async function getWeekAvailability(startDateStr, tipo = 'medicina general', doctor = null, maxResults = 7, maxScanDays = 45) {
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
                    const slots = await _withRetry(() => getAvailableSlots(dateStr, tipo, doctor), `slots(${dateStr})`);
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

// Busca el primer día con disponibilidad, en lotes de 3 en paralelo.
async function getNextAvailableSlots(startDateStr, tipo, doctor) {
    const BATCH = 3;
    const MAX = 60;
    try {
        for (let i = 1; i <= MAX; i += BATCH) {
            const batch = [];
            for (let j = i; j < Math.min(i + BATCH, MAX + 1); j++) {
                const d = new Date(startDateStr + 'T12:00:00');
                d.setDate(d.getDate() + j);
                batch.push(toLocalDateStr(d));
            }
            const results = await Promise.all(batch.map(async dateStr => {
                try {
                    const slots = await _withRetry(() => getAvailableSlots(dateStr, tipo, doctor), `next(${dateStr})`);
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
