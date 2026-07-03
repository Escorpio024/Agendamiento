const botPrisma = require('./dbBot');

class CampaignService {
    constructor() {
        this.client = null;
        this.isSending = false;
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
            throw new Error('Ya hay una campaña enviándose actualmente.');
        }

        const campaign = await botPrisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) throw new Error('Campaña no encontrada.');
        if (campaign.status === 'COMPLETED') throw new Error('Esta campaña ya fue enviada.');

        this.isSending = true;

        // Iniciar en segundo plano
        this._runCampaign(campaign).catch(err => {
            console.error('[CAMPAIGN] Error en envío de campaña:', err);
            this.isSending = false;
        });

        return { success: true, message: 'Campaña iniciada en segundo plano.' };
    }

    async _runCampaign(campaign) {
        console.log(`[CAMPAIGN] Iniciando campaña: ${campaign.name}`);

        // 1. Obtener todos los pacientes únicos a los que enviar.
        // Opción: Extraer de AppointmentLog (pacientes que han agendado)
        const appointments = await botPrisma.appointmentLog.findMany({
            select: { whatsappId: true, patientPhone: true }
        });

        // Extraer números únicos limpios
        const phoneSet = new Set();
        for (const appt of appointments) {
            let phone = appt.whatsappId;
            if (!phone && appt.patientPhone) {
                phone = appt.patientPhone + '@c.us'; // O lid
            }
            if (phone) phoneSet.add(phone);
        }

        const targetPhones = Array.from(phoneSet);
        const total = targetPhones.length;
        
        console.log(`[CAMPAIGN] Total de números únicos a enviar: ${total}`);

        await botPrisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'SENDING', totalCount: total }
        });

        let sentCount = campaign.sentCount;

        for (let i = 0; i < total; i++) {
            const waId = targetPhones[i];
            
            // Revisar si ya se envió (para retomar en caso de caída)
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
                    
                    // Actualizar contador en BD cada 10 mensajes
                    if (sentCount % 10 === 0) {
                        await botPrisma.campaign.update({
                            where: { id: campaign.id },
                            data: { sentCount }
                        });
                    }

                    console.log(`[CAMPAIGN] Mensaje ${i+1}/${total} enviado a ${waId}`);
                    
                    // RETRASO ALEATORIO de 6 a 12 segundos para evitar BAN por SPAM
                    const delay = Math.floor(Math.random() * (12000 - 6000 + 1)) + 6000;
                    await new Promise(r => setTimeout(r, delay));

                } catch (err) {
                    console.error(`[CAMPAIGN] Error enviando a ${waId}:`, err.message);
                    await botPrisma.campaignLog.create({
                        data: {
                            campaignId: campaign.id,
                            patientPhone: waId,
                            status: 'FAILED',
                            error: err.message
                        }
                    });
                }
            }
        }

        // Finalizar
        await botPrisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'COMPLETED', sentCount }
        });

        console.log(`[CAMPAIGN] ✅ Campaña '${campaign.name}' completada. Enviados: ${sentCount}/${total}.`);
        this.isSending = false;
    }
}

module.exports = new CampaignService();
