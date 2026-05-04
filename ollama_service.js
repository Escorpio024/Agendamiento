require('dotenv').config({ override: true });
const OpenAI = require("openai");
const prompts = require('./prompts');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 20000,   // 20 segundos máximo por llamada — evita que el bot quede mudo
    maxRetries: 1,    // 1 reintento automático si falla
});
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const TODAY = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getNext7Days = () => {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    let result = '';
    for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        result += `- ${days[d.getDay()]}: ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}\n`;
    }
    return result;
};

// ─── Core AI wrapper ─────────────────────────────────────────────────────────
// messages: array of { role: 'system'|'user'|'assistant', content: string }
// For simple calls, pass a string and it becomes the system prompt.

async function callAI(input, { temperature = 0.1, maxTokens = 200, json = false } = {}) {
    const messages = typeof input === 'string'
        ? [{ role: 'system', content: input }]
        : input; // already an array of {role, content}

    const config = {
        model: MODEL,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
    };
    if (json) config.response_format = { type: 'json_object' };

    const completion = await openai.chat.completions.create(config);
    let result = completion.choices[0].message.content.trim();

    // Strip markdown fences if model ignores response_format
    if (json && result.startsWith('```')) {
        result = result.replace(/^```(json)?|```$/gi, '').trim();
    }
    return result;
}

// ─── Parse history string into [{role, content}] turns ───────────────────────
// History lines are stored as "Paciente: <text>" or "Aurora: <text>"
function parseHistoryToMessages(historyStr) {
    if (!historyStr) return [];
    return historyStr
        .split('\n')
        .filter(Boolean)
        .map(line => {
            if (line.startsWith('Aurora:')) {
                return { role: 'assistant', content: line.replace(/^Aurora:\s*/, '') };
            }
            return { role: 'user', content: line.replace(/^Paciente:\s*/, '') };
        });
}

// ─── Intent Extraction ────────────────────────────────────────────────────────

async function extractIntent(message) {
    try {
        const prompt = prompts.INTENT_EXTRACTION_PROMPT.replace('{message}', message);
        const raw = await callAI(prompt, {
            temperature: 0,
            maxTokens: 20,
        });
        const intentMap = [
            'AGENDAR_CITA', 'MODIFICAR_CITA', 'CANCELAR_CITA',
            'CONSULTAR_CITA', 'CONSULTAR_HORARIOS', 'INFO_GENERAL',
            'CONSULTAR_DATOS', 'ACTUALIZAR_CELULAR', 'SALUDO', 'URGENCIA', 'OTRO'
        ];
        return intentMap.find(i => raw.toUpperCase().includes(i)) || 'OTRO';
    } catch (error) {
        console.error('[AI] Error extracting intent:', error.message);
        return 'OTRO';
    }
}

// ─── Entity Extraction ────────────────────────────────────────────────────────

async function extractEntities(message, conversationHistory = "") {
    try {
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const prompt = prompts.COMPREHENSIVE_EXTRACTION_PROMPT
            .replace('{current_date}', TODAY())
            .replace('{current_day_name}', dayNames[new Date().getDay()])
            .replace('{next_7_days}', getNext7Days())
            .replace('{conversationHistory}', conversationHistory || 'Sin historial')
            .replace('{message}', message);

        const raw = await callAI(prompt, {
            temperature: 0,
            maxTokens: 300,
            json: true,
        });
        return JSON.parse(raw);
    } catch (error) {
        console.error('[AI] Error extracting entities:', error.message);
        return { fecha: null, hora: null, tipo_cita: null, doctor: null, sintomas: [], urgencia: false };
    }
}

// ─── Combined extraction ──────────────────────────────────────────────────────

async function extractAll(message, conversationHistory = "") {
    try {
        const [intent, entities] = await Promise.all([
            extractIntent(message),
            extractEntities(message, conversationHistory),
        ]);
        return {
            intent,
            entities: { ...entities, urgente: entities.urgencia, para_quien: null },
        };
    } catch (error) {
        console.error('[AI] Error in extractAll:', error.message);
        return {
            intent: 'OTRO',
            entities: { para_quien: null, tipo_cita: null, fecha: null, hora: null, sintomas: [], doctor: null, urgente: false },
        };
    }
}

// ─── Natural Response Generation ──────────────────────────────────────────────
// historyStr: the raw session.history lines joined with '\n'
// This is the KEY fix: real conversation turns are injected into the API call.

async function generateNaturalResponse(context, data = {}, message = "", historyStr = "") {
    try {
        // 1. System prompt: Aurora's persona and rules
        const systemPrompt = prompts.AURORA_SYSTEM_PROMPT;

        // 2. Situational context for this turn (injected as a system note at the end)
        const situationNote = [
            `=== SITUACIÓN ACTUAL ===`,
            context,
            data && Object.keys(data).length > 0 ? `Datos disponibles: ${JSON.stringify(data)}` : '',
        ].filter(Boolean).join('\n');

        // 3. Build messages array: system + history turns + current user message
        const historyMessages = parseHistoryToMessages(historyStr);

        const messages = [
            { role: 'system', content: systemPrompt + '\n\n' + situationNote },
            ...historyMessages,
        ];

        // Add the current user message only if it's not already last in history
        if (message && (historyMessages.length === 0 || historyMessages[historyMessages.length - 1].content !== message)) {
            messages.push({ role: 'user', content: message });
        }

        const cfg = prompts.MODEL_CONFIG.conversational_tasks;
        return await callAI(messages, {
            temperature: cfg.temperature,
            maxTokens: cfg.max_tokens,
        });
    } catch (error) {
        console.error('[AI] Error generating response:', error.message);
        return 'Dame un segundito, estoy revisando el sistema... 😊';
    }
}

// ─── Contextual Question ──────────────────────────────────────────────────────

async function contextualQuestion(missingField) {
    try {
        const prompt = prompts.CONTEXTUAL_QUESTION_PROMPT.replace('{missingField}', missingField);
        return await callAI(prompt, { temperature: 0.3, maxTokens: 80 });
    } catch (error) {
        const fallbacks = {
            fecha: '¿Para qué día te queda mejor la cita?',
            hora: '¿A qué hora prefieres que busquemos espacio?',
        };
        return fallbacks[missingField] || `¿Me puedes indicar ${missingField}?`;
    }
}

// ─── Symptom Analysis ─────────────────────────────────────────────────────────

async function analyzeSymptoms(message) {
    try {
        const prompt = prompts.SYMPTOM_ANALYSIS_PROMPT.replace('{message}', message);
        const raw = await callAI(prompt, { temperature: 0, maxTokens: 150, json: true });
        return JSON.parse(raw);
    } catch (error) {
        console.error('[AI] Error analyzing symptoms:', error.message);
        return { severidad: 'LEVE', especialidad: 'medicina general', recomendacion_texto: 'Vamos a revisarlo en consulta.' };
    }
}

// ─── Time Slot Extraction ─────────────────────────────────────────────────────

async function extractTimeSlot(message, availableSlots) {
    try {
        const slotsText = availableSlots.join(', ');
        const prompt = prompts.SLOT_SELECTION_PROMPT
            .replace('{slots}', slotsText)
            .replace('{message}', message);
        const result = await callAI(prompt, { temperature: 0, maxTokens: 30 });
        const clean = result.trim();
        return clean === 'NO_CLARO' ? null : clean;
    } catch (error) {
        console.error('[AI] Error extracting time slot:', error.message);
        return null;
    }
}

// ─── Contact Extraction ───────────────────────────────────────────────────────

async function extractContact(message) {
    try {
        const prompt = prompts.CONTACT_EXTRACTION_PROMPT.replace('{message}', message);
        const result = await callAI(prompt, { temperature: 0, maxTokens: 30 });
        const clean = result.trim();
        return clean === 'NO_ENCONTRADO' ? null : clean.replace(/\D/g, '');
    } catch (error) {
        return null;
    }
}

// ─── Exit Detection ───────────────────────────────────────────────────────────

async function wantsToExit(message) {
    const exitWords = ['chao', 'adios', 'adiós', 'salir', 'cancelar', 'dejemos', 'me equivoqué', 'olvídalo', 'no importa', 'olvida'];
    if (exitWords.some(w => message.toLowerCase().includes(w))) return true;
    try {
        const prompt = prompts.EXIT_DETECTION_PROMPT.replace('{message}', message);
        const result = await callAI(prompt, { temperature: 0, maxTokens: 10 });
        return result.trim().toUpperCase() === 'SI';
    } catch {
        return false;
    }
}

function wantsNaturalMode(message) {
    const naturalKeywords = ['quiero', 'podrías', 'necesito', 'ayuda', 'me gustaría', 'quisiera', 'deseo', 'puedo', 'cómo', 'cuándo'];
    return naturalKeywords.some(k => message.toLowerCase().includes(k));
}

function isSimpleOption(message) {
    return /^[a-c]$/i.test(message.trim()) || ['si', 'sí', 'no'].includes(message.trim().toLowerCase());
}

module.exports = {
    extractAll,
    extractIntent,
    extractEntities,
    generateNaturalResponse,
    contextualQuestion,
    analyzeSymptoms,
    extractTimeSlot,
    extractContact,
    wantsToExit,
    wantsNaturalMode,
    isSimpleOption,
};