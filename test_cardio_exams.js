require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const codes = [
        '903895', '903876', '*903895', '*903876', // Creatinina
        '903426', '903427', '*903426', '*903427', // Hemoglobina
        '903817', '*903817', // Ldl
        '*903026', '903026', '903028', '*903028' // Microalbuminuria
    ];
    
    console.log("Verificando códigos de exámenes cardiovasculares en TARTICULOS...");
    
    const codesSql = codes.map(c => `'${c}'`).join(',');
    const results = await prisma.$queryRawUnsafe(`
        SELECT ART_CODIGO, LTRIM(RTRIM(ART_NOMB)) AS Nombre
        FROM TARTICULOS
        WHERE ART_CODIGO IN (${codesSql})
    `);
    
    console.log(results);
    
    // Also check TQORDENESMEDICAS for past 3 months
    const dateLimit = new Date();
    dateLimit.setMonth(dateLimit.getMonth() - 3);
    const dateStr = dateLimit.toISOString().slice(0,10).replace(/-/g, '');
    console.log("Fecha límite (-3 meses):", dateStr);
    
    const qty = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM TQORDENESMEDICAS
        WHERE QLO_COD_ARTIC IN (${codesSql})
          AND QLO_FCH >= '${dateStr}'
    `);
    console.log("Órdenes en los últimos 3 meses:", qty);
    
    prisma.$disconnect();
}
main();
