const prisma = require('./db');

class ChatService {
    /**
     * Get or create a conversation
     * @param {string} phone - WhatsApp ID
     * @param {string} name - Contact name
     */
    async getOrCreateConversation(phone, name) {
        let conversation = await prisma.conversation.findUnique({
            where: { id: phone }
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
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
            conversation = await prisma.conversation.update({
                where: { id: phone },
                data: { name }
            });
        }

        return conversation;
    }

    /**
     * Save a message to the database
     * @param {string} phone - Conversation ID
     * @param {object} messageData - Message details
     */
    async saveMessage(phone, messageData) {
        // messageData: { id, body, fromMe, type, timestamp, mediaUrl? }

        // Ensure conversation exists
        const conversation = await this.getOrCreateConversation(phone, messageData.senderName);

        // Upsert message (create if new, update if exists - though usually messages don't change)
        const message = await prisma.message.upsert({
            where: { id: messageData.id },
            update: {
                mediaUrl: messageData.mediaUrl, // Update media URL if it changes (e.g. enhanced later)
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

        // Update conversation last message only if this message is newer
        if (new Date(messageData.timestamp) > new Date(conversation.lastMessageAt)) {
            await prisma.conversation.update({
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
     * Update conversation status (Bot <-> Human)
     * @param {string} phone 
     * @param {string} status 
     */
    async updateStatus(phone, status) {
        return prisma.conversation.update({
            where: { id: phone },
            data: { status }
        });
    }

    /**
     * Check if a conversation is in Human Mode
     */
    async isHumanMode(phone) {
        const conversation = await prisma.conversation.findUnique({
            where: { id: phone }
        });
        return conversation && conversation.status !== 'bot';
    }

    /**
     * Get all conversations, optionally filtered by status
     * Includes patient information (name and document number)
     */
    async getConversations(status) {
        const where = status ? { status } : {};
        const conversations = await prisma.conversation.findMany({
            where,
            orderBy: { lastMessageAt: 'desc' },
            include: { messages: { take: 1, orderBy: { timestamp: 'desc' } } }
        });

        // Enrich with patient data
        const enriched = await Promise.all(conversations.map(async (conv) => {
            // Extract phone number from conversation ID
            const phoneClean = conv.id.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
            const phone10 = phoneClean.slice(-10);

            let patientName = conv.name;
            let patientDocument = null;

            if (phone10) {
                try {
                    // Find patient by phone in TKCLIENTES
                    const patient = await prisma.cliente.findFirst({
                        where: {
                            OR: [
                                { KC_TEL1: { contains: phone10 } },
                                { KC_TEL2: { contains: phone10 } },
                                { KC_TEL3: { contains: phone10 } }
                            ]
                        },
                        select: {
                            KC_NOM: true,
                            KC_COD: true
                        }
                    });

                    if (patient) {
                        patientName = patient.KC_NOM?.trim() || conv.name;
                        patientDocument = patient.KC_COD;
                    }
                } catch (e) {
                    console.error("Error fetching patient for conversation:", e.message);
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
     * Get messages for a conversation
     */
    async getMessages(conversationId) {
        return prisma.message.findMany({
            where: { conversationId },
            orderBy: { timestamp: 'asc' }
        });
    }
}

module.exports = new ChatService();
