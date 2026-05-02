const aiService = require('./ollama_service');
require('dotenv').config();

async function run() {
    const history = "Paciente: Quiero agendar una cita\nAurora: Tengo disponibilidad para el 9 de abril. ¿quieres ver horarios?";
    const res = await aiService.extractEntities("Me gustaría para el lunes 13", history);
    console.log("Extracted with history:", res);
    process.exit(0);
}
run();
