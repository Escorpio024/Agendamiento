const medicalPrisma = require('./db');
const botPrisma = require('./dbBot');

class ChatService {
    /**
     * Get or create a conversation (Local SQLite)
     * @param {string} phone - WhatsApp ID
     * @param {string} name - Contact name
     */
    async getOrCreateConversation(phone, name) {
        try {
            let conversation = await botPrisma.conversation.findUnique({
                where: { id: phone }
            });

            if (!conversation) {
                const nowISO = new Date().toISOString();
                conversation = await botPrisma.conversation.create({
                    data: {
                        id: phone,
                        name: name || phone,
                        status: 'bot',
                        unreadCount: 0,
                        lastMessageAt: nowISO   // ← ISO string explícito evita serialización incorrecta
                    }
                });
            } else if (name && conversation.name !== name) {
                conversation = await botPrisma.conversation.update({
                    where: { id: phone },
                    data: { name }
                });
            }
            return conversation;
        } catch (e) {
            console.error('[DB] SQLite error en getOrCreateConversation. Fallback a memoria.', e.message);
            return { id: phone, name: name || phone, status: 'bot', unreadCount: 0, lastMessageAt: new Date() };
        }
    }

    /**
     * Save a message to the local database (SQLite)
     */
    async saveMessage(phone, messageData) {
        try {
            const conversation = await this.getOrCreateConversation(phone, messageData.senderName);

            // Siempre construir un Date válido y luego convertir a ISO string
            // ISO string evita el bug de Prisma SQLite que guarda Date como número Unix
            const rawTs = messageData.timestamp;
            const tsDate = rawTs instanceof Date ? rawTs : new Date(typeof rawTs === 'number' && rawTs > 1e12 ? rawTs : (rawTs || Date.now()));
            const tsISO  = tsDate.toISOString();

            // Usar $executeRaw para el INSERT/UPSERT:
            // - Evita que Prisma LEA registros con timestamps rotos antes de escribir
            // - Garantiza que el timestamp se guarda como string ISO en SQLite
            await botPrisma.$executeRaw`
                INSERT INTO "Message" (id, conversationId, fromMe, body, type, mediaUrl, timestamp)
                VALUES (
                    ${messageData.id},
                    ${phone},
                    ${messageData.fromMe ? 1 : 0},
                    ${messageData.body || ''},
                    ${messageData.type || 'chat'},
                    ${messageData.mediaUrl || null},
                    ${tsISO}
                )
                ON CONFLICT(id) DO UPDATE SET mediaUrl = excluded.mediaUrl
            `;

            // Actualizar lastMessageAt de la conversación si este mensaje es más reciente
            const convTs = conversation.lastMessageAt
                ? new Date(conversation.lastMessageAt)
                : new Date(0);
            const convTsValid = isNaN(convTs.getTime()) ? new Date(0) : convTs;

            if (tsDate > convTsValid) {
                const newUnread = messageData.fromMe
                    ? (conversation.unreadCount || 0)
                    : (conversation.unreadCount || 0) + 1;

                await botPrisma.$executeRaw`
                    UPDATE "Conversation"
                    SET lastMessageAt = ${tsISO},
                        unreadCount   = ${newUnread}
                    WHERE id = ${phone}
                `;
            }

            return messageData;
        } catch (e) {
            console.error('[DB] SQLite error en saveMessage. Ignorando.', e.message);
            return messageData; // Fallback
        }
    }

    /**
     * Update conversation status (Local SQLite)
     */
    async updateStatus(phone, status) {
        try {
            return await botPrisma.conversation.update({
                where: { id: phone },
                data: { status }
            });
        } catch (e) {
            console.error('[DB] SQLite error en updateStatus:', e.message);
            return null;
        }
    }

    async isHumanMode(phone) {
        try {
            const conversation = await botPrisma.conversation.findUnique({
                where: { id: phone }
            });
            return conversation && conversation.status !== 'bot';
        } catch (e) {
            console.error('[DB] SQLite error en isHumanMode. Forzando modo bot:', e.message);
            return false;
        }
    }

    /**
     * Get all conversations enriched with remote patient data
     */
    async getConversations(status) {
        try {
            const where = status ? { status } : {};
            const conversations = await botPrisma.conversation.findMany({
                where,
                orderBy: { lastMessageAt: 'desc' },
                include: { messages: { take: 1, orderBy: { timestamp: 'desc' } } }
            });

            // Normalizar timestamps — SQLite a veces los guarda como string o número
            const normalize = (val) => {
                if (!val) return new Date();
                if (val instanceof Date) return val;
                const d = new Date(val);
                return isNaN(d.getTime()) ? new Date() : d;
            };

            // Enrich with remote patient data (SQL Server)
            const enriched = await Promise.all(conversations.map(async (conv) => {
                // Normalizar timestamps de la conversación y sus mensajes
                conv.lastMessageAt = normalize(conv.lastMessageAt);
                if (conv.messages) {
                    conv.messages = conv.messages.map(m => ({
                        ...m,
                        timestamp: normalize(m.timestamp)
                    }));
                }

                const phoneClean = conv.id.replace(/@(c\.us|lid|s\.whatsapp\.net)/gi, '').replace(/\D/g, '');
                const phone10 = phoneClean.slice(-10);
                const phone7  = phoneClean.slice(-7);

                let patientName     = conv.name;
                let patientDocument = null;

                if (phone10) {
                    try {
                        const pFact = await medicalPrisma.tMUSUARIOSFACTURACION.findFirst({
                            where: {
                                OR: [
                                    { KC2_TEL_RESP: { contains: phone10 } },
                                    { KC2_TEL_RESP: { contains: phone7  } }
                                ]
                            }
                        });

                        if (pFact) {
                            patientName     = `${pFact.KC2_PNOMBRE || ''} ${pFact.KC2_PAPELLIDO || ''}`.trim() || pFact.KC2_NOM_RESP || conv.name;
                            patientDocument = pFact.KC2_OACOD_NUI || pFact.KC2_COD;
                        } else {
                            const pAseg = await medicalPrisma.paciente.findFirst({
                                where: {
                                    OR: [
                                        { KC0_RES_TEL: { contains: phone10 } },
                                        { KC0_RES_TEL: { contains: phone7  } }
                                    ]
                                }
                            });
                            if (pAseg) {
                                patientName     = pAseg.KC0_NOM || conv.name;
                                patientDocument = pAseg.KC0_COD;
                            }
                        }
                    } catch (e) {
                        console.error('[CHAT] Error enriqueciendo paciente desde BD remota:', e.message);
                    }
                }

                return { ...conv, patientName, patientDocument };
            }));

            return enriched;
        } catch (e) {
            console.error('[CHAT] Error en getConversations:', e.message);
            return []; // Devolver array vacío en vez de lanzar 500
        }
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

