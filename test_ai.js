const aiService = require('./ollama_service');
require('dotenv').config();

async function run() {
    const res = await aiService.extractEntities("Me gustaría para el lunes 13");
    console.log("Extracted:", res);
    
    const res2 = await aiService.extractEntities("Si, pero no para mañana, para el 10 de abril del 2026");
    console.log("Extracted 2:", res2);
    
    process.exit(0);
}
run();
