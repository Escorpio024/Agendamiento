const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("=== Búsqueda de Tablas de Historia Clínica y Signos Vitales ===");
        
        // Buscar tablas relacionadas con signos vitales, historias clinicas o evoluciones
        const tables = await prisma.$queryRaw`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%HISTORIA%' 
               OR TABLE_NAME LIKE '%HC%' 
               OR TABLE_NAME LIKE '%EVOLUCION%' 
               OR TABLE_NAME LIKE '%SIGNO%'
               OR TABLE_NAME LIKE '%VITAL%'
               OR TABLE_NAME LIKE '%EXAMEN%'
               OR TABLE_NAME LIKE '%CARDIO%'
               OR TABLE_NAME LIKE '%RIESGO%'
               OR TABLE_NAME LIKE '%TRIAGE%'
               OR TABLE_NAME LIKE '%NOTA%'
               OR TABLE_NAME LIKE '%DIAG%'
        `;
        
        console.log("Posibles Tablas Encontradas:");
        for (let t of tables) {
            console.log(" - " + t.TABLE_NAME);
        }

        // Buscar columnas relacionadas con signos vitales o riesgos
        const cols = await prisma.$queryRaw`
            SELECT TABLE_NAME, COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE COLUMN_NAME LIKE '%PRESION%'
               OR COLUMN_NAME LIKE '%PESO%'
               OR COLUMN_NAME LIKE '%TALLA%'
               OR COLUMN_NAME LIKE '%IMC%'
               OR COLUMN_NAME LIKE '%GLICEMIA%'
               OR COLUMN_NAME LIKE '%RIESGO%'
               OR COLUMN_NAME LIKE '%SISTOL%'
               OR COLUMN_NAME LIKE '%DIASTOL%'
               OR COLUMN_NAME LIKE '%CARDIO%'
        `;

        console.log("\nPosibles Columnas Encontradas:");
        const tablesMap = {};
        for (let c of cols) {
            if (!tablesMap[c.TABLE_NAME]) tablesMap[c.TABLE_NAME] = [];
            tablesMap[c.TABLE_NAME].push(c.COLUMN_NAME);
        }
        
        for (let t in tablesMap) {
            console.log(`Tabla: ${t} -> Columnas: ${tablesMap[t].join(', ')}`);
        }

    } catch(e) {
        console.error('DB Error:', e.message);
    }
    process.exit(0);
}
main();
