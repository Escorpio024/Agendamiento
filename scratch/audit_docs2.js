const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // Ver exactamente cuáles son los doctores con códigos simples (111, 123, 333, 444, 555, 777)
        const docs = await prisma.$queryRaw`
            SELECT 
                MED_COD, 
                LTRIM(RTRIM(MED_NOMBRE)) as nombre, 
                MED_ESPECIALIDAD_1,
                MED_CONSULTORIO,
                MED_EST_ESTADO
            FROM TMMEDICOS 
            WHERE MED_COD IN (111, 123, 333, 444, 555, 777)
            ORDER BY MED_COD
        `;
        console.log('=== DOCTORES CON CÓDIGOS SIMPLES ===');
        console.table(docs);

        // Ver el último commit que menciona lista blanca
        console.log('\n=== VERIFICANDO LISTA BLANCA EN CÓDIGO ===');
        
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
