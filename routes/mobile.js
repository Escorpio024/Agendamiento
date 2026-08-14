/**
 * routes/mobile.js
 * ─────────────────────────────────────────────────────────────────────────────
 * API REST para la app móvil Flutter de Aurora.
 * Todos los endpoints quedan bajo el prefijo /api/mobile (registrado en server.js).
 *
 * Autenticación: header  Authorization: Bearer <cedula>
 *                (se valida que el paciente exista en SQL Server)
 *
 * Respuestas estándar:
 *   200 OK           → { data: ... }
 *   400 Bad Request  → { error: "mensaje" }
 *   401 Unauthorized → { error: "mensaje" }
 *   404 Not Found    → { error: "mensaje" }
 *   500 Server Error → { error: "mensaje" }
 */

const express = require('express');
const router  = express.Router();
const medicalPrisma = require('../db');
const botPrisma = require('../dbBot');
const availability_service = require('../availability_service');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decimalToDateStr(dec) {
    if (!dec) return null;
    const s = String(dec).replace(/\..*/, '').padStart(8, '0');
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function toTimeStr(hh, mm) {
    if (hh === null || hh === undefined) return null;
    const h = String(Number(hh)).padStart(2, '0');
    const m = String(Number(mm ?? 0)).padStart(2, '0');
    return `${h}:${m}`;
}

function todayDecimal() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return Number(`${y}${m}${d}`);
}

function formatPaciente(p) {
    return {
        cedula:          p.KC0_COD?.trim()       || null,
        tipo_doc:        p.KC0_TIPO_DOCTO?.trim() || null,
        nombre_completo: [
            p.KC0_PNOMBRE?.trim(),
            p.KC0_SNOMBRE?.trim(),
            p.KC0_PAPELLIDO?.trim(),
            p.KC0_SAPELLIDO?.trim()
        ].filter(Boolean).join(' ') || p.KC0_NOM?.trim() || null,
        primer_nombre:    p.KC0_PNOMBRE?.trim()   || null,
        segundo_nombre:   p.KC0_SNOMBRE?.trim()   || null,
        primer_apellido:  p.KC0_PAPELLIDO?.trim() || null,
        segundo_apellido: p.KC0_SAPELLIDO?.trim() || null,
        sexo:             p.KC0_SEXO?.trim()       || null,
        fecha_nacimiento: decimalToDateStr(p.KC0_FCH_NACE),
        telefono:         p.KC0_RES_TEL?.trim()   || null,
        direccion:        p.KC0_RES_DIR?.trim()   || null,
        estado:           p.KC0_ESTADO?.trim()     || null,
    };
}

function formatCita(c, medicoNombre) {
    return {
        medico_id:    Number(c.KC3_MEDICO),
        medico_nombre:medicoNombre || null,
        fecha:        decimalToDateStr(c.KC3_FCH),
        hora:         toTimeStr(c.KC3_HH, c.KC3_MM),
        estado:       c.KC3_ESTADO?.trim() || null,
        tipo:         c.KC3_TIPO?.trim()   || null,
        observacion:  c.KC3_OBSERVACION?.trim() || null,
        consultorio:  c.KC3_CONSULTORIO?.trim() || null,
        articulo:     c.KC3_ARTIC?.trim()  || null,
    };
}

// ─── Middleware de autenticación por cédula ───────────────────────────────────
async function authMiddleware(req, res, next) {
    if (!medicalPrisma) {
        return res.status(503).json({ error: 'Base de datos no disponible.' });
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token) {
        return res.status(401).json({ error: 'Se requiere la cédula en el header Authorization: Bearer <cedula>' });
    }

    if (!/^[a-zA-Z0-9-]{4,20}$/.test(token)) {
        return res.status(400).json({ error: 'Formato de cédula inválido.' });
    }

    try {
        const cedulaPadded = token.padStart(14, '0');
        const rows = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 1
                KC2_COD         AS cod,
                KC2_OACOD_NUI   AS nui,
                KC2_PNOMBRE     AS primer_nombre,
                KC2_SNOMBRE     AS segundo_nombre,
                KC2_PAPELLIDO   AS primer_apellido,
                KC2_SAPELLIDO   AS segundo_apellido,
                KC2_TEL_RESP    AS telefono,
                KC2_TIPO_DOCTO  AS tipo_doc,
                KC2_SEXO        AS sexo,
                KC2_EDAD        AS edad
            FROM TMUSUARIOSFACTURACION
            WHERE KC2_OACOD_NUI = '${token}'
               OR KC2_COD = '${cedulaPadded}'
        `);

        if (!rows || rows.length === 0) {
            return res.status(401).json({ error: 'Cédula no encontrada. Verifica el número e intenta de nuevo.' });
        }

        const p = rows[0];
        req.cedula   = token; // <- token is cedulaClean here
        req.paciente = {
            cedula: p.nui || p.cod?.replace(/^0+/, ''),
            tipo_doc: p.tipo_doc?.trim() || null,
            nombre_completo: [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(' '),
            primer_nombre: p.primer_nombre?.trim() || null,
            segundo_nombre: p.segundo_nombre?.trim() || null,
            primer_apellido: p.primer_apellido?.trim() || null,
            segundo_apellido: p.segundo_apellido?.trim() || null,
            sexo: p.sexo?.trim() || null,
            edad: p.edad ? Number(p.edad) : null,
            telefono: p.telefono?.trim() || null,
            estado: 'Activo'
        };
        next();
    } catch (err) {
        console.error('[AUTH MOBILE] Error:', err.message);
        return res.status(500).json({ error: 'Error al verificar identidad.' });
    }
}

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────

// POST /api/mobile/auth/login — login por cédula
router.post('/auth/login', async (req, res) => {
    if (!medicalPrisma) {
        return res.status(503).json({ error: 'Base de datos no disponible.' });
    }

    const { cedula } = req.body || {};
    if (!cedula || typeof cedula !== 'string') {
        return res.status(400).json({ error: 'El campo "cedula" es requerido. Envía JSON con Content-Type: application/json' });
    }

    const cedulaClean = cedula.trim();
    if (!/^[a-zA-Z0-9-]{4,20}$/.test(cedulaClean)) {
        return res.status(400).json({ error: 'Formato de cédula inválido.' });
    }

    try {
        const cedulaPadded = cedulaClean.padStart(14, '0');
        const rows = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 1
                KC2_COD         AS cod,
                KC2_OACOD_NUI   AS nui,
                KC2_PNOMBRE     AS primer_nombre,
                KC2_SNOMBRE     AS segundo_nombre,
                KC2_PAPELLIDO   AS primer_apellido,
                KC2_SAPELLIDO   AS segundo_apellido,
                KC2_TEL_RESP    AS telefono,
                KC2_TIPO_DOCTO  AS tipo_doc,
                KC2_SEXO        AS sexo,
                KC2_EDAD        AS edad
            FROM TMUSUARIOSFACTURACION
            WHERE KC2_OACOD_NUI = '${cedulaClean}'
               OR KC2_COD = '${cedulaPadded}'
        `);

        if (!rows || rows.length === 0) {
            return res.status(404).json({
                error: 'No se encontró ningún paciente con esa cédula. Verifica el número.'
            });
        }

        const p = rows[0];
        const pacienteLocal = {
            cedula: p.nui || p.cod?.replace(/^0+/, ''),
            tipo_doc: p.tipo_doc?.trim() || null,
            nombre_completo: [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(' '),
            primer_nombre: p.primer_nombre?.trim() || null,
            segundo_nombre: p.segundo_nombre?.trim() || null,
            primer_apellido: p.primer_apellido?.trim() || null,
            segundo_apellido: p.segundo_apellido?.trim() || null,
            sexo: p.sexo?.trim() || null,
            edad: p.edad ? Number(p.edad) : null,
            telefono: p.telefono?.trim() || null,
            estado: 'Activo'
        };

        return res.status(200).json({
            success:  true,
            token:    cedulaClean,
            paciente: pacienteLocal
        });

    } catch (err) {
        console.error('[LOGIN MOBILE] Error:', err.message);
        return res.status(500).json({ error: 'Error interno al autenticar.' });
    }
});

// GET /api/mobile/paciente/perfil — datos personales del paciente autenticado
router.get('/paciente/perfil', authMiddleware, (req, res) => {
    return res.status(200).json({ data: formatPaciente(req.paciente) });
});

// PUT /api/mobile/usuarios/:id — actualizar perfil del paciente (teléfono y correo)
router.put(['/usuarios/:id', '/paciente/telefono'], authMiddleware, async (req, res) => {
    try {
        const nuevoTelefono = req.body.telefono;
        const nuevoEmail = req.body.email; // Recibimos el email para compatibilidad con Flutter
        
        let result = true;
        if (nuevoTelefono) {
            result = await availability_service.updateCelular(req.cedula, nuevoTelefono);
        }
        
        // Nota: La base de datos SQL Server (TKCLIENTESANEXO5/TMUSUARIOSFACTURACION) 
        // no tiene columna oficial de correo electrónico, por lo que el email se recibe 
        // pero no se persiste en la BD legacy por ahora.
        
        if (result.ok || result === true) {
            return res.status(200).json({ 
                success: true, 
                message: 'Perfil actualizado correctamente',
                email_ignored: !!nuevoEmail 
            });
        } else {
            return res.status(400).json({ error: 'Formato inválido o error en BD', detalle: result.reason });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Error interno al actualizar perfil' });
    }
});

// GET /api/mobile/sedes
router.get('/sedes', authMiddleware, (req, res) => {
    return res.status(200).json([
        {
            "id": 1,
            "nombre": "Sede Principal Ebéjico",
            "direccion": "Ebéjico",
            "ciudad": "Ebéjico",
            "telefono": "3016404175",
            "activa": true
        }
    ]);
});

// GET /api/mobile/procedimientos
router.get('/procedimientos', authMiddleware, (req, res) => {
    return res.status(200).json([
        {
            "id": 999,
            "cups": "890201",
            "nombre": "Consulta de Medicina General",
            "modalidad": "Presencial",
            "contraste": "N/A",
            "activo": true
        },
        {
            "id": 461,
            "cups": "890203",
            "nombre": "Consulta de Odontología",
            "modalidad": "Presencial",
            "contraste": "N/A",
            "activo": true
        },
        {
            "id": 510,
            "cups": "890205",
            "nombre": "Consulta de Pediatría",
            "modalidad": "Presencial",
            "contraste": "N/A",
            "activo": true
        }
    ]);
});

// GET /api/mobile/doctores
router.get('/doctores', authMiddleware, async (req, res) => {
    try {
        const docs = await medicalPrisma.$queryRawUnsafe(`
            SELECT MED_COD as id, MED_NOMBRE as nombre, MED_ESPECIALIDAD_1 as especialidad
            FROM TMMEDICOS 
            WHERE MED_EST_ESTADO = 'A'
        `);
        const result = docs.map(d => ({
            id: Number(d.id),
            nombre: d.nombre?.trim(),
            especialidad: d.especialidad?.trim() || "General",
            activo: true
        }));
        return res.status(200).json(result);
    } catch (err) {
        return res.status(500).json({ error: 'Error obteniendo doctores' });
    }
});

// GET /api/mobile/horarios
router.get('/horarios', authMiddleware, async (req, res) => {
    try {
        let especialidadCod = req.query.procedimiento_id || 999;
        
        // Mapeo seguro por si Flutter insiste en mandar 101 u otros IDs quemados
        if (String(especialidadCod) === '101') especialidadCod = 999;
        if (String(especialidadCod) === '109') especialidadCod = 461;
        if (String(especialidadCod) === '112') especialidadCod = 510;
        
        let targetDate = req.query.fecha; 
        let slots = [];
        
        if (targetDate) {
            slots = await availability_service.getAvailableSlots(targetDate, especialidadCod);
        } else {
            // Si no envían fecha, buscamos iterativamente desde HOY hasta 7 días adelante
            const hoy = new Date();
            for (let i = 0; i <= 7; i++) {
                let d = new Date(hoy);
                d.setDate(d.getDate() + i);
                let dateStr = d.toISOString().split('T')[0];
                
                let s = await availability_service.getAvailableSlots(dateStr, especialidadCod);
                if (s && s.length > 0) {
                    slots = s;
                    targetDate = dateStr; // Fijamos la fecha donde encontramos
                    break; // Cortamos en el primer día que tenga disponibilidad
                }
            }
            if (!targetDate) targetDate = hoy.toISOString().split('T')[0]; // fallback
        }
        
        const result = slots.map(s => {
            const timeStr = `${String(s.hh).padStart(2, '0')}:${String(s.mm).padStart(2, '0')}`;
            const horaFinStr = `${String(s.hh).padStart(2, '0')}:${String(Number(s.mm)+20).padStart(2, '0')}`; 
            
            // s.dateDecimal no existe en el objeto devuelto por getAvailableSlots, usamos targetDate
            const dateDec = (s.fechaISO || targetDate).replace(/-/g, '');
            const idVirtual = `${s.doctorId}_${dateDec}_${s.hh}_${s.mm}`;
            
            return {
                id: idVirtual, 
                sede_id: "1",
                doctor_id: String(s.doctorId),
                fecha: s.fechaISO || targetDate,
                hora_inicio: timeStr,
                hora_fin: horaFinStr,
                disponible: s.disponible
            };
        });
        
        return res.status(200).json(result);
    } catch (err) {
        console.error('[HORARIOS ERROR]', err);
        return res.status(500).json({ error: 'Error obteniendo horarios' });
    }
});

// GET /api/mobile/citas — historial completo de citas (sin filtro de fecha)
router.get('/citas', authMiddleware, async (req, res) => {
    try {
        const cedula = req.cedula;
        
        // Buscar el código interno de 14 dígitos del paciente
        const cleanId = cedula.replace(/\D/g, '');
        const pacCod14 = cleanId.padStart(14, '0');
        
        // Query directa sin filtro de fecha — devuelve TODO el historial
        // incluyendo citas pasadas y canceladas
        // Usamos subquery para KC3_ESTADO para evitar duplicados del JOIN
        const rows = await medicalPrisma.$queryRaw`
            SELECT
                t.TME2_CODM         AS medicoId,
                t.TME2_FCH          AS fecha,
                t.TME2_HH           AS hh,
                t.TME2_MM           AS mm,
                t.TME2_CONSULTORIO  AS consultorio,
                LTRIM(RTRIM(m.MED_NOMBRE)) AS medicoNombre,
                (SELECT TOP 1 c.KC3_ESTADO
                 FROM TMCITASUSUARIOS c
                 WHERE c.KC3_MEDICO = t.TME2_CODM
                   AND c.KC3_FCH    = t.TME2_FCH
                   AND c.KC3_HH     = t.TME2_HH
                   AND c.KC3_MM     = t.TME2_MM
                 ORDER BY c.KC3_FCH DESC) AS estado,
                (SELECT TOP 1 c.KC3_ESPECIALISTA
                 FROM TMCITASUSUARIOS c
                 WHERE c.KC3_MEDICO = t.TME2_CODM
                   AND c.KC3_FCH    = t.TME2_FCH
                   AND c.KC3_HH     = t.TME2_HH
                   AND c.KC3_MM     = t.TME2_MM
                 ORDER BY c.KC3_FCH DESC) AS especialidadCod,
                m.MED_ESPECIALIDAD_1 AS medicoEspecialidad
            FROM TMTURNOSMEDICOSDETALLE t
            INNER JOIN TMMEDICOS m ON m.MED_COD = t.TME2_CODM
            WHERE LTRIM(RTRIM(t.TME2_COD)) = LTRIM(RTRIM(${pacCod14}))
            ORDER BY t.TME2_FCH DESC, t.TME2_HH DESC, t.TME2_MM DESC
        `;
        
        const result = rows.map(r => {
            const medicoId = Number(r.medicoId);
            const fechaDec = Number(r.fecha);
            const hh       = Number(r.hh);
            const mm       = Number(r.mm);
            
            // Convertir fecha decimal (ej. 20260811) a YYYY-MM-DD
            const fechaStr = decimalToDateStr(fechaDec);
            
            // Construir ISO date para created_at
            let isoDate;
            try {
                isoDate = new Date(`${fechaStr}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00-05:00`).toISOString();
            } catch (e) {
                isoDate = new Date().toISOString();
            }
            
            // Estado: 'CA' = Cancelada en Xenco
            const estadoXenco = r.estado ? String(r.estado).trim().toUpperCase() : null;
            const estadoLabel = (estadoXenco === 'CA' || estadoXenco === '02') ? 'Cancelada' : 'Programada';
            
            const espCod = String(r.medicoEspecialidad || r.especialidadCod || '999').trim();
            
            return {
                id: `${medicoId}|${fechaDec}|${hh}|${mm}`,
                usuario_id: cedula,
                procedimiento_id: espCod,
                horario_id: 'N/A',
                sede_id: '1',
                estado: estadoLabel,
                observaciones: r.consultorio ? `Consultorio: ${r.consultorio}` : '',
                medico: r.medicoNombre || `Médico ${medicoId}`,
                fecha: fechaStr,
                hora: `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`,
                created_at: isoDate
            };
        });
        
        return res.status(200).json(result);
    } catch (err) {
        console.error('[CITAS MOBILE ERROR]', err);
        return res.status(500).json({ error: 'Error obteniendo citas' });
    }
});

// PATCH /api/mobile/citas/:id — cancelar cita
router.patch('/citas/:id', authMiddleware, async (req, res) => {
    try {
        const citaId = req.params.id;
        const body = req.body;
        
        if (body.estado !== 'Cancelada') {
            return res.status(400).json({ error: 'Solo se permite actualizar el estado a "Cancelada"' });
        }
        
        // El id es el string original que enviamos en el GET /citas (ej. "333|20260811|14|40")
        const cancelado = await availability_service.cancelAppointment(citaId, req.cedula);
        
        if (cancelado) {
            const io = req.app.get('io');
            if (io) {
                io.emit('mobile_appointment_update', {
                    action: 'CANCELLED',
                    details: {
                        cedula: req.cedula,
                        paciente: req.paciente?.nombre_completo,
                        mensaje: `Se canceló la cita con ID: ${citaId}`
                    }
                });
            }
            
            try {
                await botPrisma.mobileAppLog.create({
                    data: {
                        cedula: req.cedula,
                        action: 'CANCELLED',
                        month: new Date().toISOString().substring(0, 7)
                    }
                });
            } catch (logErr) {
                console.error('[MOBILE LOG ERROR]', logErr.message);
            }
            return res.status(200).json({ success: true, message: 'Cita cancelada correctamente' });
        } else {
            return res.status(400).json({ error: 'No se pudo cancelar la cita. Verifica el ID o si ya estaba cancelada.' });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Error interno al cancelar la cita' });
    }
});

// POST /api/mobile/citas — agendamiento
router.post('/citas', authMiddleware, async (req, res) => {
    try {
        const body = req.body;
        const idParts = String(body.horario_id).split('_');
        if (idParts.length !== 4) {
            return res.status(400).json({ error: 'ID de horario inválido' });
        }
        
        const docId = Number(idParts[0]);
        const dateDecStr = idParts[1]; // ej: "20260811"
        const fechaStr = `${dateDecStr.slice(0,4)}-${dateDecStr.slice(4,6)}-${dateDecStr.slice(6,8)}`;
        const horaStr = `${idParts[2]}:${idParts[3].padStart(2, '0')}`;
        
        // Mapeamos el req.paciente extraído de TMUSUARIOSFACTURACION
        const pacienteObj = {
            KC0_COD: req.cedula,
            KC0_NOM: req.paciente.nombre_completo,
            KC0_RES_TEL: req.paciente.telefono,
            KC0_PNOMBRE: req.paciente.primer_nombre,
            KC0_PAPELLIDO: req.paciente.primer_apellido
        };
        
        let especialidadCod = body.procedimiento_id || 999;
        if (String(especialidadCod) === '101') especialidadCod = 999;
        if (String(especialidadCod) === '109') especialidadCod = 461;
        if (String(especialidadCod) === '112') especialidadCod = 510;
        
        const reservado = await availability_service.reserveSlot(
            fechaStr,
            horaStr,
            req.cedula,
            String(especialidadCod),
            docId,
            pacienteObj,
            'Ebejico',
            false
        );
        
        if (reservado) {
            const io = req.app.get('io');
            if (io) {
                io.emit('mobile_appointment_update', {
                    action: 'CREATED',
                    details: {
                        cedula: req.cedula,
                        paciente: req.paciente?.nombre_completo,
                        fecha: fechaStr + ' ' + horaStr,
                        medico: `ID: ${docId}`,
                        sede: 'Ebejico'
                    }
                });
            }
            
            try {
                await botPrisma.mobileAppLog.create({
                    data: {
                        cedula: req.cedula,
                        action: 'CREATED',
                        month: new Date().toISOString().substring(0, 7)
                    }
                });
            } catch (logErr) {
                console.error('[MOBILE LOG ERROR]', logErr.message);
            }
            return res.status(201).json({ success: true, message: 'Cita reservada correctamente' });
        } else {
            return res.status(400).json({ error: 'No se pudo reservar la cita (posiblemente ya ocupada o cruzada)' });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Error al reservar cita' });
    }
});

// GET /api/mobile/recent-logs — obtener los últimos 50 eventos registrados
router.get('/recent-logs', async (req, res) => {
    try {
        const logs = await botPrisma.mobileAppLog.findMany({
            take: 50,
            orderBy: { createdAt: 'desc' }
        });
        
        // Mapear los logs al formato que espera el frontend en `events`
        const mappedLogs = logs.map(log => ({
            id: log.id,
            action: log.action,
            timestamp: log.createdAt,
            details: {
                cedula: log.cedula,
                // Paciente y demás datos no se guardan en MobileAppLog, así que solo pasamos la cédula
                // En un futuro podríamos guardar JSON de details en Prisma si lo requieren.
            }
        })).reverse(); // Invertimos para que el más viejo de los 50 quede primero y el más nuevo al final
        
        return res.status(200).json(mappedLogs);
    } catch (err) {
        console.error('[MOBILE LOGS ERROR]', err);
        return res.status(500).json({ error: 'Error al obtener historial de eventos' });
    }
});

// GET /api/mobile/stats — obtener estadísticas mensuales de la app móvil
router.get('/stats', async (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().substring(0, 7);
        
        const logs = await botPrisma.mobileAppLog.findMany({
            where: { month: month }
        });
        
        const creadas = logs.filter(l => l.action === 'CREATED').length;
        const canceladas = logs.filter(l => l.action === 'CANCELLED').length;
        
        return res.status(200).json({
            month,
            creadas,
            canceladas,
            total: logs.length
        });
    } catch (err) {
        console.error('[MOBILE STATS ERROR]', err);
        return res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// GET /api/mobile/health — health check sin autenticación
router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
