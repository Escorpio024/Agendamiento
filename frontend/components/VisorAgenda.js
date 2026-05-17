'use client';
import { useState, useEffect, useCallback } from 'react';
import { X, Calendar, User, RefreshCw, Search, Clock, Phone, Building2, UserCheck, MonitorCheck, FileText } from 'lucide-react';

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = typeof window !== 'undefined' ? (IS_PROD ? window.location.hostname : 'localhost') : 'localhost';
const API_BASE = `http://${SERVER_HOST}:3001`;

function toDecimal(dateStr) {
    if (typeof dateStr === 'string' && dateStr.includes('-')) {
        return parseInt(dateStr.replace(/-/g, ''), 10);
    }
    const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
    return parseInt(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`);
}
function fromDecimal(dec) {
    const s = String(dec);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}
function todayStr() {
    const d = new Date();
    // Use local time instead of UTC to avoid timezone mismatch
    const offset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d - offset)).toISOString().split('T')[0];
    return localISOTime;
}

export default function VisorAgenda({ onClose }) {
    const [medicos, setMedicos] = useState([]);
    const [medicoSel, setMedicoSel] = useState(null);
    const [fecha, setFecha] = useState(todayStr());
    const [filtro, setFiltro] = useState('todos'); // todos | asignados | libres
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMedicos, setLoadingMedicos] = useState(true);
    const [error, setError] = useState(null);
    const [busqueda, setBusqueda] = useState('');

    // Cargar lista de médicos
    useEffect(() => {
        setLoadingMedicos(true);
        fetch(`${API_BASE}/api/visor/medicos`)
            .then(r => r.json())
            .then(data => {
                setMedicos(Array.isArray(data) ? data : []);
                setLoadingMedicos(false);
            })
            .catch(e => {
                setError('No se pudo cargar la lista de médicos');
                setLoadingMedicos(false);
            });
    }, []);

    // Cargar agenda cuando cambia médico o fecha
    const cargarAgenda = useCallback(async () => {
        if (!medicoSel || !fecha) return;
        setLoading(true);
        setError(null);
        try {
            const dec = toDecimal(fecha);
            const res = await fetch(`${API_BASE}/api/visor/agenda?medicoId=${medicoSel.cod}&fecha=${dec}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al cargar agenda');
            setSlots(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message);
            setSlots([]);
        } finally {
            setLoading(false);
        }
    }, [medicoSel, fecha]);

    useEffect(() => { cargarAgenda(); }, [cargarAgenda]);

    // Filtrar slots
    const slotsFiltrados = slots.filter(s => {
        const matchFiltro = filtro === 'todos' || (filtro === 'asignados' && s.asignado) || (filtro === 'libres' && !s.asignado);
        const matchBusqueda = !busqueda || s.pacienteNom.toLowerCase().includes(busqueda.toLowerCase())
            || s.cod?.includes(busqueda) || s.entidad?.toLowerCase().includes(busqueda.toLowerCase());
        return matchFiltro && matchBusqueda;
    });

    const stats = {
        total: slots.length,
        asignados: slots.filter(s => s.asignado).length,
        libres: slots.filter(s => !s.asignado).length,
    };

    // ── Generador de informe del día ───────────────────────────────────────────
    const generarInforme = () => {
        if (!medicoSel || slots.length === 0) return;

        const fechaLegible = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        const fechaCorta = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const ahora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        const ocupacion = stats.total > 0 ? Math.round((stats.asignados / stats.total) * 100) : 0;

        const filas = slots.map((s, i) => `
            <tr class="${s.asignado ? 'asignado' : 'libre'}">
                <td>${s.lin || i + 1}</td>
                <td class="hora">${s.hora}</td>
                <td>
                    ${s.asignado
                ? `<div class="paciente-nom">${s.pacienteNom || '—'}</div>${s.cod && s.cod !== '00000000000000' ? `<div class="cedula">CC: ${s.cod.replace(/^0+/, '')}</div>` : ''}`
                : '<span class="libre-tag">LIBRE</span>'
            }
                </td>
                <td>${s.asignado ? (s.entidad || '—') : '—'}</td>
                <td>${s.edad != null ? s.edad + ' A' : '—'}</td>
                <td>${s.telefono || '—'}</td>
                <td>${s.consultorio || '—'}</td>
                <td><span class="usuario ${s.usuario === 'AGENTE AURORA' ? 'aurora' : ''}">${s.usuario || '—'}</span></td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8" />
    <title>Informe de Agenda — ${medicoSel.nombre} — ${fechaCorta}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1a1a2e; font-size: 12px; }

        /* ── Header ── */
        .header { background: linear-gradient(135deg, #8263B1 0%, #A1E3D8 100%); padding: 24px 32px; color: white; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .logo span { opacity: 0.75; font-weight: 400; font-size: 14px; display: block; margin-top: 2px; }
        .meta { text-align: right; font-size: 11px; opacity: 0.85; line-height: 1.6; }
        .doctor-name { font-size: 17px; font-weight: 700; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 10px; }
        .doctor-fecha { font-size: 13px; opacity: 0.85; margin-top: 2px; text-transform: capitalize; }

        /* ── Stats ── */
        .stats { display: flex; gap: 16px; padding: 20px 32px; background: #f8f9fc; border-bottom: 1px solid #e2e8f0; }
        .stat-card { flex: 1; background: white; border-radius: 10px; padding: 14px 18px;
                     border: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(0,0,0,0.06); text-align: center; }
        .stat-card .num { font-size: 28px; font-weight: 800; line-height: 1; }
        .stat-card .lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
                          color: #64748b; margin-top: 4px; }
        .stat-card.total .num  { color: #1a1a2e; }
        .stat-card.asig .num   { color: #0f766e; }
        .stat-card.libre .num  { color: #8263B1; }
        .stat-card.ocup .num   { color: #d97706; }

        /* ── Tabla ── */
        .table-wrap { padding: 20px 32px 32px; }
        .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase;
                         letter-spacing: 0.8px; color: #64748b; margin-bottom: 10px;
                         padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #1a1a2e; color: white; }
        thead th { padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700;
                   text-transform: uppercase; letter-spacing: 0.6px; }
        tbody tr { border-bottom: 1px solid #f1f5f9; }
        tbody tr:last-child { border-bottom: none; }
        tbody tr.asignado { background: #f0fdf9; }
        tbody tr.libre { background: #fafafa; }
        tbody td { padding: 7px 10px; vertical-align: middle; }
        .hora { font-family: monospace; font-weight: 700; color: #0f766e; font-size: 12px; }
        .paciente-nom { font-weight: 600; color: #1a1a2e; }
        .cedula { font-size: 10px; color: #94a3b8; font-family: monospace; margin-top: 2px; }
        .libre-tag { display: inline-block; background: #f1f5f9; color: #94a3b8;
                     font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
                     letter-spacing: 0.5px; }
        .usuario { display: inline-block; padding: 2px 8px; border-radius: 4px;
                   font-size: 10px; font-weight: 600; background: #f1f5f9; color: #64748b; }
        .usuario.aurora { background: #ede9fe; color: #7c3aed; }

        /* ── Footer ── */
        .footer { padding: 16px 32px; background: #f8f9fc; border-top: 1px solid #e2e8f0;
                  display: flex; justify-content: space-between; align-items: center;
                  font-size: 10px; color: #94a3b8; }

        /* ── Print ── */
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            tbody tr.asignado { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-top">
            <div class="logo">🏥 Agente Aurora<span>Sistema de Agendamiento Médico</span></div>
            <div class="meta">
                Generado: ${fechaCorta} a las ${ahora}<br/>
                Documento confidencial — Uso interno
            </div>
        </div>
        <div class="doctor-name">Dr(a). ${medicoSel.nombre}</div>
        <div class="doctor-fecha">Agenda del ${fechaLegible}</div>
    </div>

    <div class="stats">
        <div class="stat-card total"><div class="num">${stats.total}</div><div class="lbl">Total Turnos</div></div>
        <div class="stat-card asig"><div class="num">${stats.asignados}</div><div class="lbl">Asignados</div></div>
        <div class="stat-card libre"><div class="num">${stats.libres}</div><div class="lbl">Disponibles</div></div>
        <div class="stat-card ocup"><div class="num">${ocupacion}%</div><div class="lbl">Ocupación</div></div>
    </div>

    <div class="table-wrap">
        <div class="section-title">Detalle de turnos del día</div>
        <table>
            <thead>
                <tr>
                    <th>#</th><th>Hora</th><th>Paciente</th><th>EPS / Entidad</th>
                    <th>Edad</th><th>Teléfono</th><th>Consultorio</th><th>Agendado por</th>
                </tr>
            </thead>
            <tbody>${filas}</tbody>
        </table>
    </div>

    <div class="footer">
        <span>Aurora Bot — Sistema de Gestión Médica</span>
        <span>Dr(a). ${medicoSel.nombre} · ${fechaCorta} · ${stats.asignados} de ${stats.total} turnos ocupados (${ocupacion}%)</span>
    </div>

    <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (win) {
            win.document.write(html);
            win.document.close();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-[#2D283E]"
                style={{ background: 'linear-gradient(135deg, #1A1721 0%, #1E1B26 100%)' }}>

                {/* Header */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-[#2D283E]"
                    style={{ background: 'linear-gradient(90deg, #8263B1 0%, #A1E3D8 100%)', opacity: 0.95 }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                <MonitorCheck size={18} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-white font-bold text-lg leading-tight">Visor de Agenda</h2>
                                <p className="text-white/70 text-xs">Turnos médicos en tiempo real</p>
                            </div>
                        </div>
                        <button onClick={onClose}
                            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Controles */}
                <div className="flex-shrink-0 p-4 border-b border-[#2D283E] bg-[#1A1721] space-y-3">
                    <div className="flex flex-wrap gap-3">
                        {/* Médico */}
                        <div className="flex-1 min-w-48">
                            <label className="block text-xs text-[#A1E3D8] font-semibold mb-1.5 flex items-center gap-1">
                                <User size={11} /> Profesional
                            </label>
                            <select
                                value={medicoSel?.cod || ''}
                                onChange={e => {
                                    const m = medicos.find(x => x.cod === parseInt(e.target.value));
                                    setMedicoSel(m || null);
                                }}
                                className="w-full px-3 py-2 text-sm bg-[#0F0E13] border border-[#2D283E] text-[#F5F5F7] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#8263B1]"
                            >
                                <option value="">— Seleccionar médico —</option>
                                {medicos.map(m => (
                                    <option key={m.cod} value={m.cod}>{m.nombre}</option>
                                ))}
                            </select>
                        </div>

                        {/* Fecha */}
                        <div className="w-44">
                            <label className="block text-xs text-[#A1E3D8] font-semibold mb-1.5 flex items-center gap-1">
                                <Calendar size={11} /> Fecha
                            </label>
                            <input
                                type="date"
                                value={fecha}
                                onChange={e => setFecha(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-[#0F0E13] border border-[#2D283E] text-[#F5F5F7] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#8263B1]"
                                style={{ colorScheme: 'dark' }}
                            />
                        </div>

                        {/* Botón Actualizar */}
                        <div className="flex items-end">
                            <button
                                onClick={cargarAgenda}
                                disabled={loading || !medicoSel}
                                className="px-4 py-2 bg-[#8263B1] hover:bg-[#9473C1] disabled:opacity-40 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
                            >
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                {loading ? 'Cargando...' : 'Actualizar'}
                            </button>
                        </div>
                    </div>

                    {/* Filtros + búsqueda */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex gap-1 bg-[#0F0E13] rounded-lg p-1">
                            {[
                                { key: 'todos', label: `Todos (${stats.total})` },
                                { key: 'asignados', label: `Asignados (${stats.asignados})`, color: '#A1E3D8' },
                                { key: 'libres', label: `Libres (${stats.libres})` },
                            ].map(f => (
                                <button key={f.key} onClick={() => setFiltro(f.key)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${filtro === f.key
                                        ? 'bg-[#8263B1] text-white shadow'
                                        : 'text-gray-400 hover:text-white'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {/* Búsqueda */}
                        <div className="flex-1 min-w-40 relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" placeholder="Buscar paciente, cédula o EPS..."
                                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0F0E13] border border-[#2D283E] text-[#F5F5F7] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#8263B1] placeholder-gray-500" />
                        </div>
                    </div>
                </div>

                {/* Tabla */}
                <div className="flex-1 overflow-y-auto">
                    {!medicoSel ? (
                        <div className="flex flex-col items-center justify-center h-full py-16 text-gray-500">
                            <User size={40} className="mb-3 opacity-30" />
                            <p className="text-sm">Selecciona un profesional para ver su agenda</p>
                        </div>
                    ) : loading ? (
                        <div className="flex items-center justify-center h-full py-16 text-[#A1E3D8]">
                            <RefreshCw size={24} className="animate-spin mr-3" />
                            <span className="text-sm">Cargando agenda...</span>
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center text-red-400 text-sm">{error}</div>
                    ) : slotsFiltrados.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            No hay turnos para mostrar con los filtros actuales
                        </div>
                    ) : (
                        <table className="w-full text-sm border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr style={{ background: '#12101A' }}>
                                    {['#', 'Hora', 'Paciente', 'EPS / Entidad', 'Edad', 'Teléfono', 'Consultorio', 'Usuario'].map(h => (
                                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-[#2D283E]">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {slotsFiltrados.map((s, idx) => (
                                    <tr key={idx}
                                        className={`border-b border-[#2D283E]/50 transition-colors hover:brightness-110 ${s.asignado
                                            ? 'bg-[#0D3D3A]/60'
                                            : idx % 2 === 0 ? 'bg-[#1A1721]' : 'bg-[#1E1B26]'
                                            }`}>
                                        {/* # */}
                                        <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{s.lin}</td>
                                        {/* Hora */}
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={11} className="text-[#A1E3D8] opacity-70" />
                                                <span className="text-[#A1E3D8] font-bold text-xs font-mono">{s.hora}</span>
                                            </div>
                                        </td>
                                        {/* Paciente */}
                                        <td className="px-3 py-2.5">
                                            {s.asignado ? (
                                                <div>
                                                    <p className="text-[#F5F5F7] font-semibold text-xs leading-tight">
                                                        {s.pacienteNom || '—'}
                                                    </p>
                                                    {s.cod && s.cod !== '00000000000000' && (
                                                        <p className="text-gray-500 text-[10px] font-mono mt-0.5">
                                                            CC: {s.cod.replace(/^0+/, '')}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-600 text-xs italic">Libre</span>
                                            )}
                                        </td>
                                        {/* EPS */}
                                        <td className="px-3 py-2.5">
                                            {s.asignado ? (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${s.entidad === 'PARTICULAR'
                                                    ? 'bg-gray-700/50 text-gray-300'
                                                    : 'bg-[#A1E3D8]/15 text-[#A1E3D8]'}`}>
                                                    <Building2 size={9} />
                                                    {s.entidad}
                                                </span>
                                            ) : <span className="text-gray-700 text-xs">—</span>}
                                        </td>
                                        {/* Edad */}
                                        <td className="px-3 py-2.5 text-xs text-gray-300">
                                            {s.edad != null ? `${s.edad} A` : '—'}
                                        </td>
                                        {/* Teléfono */}
                                        <td className="px-3 py-2.5">
                                            {s.telefono ? (
                                                <div className="flex items-center gap-1 text-xs text-gray-300">
                                                    <Phone size={10} className="text-[#8263B1]" />
                                                    {s.telefono}
                                                </div>
                                            ) : <span className="text-gray-700 text-xs">—</span>}
                                        </td>
                                        {/* Consultorio */}
                                        <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">
                                            {s.consultorio || '—'}
                                        </td>
                                        {/* Usuario */}
                                        <td className="px-3 py-2.5">
                                            {s.usuario ? (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${s.usuario === 'AURORA'
                                                    ? 'bg-[#8263B1]/30 text-[#C4A7FF]'
                                                    : 'bg-[#2D283E] text-gray-300'}`}>
                                                    <UserCheck size={9} />
                                                    {s.usuario}
                                                </span>
                                            ) : <span className="text-gray-700 text-xs">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                {medicoSel && slots.length > 0 && (
                    <div className="flex-shrink-0 px-6 py-3 border-t border-[#2D283E] bg-[#12101A] flex items-center justify-between gap-4">
                        {/* Leyenda */}
                        <div className="flex gap-4 text-xs text-gray-400">
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-sm bg-[#0D3D3A]/80 border border-[#A1E3D8]/30 inline-block" />
                                Asignado ({stats.asignados})
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 rounded-sm bg-[#1E1B26] border border-[#2D283E] inline-block" />
                                Libre ({stats.libres})
                            </span>
                        </div>

                        {/* Info del doctor */}
                        <span className="text-xs text-gray-500 hidden sm:block truncate max-w-xs">
                            {medicoSel.nombre} · {new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>

                        {/* Botón Generar Informe */}
                        <button
                            onClick={generarInforme}
                            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200
                                       bg-gradient-to-r from-[#8263B1] to-[#A1E3D8] hover:from-[#9473C1] hover:to-[#7dd3c8]
                                       text-white shadow-lg shadow-[#8263B1]/30 hover:shadow-[#8263B1]/50
                                       hover:scale-105 active:scale-95"
                        >
                            <FileText size={14} />
                            Generar Informe del Día
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
