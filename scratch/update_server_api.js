const fs = require('fs');

const path = 'd:\\Angel\\Proyectos\\agendamiento\\server.js';
let content = fs.readFileSync(path, 'utf8');

const getIndicadoresOld = `        // Atendidos Mes (artículos CVD)
        const getAtendidos = async (start, end) => {
            const result = await medicalPrisma.$queryRawUnsafe(\`
                SELECT COUNT(*) as total
                FROM TMCITASUSUARIOS
                WHERE KC3_FCH >= \${start} AND KC3_FCH <= \${end}
                  AND KC3_NUM > 0
                  AND LTRIM(RTRIM(KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13','890301-14','890301-15','890301-16')
            \`);
            return parseInt(result[0]?.total || 0);
        };

        const atendidosMes = await getAtendidos(startOfMonth, endOfMonth);
        const atendidosTrimestre = await getAtendidos(startOfQuarter, endOfMonth);
        const atendidosAno = await getAtendidos(startOfYear, endOfMonth);

        // Desglose por EPS (mes)
        const epsResult = await medicalPrisma.$queryRawUnsafe(\`
            SELECT 
                c.KC3_ENTIDAD,
                LTRIM(RTRIM(e.ENT_NOMBRE)) AS eps,
                COUNT(*) AS total
            FROM TMCITASUSUARIOS c
            LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
            WHERE c.KC3_FCH >= \${startOfMonth} AND c.KC3_FCH <= \${endOfMonth}
              AND c.KC3_NUM > 0
              AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13','890301-14','890301-15','890301-16')
            GROUP BY c.KC3_ENTIDAD, LTRIM(RTRIM(e.ENT_NOMBRE))
            ORDER BY total DESC
        \`);

        // Mock de indicadores clínicos ya que no hay datos en la BD
        const data = {
            mes: {
                atendidos: atendidosMes,
                dmControl: { valor: Math.round(atendidosMes * 0.45), porcentaje: 45.0, meta: 50 },
                ercEstudio: { valor: Math.round(atendidosMes * 0.82), porcentaje: 82.0, meta: 80 },
                htaControl: { valor: Math.round(atendidosMes * 0.58), porcentaje: 58.0, meta: 60 },
                ldlControl: { valor: Math.round(atendidosMes * 0.48), porcentaje: 48.0, meta: 50 },
                paControl: { valor: Math.round(atendidosMes * 0.61), porcentaje: 61.0, meta: 60 },
            },
            trimestre: {
                atendidos: atendidosTrimestre,
                dmControl: { valor: Math.round(atendidosTrimestre * 0.42), porcentaje: 42.0 },
                ercEstudio: { valor: Math.round(atendidosTrimestre * 0.79), porcentaje: 79.0 },
                htaControl: { valor: Math.round(atendidosTrimestre * 0.55), porcentaje: 55.0 },
                ldlControl: { valor: Math.round(atendidosTrimestre * 0.45), porcentaje: 45.0 },
                paControl: { valor: Math.round(atendidosTrimestre * 0.59), porcentaje: 59.0 },
            },
            ano: {
                atendidos: atendidosAno,
                dmControl: { valor: Math.round(atendidosAno * 0.46), porcentaje: 46.0 },
                ercEstudio: { valor: Math.round(atendidosAno * 0.84), porcentaje: 84.0 },
                htaControl: { valor: Math.round(atendidosAno * 0.61), porcentaje: 61.0 },
                ldlControl: { valor: Math.round(atendidosAno * 0.49), porcentaje: 49.0 },
                paControl: { valor: Math.round(atendidosAno * 0.63), porcentaje: 63.0 },
            },
            eps: epsResult.map(r => {
                const totalEps = parseInt(r.total || 0);
                return {
                    id: r.KC3_ENTIDAD,
                    nombre: r.eps || 'SIN EPS',
                    atendidos: totalEps,
                    dmControl: Math.round(totalEps * 0.45),
                    paControl: Math.round(totalEps * 0.61),
                    ercEstudio: Math.round(totalEps * 0.82)
                };
            })
        };`;

const getIndicadoresNew = `        const getIndicadores = async (start, end) => {
            const rows = await medicalPrisma.$queryRawUnsafe(\`
                SELECT 
                    v.[TIENE HTA], v.[TIENE DM], v.[ESTADIO ERC],
                    v.[HEMOGLOBINA GLI], v.[COLESTEROL LDL],
                    v.[P. Sistolica] AS PSistolica, v.[P. Diastolica] AS PDiastolica,
                    c.KC3_ENTIDAD, LTRIM(RTRIM(e.ENT_NOMBRE)) AS eps
                FROM TMCITASUSUARIOS c
                INNER JOIN VIQ_MOVIMIENTO_HC_ALTO_COSTO v ON c.KC3_COD = v.Codigo_KC AND c.KC3_FCH = v.[Fecha HC]
                LEFT JOIN TMENTIDADES e ON e.ENT_COD = c.KC3_ENTIDAD
                WHERE c.KC3_FCH >= \${start} AND c.KC3_FCH <= \${end}
                  AND c.KC3_NUM > 0
                  AND LTRIM(RTRIM(c.KC3_ARTIC)) IN ('890301-7','890301-8','890301-12','890301-13','890301-14','890301-15','890301-16')
            \`);
            
            const total = rows.length;
            let dmControl = 0, ercEstudio = 0, htaControl = 0, ldlControl = 0, paControl = 0;
            let epsMap = {};

            for (const r of rows) {
                // Parse numbers safely
                const hba1c = parseFloat(r['HEMOGLOBINA GLI']);
                const ldl = parseFloat(r['COLESTEROL LDL']);
                const sys = parseInt(r.PSistolica);
                const dia = parseInt(r.PDiastolica);
                
                let dmOk = false, ercOk = false, htaOk = false, ldlOk = false, paOk = false;

                if (r['TIENE DM'] === '1' && !isNaN(hba1c) && hba1c >= 4 && hba1c < 7) { dmControl++; dmOk = true; }
                if (r['ESTADIO ERC'] && !['', '98'].includes(r['ESTADIO ERC'].trim())) { ercEstudio++; ercOk = true; }
                if (r['TIENE HTA'] === '1' && sys > 0 && sys < 150 && dia > 0 && dia < 90) { htaControl++; htaOk = true; }
                if (r['TIENE HTA'] === '1' && r['TIENE DM'] === '1' && !isNaN(ldl) && ldl >= 15 && ldl <= 100) { ldlControl++; ldlOk = true; }
                if (sys > 0 && sys < 140 && dia > 0 && dia < 90) { paControl++; paOk = true; }

                if (r.KC3_ENTIDAD) {
                    const epsName = r.eps || 'SIN EPS';
                    if (!epsMap[epsName]) epsMap[epsName] = { atendidos: 0, dmControl: 0, paControl: 0, ercEstudio: 0 };
                    epsMap[epsName].atendidos++;
                    if (dmOk) epsMap[epsName].dmControl++;
                    if (paOk) epsMap[epsName].paControl++;
                    if (ercOk) epsMap[epsName].ercEstudio++;
                }
            }

            return {
                atendidos: total,
                dmControl: { valor: dmControl, porcentaje: total ? Math.round((dmControl/total)*1000)/10 : 0 },
                ercEstudio: { valor: ercEstudio, porcentaje: total ? Math.round((ercEstudio/total)*1000)/10 : 0 },
                htaControl: { valor: htaControl, porcentaje: total ? Math.round((htaControl/total)*1000)/10 : 0 },
                ldlControl: { valor: ldlControl, porcentaje: total ? Math.round((ldlControl/total)*1000)/10 : 0 },
                paControl: { valor: paControl, porcentaje: total ? Math.round((paControl/total)*1000)/10 : 0 },
                epsList: Object.entries(epsMap).map(([nombre, stats]) => ({ nombre, ...stats })).sort((a,b)=>b.atendidos-a.atendidos)
            };
        };

        const resMes = await getIndicadores(startOfMonth, endOfMonth);
        const resTrimestre = await getIndicadores(startOfQuarter, endOfMonth);
        const resAno = await getIndicadores(startOfYear, endOfMonth);

        const data = {
            mes: resMes,
            trimestre: resTrimestre,
            ano: resAno,
            eps: resMes.epsList
        };`;

content = content.replace(getIndicadoresOld, getIndicadoresNew);
fs.writeFileSync(path, content, 'utf8');
console.log('Replaced correctly');
