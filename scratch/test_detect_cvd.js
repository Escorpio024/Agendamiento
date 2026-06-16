const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function dateToDecimal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return parseInt(`${y}${m}${day}`);
}

async function main() {
    try {
        const todayDec = dateToDecimal(new Date());
        console.log(`Buscando citas CVD finalizadas hoy (${todayDec})...`);

        const citasCvd = await prisma.$queryRaw`
            SELECT c.KC3_MEDICO, c.KC3_FCH, c.KC3_COD, c.KC3_ARTIC, c.KC3_ENTIDAD, e.ENT_NOMBRE, c.KC3_ESTADO, c.KC3_NUM
            FROM TMCITASUSUARIOS c
            LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
            WHERE c.KC3_FCH = ${todayDec}
              AND c.KC3_NUM > 0
              AND c.KC3_COD IS NOT NULL
              AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7', '890301-8', '890301-12', '890301-13', '890301-14', '890301-15', '890301-16')
              AND LEN(LTRIM(RTRIM(c.KC3_COD))) = 14
              AND c.KC3_COD <> '00000000000000'
              AND CAST(c.KC3_COD AS BIGINT) > 0
        `;

        console.log(`Encontradas ${citasCvd.length} citas que cumplen los criterios EXACTOS.`);
        if (citasCvd.length > 0) {
            console.log(citasCvd.slice(0, 3));
        }

        console.log("\nBuscando de forma general cualquier cita con códigos CVD hoy (sin filtros estrictos):");
        const generalCvd = await prisma.$queryRaw`
            SELECT c.KC3_MEDICO, c.KC3_FCH, c.KC3_COD, c.KC3_ARTIC, c.KC3_ESTADO, c.KC3_NUM, LEN(LTRIM(RTRIM(c.KC3_COD))) as CodLen
            FROM TMCITASUSUARIOS c
            WHERE c.KC3_FCH = ${todayDec}
              AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7', '890301-8', '890301-12', '890301-13', '890301-14', '890301-15', '890301-16')
        `;
        console.log(`Encontradas ${generalCvd.length} citas sin filtros estrictos.`);
        if (generalCvd.length > 0) {
            console.log(generalCvd.slice(0, 3));
        }

        console.log("\nBuscando si hoy hay ALGUN código CVD diferente (Ej. usando LIKE '%890301%'):");
        const likeCvd = await prisma.$queryRaw`
            SELECT TOP 5 c.KC3_ARTIC, count(*) as count
            FROM TMCITASUSUARIOS c
            WHERE c.KC3_FCH = ${todayDec}
              AND c.KC3_ARTIC LIKE '%890301%'
            GROUP BY c.KC3_ARTIC
        `;
        console.log(likeCvd);

    } catch (error) {
        console.error('Error:', error.message);
    }
    process.exit(0);
}

main();
