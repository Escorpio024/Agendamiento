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
        if (file) {
            const media = MessageMedia.fromFilePath(file.path);
            sentMsg = await whatsappClient.sendMessage(conversationId, media, { caption: text });
            // Cleanup file if needed, or keep for history? keeping for history.
        } else if (text) {
            sentMsg = await whatsappClient.sendMessage(conversationId, text);
        } else {
            return res.status(400).json({ error: 'Message or file required' });
        }

        // Save to DB
        // Note: whatsapp-web.js 'message_create' event usually triggers for own messages too,
        // but to be safe and fast for UI, we can return the structure.
        // The actual DB save might happen in the event listener in index.js to avoid duplicates.

        res.json({ success: true, id: sentMsg.id._serialized });

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

// Enviar recordatorios manualmente
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
