const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const chatService = require('./chat_service');
const { MessageMedia } = require('whatsapp-web.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const botPrisma = require('./dbBot');
const medicalPrisma = require('./db');
const logger = require('./logger');
const controlCVDService = require('./control_cvd_service');

// ─── CORS: Configurable desde .env ────────────────────────────────────────────
// En desarrollo: CORS_ORIGIN=* (permisivo)
// En producción: CORS_ORIGIN=http://192.168.1.50:3000,http://mi-server.local:3000
const RAW_ORIGINS = process.env.CORS_ORIGIN || '*';
const CORS_ORIGINS = RAW_ORIGINS.trim() === '*'
    ? true  // true = permitir todos (equivale a *)
    : RAW_ORIGINS.split(',').map(o => o.trim());

const corsOptions = {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));   // Limitar JSON body
app.use('/media', express.static(path.join(__dirname, 'public/media')));

// Upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = './public/media';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// ─── Tipos de archivo permitidos para subida ──────────────────────────────────
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|gif|webp|mp4|mp3|ogg|pdf|docx?)$/i;
const ALLOWED_MIMETYPES  = /^(image|video|audio|application\/pdf|application\/msword|application\/vnd\.openxmlformats)/;

const upload = multer({
    storage: storage,
    limits: { fileSize: 16 * 1024 * 1024 },  // 16 MB máximo
    fileFilter: (req, file, cb) => {
        const extOk  = ALLOWED_EXTENSIONS.test(path.extname(file.originalname));
        const mimeOk = ALLOWED_MIMETYPES.test(file.mimetype);
        if (extOk && mimeOk) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo no permitido: ${file.originalname}`));
        }
    }
});

let whatsappClient = null;

// --- API ROUTES ---

// Get Conversations (filter by status)
app.get('/api/conversations', async (req, res) => {
    try {
        const { status } = req.query;
        const conversations = await chatService.getConversations(status || null);
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Messages for a Conversation
app.get('/api/conversations/:id/messages', async (req, res) => {
    try {
        const { id } = req.params;
        const messages = await botPrisma.message.findMany({
            where: { conversationId: id },
            orderBy: { timestamp: 'desc' },
            take: 50
        });
        res.json(messages.reverse());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Appointments History
app.get('/api/appointments', async (req, res) => {
    try {
        const logs = await botPrisma.appointmentLog.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Send Message
app.post('/api/messages/send', upload.single('file'), async (req, res) => {
    try {
        const { conversationId, text } = req.body;
        const file = req.file;

        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp Client not ready' });
        }

        let sentMsg;
        let mediaUrl = null;
        if (file) {
            const media = MessageMedia.fromFilePath(file.path);
            sentMsg = await whatsappClient.sendMessage(conversationId, media, { caption: text });
            mediaUrl = `/media/${path.basename(file.path)}`;
        } else if (text) {
            sentMsg = await whatsappClient.sendMessage(conversationId, text);
        } else {
            return res.status(400).json({ error: 'Message or file required' });
        }

        // Save to DB immediately so the UI reflects the sent message in real-time.
        // The 'message_create' event in index.js will try to upsert and skip the duplicate.
        const msgId = sentMsg.id._serialized;
        const timestamp = new Date();
        let savedMsg;
        try {
            savedMsg = await botPrisma.message.upsert({
                where: { id: msgId },
                update: {},
                create: {
                    id: msgId,
                    conversationId: conversationId,
                    fromMe: true,
                    body: text || '',
                    type: file ? 'image' : 'chat',
                    mediaUrl: mediaUrl,
                    timestamp: timestamp
                }
            });
        } catch (dbErr) {
            console.warn('[Send] Could not save sent message to DB:', dbErr.message);
            savedMsg = { id: msgId, conversationId, fromMe: true, body: text || '', timestamp };
        }

        // Emit the sent message to all connected frontend clients in real-time
        io.emit('new_message', savedMsg);

        res.json({ success: true, id: msgId });

    } catch (error) {
        console.error('Send Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Assign Agent / Change Status
app.post('/api/conversations/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'bot', 'pending', 'assigned', 'resolved'

        const updated = await chatService.updateStatus(id, status);
        io.emit('conversation_updated', updated); // Notify all clients

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enviar recordatorios manualmente a todos
app.post('/api/send-reminders', async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp no conectado' });
        }
        const reminderService = require('./reminder_service');
        reminderService.setClient(whatsappClient);
        const result = await reminderService.sendReminders();
        const sent = result || 0;
        console.log(`[RECORDATORIOS MANUALES] Enviados: ${sent}`);
        res.json({ success: true, sent });
    } catch (error) {
        console.error('Error enviando recordatorios:', error);
        res.status(500).json({ error: error.message });
    }
});

// Enviar recordatorio manual para UNA sola cita
app.post('/api/appointments/:id/remind', async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.status(503).json({ error: 'WhatsApp no conectado' });
        }
        
        const { id } = req.params;
        const appt = await botPrisma.appointmentLog.findUnique({ where: { id } });
        
        if (!appt) {
            return res.status(404).json({ error: 'Cita no encontrada en el historial' });
        }

        const mensaje = `🔔 *¡Hola! Te recordamos tu cita médica para el ${appt.appointmentDate}*\n\n👤 *Paciente:* ${appt.patientName}\n🏥 *Servicio:* ${appt.serviceType || 'Medicina General'}\n📅 *Fecha:* ${appt.appointmentDate}\n🕐 *Hora:* ${appt.appointmentTime || 'N/A'}\n👨‍⚕️ *Doctor:* ${appt.doctorName || 'Asignado'}\n\nPor favor llega con 15 minutos de anticipación. 😊`;
        
        await whatsappClient.sendMessage(appt.whatsappId, mensaje);
        console.log(`[RECORDATORIO INDIVIDUAL] Enviado a ${appt.whatsappId} para cita ${id}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error enviando recordatorio individual:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── MÓDULO CARDIOVASCULAR ────────────────────────────────────────────────────

// GET /api/cardiovascular/controles — Listar controles a 3 meses
app.get('/api/cardiovascular/controles', async (req, res) => {
    try {
        const controles = await botPrisma.controlReminder.findMany({
            orderBy: { fechaControl: 'asc' }
        });
        
        const enriched = await Promise.all(controles.map(async (c) => {
            let telefono = await controlCVDService.getWhatsAppId(c.cedula);
            if (telefono) {
                telefono = telefono.replace('@c.us', '');
            }
            
            // Si la cita ya está agendada, verificamos en tiempo real en Xenco si sigue activa o si el paciente la canceló.
            let xencoEstado = null;
            if (c.estado === 'BOOKED' || c.estado === 'BOOKED_AND_REMINDED') {
                if (c.citaFch) {
                    try {
                        const cedula14 = c.cedula.padStart(14, '0');
                        const cedulaSinCeros = c.cedula.replace(/^0+/, '');
                        const sqlCita = `
                            SELECT TOP 1 KC3_ESTADO 
                            FROM TMCITASUSUARIOS 
                            WHERE KC3_FCH = ${c.citaFch} 
                              AND (KC3_COD = '${cedula14}' OR KC3_COD = '${cedulaSinCeros}' OR KC3_COD = '${c.cedula}')
                              AND KC3_MEDICO = ${c.citaMedico || 0}
                        `;
                        const resCita = await medicalPrisma.$queryRawUnsafe(sqlCita);
                        if (resCita && resCita.length > 0) {
                            // En Xenco: C = Cancelada
                            xencoEstado = String(resCita[0].KC3_ESTADO).trim();
                        } else {
                            // Si no se encontró la cita, asumimos que fue borrada/cancelada
                            xencoEstado = 'C';
                        }
                    } catch (err) {
                        logger.error('[CARDIOVASCULAR] Error consultando estado en Xenco:', err.message);
                    }
                }
            }

            return { 
                ...c, 
                telefono: telefono || 'SIN TELÉFONO',
                canceladaEnXenco: xencoEstado === 'C'
            };
        }));

        res.json(enriched);
    } catch (error) {
        logger.error('[CARDIOVASCULAR] Error obteniendo controles:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/cardiovascular/controles/:id — Eliminar control a 3 meses
app.delete('/api/cardiovascular/controles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await botPrisma.controlReminder.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        logger.error('[CARDIOVASCULAR] Error eliminando control:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/cardiovascular/controles/procesar-pendientes — Disparar agendamiento AHORA para pendientes
app.post('/api/cardiovascular/controles/procesar-pendientes', async (req, res) => {
    try {
        const totalPending = await botPrisma.controlReminder.count({ where: { estado: { in: ['PENDING', 'BOOKING_FAILED_NO_SLOT'] } } });
        if (totalPending === 0) {
            return res.json({ success: true, message: 'No hay controles pendientes para procesar.', procesados: 0 });
        }
        // Responder inmediatamente y luego procesar en background
        res.json({ 
            success: true, 
            message: `Iniciando agendamiento para ${totalPending} controles pendientes. Los pacientes recibirán su confirmación de WhatsApp en los próximos minutos.`, 
            procesados: totalPending 
        });
        setImmediate(() => {
            controlCVDService.executeImmediateBooking()
                .catch(e => logger.error('[CARDIOVASCULAR] Error en agendamiento manual:', e.message));
        });
    } catch (error) {
        logger.error('[CARDIOVASCULAR] Error iniciando agendamiento manual:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/cardiovascular/controles/scan-presenciales — Verifica masivamente en Xenco quién ya tiene cita agendada presencialmente
app.post('/api/cardiovascular/controles/scan-presenciales', async (req, res) => {
    try {
        const total = await botPrisma.controlReminder.count({
            where: { estado: { in: ['BOOKING_FAILED_NO_SLOT', 'PENDING', 'BOOKING_FAILED_XENCO', 'FAILED_NO_PHONE'] } }
        });
        if (total === 0) {
            return res.json({ success: true, message: 'No hay pacientes pendientes para escanear.', total: 0, marcados: 0 });
        }
        // Responder inmediatamente, procesar en background
        res.json({ success: true, message: `Escaneando ${total} pacientes contra Xenco... El Visor se actualizará en los próximos minutos.`, total });
        setImmediate(() => {
            controlCVDService.scanAndMarkPresencial()
                .catch(e => logger.error('[CARDIOVASCULAR] Error en escaneo masivo:', e.message));
        });
    } catch (error) {
        logger.error('[CARDIOVASCULAR] Error iniciando escaneo masivo:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// Códigos CUPS de exámenes cardiovasculares (exactos tal como aparecen en Xenco)
const CVD_CODES = [
    // Creatinina en suero / orina
    '903895', '*903895', '903876', '*903876',
    // Hemoglobina Glicosilada (HbA1c)
    '903426', '*903426', '903427', '*903427',
    // LDL Colesterol
    '903817', '*903817',
    // Microalbuminuria
    '903026', '*903026', '903028', '*903028',
    // Colesterol de Alta Densidad (HDL)
    '903815', '*903815',
    // Colesterol Total
    '903818', '*903818',
    // Triglicéridos
    '903868', '*903868',
    // Uroanálisis con sedimento y densidad urinaria
    '907106', '*907106',
    // Glucosa en suero / LCR / otro fluido
    '903841', '*903841',
    // Hemograma IV (Hemoglobina, Hematocrito, Recuento de Plaquetas)
    '902210', '*902210',
];

const CVD_CODES_SQL = CVD_CODES.map(c => `'${c}'`).join(',');

// GET /api/cardiovascular/patient/:id
app.get('/api/cardiovascular/patient/:id', async (req, res) => {
    try {
        // ── Validar cédula: solo dígitos, entre 5 y 15 caracteres ──
        const rawId = req.params.id || '';
        const cedula = rawId.replace(/\D/g, '');
        if (!cedula || cedula.length < 5 || cedula.length > 15) {
            return res.status(400).json({ error: 'Documento inválido. Debe contener entre 5 y 15 dígitos.' });
        }
        const cedula14 = cedula.padStart(14, '0');

        // ── 1. Datos del paciente ──
        const pacRows = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 1
                LTRIM(RTRIM(KC2_PNOMBRE))   AS pnombre,
                LTRIM(RTRIM(KC2_SNOMBRE))   AS snombre,
                LTRIM(RTRIM(KC2_PAPELLIDO)) AS papellido,
                LTRIM(RTRIM(KC2_SAPELLIDO)) AS sapellido,
                KC2_OACOD_NUI               AS nui,
                KC2_COD                     AS cod,
                KC2_TEL_RESP                AS telefono,
                KC_FCH_NACE                 AS fch_nace,
                LTRIM(RTRIM(ENT_NOMBRE))    AS entidad
            FROM TMUSUARIOSFACTURACION
            LEFT JOIN TKCLIENTES  ON KC2_ZONA = KC_ZONA AND KC2_COD = KC_COD AND KC2_SEQK = KC_SEQK
            LEFT JOIN TMENTIDADES ON ENT_COD = KC2_EPS_POS
            WHERE KC2_OACOD_NUI = '${cedula}'
               OR KC2_COD = '${cedula14}'
            ORDER BY KC2_FCH_DIG DESC
        `);

        if (!pacRows.length) return res.status(404).json({ error: 'Paciente no encontrado' });
        const p = pacRows[0];

        const nombre = [p.papellido, p.sapellido, p.pnombre, p.snombre].filter(Boolean).join(' ').trim();
        let edad = null;
        if (p.fch_nace && p.fch_nace > 0) {
            const nacStr = String(p.fch_nace).padStart(8, '0');
            const nac = new Date(
                parseInt(nacStr.slice(0,4)),
                parseInt(nacStr.slice(4,6)) - 1,
                parseInt(nacStr.slice(6,8))
            );
            edad = Math.floor((new Date() - nac) / (365.25 * 24 * 3600 * 1000));
        }

        // Buscar celular en TKCLIENTESANEXO5 si no tiene en facturación
        let telefono = p.telefono?.trim() || null;
        if (!telefono || /^0+$/.test(telefono)) {
            const kc5 = await medicalPrisma.$queryRawUnsafe(`
                SELECT TOP 1 KC5_TEL_CEL FROM TKCLIENTESANEXO5
                WHERE KC5_RACOD_CLI IN ('${cedula}', '${cedula14}')
            `);
            telefono = kc5[0]?.KC5_TEL_CEL?.trim() || null;
        }

        const patient = { nombre, documento: cedula, edad, telefono, entidad: p.entidad };

        // ── 1.1 Filtrar 6 meses atrás para programados/pendientes ──
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        const dateStr = parseInt(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`);

        // ── 2. PROGRAMADOS: médico ordenó el examen (con fecha de conducta/orden médica)
        //       Se muestran AUNQUE ya hayan pasado por facturación/TYORDENESLABENVIADAS,
        //       porque la fecha de la orden médica ES la fecha programada del examen.
        const programadosRows = await medicalPrisma.$queryRawUnsafe(`
            WITH TodasLasOrdenes AS (
                SELECT
                    QLO_COD_ARTIC                   AS codigo,
                    LTRIM(RTRIM(QLO_NOM_DESC))      AS tipoExamen,
                    QLO_FCH                         AS fecha,
                    CAST(QLO_NUM_MED AS VARCHAR)    AS doctor_id
                FROM TQORDENESMEDICAS
                WHERE QLO_COD = '${cedula14}'
                  AND QLO_COD_ARTIC IN (${CVD_CODES_SQL})
                  AND (QLO_EST_ANULADO IS NULL OR QLO_EST_ANULADO = '')
                  AND QLO_FCH >= ${dateStr}

                UNION ALL

                SELECT
                    QM3_COD_ARTIC                   AS codigo,
                    LTRIM(RTRIM(QM3_NOM_DESC))      AS tipoExamen,
                    QM3_FCH                         AS fecha,
                    CAST(QM3_COD_MEDICO AS VARCHAR) AS doctor_id
                FROM TQMOVIMIENTOCONDUCTASD
                WHERE QM3_COD = '${cedula14}'
                  AND QM3_COD_ARTIC IN (${CVD_CODES_SQL})
                  AND QM3_FCH >= ${dateStr}

                UNION ALL

                SELECT 
                    d.QJY_ARTIC                     AS codigo,
                    LTRIM(RTRIM(d.QJY_NOM_DESC))    AS tipoExamen,
                    e.QJ0_FCH                       AS fecha,
                    CAST(e.QJ0_NUM_MED AS VARCHAR)  AS doctor_id
                FROM TQFORMATOS3047D d
                INNER JOIN TQFORMATOS3047 e 
                    ON d.QJY_TIPO = e.QJ0_TIPO 
                    AND d.QJY_NUM = e.QJ0_NUM
                WHERE (e.QJ0_NUM_NDOC = '${cedula}' OR e.QJ0_COD = '${cedula14}')
                  AND d.QJY_ARTIC IN (${CVD_CODES_SQL})
                  AND e.QJ0_FCH >= ${dateStr}
            )
            SELECT
                o.codigo,
                MAX(o.tipoExamen) AS tipoExamen,
                MAX(o.fecha)      AS fecha,
                MAX(LTRIM(RTRIM(m.MED_NOMBRE))) AS doctor
            FROM TodasLasOrdenes o
            LEFT JOIN TMMEDICOS m ON CAST(m.MED_COD AS VARCHAR) = o.doctor_id
            -- Excluir solo los que ya fueron procesados por el laboratorio (realizados) después de la fecha de la orden
            WHERE NOT EXISTS (
                SELECT 1 FROM TYORDENESLABENVIADAS y
                WHERE REPLACE(y.YKL_ARTIC, '*', '') = REPLACE(o.codigo, '*', '')
                  AND CAST(TRY_CAST(y.YKL_NUMERO_ID AS BIGINT) AS VARCHAR) = '${cedula}'
                  AND y.YKL_PROCESADA_LAB = 'S'
                  AND y.YKL_FECHA >= o.fecha
            )
            GROUP BY o.codigo
            ORDER BY MAX(o.fecha) DESC
        `);

        const programados = programadosRows.map(r => ({
            id: `prog-${r.codigo}`,
            codigo: r.codigo,
            tipoExamen: r.tipoExamen || r.codigo,
            fecha: r.fecha ? String(r.fecha).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : null,
            doctor: r.doctor?.trim() || null
        }));

        // ── 3. PENDIENTES: en TYORDENESLABENVIADAS sin procesar, Y que NO tienen
        //       origen en una conducta/orden médica reciente (esos ya van en Programados).
        const pendientesRows = await medicalPrisma.$queryRawUnsafe(`
            SELECT
                y.YKL_ARTIC AS codigo,
                MAX(LTRIM(RTRIM(y.YKL_NOM_ARTIC))) AS tipoExamen,
                MAX(y.YKL_FECHA) AS fecha,
                (
                    SELECT TOP 1 LTRIM(RTRIM(med.MED_NOMBRE))
                    FROM (
                        SELECT QLO_NUM_MED AS doc_id, QLO_FCH AS fch FROM TQORDENESMEDICAS
                        WHERE QLO_COD = '${cedula14}' AND REPLACE(QLO_COD_ARTIC, '*', '') = REPLACE(y.YKL_ARTIC, '*', '')
                        UNION ALL
                        SELECT QM3_COD_MEDICO AS doc_id, QM3_FCH AS fch FROM TQMOVIMIENTOCONDUCTASD
                        WHERE QM3_COD = '${cedula14}' AND REPLACE(QM3_COD_ARTIC, '*', '') = REPLACE(y.YKL_ARTIC, '*', '')
                        UNION ALL
                        SELECT e.QJ0_NUM_MED AS doc_id, e.QJ0_FCH AS fch 
                        FROM TQFORMATOS3047D d
                        INNER JOIN TQFORMATOS3047 e ON d.QJY_TIPO = e.QJ0_TIPO AND d.QJY_NUM = e.QJ0_NUM
                        WHERE (e.QJ0_NUM_NDOC = '${cedula}' OR e.QJ0_COD = '${cedula14}') 
                          AND REPLACE(d.QJY_ARTIC, '*', '') = REPLACE(y.YKL_ARTIC, '*', '')
                    ) t
                    LEFT JOIN TMMEDICOS med ON CAST(med.MED_COD AS VARCHAR) = CAST(t.doc_id AS VARCHAR)
                    ORDER BY t.fch DESC
                ) AS doctor
            FROM TYORDENESLABENVIADAS y
            WHERE CAST(TRY_CAST(y.YKL_NUMERO_ID AS BIGINT) AS VARCHAR) = '${cedula}'
              AND y.YKL_ARTIC IN (${CVD_CODES_SQL})
              AND (y.YKL_PROCESADA_LAB IS NULL OR y.YKL_PROCESADA_LAB = '')
              -- Solo mostrar como pendiente si NO tiene orden médica reciente (esos van en Programados)
              AND NOT EXISTS (
                  SELECT 1 FROM TQMOVIMIENTOCONDUCTASD qm
                  WHERE qm.QM3_COD = '${cedula14}'
                    AND REPLACE(qm.QM3_COD_ARTIC, '*', '') = REPLACE(y.YKL_ARTIC, '*', '')
                    AND qm.QM3_FCH >= ${dateStr}
              )
              AND NOT EXISTS (
                  SELECT 1 FROM TQORDENESMEDICAS ql
                  WHERE ql.QLO_COD = '${cedula14}'
                    AND REPLACE(ql.QLO_COD_ARTIC, '*', '') = REPLACE(y.YKL_ARTIC, '*', '')
                    AND ql.QLO_FCH >= ${dateStr}
                    AND (ql.QLO_EST_ANULADO IS NULL OR ql.QLO_EST_ANULADO = '')
              )
              AND NOT EXISTS (
                  SELECT 1 FROM TQFORMATOS3047D d
                  INNER JOIN TQFORMATOS3047 e ON d.QJY_TIPO = e.QJ0_TIPO AND d.QJY_NUM = e.QJ0_NUM
                  WHERE (e.QJ0_NUM_NDOC = '${cedula}' OR e.QJ0_COD = '${cedula14}')
                    AND REPLACE(d.QJY_ARTIC, '*', '') = REPLACE(y.YKL_ARTIC, '*', '')
                    AND e.QJ0_FCH >= ${dateStr}
              )
              AND y.YKL_FECHA >= ${dateStr}
            GROUP BY y.YKL_ARTIC
            ORDER BY MAX(y.YKL_FECHA) DESC
        `);

        const pendientes = pendientesRows.map(r => ({
            id: `pend-${r.codigo}`,
            codigo: r.codigo,
            tipoExamen: r.tipoExamen || r.codigo,
            fecha: r.fecha ? String(r.fecha).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : null,
            doctor: r.doctor?.trim() || null
        }));

        // ── 4. REALIZADOS: lab ya los procesó (una fila por tipo de examen) ──
        const realizadosRows = await medicalPrisma.$queryRawUnsafe(`
            SELECT
                y.YKL_ARTIC AS codigo,
                MAX(LTRIM(RTRIM(y.YKL_NOM_ARTIC))) AS tipoExamen,
                MAX(y.YKL_FECHA) AS fecha,
                (
                    SELECT TOP 1 LTRIM(RTRIM(med.MED_NOMBRE))
                    FROM (
                        SELECT QLO_NUM_MED AS doc_id, QLO_FCH AS fch FROM TQORDENESMEDICAS 
                        WHERE QLO_COD = '${cedula14}' AND REPLACE(QLO_COD_ARTIC, '*', '') = REPLACE(y.YKL_ARTIC, '*', '')
                        UNION ALL
                        SELECT QM3_COD_MEDICO AS doc_id, QM3_FCH AS fch FROM TQMOVIMIENTOCONDUCTASD
                        WHERE QM3_COD = '${cedula14}' AND REPLACE(QM3_COD_ARTIC, '*', '') = REPLACE(y.YKL_ARTIC, '*', '')
                    ) t
                    LEFT JOIN TMMEDICOS med ON CAST(med.MED_COD AS VARCHAR) = CAST(t.doc_id AS VARCHAR)
                    ORDER BY t.fch DESC
                ) AS doctor
            FROM TYORDENESLABENVIADAS y
            WHERE CAST(TRY_CAST(y.YKL_NUMERO_ID AS BIGINT) AS VARCHAR) = '${cedula}'
              AND y.YKL_ARTIC IN (${CVD_CODES_SQL})
              AND y.YKL_PROCESADA_LAB = 'S'
            GROUP BY y.YKL_ARTIC
            ORDER BY MAX(y.YKL_FECHA) DESC
        `);

        const realizados = realizadosRows.map(r => ({
            id: `real-${r.codigo}`,
            codigo: r.codigo,
            tipoExamen: r.tipoExamen || r.codigo,
            fecha: r.fecha ? String(r.fecha).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : null,
            doctor: r.doctor?.trim() || null
        }));

        res.json({ patient, programados, pendientes, realizados });

    } catch (error) {
        console.error('[CARDIOVASCULAR] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/cardiovascular/remind/:id — Recordatorio por WhatsApp
app.post('/api/cardiovascular/remind/:id', async (req, res) => {
    try {
        const examId  = decodeURIComponent(req.params.id);
        const { cedula, telefono, examen } = req.body;

        // En modo desarrollo sin WhatsApp activo
        if (!whatsappClient) {
            return res.status(503).json({
                error: 'WhatsApp no está conectado. Activa el bot (NO_WHATSAPP=false) para enviar recordatorios.'
            });
        }

        // ── Resolver el número de teléfono real del paciente ──────────────────
        // Prioridad: telefono enviado por el frontend → buscar en BD por cédula
        let rawPhone = telefono ? String(telefono).replace(/\D/g, '') : null;

        // Si el frontend no envió teléfono, intentar buscarlo en la BD
        if (!rawPhone && cedula) {
            const cedLimpia = String(cedula).replace(/\D/g, '');
            const cedula14  = cedLimpia.padStart(14, '0');
            try {
                const rows = await medicalPrisma.$queryRawUnsafe(`
                    SELECT TOP 1 KC5_TEL_CEL FROM TKCLIENTESANEXO5
                    WHERE KC5_RACOD_CLI IN ('${cedLimpia}', '${cedula14}')
                      AND KC5_TEL_CEL IS NOT NULL AND KC5_TEL_CEL <> ''
                `);
                if (rows[0]?.KC5_TEL_CEL) rawPhone = String(rows[0].KC5_TEL_CEL).replace(/\D/g, '');
            } catch (e) {
                logger.warn('[CARDIOVASCULAR] No se pudo buscar teléfono en BD:', e.message);
            }
        }

        // Validar que tengamos un teléfono con longitud razonable
        if (!rawPhone || rawPhone.length < 7) {
            return res.status(400).json({
                error: 'No se encontró número de WhatsApp para este paciente. Verifica que tenga teléfono registrado.'
            });
        }

        // Construir JID de WhatsApp (formato Colombia: 57 + 10 dígitos)
        // Si el número tiene 10 dígitos, agregar prefijo país
        const digits = rawPhone.length === 10 ? `57${rawPhone}` : rawPhone;
        const waId   = `${digits}@c.us`;

        const ochoDias = new Date();
        ochoDias.setDate(ochoDias.getDate() + 8);
        const fechaDeseada = ochoDias.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

        const msg = `🔔 *RECORDATORIO — Exámenes de Riesgo Cardiovascular*\n\nHola, te recordamos que tienes exámenes pendientes por realizar:\n\n🧪 *${examen || 'Exámenes cardiovasculares'}*\n\n⚠️ *IMPORTANTE:* Recuerda que *TODOS* los exámenes te los debes realizar el *mismo día*.\n\n📅 Te sugerimos acercarte a nuestra institución para realizarlos en aproximadamente 8 días, es decir, alrededor del *${fechaDeseada}*. 😊\n\n_Agente Aurora — Sistema de Agendamiento_`;
        await whatsappClient.sendMessage(waId, msg);
        logger.info(`[CARDIOVASCULAR] ✅ Recordatorio enviado a ${waId} — examen: ${examId}`);
        res.json({ success: true });
    } catch (error) {
        logger.warn('[CARDIOVASCULAR] Error en remind:', error.message);
        res.status(500).json({ error: error.message });
    }
});



// POST /api/cardiovascular/schedule/:id — Placeholder agendamiento
app.post('/api/cardiovascular/schedule/:id', async (req, res) => {
    res.json({ success: true, message: 'Funcionalidad en desarrollo' });
});

// ─── PUT /api/cardiovascular/patient/:cedula — Actualizar datos del paciente ──
app.put('/api/cardiovascular/patient/:cedula', async (req, res) => {
    try {
        const rawId   = req.params.cedula || '';
        const cedula  = rawId.replace(/\D/g, '');
        if (!cedula || cedula.length < 5 || cedula.length > 15) {
            return res.status(400).json({ error: 'Documento inválido.' });
        }
        const cedula14 = cedula.padStart(14, '0');
        const { telefono } = req.body;

        if (!telefono) {
            return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
        }

        const telLimpio = String(telefono).replace(/\D/g, '');
        if (telLimpio.length < 7 || telLimpio.length > 15) {
            return res.status(400).json({ error: 'Número de teléfono inválido.' });
        }

        // Actualizar en TKCLIENTESANEXO5 si existe el registro, sino insertar
        const existeAnexo = await medicalPrisma.$queryRawUnsafe(`
            SELECT TOP 1 KC5_RACOD_CLI FROM TKCLIENTESANEXO5
            WHERE KC5_RACOD_CLI IN ('${cedula}', '${cedula14}')
        `);

        if (existeAnexo.length > 0) {
            await medicalPrisma.$executeRawUnsafe(`
                UPDATE TKCLIENTESANEXO5
                SET KC5_TEL_CEL = '${telLimpio}'
                WHERE KC5_RACOD_CLI IN ('${cedula}', '${cedula14}')
            `);
        } else {
            // Intentar actualizar KC2_TEL_RESP como fallback
            await medicalPrisma.$executeRawUnsafe(`
                UPDATE TMUSUARIOSFACTURACION
                SET KC2_TEL_RESP = '${telLimpio}'
                WHERE KC2_OACOD_NUI = '${cedula}' OR KC2_COD = '${cedula14}'
            `);
        }

        logger.info(`[CARDIOVASCULAR] Teléfono actualizado para cédula ${cedula}: ${telLimpio}`);
        res.json({ success: true, telefono: telLimpio });
    } catch (error) {
        logger.warn('[CARDIOVASCULAR] Error al actualizar paciente:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/cardiovascular/programado/remove — Registrar eliminación ───────
app.post('/api/cardiovascular/programado/remove', async (req, res) => {
    try {
        const { cedula, examCodigo, tipoExamen, fecha, doctor, motivo } = req.body;
        if (!cedula || !examCodigo || !tipoExamen) {
            return res.status(400).json({ error: 'Faltan campos requeridos.' });
        }
        const registro = await botPrisma.cvdProgramadoHistorial.create({
            data: {
                cedula:     String(cedula).replace(/\D/g, ''),
                examCodigo: String(examCodigo),
                tipoExamen: String(tipoExamen),
                fecha:      fecha  || null,
                doctor:     doctor || null,
                accion:     'ELIMINADO',
                motivo:     motivo || null,
            }
        });
        logger.info(`[CARDIOVASCULAR] Eliminación registrada: ${examCodigo} — cédula ${cedula}`);
        res.json({ success: true, id: registro.id });
    } catch (error) {
        logger.warn('[CARDIOVASCULAR] Error al registrar eliminación:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/cardiovascular/historial/:cedula — Historial de movimientos ─────
app.get('/api/cardiovascular/historial/:cedula', async (req, res) => {
    try {
        const cedula = String(req.params.cedula || '').replace(/\D/g, '');
        if (!cedula || cedula.length < 5) {
            return res.status(400).json({ error: 'Cédula inválida.' });
        }
        const registros = await botPrisma.cvdProgramadoHistorial.findMany({
            where: { cedula },
            orderBy: { creadoEn: 'desc' },
            take: 100,
        });
        res.json(registros);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/cardiovascular/medicos-cvd — Lista médicos activos ──────────────
app.get('/api/cardiovascular/medicos-cvd', async (req, res) => {
    try {
        const hoy    = new Date();
        const hace30 = new Date(); hace30.setDate(hoy.getDate() - 30);
        const toDecimal = d => parseInt(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`);
        const desde  = toDecimal(hace30);
        const hasta  = toDecimal(new Date(hoy.getFullYear(), hoy.getMonth() + 3, 0));

        const medicos = await medicalPrisma.$queryRaw`
            SELECT DISTINCT
                CAST(m.MED_COD AS BIGINT)       AS cod,
                LTRIM(RTRIM(m.MED_NOMBRE))      AS nombre
            FROM TMMEDICOS m
            INNER JOIN TMTURNOSMEDICOSDETALLE t ON t.TME2_CODM = m.MED_COD
            WHERE t.TME2_FCH BETWEEN ${desde} AND ${hasta}
              AND m.MED_NOMBRE IS NOT NULL
              AND m.MED_EST_ESTADO = 'A'
            ORDER BY nombre
        `;
        res.json(medicos.map(m => ({ cod: Number(m.cod), nombre: m.nombre })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/cardiovascular/cita — Guardar cita programada localmente ───────
app.post('/api/cardiovascular/cita', async (req, res) => {
    try {
        const { cedula, paciente, doctorId, doctorNombre, examCodigo, tipoExamen, fecha, hora, notas } = req.body;
        if (!cedula || !examCodigo || !tipoExamen) {
            return res.status(400).json({ error: 'Faltan campos requeridos.' });
        }
        const cita = await botPrisma.cvdCitaProgramada.create({
            data: {
                cedula:      String(cedula).replace(/\D/g, ''),
                paciente:    String(paciente  || ''),
                doctorId:    doctorId    ? String(doctorId)    : null,
                doctorNombre:doctorNombre ? String(doctorNombre): null,
                examCodigo:  String(examCodigo),
                tipoExamen:  String(tipoExamen),
                fecha:       fecha  || null,
                hora:        hora   || null,
                notas:       notas  || null,
            }
        });
        // También registrar en historial como "PROGRAMADO"
        await botPrisma.cvdProgramadoHistorial.create({
            data: {
                cedula:     String(cedula).replace(/\D/g, ''),
                examCodigo: String(examCodigo),
                tipoExamen: String(tipoExamen),
                fecha:      fecha  || null,
                doctor:     doctorNombre || null,
                accion:     'PROGRAMADO',
                motivo:     `Cita programada para el ${fecha || 'sin fecha'} con ${doctorNombre || 'médico no asignado'}`,
            }
        });
        logger.info(`[CARDIOVASCULAR] Cita programada: ${tipoExamen} — cédula ${cedula}`);
        res.json({ success: true, id: cita.id });
    } catch (error) {
        logger.warn('[CARDIOVASCULAR] Error al programar cita:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── VISOR DE AGENDA ────────────────────────────────────────────────────────

// GET /api/visor/medicos — Lista de médicos con agenda activa
app.get('/api/visor/medicos', async (req, res) => {
    try {
        const hoy = new Date();
        const hace30 = new Date(); hace30.setDate(hoy.getDate() - 30);
        const toDecimal = d => parseInt(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`);
        const desde = toDecimal(hace30);
        const hasta = toDecimal(new Date(hoy.getFullYear(), hoy.getMonth() + 3, 0));

        const medicos = await medicalPrisma.$queryRaw`
            SELECT cod, nombre FROM (
                SELECT DISTINCT
                    CAST(m.MED_COD AS BIGINT)           AS cod,
                    LTRIM(RTRIM(m.MED_NOMBRE))          AS nombre
                FROM TMMEDICOS m
                INNER JOIN TMTURNOSMEDICOSDETALLE t ON t.TME2_CODM = m.MED_COD
                WHERE t.TME2_FCH BETWEEN ${desde} AND ${hasta}
                  AND m.MED_NOMBRE IS NOT NULL
                  AND m.MED_EST_ESTADO = 'A'
            ) sub
            ORDER BY nombre
        `;
        res.json(medicos.map(m => ({ cod: Number(m.cod), nombre: m.nombre })));
    } catch (e) {
        console.error('[VISOR] Error /medicos:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/visor/agenda?medicoId=X&fecha=YYYYMMDD&filtro=todos|asignados|libres
app.get('/api/visor/agenda', async (req, res) => {
    try {
        const medicoId = parseInt(req.query.medicoId);
        const fecha    = parseInt(req.query.fecha);
        if (!medicoId || !fecha) return res.status(400).json({ error: 'medicoId y fecha requeridos' });

        const slots = await medicalPrisma.$queryRaw`
            SELECT
                ROW_NUMBER() OVER (ORDER BY t.TME2_HH, t.TME2_MM) as lin,
                t.TME2_SEQ  as seq,
                t.TME2_HH   as hh,
                t.TME2_MM   as mm,
                ISNULL(LTRIM(RTRIM(t.TME2_COD)), '')          as cod,
                ISNULL(LTRIM(RTRIM(c.KC3_USUARIO)), '') as usuario,
                ISNULL(LTRIM(RTRIM(t.TME2_CONSULTORIO)), '')  as consultorio,
                ISNULL(LTRIM(RTRIM(t.TME2_ESTADO)), '')       as estado,
                c.KC3_ENTIDAD                                  as entidadCod,
                ISNULL(LTRIM(RTRIM(e.ENT_NOMBRE)), '')         as entidadNom,
                ISNULL(LTRIM(RTRIM(c.KC3_ESTADO)), '')         as citaEstado,
                ISNULL(LTRIM(RTRIM(
                    ISNULL(f.KC2_PNOMBRE,'') + ' ' + ISNULL(f.KC2_PAPELLIDO,'')
                )), '') as pacienteNom,
                ISNULL(LTRIM(RTRIM(
                    CASE 
                         WHEN f.KC2_TEL_RESP IS NOT NULL AND f.KC2_TEL_RESP <> '0000000000' AND f.KC2_TEL_RESP <> '' THEN f.KC2_TEL_RESP
                         WHEN f.KC2_TEL_ACOMP IS NOT NULL AND f.KC2_TEL_ACOMP <> '0000000000' AND f.KC2_TEL_ACOMP <> '' THEN f.KC2_TEL_ACOMP
                         WHEN cl.KC_TEL1 IS NOT NULL AND cl.KC_TEL1 <> '0000000000' AND cl.KC_TEL1 <> '' THEN cl.KC_TEL1
                         ELSE ''
                    END
                )), '') as telefono,
                COALESCE(
                    NULLIF(f.KC2_EDAD, 0),
                    CASE
                        WHEN a.KC0_FCH_NACE IS NOT NULL AND a.KC0_FCH_NACE > 19000101
                        THEN DATEDIFF(YEAR,
                            DATEFROMPARTS(a.KC0_FCH_NACE/10000, (a.KC0_FCH_NACE%10000)/100, a.KC0_FCH_NACE%100),
                            GETDATE())
                        WHEN cl.KC_FCH_NACE IS NOT NULL AND cl.KC_FCH_NACE > 19000101
                        THEN DATEDIFF(YEAR,
                            DATEFROMPARTS(cl.KC_FCH_NACE/10000, (cl.KC_FCH_NACE%10000)/100, cl.KC_FCH_NACE%100),
                            GETDATE())
                        ELSE NULL
                    END
                ) as edad
            FROM TMTURNOSMEDICOSDETALLE t
            LEFT JOIN TMCITASUSUARIOS c
                ON  c.KC3_MEDICO = t.TME2_CODM
                AND c.KC3_FCH    = t.TME2_FCH
                AND c.KC3_HH     = t.TME2_HH
                AND c.KC3_MM     = t.TME2_MM
                AND (c.KC3_ESTADO IS NULL OR c.KC3_ESTADO <> 'CA')
            LEFT JOIN TMENTIDADES e
                ON e.ENT_COD = c.KC3_ENTIDAD
            LEFT JOIN TMUSUARIOSFACTURACION f
                ON  f.KC2_COD    = t.TME2_COD AND t.TME2_COD <> '00000000000000' AND t.TME2_COD <> ''
            LEFT JOIN TMUSUARIOSASEGURAMIENTO a
                ON  a.KC0_COD    = t.TME2_COD AND t.TME2_COD <> '00000000000000' AND t.TME2_COD <> ''
            LEFT JOIN TKCLIENTES cl
                ON  cl.KC_COD    = t.TME2_COD AND t.TME2_COD <> '00000000000000' AND t.TME2_COD <> ''
            WHERE t.TME2_CODM = ${medicoId}
              AND t.TME2_FCH  = ${fecha}
            ORDER BY t.TME2_HH, t.TME2_MM
        `;

        // Mapear y normalizar
        const USU_MAP = {
            'AURORA': 'AGENTE AURORA',
            'CINDY':  'CINDY VIVIANA ECHAVA',
            'NTUBER': 'RECEPCIÓN (NTUBER)',   // ← usuario de Xenco, renombra si sabes el nombre real
        };
        const mapped = slots.map((s, i) => ({
            lin:         Number(s.lin || i+1),
            seq:         Number(s.seq),
            hora:        `${String(Number(s.hh)).padStart(2,'0')}:${String(Number(s.mm)).padStart(2,'0')}`,
            asignado:    s.cod && s.cod.length === 14 && s.cod !== '00000000000000' && BigInt(s.cod) > 0n,
            cod:         s.cod,
            pacienteNom: s.pacienteNom?.trim() || '',
            entidad:     s.entidadNom ? s.entidadNom.trim() : (s.entidadCod ? `Entidad ${s.entidadCod}` : 'PARTICULAR'),

            edad:        s.edad !== null && s.edad !== undefined ? Number(s.edad) : null,
            telefono:    s.telefono?.trim() || '',
            consultorio: s.consultorio?.trim() || '',
            usuario:     s.usuario ? (USU_MAP[s.usuario.trim()] || s.usuario.trim()) : '',
            estado:      s.citaEstado?.trim() || '',
        }));

        res.json(mapped);
    } catch (e) {
        console.error('[VISOR] Error /agenda:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── FIN VISOR ───────────────────────────────────────────────────────────────

// --- EXPORT ---

/**
 * Start the Express/Socket server
 * @param {Client} client - WhatsApp Helper Client
 * @param {number} port 
 */
function start(client, port = 3001) {
    whatsappClient = client;
    if (server.listening) return; // Ya está escuchando, no volver a iniciar
    server.listen(port, () => {
        const originsLabel = RAW_ORIGINS === '*' ? 'TODAS (*)' : RAW_ORIGINS;
        logger.info(`🚀 Inbox API & Socket en http://localhost:${port} | CORS: ${originsLabel}`);
    });
}

/**
 * Emit a new message event to frontend
 * @param {object} message 
 */
function emitMessage(message) {
    io.emit('new_message', message);
}

/**
 * Emit conversation update
 * @param {object} conversation 
 */
function emitConversationUpdate(conversation) {
    io.emit('conversation_updated', conversation);
}

/**
 * Emit new appointment event to update frontend counter
 */
function emitAppointmentCreated() {
    io.emit('new_appointment');
}

module.exports = {
    start,
    emitMessage,
    emitConversationUpdate,
    emitAppointmentCreated
};
