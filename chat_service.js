const medicalPrisma = require('./db');
const botPrisma = require('./dbBot');

class ChatService {
    /**
     * Get or create a conversation (Local SQLite)
     * @param {string} phone - WhatsApp ID
     * @param {string} name - Contact name
     */
    async getOrCreateConversation(phone, name) {
        let conversation = await botPrisma.conversation.findUnique({
            where: { id: phone }
        });

        if (!conversation) {
            conversation = await botPrisma.conversation.create({
                data: {
                    id: phone,
                    name: name || phone,
                    status: 'bot',
                    unreadCount: 0,
                    lastMessageAt: new Date()
                }
            });
        } else if (name && conversation.name !== name) {
            // Update name if changed
            conversation = await botPrisma.conversation.update({
                where: { id: phone },
                data: { name }
            });
        }

        return conversation;
    }

    /**
     * Save a message to the local database (SQLite)
     * @param {string} phone - Conversation ID
     * @param {object} messageData - Message details
     */
    async saveMessage(phone, messageData) {
        // messageData: { id, body, fromMe, type, timestamp, mediaUrl? }

        // Ensure conversation exists
        const conversation = await this.getOrCreateConversation(phone, messageData.senderName);

        // Upsert message
        const message = await botPrisma.message.upsert({
            where: { id: messageData.id },
            update: {
                mediaUrl: messageData.mediaUrl,
            },
            create: {
                id: messageData.id,
                conversationId: phone,
                fromMe: messageData.fromMe,
                body: messageData.body,
                type: messageData.type || 'chat',
                mediaUrl: messageData.mediaUrl,
                timestamp: messageData.timestamp || new Date()
            }
        });

        // Update conversation last message local
        if (new Date(messageData.timestamp) > new Date(conversation.lastMessageAt)) {
            await botPrisma.conversation.update({
                where: { id: phone },
                data: {
                    lastMessageAt: messageData.timestamp,
                    unreadCount: messageData.fromMe ? conversation.unreadCount : conversation.unreadCount + 1
                }
            });
        }

        return message;
    }

    /**
     * Update conversation status (Local SQLite)
     */
    async updateStatus(phone, status) {
        return botPrisma.conversation.update({
            where: { id: phone },
            data: { status }
        });
    }

    /**
     * Check if a conversation is in Human Mode (Local SQLite)
     */
    async isHumanMode(phone) {
        const conversation = await botPrisma.conversation.findUnique({
            where: { id: phone }
        });
        return conversation && conversation.status !== 'bot';
    }

    /**
     * Get all conversations enriched with remote patient data
     */
    async getConversations(status) {
        const where = status ? { status } : {};
        const conversations = await botPrisma.conversation.findMany({
            where,
            orderBy: { lastMessageAt: 'desc' },
            include: { messages: { take: 1, orderBy: { timestamp: 'desc' } } }
        });

        // Enrich with remote patient data (SQL Server)
        const enriched = await Promise.all(conversations.map(async (conv) => {
            const phoneClean = conv.id.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
            const phone10 = phoneClean.slice(-10);
            const phone7 = phoneClean.slice(-7);

            let patientName = conv.name;
            let patientDocument = null;

            if (phone10) {
                try {
                    // Lookup in REMOTE SQL Server - Priorizar TMUSUARIOSFACTURACION
                    const pFact = await medicalPrisma.tMUSUARIOSFACTURACION.findFirst({
                        where: {
                            OR: [
                                { KC2_TEL_RESP: { contains: phone10 } },
                                { KC2_TEL_RESP: { contains: phone7 } }
                            ]
                        }
                    });

                    if (pFact) {
                        patientName = `${pFact.KC2_PNOMBRE || ''} ${pFact.KC2_PAPELLIDO || ''}`.trim() || pFact.KC2_NOM_RESP || conv.name;
                        patientDocument = pFact.KC2_OACOD_NUI || pFact.KC2_COD;
                    } else {
                        // Fallback a Aseguramiento
                        const pAseg = await medicalPrisma.paciente.findFirst({
                            where: {
                                OR: [
                                    { KC0_RES_TEL: { contains: phone10 } },
                                    { KC0_RES_TEL: { contains: phone7 } }
                                ]
                            }
                        });
                        if (pAseg) {
                            patientName = pAseg.KC0_NOM || conv.name;
                            patientDocument = pAseg.KC0_COD;
                        }
                    }
                } catch (e) {
                    console.error("Error fetching patient for conversation from remote DB:", e.message);
                }
            }

            return {
                ...conv,
                patientName,
                patientDocument
            };
        }));

        return enriched;
    }

    /**
     * Get messages for a conversation (Local SQLite)
     */
    async getMessages(conversationId) {
        return botPrisma.message.findMany({
            where: { conversationId },
            orderBy: { timestamp: 'asc' }
        });
    }
}

module.exports = new ChatService();

