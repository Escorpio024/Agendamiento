const prisma = require('./db');

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
    return toLocalDateStr(today);
}

function timeLabel(hh, mm) {
    const h12 = hh % 12 || 12;
    const period = hh < 12 ? 'AM' : 'PM';
    return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

// =========================================
// BUSCAR PACIENTE POR TELÉFONO / DOCUMENTO
// =========================================

async function findPaciente(userId) {
    const clean = userId.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
    const phone10 = clean.slice(-10);
    const phone7 = clean.slice(-7);

    // ── 1. Buscar en TKCLIENTES por teléfono (fuente principal → 33K pacientes reales) ──
    const cliente = await prisma.cliente.findFirst({
        where: {
            OR: [
                { KC_TEL1: phone10 }, { KC_TEL2: phone10 }, { KC_TEL3: phone10 },
                { KC_TEL1: phone7 }, { KC_TEL2: phone7 }, { KC_TEL3: phone7 },
                { KC_TEL1: { contains: phone10 } },
                { KC_TEL2: { contains: phone10 } },
                { KC_TEL3: { contains: phone10 } }
            ]
        }
        // Sin include para evitar FK errors con BD real
    });

    if (cliente) {
        let emailVal = null;
        try { const er = await prisma.clienteEmail.findFirst({ where: { KC2_COD: cliente.KC_COD } }); emailVal = er?.KC2_EMAIL || null; } catch (_) { }
        return {
            KC0_COD: cliente.KC_COD,
            KC0_NOM: cliente.KC_NOM,
            KC0_PNOMBRE: cliente.KC_NOM?.split(' ').slice(-2, -1)[0] || cliente.KC_NOM?.split(' ')[0],
            KC0_RES_TEL: cliente.KC_TEL1,
            KC0_ENTIDAD: null,
            email: emailVal,
            zona: cliente.KC_ZONA,
            cod: cliente.KC_COD,
            seqk: cliente.KC_SEQK || ''
        };
    }

    // ── 2. Fallback: TMUSUARIOSASEGURAMIENTO (pacientes registrados por el bot) ──
    let aseg = await prisma.paciente.findFirst({ where: { KC0_RES_TEL: { contains: phone10 } } });
    if (!aseg) aseg = await prisma.paciente.findFirst({ where: { KC0_RES_TEL: { contains: phone7 } } });
    if (aseg) {
        const emailRec = await prisma.clienteEmail.findFirst({ where: { KC2_COD: aseg.KC0_COD } });
        return { ...aseg, email: emailRec?.KC2_EMAIL || null, zona: '001', cod: aseg.KC0_COD, seqk: '' };
    }

    // ── 3. Buscar por número de documento ──
    if (/^\d{5,15}$/.test(clean)) {
        const byCliente = await prisma.cliente.findFirst({ where: { KC_COD: clean } });
        if (byCliente) {
            return {
                KC0_COD: byCliente.KC_COD, KC0_NOM: byCliente.KC_NOM,
                KC0_RES_TEL: byCliente.KC_TEL1, KC0_ENTIDAD: null,
                email: null,
                zona: byCliente.KC_ZONA, cod: byCliente.KC_COD, seqk: byCliente.KC_SEQK || ''
            };
        }
    }

    return null;
}



// =========================================
// DISPONIBILIDAD
// =========================================

async function getAvailableSlots(fechaStr, tipo = 'medicina general', preferredDoctor = null, skipLimit = false) {
    const dateStr = parseRelativeDate(fechaStr);
    const dateDecimal = dateToDecimal(new Date(dateStr + 'T12:00:00'));

    // 1. Buscar especialidad por código directo o nombre
    const espCod = normalizeTipoCita(tipo);
    let especialidad = null;
    if (espCod) {
        // Buscar primero por código exacto (más confiable)
        especialidad = await prisma.especialidad.findFirst({ where: { ESP_COD: espCod } });
        if (!especialidad && !/^\d+$/.test(tipo)) {
            especialidad = await prisma.especialidad.findFirst({
                where: { ESP_NOMBRE: { contains: String(tipo).toUpperCase() } }
            });
        }
    }

    // 2. Buscar turnos activos para la fecha
    const whereClause = {
        TME_FCH: { lte: dateDecimal },
        TME_FCH_FIN: { gte: dateDecimal }
    };
    if (especialidad) whereClause.TME_ESPECIALIDAD = especialidad.ESP_COD;

    const turnos = await prisma.turnoMedico.findMany({ where: whereClause });
    if (!turnos.length) {
        console.error(`[HABEJICO] getAvailableSlots: 0 turnos encontrados para fecha=${dateDecimal}, espCod=${espCod}, tipo=${tipo}`);
        return [];
    }

    // 3. Info médicos
    const medicoCodes = [...new Set(turnos.map(t => Number(t.TME_CODM)))];
    const medicos = await prisma.medico.findMany({
        where: { MED_COD: { in: medicoCodes }, MED_EST_ESTADO: 'A' }
    });
    const medicoMap = {};
    medicos.forEach(m => { medicoMap[Number(m.MED_COD)] = m; });

    // 4. Filtrar por doctor preferido
    let filteredTurnos = turnos;
    if (preferredDoctor) {
        const name = preferredDoctor.toLowerCase();
        const pref = turnos.filter(t => medicoMap[Number(t.TME_CODM)]?.MED_NOMBRE?.toLowerCase().includes(name));
        if (pref.length) filteredTurnos = pref;
    }

    // 5. Citas ya agendadas para esa fecha
    const allCitas = await prisma.cita.findMany({
        where: { KC3_FCH: dateDecimal }
    });
    // SQL Server CHAR(2) puede tener espacios ('CA '), por lo que filtramos con trim
    const citasExistentes = allCitas.filter(c => c.KC3_ESTADO && c.KC3_ESTADO.trim() !== 'CA');

    // 6. Generar slots
    const now = new Date();
    const slots = [];

    for (const turno of filteredTurnos) {
        const medico = medicoMap[Number(turno.TME_CODM)];
        if (!medico) continue;
        const dur = Number(turno.TME_DUR_CITA) || 30;

        const franjas = [];
        if (turno.TME_HH_I != null && turno.TME_HH_F != null) {
            franjas.push({ hi: Number(turno.TME_HH_I), mi: Number(turno.TME_MM_I || 0), hf: Number(turno.TME_HH_F), mf: Number(turno.TME_MM_F || 0) });
        }
        if (turno.TME_HH_I_A != null && turno.TME_HH_F_A != null) {
            franjas.push({ hi: Number(turno.TME_HH_I_A), mi: Number(turno.TME_MM_I_A || 0), hf: Number(turno.TME_HH_F_A), mf: Number(turno.TME_MM_F_A || 0) });
        }

        for (const f of franjas) {
            let totalMin = f.hi * 60 + f.mi;
            const endMin = f.hf * 60 + f.mf;

            while (totalMin + dur <= endMin) {
                const currH = Math.floor(totalMin / 60);
                const currM = totalMin % 60;
                const isBooked = citasExistentes.some(c =>
                    String(c.KC3_MEDICO) === String(turno.TME_CODM) &&
                    parseInt(c.KC3_HH) === currH &&
                    parseInt(c.KC3_MM) === currM
                );
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
                totalMin += dur;
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

async function reserveSlot(fechaStr, hora, userId, tipo = 'medicina general', medicoId = null) {
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

        // Buscar paciente
        const paciente = await findPaciente(userId);
        if (!paciente) return false;

        // Validar slot disponible
        const slots = await getAvailableSlots(dateStr, tipo, null, true);
        let slot = medicoId
            ? slots.find(s => s.doctorId === Number(medicoId) && s.hh === hh && s.mm === mm)
            : slots.find(s => s.hh === hh && s.mm === mm);
        if (!slot) {
            console.error('[HABEJICO] reserveSlot falló: Slot no encontrado en array de disponibilidad para', { hh, mm, medicoId, tipo, slotsCount: slots.length });
            return false;
        }

        // Generar SEQK único para esta cita
        const existing = await prisma.cita.findMany({
            where: {
                KC3_COD: paciente.KC0_COD,
                KC3_FCH: dateDecimal,
                KC3_MEDICO: slot.doctorId,
                KC3_ZONA: paciente.zona || '001'
            }
        });
        const seqk = String(existing.length + 1).padStart(2, '0');

        const zonaUsar = paciente.zona || '001';

        // Crear cita en BD con los campos idénticos a los nativos de HABE JICO
        await prisma.cita.create({
            data: {
                KC3_MEDICO: slot.doctorId,
                KC3_ZONA: zonaUsar,
                KC3_COD: paciente.KC0_COD,
                KC3_SEQK: seqk,
                KC3_FCH: dateDecimal,
                KC3_HH: hh,
                KC3_MM: mm,
                KC3_ESPECIALISTA: slot.especialidadCod || null,
                KC3_CONSULTORIO: slot.consultorio || null,
                KC3_ESTADO: '01',          // '01' es el estado nativo para 'Agendado'
                KC3_TIPO: '',              // Vacío
                KC3_OBSERVACION: `WhatsApp - ${tipo}`.substring(0, 60),
                KC3_USUARIO: 'BOT',
                KC3_ENTIDAD: paciente.KC0_ENTIDAD || 0,
                KC3_NUM: 0,                // Requerido por el frontend de Habejico
                KC3_NUM_TURNO: 0,          // Requerido por Habejico
                KC3_VALOR: 0,              // Requerido por Habejico
                KC3_GENERADA: null
            }
        });

        console.log(`✅ Cita confirmada en BD: médico=${slot.doctorId} fecha=${dateDecimal} hora=${hh}:${mm}`);
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
    try {
        const paciente = await findPaciente(userId);
        if (!paciente) return [];

        const todayDecimal = dateToDecimal(new Date());
        const citas = await prisma.cita.findMany({
            where: { KC3_COD: paciente.KC0_COD, KC3_FCH: { gte: todayDecimal }, KC3_ESTADO: { not: 'CA' } },
            orderBy: [{ KC3_FCH: 'asc' }, { KC3_HH: 'asc' }]
        });

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

async function getWeekAvailability(startDateStr, tipo = 'medicina general', doctor = null, numDays = 6) {
    const results = [];
    for (let i = 0; i < numDays; i++) {
        const d = new Date(startDateStr + 'T12:00:00');
        d.setDate(d.getDate() + i);
        const dateStr = toLocalDateStr(d);
        const slots = await getAvailableSlots(dateStr, tipo, doctor);
        if (slots.length) {
            results.push({
                date: dateStr,
                dayName: DAY_NAMES_ES[d.getDay()],
                slotCount: slots.length,
                firstSlot: slots[0].time,
                lastSlot: slots[slots.length - 1].time
            });
        }
    }
    return results;
}

async function getNextAvailableSlots(startDateStr, tipo, doctor) {
    const d = new Date(startDateStr + 'T12:00:00');
    for (let i = 0; i < 7; i++) {
        d.setDate(d.getDate() + 1);
        const dateStr = toLocalDateStr(d);
        const slots = await getAvailableSlots(dateStr, tipo, doctor);
        if (slots.length) return { date: dateStr, slots };
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
    parseRelativeDate,
    getNextAvailableSlots,
    getWeekAvailability,
    isRangeDate,
    getWeekStartDate,
    findPaciente,
    dateToDecimal,
    decimalToDate
};
