require('dotenv').config();
const medicalPrisma = require('./db');

async function main() {
    const CVD_CODES = [
        '903895', '903876', '*903895', '*903876', // Creatinina
        '903426', '903427', '*903426', '*903427', // Hemoglobina
        '903817', '*903817', // Ldl
        '*903026', '903026', '903028', '*903028' // Microalbuminuria
    ];
    const CVD_CODES_SQL = CVD_CODES.map(c => `'${c}'`).join(',');
    
    // Hace 3 meses (YYYYMMDD)
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const dateStr = parseInt(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`);
    console.log("Filtrando fecha desde (hace 3 meses):", dateStr);
    
    console.log("Buscando en TQORDENESMEDICAS (programados)...");
    const programados = await medicalPrisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM TQORDENESMEDICAS
        WHERE QLO_COD_ARTIC IN (${CVD_CODES_SQL})
          AND QLO_FCH >= ${dateStr}
    `);
    console.log("Programados:", programados[0]?.count || 0);
    
    console.log("Buscando en TYORDENESLABENVIADAS (pendientes/realizados)...");
    const pendientes = await medicalPrisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM TYORDENESLABENVIADAS
        WHERE YKL_ARTIC IN (${CVD_CODES_SQL})
          AND YKL_FECHA >= ${dateStr}
    `);
    console.log("Laboratorios:", pendientes[0]?.count || 0);
    
    medicalPrisma.$disconnect();
}
main();
