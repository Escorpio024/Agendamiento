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
        const paciente = await medicalPrisma.paciente.findFirst({
            where: { KC0_COD: token },
            select: {
                KC0_COD: true, KC0_TIPO_DOCTO: true, KC0_NOM: true,
                KC0_PNOMBRE: true, KC0_SNOMBRE: true,
                KC0_PAPELLIDO: true, KC0_SAPELLIDO: true,
                KC0_SEXO: true, KC0_FCH_NACE: true,
                KC0_RES_TEL: true, KC0_RES_DIR: true, KC0_ESTADO: true,
            }
        });

        if (!paciente) {
            return res.status(401).json({ error: 'Cédula no encontrada. Verifica el número e intenta de nuevo.' });
        }

        req.cedula   = token;
        req.paciente = paciente;
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

    const { cedula } = req.body;
    if (!cedula || typeof cedula !== 'string') {
        return res.status(400).json({ error: 'El campo "cedula" es requerido.' });
    }

    const cedulaClean = cedula.trim();
    if (!/^[a-zA-Z0-9-]{4,20}$/.test(cedulaClean)) {
        return res.status(400).json({ error: 'Formato de cédula inválido.' });
    }

    try {
        const paciente = await medicalPrisma.paciente.findFirst({
            where: { KC0_COD: cedulaClean },
            select: {
                KC0_COD: true, KC0_TIPO_DOCTO: true, KC0_NOM: true,
                KC0_PNOMBRE: true, KC0_SNOMBRE: true,
                KC0_PAPELLIDO: true, KC0_SAPELLIDO: true,
                KC0_SEXO: true, KC0_FCH_NACE: true,
                KC0_RES_TEL: true, KC0_RES_DIR: true, KC0_ESTADO: true,
            }
        });

        if (!paciente) {
            return res.status(404).json({
                error: 'No se encontró ningún paciente con esa cédula.'
            });
        }

        return res.status(200).json({
            success:  true,
            token:    cedulaClean,
            paciente: formatPaciente(paciente)
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

// GET /api/mobile/citas/proximas — próximas citas del paciente autenticado
router.get('/citas/proximas', authMiddleware, async (req, res) => {
    if (!medicalPrisma) return res.status(503).json({ error: 'Base de datos no disponible.' });

    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const hoy   = todayDecimal();

    try {
        const citas = await medicalPrisma.cita.findMany({
            where: {
                KC3_COD:    req.cedula,
                KC3_FCH:    { gte: hoy },
                KC3_ESTADO: { not: 'AN' },
            },
            orderBy: [{ KC3_FCH: 'asc' }, { KC3_HH: 'asc' }, { KC3_MM: 'asc' }],
            take: limit,
        });

        const medicoCodes = [...new Set(citas.map(c => c.KC3_MEDICO).filter(Boolean))];
        let medicoMap = {};
        if (medicoCodes.length > 0) {
            const medicos = await medicalPrisma.medico.findMany({
                where: { MED_COD: { in: medicoCodes } },
                select: { MED_COD: true, MED_NOMBRE: true }
            });
            medicoMap = Object.fromEntries(medicos.map(m => [String(m.MED_COD), m.MED_NOMBRE?.trim()]));
        }

        const data = citas.map(c => formatCita(c, medicoMap[String(c.KC3_MEDICO)]));
        return res.status(200).json({ data, total: data.length });

    } catch (err) {
        console.error('[CITAS PROXIMAS] Error:', err.message);
        return res.status(500).json({ error: 'Error al obtener las próximas citas.' });
    }
});

// GET /api/mobile/citas/historial — historial de citas pasadas del paciente autenticado
router.get('/citas/historial', authMiddleware, async (req, res) => {
    if (!medicalPrisma) return res.status(503).json({ error: 'Base de datos no disponible.' });

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page  = Math.max(Number(req.query.page)  || 1,  1);
    const skip  = (page - 1) * limit;
    const hoy   = todayDecimal();

    try {
        const [citas, total] = await Promise.all([
            medicalPrisma.cita.findMany({
                where: { KC3_COD: req.cedula, KC3_FCH: { lt: hoy } },
                orderBy: [{ KC3_FCH: 'desc' }, { KC3_HH: 'desc' }],
                take: limit,
                skip: skip,
            }),
            medicalPrisma.cita.count({
                where: { KC3_COD: req.cedula, KC3_FCH: { lt: hoy } }
            })
        ]);

        const medicoCodes = [...new Set(citas.map(c => c.KC3_MEDICO).filter(Boolean))];
        let medicoMap = {};
        if (medicoCodes.length > 0) {
            const medicos = await medicalPrisma.medico.findMany({
                where: { MED_COD: { in: medicoCodes } },
                select: { MED_COD: true, MED_NOMBRE: true }
            });
            medicoMap = Object.fromEntries(medicos.map(m => [String(m.MED_COD), m.MED_NOMBRE?.trim()]));
        }

        const data = citas.map(c => formatCita(c, medicoMap[String(c.KC3_MEDICO)]));
        return res.status(200).json({ data, total, page, limit });

    } catch (err) {
        console.error('[HISTORIAL CITAS] Error:', err.message);
        return res.status(500).json({ error: 'Error al obtener el historial de citas.' });
    }
});

// GET /api/mobile/health — health check sin autenticación
router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
