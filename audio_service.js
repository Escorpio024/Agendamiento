require('dotenv').config({ override: true });
const fs = require('fs');
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
    // Si usas un modelo local compatible con el endpoint de transcripción,
    // puedes agregar 'baseURL' aquí.
});

async function transcribeAudio(filePath) {
    try {
        console.log(`[Audio] Iniciando transcripción de: ${filePath}`);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
            language: "es", // Forzamos español para mayor precisión clínica
            temperature: 0.2 // Baja temperatura para que sea literal y no alucine
        });

        return transcription.text;
    } catch (error) {
        console.error('[Audio] Error transcribiendo nota de voz:', error.message);
        return null;
    }
}

module.exports = {
    transcribeAudio
};