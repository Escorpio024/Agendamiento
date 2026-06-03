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
    
    console.log("Verificando códigos de exámenes cardiovasculares en T82P1...");
    
    const codesSql = codes.map(c => `'${c}'`).join(',');
    const results = await prisma.$queryRawUnsafe(`
        SELECT MI_ARTIC, LTRIM(RTRIM(MI_DESC)) AS Nombre
        FROM T82P1
        WHERE MI_ARTIC IN (${codesSql})
    `);
    
    console.log(results);
    
    prisma.$disconnect();
}
main();
