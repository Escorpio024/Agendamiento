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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust for production
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
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
const upload = multer({ storage: storage });

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
        console.log(`🚀 Inbox API & Socket running on http://localhost:${port}`);
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
