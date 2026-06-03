require('dotenv').config();
const prisma = require('./db');

async function buscarMedico(nombre) {
    console.log(`\n🔍 Buscando médico con nombre: "${nombre}"...\n`);
    try {
        // Buscar en TMMEDICOS
        const medicos = await prisma.$queryRaw`
            SELECT 
                MED_COD     AS codigo,
                LTRIM(RTRIM(MED_NOMBRE)) AS nombre,
                MED_EST_ESTADO AS estado
            FROM TMMEDICOS
            WHERE MED_NOMBRE LIKE ${'%' + nombre + '%'}
            ORDER BY MED_NOMBRE
        `;

        if (!medicos.length) {
            console.log('❌ No se encontró ningún médico con ese nombre.');
        } else {
            console.log(`✅ ${medicos.length} resultado(s):\n`);
            for (const m of medicos) {
                const est = m.estado === 'A' ? '🟢 ACTIVO' : '🔴 INACTIVO';
                console.log(`  Código: ${m.codigo}  |  Nombre: ${m.nombre}  |  Estado: ${est}`);
            }
        }

        // Buscar si tiene turnos activos en los próximos 30 días
        if (medicos.length > 0) {
            console.log('\n📅 Verificando turnos activos en TMTURNOSMEDICOS:\n');
            for (const m of medicos) {
                const hoy = new Date();
                const hoyDec = parseInt(`${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}`);
                const turnos = await prisma.turnoMedico.findMany({
                    where: {
                        TME_CODM: m.codigo,
                        OR: [{ TME_FCH_FIN: { gte: hoyDec } }, { TME_FCH_FIN: null }]
                    }
                });
                if (turnos.length > 0) {
                    const t = turnos[0];
                    console.log(`  Dr. ${m.nombre} → ${turnos.length} turno(s) vigente(s)`);
                    console.log(`    Desde: ${t.TME_FCH} | Hasta: ${t.TME_FCH_FIN || 'sin fin'} | Especialidad: ${t.TME_ESPECIALIDAD}`);
                } else {
                    console.log(`  Dr. ${m.nombre} → Sin turnos vigentes`);
                }
            }
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

buscarMedico('SEVILLA');
