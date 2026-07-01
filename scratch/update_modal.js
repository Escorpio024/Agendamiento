const fs = require('fs');

const path = 'd:\\Angel\\Proyectos\\agendamiento\\frontend\\app\\cardiovascular\\page.js';
let content = fs.readFileSync(path, 'utf8');

const startMarker = '// ─── Dashboard Indicadores Modal ─────────────────────────────────────────────';
const endMarker = '// ─── Main Page ────────────────────────────────────────────────────────────────';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const newModal = `// ─── Dashboard Indicadores Modal ─────────────────────────────────────────────
function DashboardIndicadoresModal({ onClose }) {
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setErrorMsg(null);
            try {
                const res = await fetch(\`\${API_BASE}/api/cardiovascular/indicadores?year=\${year}&month=\${month}\`);
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                } else {
                    setErrorMsg(\`No se pudieron cargar los datos (Error \${res.status}). Asegúrate de reiniciar el servidor backend.\`);
                }
            } catch (e) {
                console.error(e);
                setErrorMsg("Error de conexión. ¿Reiniciaste el servidor backend (npm start)?");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [year, month]);

    const handleDownloadCSV = () => {
        if (!data) return;
        const csvRows = [];
        // Headers
        csvRows.push("Indicador,Numerador,Denominador,Meta,Cumplimiento,Puntaje");
        
        // Helper
        const addRow = (nombre, stat, meta) => {
            const num = stat?.valor || 0;
            const denom = data.mes.atendidos || 0;
            const cump = stat?.porcentaje || 0;
            const punt = ((cump / 100) * 10).toFixed(2);
            csvRows.push(\`"\${nombre}",\${num},\${denom},\${meta},\${cump}%,\${punt}\`);
        };

        addRow("Porcentaje de pacientes diabéticos controlados (Hb1AC >=4 y <7%, en los últimos 6 meses)", data.mes.dmControl, "50 %");
        addRow("Usuarios estudiados bajo el algoritmo para Enfermedad Renal Crónica - ERC", data.mes.ercEstudio, "80 %");
        addRow("Porcentaje de pacientes hipertensos controlados <150/90. (>=60 años)", data.mes.htaControl, "60 %");
        addRow("Porcentaje de Control de LDL en pacientes con HTA, DM y ERC. (>= 15 mg/dl y <= 100 mg/dl)", data.mes.ldlControl, "50 %");
        addRow("Control de la presión arterial (<140/90) **", data.mes.paControl, "60 %");

        csvRows.push("");
        csvRows.push("Desglose EPS,Atendidos,DM Ctrl.,PA Ctrl.,ERC Est.");
        data.eps.forEach(e => {
            csvRows.push(\`"\${e.nombre}",\${e.atendidos},\${e.dmControl},\${e.paControl},\${e.ercEstudio}\`);
        });

        const blob = new Blob([csvRows.join("\\n")], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", \`indicadores_cvd_\${year}_\${month}.csv\`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const rowStyle = "flex items-stretch gap-[2px] mb-[2px] w-full min-h-[44px]";
    const labelStyle = "flex items-center px-4 py-2 rounded-sm text-xs font-semibold text-white shadow-sm flex-1 leading-snug";
    const valStyle = "flex items-center justify-center p-2 rounded-sm font-bold text-white shadow-sm w-[110px] text-lg bg-[#2A3E4F]";
    const headerStyle = "flex items-center justify-center p-2 rounded-sm font-bold text-white shadow-sm w-[110px] text-xs bg-[#192C3D] uppercase tracking-wider";

    const IndicatorRow = ({ label, stat, metaStr }) => {
        const num = stat?.valor || 0;
        const denom = data?.mes?.atendidos || 0;
        const cump = stat?.porcentaje || 0;
        const punt = ((cump / 100) * 10).toFixed(2);
        
        return (
            <div className={rowStyle}>
                <div className={labelStyle} style={{ background: '#0F9B82' }}>
                    {label}
                </div>
                <div className={valStyle}>{num}</div>
                <div className={valStyle}>{denom}</div>
                <div className={valStyle}>{metaStr}</div>
                <div className={valStyle}>{cump} %</div>
                <div className={valStyle}>{punt}</div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-6xl rounded-2xl flex flex-col overflow-hidden shadow-2xl"
                 style={{ background: '#F5F5F7', border: '1px solid var(--border)', maxHeight: '95vh' }}>
                <div className="px-6 py-4 flex items-center justify-between"
                     style={{ borderBottom: '1px solid var(--border)', background: '#192C3D' }}>
                    <div className="flex items-center gap-3">
                        <Activity size={20} style={{ color: '#0F9B82' }} />
                        <h2 className="text-base font-bold text-white">Dashboard de Riesgo Cardiovascular</h2>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                        style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
                        <X size={15} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6" style={{ background: '#EAECEE' }}>
                    
                    {/* Toolbar */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <select className="px-4 py-2 rounded-lg text-sm font-semibold shadow-sm" style={{ background: 'white', color: '#333', border: '1px solid #ccc', outline: 'none' }} value={year} onChange={e=>setYear(parseInt(e.target.value))}>
                                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select className="px-4 py-2 rounded-lg text-sm font-semibold shadow-sm" style={{ background: 'white', color: '#333', border: '1px solid #ccc', outline: 'none' }} value={month} onChange={e=>setMonth(parseInt(e.target.value))}>
                                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                            </select>
                        </div>
                        {data && !errorMsg && (
                            <button onClick={handleDownloadCSV}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white shadow-md transition-all transform hover:scale-105"
                                style={{ background: '#0F9B82' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#0d8972'}
                                onMouseLeave={e => e.currentTarget.style.background = '#0F9B82'}>
                                <Download size={16} /> Descargar Informe (CSV)
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                            <Loader2 size={40} className="animate-spin mb-4" style={{ color: '#0F9B82' }} />
                            <p className="text-sm text-gray-500 font-semibold">Calculando indicadores clínicos...</p>
                        </div>
                    ) : errorMsg ? (
                        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                            <AlertTriangle size={48} className="mb-4 text-red-500" />
                            <p className="text-sm text-red-600 font-semibold text-center max-w-md">{errorMsg}</p>
                        </div>
                    ) : data ? (
                        <div className="flex flex-col gap-6">
                            
                            {/* Cuadro principal similar a imagen */}
                            <div className="flex flex-col">
                                <div className={rowStyle}>
                                    <div className="flex-1"></div>
                                    <div className={headerStyle}>NUMERADOR</div>
                                    <div className={headerStyle}>DENOMINADOR</div>
                                    <div className={headerStyle}>META</div>
                                    <div className={headerStyle}>CUMPLIMIENTO</div>
                                    <div className={headerStyle}>PUNTAJE</div>
                                </div>
                                <IndicatorRow 
                                    label="Porcentaje de pacientes diabéticos controlados (Hb1AC ≥4 y <7%, en los últimos 6 meses)" 
                                    stat={data.mes.dmControl} metaStr="50 %" />
                                <IndicatorRow 
                                    label="Usuarios estudiados bajo el algoritmo para Enfermedad Renal Crónica - ERC" 
                                    stat={data.mes.ercEstudio} metaStr="80 %" />
                                <IndicatorRow 
                                    label="Porcentaje de pacientes hipertensos controlados <150/90. (≥60 años)" 
                                    stat={data.mes.htaControl} metaStr="60 %" />
                                <IndicatorRow 
                                    label="Porcentaje de Control de LDL en pacientes con HTA, DM y ERC. (≥ 15 mg/dl y ≤ 100 mg/dl)" 
                                    stat={data.mes.ldlControl} metaStr="50 %" />
                                <IndicatorRow 
                                    label="Control de la presión arterial (<140/90) **" 
                                    stat={data.mes.paControl} metaStr="60 %" />
                            </div>

                            {/* Acumulados y EPS (layout simplificado para mantener el estilo limpio) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-5 rounded-xl shadow bg-white border-t-4 border-[#0F9B82]">
                                    <h3 className="text-sm font-bold text-[#192C3D] border-b pb-2 mb-3">Acumulado Trimestre (Atendidos: {data.trimestre.atendidos})</h3>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center text-xs"><span className="text-gray-600">DM Controlada:</span> <span className="font-bold text-[#0F9B82]">{data.trimestre.dmControl.porcentaje}% ({data.trimestre.dmControl.valor})</span></div>
                                        <div className="flex justify-between items-center text-xs"><span className="text-gray-600">Estudio ERC:</span> <span className="font-bold text-[#0F9B82]">{data.trimestre.ercEstudio.porcentaje}% ({data.trimestre.ercEstudio.valor})</span></div>
                                        <div className="flex justify-between items-center text-xs"><span className="text-gray-600">PA Controlada:</span> <span className="font-bold text-[#0F9B82]">{data.trimestre.paControl.porcentaje}% ({data.trimestre.paControl.valor})</span></div>
                                    </div>
                                </div>
                                <div className="p-5 rounded-xl shadow bg-white border-t-4 border-[#192C3D]">
                                    <h3 className="text-sm font-bold text-[#192C3D] border-b pb-2 mb-3">Acumulado Año (Atendidos: {data.ano.atendidos})</h3>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center text-xs"><span className="text-gray-600">DM Controlada:</span> <span className="font-bold text-[#0F9B82]">{data.ano.dmControl.porcentaje}% ({data.ano.dmControl.valor})</span></div>
                                        <div className="flex justify-between items-center text-xs"><span className="text-gray-600">Estudio ERC:</span> <span className="font-bold text-[#0F9B82]">{data.ano.ercEstudio.porcentaje}% ({data.ano.ercEstudio.valor})</span></div>
                                        <div className="flex justify-between items-center text-xs"><span className="text-gray-600">PA Controlada:</span> <span className="font-bold text-[#0F9B82]">{data.ano.paControl.porcentaje}% ({data.ano.paControl.valor})</span></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-5 rounded-xl shadow bg-white">
                                <h3 className="text-sm font-bold text-[#192C3D] border-b pb-2 mb-3">Desglose por EPS (Mes)</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead>
                                            <tr className="border-b">
                                                <th className="py-2 text-[#192C3D]">EPS</th>
                                                <th className="py-2 text-[#192C3D] text-right">Atendidos</th>
                                                <th className="py-2 text-[#192C3D] text-right">DM Ctrl.</th>
                                                <th className="py-2 text-[#192C3D] text-right">PA Ctrl.</th>
                                                <th className="py-2 text-[#192C3D] text-right">ERC Est.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.eps.length === 0 ? (
                                                <tr><td colSpan="5" className="text-center py-4 text-gray-500">No hay datos en este mes</td></tr>
                                            ) : (
                                                data.eps.map((eps, i) => (
                                                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                                        <td className="py-2 font-semibold text-gray-700">{eps.nombre}</td>
                                                        <td className="py-2 font-bold text-right text-[#0F9B82]">{eps.atendidos}</td>
                                                        <td className="py-2 text-right text-gray-600">{eps.dmControl}</td>
                                                        <td className="py-2 text-right text-gray-600">{eps.paControl}</td>
                                                        <td className="py-2 text-right text-gray-600">{eps.ercEstudio}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
\n`;

    content = content.substring(0, startIndex) + newModal + content.substring(endIndex);
    fs.writeFileSync(path, content, 'utf8');
    console.log('✅ Modal actualizado con éxito.');
} else {
    console.error('No se encontraron los delimitadores.', {startIndex, endIndex});
}
