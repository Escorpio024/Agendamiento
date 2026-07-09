const botPrisma = require('./dbBot');

class CampaignService {
    constructor() {
        this.client = null;
        this.isSending = false;
        this.isPaused = false;       // ← NUEVO: controla la pausa
        this.currentCampaignId = null;
    }

    init(client) {
        this.client = client;
    }

    async getCampaigns() {
        return await botPrisma.campaign.findMany({
            orderBy: { createdAt: 'desc' }
        });
    }

    async createCampaign(name, messageBody) {
        return await botPrisma.campaign.create({
            data: {
                name,
                messageBody,
                status: 'DRAFT',
                sentCount: 0,
                totalCount: 0
            }
        });
    }

    async startCampaign(campaignId) {
        if (this.isSending) {
            throw new Error('Ya hay una campaña enviándose. Pausa la actual antes de iniciar otra.');
        }

        const campaign = await botPrisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) throw new Error('Campaña no encontrada.');
        if (campaign.status === 'COMPLETED') throw new Error('Esta campaña ya fue enviada completamente.');

        this.isSending = true;
        this.isPaused = false;
        this.currentCampaignId = campaignId;

        // Iniciar en segundo plano sin bloquear la respuesta HTTP
        this._runCampaign(campaign).catch(err => {
            console.error('[CAMPAIGN] Error en envío de campaña:', err);
            this.isSending = false;
            this.currentCampaignId = null;
        });

        return { success: true, message: 'Campaña iniciada en segundo plano.' };
    }

    async pauseCampaign(campaignId) {
        if (this.currentCampaignId !== campaignId) {
            throw new Error('Esta campaña no está enviándose actualmente.');
        }
        this.isPaused = true;
        await botPrisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'PAUSED' }
        });
        return { success: true, message: 'Campaña pausada. Los mensajes ya enviados no se repetirán al reanudar.' };
    }

    async resumeCampaign(campaignId) {
        const campaign = await botPrisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign || campaign.status !== 'PAUSED') {
            throw new Error('La campaña no está en estado PAUSED.');
        }
        if (this.isSending) {
            throw new Error('Ya hay otra campaña activa. Pausa esa primero.');
        }
        this.isSending = true;
        this.isPaused = false;
        this.currentCampaignId = campaignId;
        await botPrisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'SENDING' }
        });
        this._runCampaign(campaign).catch(err => {
            console.error('[CAMPAIGN] Error reanudando campaña:', err);
            this.isSending = false;
            this.currentCampaignId = null;
        });
        return { success: true, message: 'Campaña reanudada.' };
    }

    async _getTargetPhones() {
        // ✅ ESTRATEGIA DE FILTRADO: Solo pacientes que han tenido conversaciones reales con el bot
        // Fuente 1: Tabla Conversation (chats reales con el bot)
        const conversations = await botPrisma.conversation.findMany({
            select: { id: true }
        });

        // Fuente 2: AppointmentLog (pacientes que agendaron citas - tienen el whatsappId confiable)
        const appointments = await botPrisma.appointmentLog.findMany({
            select: { whatsappId: true }
        });

        const phoneSet = new Set();

        // Agregar IDs de conversación (pueden ser @c.us o @lid en versiones modernas de WA)
        for (const conv of conversations) {
            if (conv.id && (conv.id.includes('@c.us') || conv.id.includes('@lid'))) {
                phoneSet.add(conv.id);
            }
        }

        // Agregar whatsappIds de citas agendadas
        for (const appt of appointments) {
            if (appt.whatsappId && (appt.whatsappId.includes('@c.us') || appt.whatsappId.includes('@lid'))) {
                phoneSet.add(appt.whatsappId);
            }
        }

        console.log(`[CAMPAIGN] Total de números únicos calificados (con historial real): ${phoneSet.size}`);
        return Array.from(phoneSet);
    }

    async _runCampaign(campaign) {
        console.log(`[CAMPAIGN] 🚀 Iniciando campaña: "${campaign.name}"`);

        const targetPhones = await this._getTargetPhones();
        const total = targetPhones.length;

        await botPrisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'SENDING', totalCount: total }
        });

        let sentCount = campaign.sentCount;
        let sentThisSession = 0; // Contador de mensajes enviados en la sesión actual

        for (let i = 0; i < total; i++) {
            // --- VERIFICAR PAUSA ---
            if (this.isPaused) {
                console.log(`[CAMPAIGN] ⏸️ Campaña "${campaign.name}" pausada en mensaje ${i}/${total}.`);
                await botPrisma.campaign.update({
                    where: { id: campaign.id },
                    data: { sentCount }
                });
                this.isSending = false;
                this.currentCampaignId = null;
                return;
            }

            // --- RESTRICCIÓN HORARIA: Solo entre 8 AM y 7 PM Colombia ---
            const horaActual = new Date().toLocaleString('es-CO', { 
                timeZone: 'America/Bogota', hour: 'numeric', hour12: false 
            });
            const hora = parseInt(horaActual);
            if (hora < 8 || hora >= 19) {
                const minutosHastaLas8 = this._minutesUntilHour(8);
                console.log(`[CAMPAIGN] 🌙 Son las ${hora}h. Esperando hasta las 8 AM Colombia (${minutosHastaLas8} min)...`);
                await botPrisma.campaign.update({
                    where: { id: campaign.id },
                    data: { sentCount, status: 'PAUSED' }
                });
                // Esperar hasta las 8 AM y luego continuar
                await new Promise(r => setTimeout(r, minutosHastaLas8 * 60 * 1000));
                await botPrisma.campaign.update({
                    where: { id: campaign.id },
                    data: { status: 'SENDING' }
                });
                sentThisSession = 0; // Reiniciar contador de sesión al nuevo día
                if (this.isPaused) return;
            }

            // --- LÍMITE DIARIO: Máximo 200 mensajes por día ---
            if (sentThisSession >= 200) {
                const minutosHastaLas8 = this._minutesUntilHour(8);
                console.log(`[CAMPAIGN] 📅 Límite diario de 200 mensajes alcanzado. Reanudando mañana a las 8 AM (${minutosHastaLas8} min)...`);
                await botPrisma.campaign.update({
                    where: { id: campaign.id },
                    data: { sentCount, status: 'PAUSED' }
                });
                await new Promise(r => setTimeout(r, minutosHastaLas8 * 60 * 1000));
                await botPrisma.campaign.update({
                    where: { id: campaign.id },
                    data: { status: 'SENDING' }
                });
                sentThisSession = 0;
                if (this.isPaused) return;
            }

            const waId = targetPhones[i];

            // --- EVITAR DUPLICADOS ---
            const exists = await botPrisma.campaignLog.findFirst({
                where: { campaignId: campaign.id, patientPhone: waId }
            });

            if (!exists) {
                try {
                    let finalId = waId;

                    // Solo intentar obtener el LID/ID si es un número tradicional (@c.us)
                    if (!waId.includes('@lid')) {
                        const cleanPhone = waId.replace('@c.us', '').replace('@s.whatsapp.net', '');
                        const numberId = await this.client.getNumberId(cleanPhone);
                        if (!numberId) {
                            throw new Error(`WhatsApp no reconoce el número ${cleanPhone}`);
                        }
                        finalId = numberId._serialized;
                    }

                    await this.client.sendMessage(finalId, campaign.messageBody);
                    await botPrisma.campaignLog.create({
                        data: {
                            campaignId: campaign.id,
                            patientPhone: finalId,
                            status: 'SENT'
                        }
                    });
                    sentCount++;
                    sentThisSession++;

                    // Actualizar contador en BD cada 5 mensajes
                    if (sentCount % 5 === 0) {
                        await botPrisma.campaign.update({
                            where: { id: campaign.id },
                            data: { sentCount }
                        });
                    }

                    console.log(`[CAMPAIGN] ✅ (${sentCount}/${total}, hoy: ${sentThisSession}) Enviado a ${finalId}`);

                    // ═══════════════════════════════════════════════════════════
                    // ⚠️  ANTI-BAN: Pausas escalonadas para imitar comportamiento humano
                    // ═══════════════════════════════════════════════════════════

                    // PAUSA GRANDE cada 100 mensajes: 30-40 minutos
                    if (sentThisSession > 0 && sentThisSession % 100 === 0) {
                        const pausaMin = Math.floor(Math.random() * 10 + 30); // 30-40 min
                        console.log(`[CAMPAIGN] ☕ Pausa grande (100 msgs): ${pausaMin} minutos...`);
                        await new Promise(r => setTimeout(r, pausaMin * 60 * 1000));

                    // PAUSA MEDIANA cada 25 mensajes: 8-15 minutos
                    } else if (sentThisSession > 0 && sentThisSession % 25 === 0) {
                        const pausaMin = Math.floor(Math.random() * 7 + 8); // 8-15 min
                        console.log(`[CAMPAIGN] 🧘 Pausa mediana (25 msgs): ${pausaMin} minutos...`);
                        await new Promise(r => setTimeout(r, pausaMin * 60 * 1000));

                    // DELAY NORMAL entre mensajes: 45-120 segundos (aleatorio, no uniforme)
                    } else {
                        // Patrón irregular: mezcla de delays cortos y largos para variar
                        const roll = Math.random();
                        let delaySeg;
                        if (roll < 0.15) {
                            delaySeg = Math.floor(Math.random() * 30 + 90); // 15% de las veces: 90-120 seg
                        } else if (roll < 0.40) {
                            delaySeg = Math.floor(Math.random() * 20 + 60); // 25% de las veces: 60-80 seg
                        } else {
                            delaySeg = Math.floor(Math.random() * 15 + 45); // 60% de las veces: 45-60 seg
                        }
                        console.log(`[CAMPAIGN]   ⏳ Esperando ${delaySeg}s antes del siguiente...`);
                        await new Promise(r => setTimeout(r, delaySeg * 1000));
                    }

                } catch (err) {
                    console.error(`[CAMPAIGN] ❌ Error enviando a ${waId}:`, err.message);
                    await botPrisma.campaignLog.create({
                        data: {
                            campaignId: campaign.id,
                            patientPhone: waId,
                            status: 'FAILED',
                            error: err.message?.substring(0, 200)
                        }
                    });
                    // Esperar un poco más después de un error
                    await new Promise(r => setTimeout(r, 30000));
                }
            }
        }

        // Guardar el conteo final y marcar como completada
        await botPrisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'COMPLETED', sentCount }
        });

        console.log(`[CAMPAIGN] 🏁 Campaña "${campaign.name}" completada. Enviados: ${sentCount}/${total}.`);
        this.isSending = false;
        this.currentCampaignId = null;
    }

    /** Calcula los minutos que faltan hasta la hora indicada (en America/Bogota) */
    _minutesUntilHour(targetHour) {
        const now = new Date();
        const nowBogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
        const target = new Date(nowBogota);
        target.setHours(targetHour, 0, 0, 0);
        // Si ya pasó la hora objetivo de hoy, apuntar al día siguiente
        if (target <= nowBogota) {
            target.setDate(target.getDate() + 1);
        }
        return Math.ceil((target - nowBogota) / 60000);
    }

    getStatus() {
        return {
            isSending: this.isSending,
            isPaused: this.isPaused,
            currentCampaignId: this.currentCampaignId
        };
    }
}

module.exports = new CampaignService();
