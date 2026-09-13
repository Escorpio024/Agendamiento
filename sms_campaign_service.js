/**
 * SMS CAMPAIGN SERVICE — Onurix
 * ─────────────────────────────────────────────────────────────
 * Servicio de envío masivo de SMS vía Onurix.
 * Análogo a campaign_service.js pero para el canal SMS.
 *
 * Flujo:
 *  1. Se crea la campaña con channel='SMS' y la lista de teléfonos en recipientsJson.
 *  2. Al iniciar, lee recipientsJson y envía uno por uno con delay configurable.
 *  3. Registra cada envío en CampaignLog.
 *  4. Soporta pause/resume sin repetir mensajes ya enviados.
 */

const botPrisma = require('./dbBot');
const { sendSMS, normalizarTelefono } = require('./sms_service');
const logger = require('./logger');

// Delay entre mensajes SMS: 2-5 segundos (Onurix no tiene restricciones de WA)
const DELAY_MIN_MS = 2000;
const DELAY_MAX_MS = 5000;

function randomDelay() {
    return Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
}

class SmsCampaignService {
    constructor() {
        this.isSending = false;
        this.isPaused = false;
        this.currentCampaignId = null;
    }

    /**
     * Al arrancar el servidor, mueve campañas SMS que quedaron en SENDING → PAUSED.
     */
    async recoverOnStartup() {
        try {
            const orphans = await botPrisma.campaign.findMany({
                where: { status: 'SENDING', channel: 'SMS' }
            });
            for (const camp of orphans) {
                await botPrisma.campaign.update({
                    where: { id: camp.id },
                    data: { status: 'PAUSED' }
                });
                logger.info(`[SMS_CAMPAIGN] ⚠️ Campaña SMS "${camp.name}" encontrada en SENDING → movida a PAUSED`);
            }
        } catch (e) {
            logger.error('[SMS_CAMPAIGN] Error en recoverOnStartup:', e.message);
        }
    }

    /** Lista todas las campañas SMS, más recientes primero. */
    async getCampaigns() {
        return await botPrisma.campaign.findMany({
            where: { channel: 'SMS' },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Crea una campaña SMS en estado DRAFT.
     * @param {string} name - Nombre interno de la campaña.
     * @param {string} messageBody - Texto del SMS.
     * @param {string[]} phones - Array de números de teléfono.
     */
    async createCampaign(name, messageBody, phones) {
        if (!Array.isArray(phones) || phones.length === 0) {
            throw new Error('Debe seleccionar al menos un destinatario.');
        }
        // Normalizar y deduplicar números
        const normalized = [...new Set(phones.map(p => normalizarTelefono(p)).filter(p => p.length >= 10))];
        if (normalized.length === 0) {
            throw new Error('Ningún número tiene un formato válido (mínimo 10 dígitos).');
        }
        return await botPrisma.campaign.create({
            data: {
                name,
                messageBody,
                channel: 'SMS',
                status: 'DRAFT',
                sentCount: 0,
                totalCount: normalized.length,
                recipientsJson: JSON.stringify(normalized)
            }
        });
    }

    /**
     * Inicia el envío de una campaña SMS en segundo plano.
     * @param {string} campaignId
     */
    async startCampaign(campaignId) {
        if (this.isSending) {
            throw new Error('Ya hay una campaña SMS enviándose. Pausa la actual antes de iniciar otra.');
        }
        const campaign = await botPrisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) throw new Error('Campaña no encontrada.');
        if (campaign.channel !== 'SMS') throw new Error('Esta campaña no es de tipo SMS.');
        if (campaign.status === 'COMPLETED') throw new Error('Esta campaña ya fue enviada completamente.');

        this.isSending = true;
        this.isPaused = false;
        this.currentCampaignId = campaignId;

        this._runCampaign(campaign).catch(err => {
            logger.error('[SMS_CAMPAIGN] Error inesperado en campaña:', err.message);
            this.isSending = false;
            this.currentCampaignId = null;
        });

        return { success: true, message: 'Campaña SMS iniciada en segundo plano.' };
    }

    /**
     * Pausa la campaña SMS actualmente en envío.
     */
    async pauseCampaign(campaignId) {
        if (this.currentCampaignId !== campaignId) {
            throw new Error('Esta campaña SMS no está enviándose actualmente.');
        }
        this.isPaused = true;
        await botPrisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'PAUSED' }
        });
        return { success: true, message: 'Campaña SMS pausada. No se repetirán los mensajes ya enviados al reanudar.' };
    }

    /**
     * Reanuda una campaña SMS pausada.
     */
    async resumeCampaign(campaignId) {
        const campaign = await botPrisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign || campaign.status !== 'PAUSED') {
            throw new Error('La campaña SMS no está en estado PAUSED.');
        }
        if (campaign.channel !== 'SMS') throw new Error('Esta campaña no es de tipo SMS.');
        if (this.isSending) {
            throw new Error('Ya hay otra campaña SMS activa. Pausa esa primero.');
        }

        this.isSending = true;
        this.isPaused = false;
        this.currentCampaignId = campaignId;

        await botPrisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'SENDING' }
        });

        this._runCampaign(campaign).catch(err => {
            logger.error('[SMS_CAMPAIGN] Error reanudando campaña:', err.message);
            this.isSending = false;
            this.currentCampaignId = null;
        });

        return { success: true, message: 'Campaña SMS reanudada.' };
    }

    /** Estado actual del servicio. */
    getStatus() {
        return {
            isSending: this.isSending,
            isPaused: this.isPaused,
            currentCampaignId: this.currentCampaignId
        };
    }

    // ─── Envío en segundo plano ───────────────────────────────────────────────

    async _runCampaign(campaign) {
        logger.info(`[SMS_CAMPAIGN] 🚀 Iniciando campaña SMS: "${campaign.name}"`);

        // Leer lista de destinatarios
        let phones = [];
        try {
            phones = JSON.parse(campaign.recipientsJson || '[]');
        } catch (_) {
            logger.error('[SMS_CAMPAIGN] ❌ recipientsJson inválido en campaña:', campaign.id);
            await botPrisma.campaign.update({
                where: { id: campaign.id },
                data: { status: 'PAUSED' }
            });
            this.isSending = false;
            this.currentCampaignId = null;
            return;
        }

        const total = phones.length;
        await botPrisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'SENDING', totalCount: total }
        });

        let sentCount = campaign.sentCount;

        for (let i = 0; i < total; i++) {
            // ── Verificar pausa ──
            if (this.isPaused) {
                logger.info(`[SMS_CAMPAIGN] ⏸️ Campaña SMS "${campaign.name}" pausada en ${i}/${total}`);
                await botPrisma.campaign.update({
                    where: { id: campaign.id },
                    data: { sentCount }
                });
                this.isSending = false;
                this.currentCampaignId = null;
                return;
            }

            const phone = phones[i];

            // ── Evitar duplicados ──
            const exists = await botPrisma.campaignLog.findFirst({
                where: { campaignId: campaign.id, patientPhone: phone }
            });

            if (!exists) {
                try {
                    const result = await sendSMS(phone, campaign.messageBody);

                    if (result.success) {
                        await botPrisma.campaignLog.create({
                            data: {
                                campaignId: campaign.id,
                                patientPhone: phone,
                                status: 'SENT'
                            }
                        });
                        sentCount++;
                        logger.info(`[SMS_CAMPAIGN] ✅ (${sentCount}/${total}) SMS enviado a ${phone}`);
                    } else if (result.skipped) {
                        // SMS_REMINDERS_ENABLED=false — igual registrar como SKIPPED para no reintentar
                        logger.info(`[SMS_CAMPAIGN] ⏭️ SMS omitido (deshabilitado) a ${phone}`);
                        await botPrisma.campaignLog.create({
                            data: {
                                campaignId: campaign.id,
                                patientPhone: phone,
                                status: 'FAILED',
                                error: 'SMS_REMINDERS_ENABLED=false'
                            }
                        });
                    } else {
                        throw new Error(result.error || 'Error desconocido de Onurix');
                    }

                } catch (err) {
                    logger.error(`[SMS_CAMPAIGN] ❌ Error enviando SMS a ${phone}:`, err.message);
                    await botPrisma.campaignLog.create({
                        data: {
                            campaignId: campaign.id,
                            patientPhone: phone,
                            status: 'FAILED',
                            error: err.message?.substring(0, 200)
                        }
                    });
                }

                // ── Actualizar progreso cada 10 mensajes ──
                if (sentCount % 10 === 0) {
                    await botPrisma.campaign.update({
                        where: { id: campaign.id },
                        data: { sentCount }
                    });
                }

                // ── Delay entre mensajes ──
                if (i < total - 1) {
                    const delay = randomDelay();
                    logger.info(`[SMS_CAMPAIGN]   ⏳ Esperando ${delay}ms antes del siguiente...`);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        // Guardar conteo final y marcar como completada
        await botPrisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'COMPLETED', sentCount }
        });

        logger.info(`[SMS_CAMPAIGN] 🏁 Campaña SMS "${campaign.name}" completada. Enviados: ${sentCount}/${total}`);
        this.isSending = false;
        this.currentCampaignId = null;
    }
}

module.exports = new SmsCampaignService();
