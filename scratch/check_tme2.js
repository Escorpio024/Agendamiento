const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$queryRaw`
    SELECT TME2_CODM, TME2_HH, TME2_MM, TME2_FCH
    FROM TMTURNOSMEDICOSDETALLE
    WHERE TME2_CODM = '111 ' 
      AND TME2_FCH >= 20260817
      AND TME2_FCH <= 20260824
      AND (
          TME2_COD IS NULL
          OR LTRIM(RTRIM(TME2_COD)) = ''
          OR TME2_COD = '00000000000000'
          OR TRY_CAST(LTRIM(RTRIM(TME2_COD)) AS BIGINT) = 0
      )
`.then(res => {
    console.log(`Total slots vacios entre 17 y 24 de ago: ${res.length}`);
    console.log(res.slice(0, 10)); // Mostrar los primeros 10
}).finally(() => prisma.$disconnect());
