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

        // Agregar IDs de conversación (son los waId directamente: "573001234567@c.us")
        for (const conv of conversations) {
            // Los IDs de conversación son el número de WhatsApp directamente
            if (conv.id && conv.id.includes('@c.us')) {
                phoneSet.add(conv.id);
            }
        }

        // Agregar whatsappIds de citas agendadas
        for (const appt of appointments) {
            if (appt.whatsappId && appt.whatsappId.includes('@c.us')) {
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

        for (let i = 0; i < total; i++) {
            // --- VERIFICAR PAUSA ---
            if (this.isPaused) {
                console.log(`[CAMPAIGN] ⏸️ Campaña "${campaign.name}" pausada en mensaje ${i}/${total}.`);
                // Guardar progreso final antes de salir
                await botPrisma.campaign.update({
                    where: { id: campaign.id },
                    data: { sentCount }
                });
                this.isSending = false;
                this.currentCampaignId = null;
                return;
            }

            const waId = targetPhones[i];

            // --- EVITAR DUPLICADOS: Si ya se envió a este número en esta campaña, saltar ---
            const exists = await botPrisma.campaignLog.findFirst({
                where: { campaignId: campaign.id, patientPhone: waId }
            });

            if (!exists) {
                try {
                    await this.client.sendMessage(waId, campaign.messageBody);
                    await botPrisma.campaignLog.create({
                        data: {
                            campaignId: campaign.id,
                            patientPhone: waId,
                            status: 'SENT'
                        }
                    });
                    sentCount++;

                    // Actualizar contador en BD cada 5 mensajes
                    if (sentCount % 5 === 0) {
                        await botPrisma.campaign.update({
                            where: { id: campaign.id },
                            data: { sentCount }
                        });
                    }

                    console.log(`[CAMPAIGN] ✅ (${sentCount}/${total}) Enviado a ${waId}`);

                    // ⚠️ ANTI-BAN: Retraso aleatorio de 7 a 15 segundos entre mensajes
                    const delay = Math.floor(Math.random() * (15000 - 7000 + 1)) + 7000;
                    await new Promise(r => setTimeout(r, delay));

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
                    // Esperar igual después de un error para no saturar
                    await new Promise(r => setTimeout(r, 5000));
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

    getStatus() {
        return {
            isSending: this.isSending,
            isPaused: this.isPaused,
            currentCampaignId: this.currentCampaignId
        };
    }
}

module.exports = new CampaignService();
