require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAll() {
    // 1. Corregir todas las citas del BOT que tienen GRUPO_ATENCION = '2' o '1' (incorrecto)
    //    y TIPO = 'VMG' (incorrecto para el visor)
    //    Deben quedar TIPO='VD', GRUPO='O' para medicina, o VOS/O para odonto

    // Medicina general (ESP=999, TIPO=VMG o VD pero GRUPO='2' o '1')
    const r1 = await prisma.cita.updateMany({
        where: {
            KC3_USUARIO: 'BOT',
            KC3_ESPECIALISTA: '999',
            KC3_GRUPO_ATENCION: { in: ['1', '2'] }
        },
        data: {
            KC3_TIPO:           'VD',
            KC3_TIPO_SERVICIO:  201,
            KC3_GRUPO_ATENCION: 'O',
            KC3_ARTIC:          '890201',
            KC3_C_COSTO:        '7310',
            KC3_ESTADO:         null,
        }
    });
    console.log(`✅ Medicina General corregidas: ${r1.count} citas (TIPO='VD', GRUPO='O')`);

    // Odontología (ESP=461 con GRUPO incorrecto)
    const r2 = await prisma.cita.updateMany({
        where: {
            KC3_USUARIO: 'BOT',
            KC3_ESPECIALISTA: '461',
            KC3_GRUPO_ATENCION: { in: ['1', '2'] }
        },
        data: {
            KC3_TIPO:           'VOS',
            KC3_TIPO_SERVICIO:  211,
            KC3_GRUPO_ATENCION: 'O',
            KC3_ARTIC:          '*230101',
            KC3_C_COSTO:        '7312',
            KC3_ESTADO:         null,
        }
    });
    console.log(`✅ Odontología corregidas: ${r2.count} citas (TIPO='VOS', GRUPO='O')`);

    // Catch-all: cualquier otra cita del BOT con GRUPO incorrecto sin especialista específico
    const r3 = await prisma.cita.updateMany({
        where: {
            KC3_USUARIO: 'BOT',
            KC3_GRUPO_ATENCION: { in: ['1', '2'] }
        },
        data: {
            KC3_TIPO:           'VD',
            KC3_TIPO_SERVICIO:  201,
            KC3_GRUPO_ATENCION: 'O',
            KC3_ARTIC:          '890201',
            KC3_C_COSTO:        '7310',
            KC3_ESTADO:         null,
        }
    });
    console.log(`✅ Otras corregidas: ${r3.count} citas adicionales (GRUPO='O')`);

    console.log('\n=== VERIFICACIÓN FINAL ===');
    const botCitas = await prisma.cita.findMany({
        where: { KC3_USUARIO: 'BOT' },
        orderBy: { KC3_FCH: 'desc' },
        take: 10
    });
    botCitas.forEach(c => {
        console.log(`FCH:${c.KC3_FCH} HH:${c.KC3_HH}:${c.KC3_MM} COD:${c.KC3_COD} → TIPO:'${c.KC3_TIPO}' GRUPO:'${c.KC3_GRUPO_ATENCION}' ESTADO:${c.KC3_ESTADO === null ? 'NULL' : `'${c.KC3_ESTADO}'`}`);
    });

    await prisma.$disconnect();
}
fixAll();
