"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Megaphone, Send, Clock, CheckCircle2, AlertCircle, Plus, RefreshCw,
    ArrowLeft, Pause, Play, Smartphone, Search,
    Users, X, ChevronDown, CheckSquare, Square, Phone, Calendar, CalendarDays
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const API_BASE = `${PROTOCOL}//${SERVER_HOST}:3001`;

const statusConfig = {
    DRAFT:     { label: 'Borrador',   color: '#9ca3af', bg: 'rgba(75,85,99,0.2)',    border: 'rgba(75,85,99,0.4)',   icon: Clock },
    SENDING:   { label: 'Enviando',   color: '#fbbf24', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', icon: RefreshCw, spin: true },
    PAUSED:    { label: 'Pausada',    color: '#fb923c', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)', icon: Pause },
    COMPLETED: { label: 'Completada', color: '#34d399', bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.4)', icon: CheckCircle2 },
};

function StatusBadge({ status }) {
    const s = statusConfig[status] || statusConfig.DRAFT;
    const Icon = s.icon;
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
            <Icon size={11} className={s.spin ? 'animate-spin' : ''} />
            {s.label}
        </span>
    );
}

function ProgressBar({ camp }) {
    const pct = camp.totalCount ? Math.round((camp.sentCount / camp.totalCount) * 100) : 0;
    const isComplete = camp.status === 'COMPLETED';
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
                <span className="text-gray-400">{camp.sentCount.toLocaleString()} / {camp.totalCount ? camp.totalCount.toLocaleString() : '---'}</span>
                <span className="font-bold" style={{ color: isComplete ? '#34d399' : '#fbbf24' }}>{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#1A1721] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: isComplete ? '#34d399' : 'linear-gradient(90deg,#3b82f6,#60a5fa)' }} />
            </div>
        </div>
    );
}

function PhoneBadge({ tipo }) {
    if (!tipo) return null;
    const isMobile = tipo === 'CELULAR';
    return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
            style={{
                background: isMobile ? 'rgba(52,211,153,0.12)' : 'rgba(156,163,175,0.12)',
                color: isMobile ? '#34d399' : '#6b7280',
                border: `1px solid ${isMobile ? 'rgba(52,211,153,0.3)' : 'rgba(107,114,128,0.3)'}`,
            }}>
            {isMobile ? 'CEL' : 'FIJO'}
        </span>
    );
}

function CampaignTable({ campaigns, loading, onSend, onPause, onResume, actionLoading }) {
    if (loading) return (
        <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl p-12 text-center text-gray-500 flex items-center justify-center gap-3">
            <RefreshCw size={18} className="animate-spin text-blue-400" /> Cargando campanas...
        </div>
    );
    if (campaigns.length === 0) return (
        <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl p-16 text-center">
            <div className="w-20 h-20 bg-[#2D283E] rounded-full flex items-center justify-center mx-auto mb-4">
                <Megaphone className="text-gray-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Sin campanas</h3>
            <p className="text-gray-400 max-w-sm mx-auto text-sm">No hay campanas SMS creadas todavia.</p>
        </div>
    );
    return (
        <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl overflow-hidden shadow-2xl">
            <table className="w-full text-left">
                <thead className="bg-[#1A1721] border-b border-[#2D283E]">
                    <tr>
                        {['Campana', 'Estado', 'Progreso', 'Fecha', 'Acciones'].map((h, i) => (
                            <th key={h} className={`px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider${i === 4 ? ' text-right' : ''}`}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[#2D283E]">
                    {campaigns.map(camp => (
                        <tr key={camp.id} className="hover:bg-[#2D283E]/40 transition-colors">
                            <td className="px-6 py-5">
                                <p className="font-bold text-white mb-0.5">{camp.name}</p>
                                <p className="text-xs text-gray-500 truncate max-w-[220px]">{camp.messageBody}</p>
                            </td>
                            <td className="px-6 py-5"><StatusBadge status={camp.status} /></td>
                            <td className="px-6 py-5 min-w-[140px]"><ProgressBar camp={camp} /></td>
                            <td className="px-6 py-5 text-sm text-gray-400 whitespace-nowrap">
                                {new Date(camp.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </td>
                            <td className="px-6 py-5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    {camp.status === 'DRAFT' && (
                                        <button onClick={() => onSend(camp.id, camp.name)} disabled={actionLoading[camp.id]}
                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors">
                                            <Send size={12} /> Enviar
                                        </button>
                                    )}
                                    {camp.status === 'SENDING' && (
                                        <button onClick={() => onPause(camp.id)} disabled={actionLoading[camp.id]}
                                            className="bg-orange-700/80 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors">
                                            <Pause size={12} /> Pausar
                                        </button>
                                    )}
                                    {camp.status === 'PAUSED' && (
                                        <button onClick={() => onResume(camp.id)} disabled={actionLoading[camp.id]}
                                            className="bg-blue-700/80 hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors">
                                            <Play size={12} /> Reanudar
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SmsCampaignsTab() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [actionLoading, setActionLoading] = useState({});
    const [newName, setNewName] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [creating, setCreating] = useState(false);
    const [filterPeriod, setFilterPeriod] = useState('today');
    const [patients, setPatients] = useState([]);
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const [selectedPhones, setSelectedPhones] = useState(new Set());
    const searchTimer = useRef(null);
    const [testOpen, setTestOpen] = useState(false);
    const [testNumbers, setTestNumbers] = useState('');
    const [testMessage, setTestMessage] = useState('');
    const [testLoading, setTestLoading] = useState(false);
    const [testResults, setTestResults] = useState(null);

    const fetchCampaigns = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/sms-campaigns`);
            if (res.ok) setCampaigns(await res.json());
        } catch (_) { } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchCampaigns();
        const iv = setInterval(fetchCampaigns, 10000);
        return () => clearInterval(iv);
    }, [fetchCampaigns]);

    const searchPatients = useCallback(async (period, q) => {
        setPatientsLoading(true);
        setSelectedPhones(new Set());
        try {
            const url = period === 'all'
                ? `${API_BASE}/api/sms-campaigns/patients?q=${encodeURIComponent(q)}&limit=500`
                : `${API_BASE}/api/sms-campaigns/patients-by-appointment?period=${period}&q=${encodeURIComponent(q)}&limit=500`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                const normalized = (data.patients || []).map(p => {
                    if (period === 'all') {
                        const clean = (p.celular || '').replace(/\D/g, '');
                        return {
                            id: p.cod, nombre: p.nombre, telefono: clean,
                            tipoTelefono: clean.length === 10 && clean.startsWith('3') ? 'CELULAR' : 'FIJO',
                            fechaCita: null, horaCita: null, medico: null,
                        };
                    }
                    return {
                        id: p.documento, nombre: p.nombre, telefono: p.telefono,
                        tipoTelefono: p.tipoTelefono, fechaCita: p.fechaCita,
                        horaCita: p.horaCita, medico: p.medico,
                    };
                });
                setPatients(normalized);
            }
        } catch (_) { } finally { setPatientsLoading(false); }
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (showModal) searchPatients(filterPeriod, ''); }, [showModal]);

    useEffect(() => {
        if (!showModal) return;
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => searchPatients(filterPeriod, searchQ), 400);
    }, [searchQ, filterPeriod, showModal, searchPatients]);

    const togglePatient = (tel) => setSelectedPhones(prev => {
        const n = new Set(prev); n.has(tel) ? n.delete(tel) : n.add(tel); return n;
    });
    const selectAllMobile = () => setSelectedPhones(new Set(
        patients.filter(p => p.tipoTelefono === 'CELULAR' && p.telefono).map(p => p.telefono)
    ));
    const clearAll = () => setSelectedPhones(new Set());

    const handleCreate = async (e) => {
        e.preventDefault();
        if (selectedPhones.size === 0) { alert('Selecciona al menos un destinatario.'); return; }
        setCreating(true);
        try {
            const res = await fetch(`${API_BASE}/api/sms-campaigns`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, messageBody: newMessage, phones: Array.from(selectedPhones) })
            });
            const data = await res.json();
            if (res.ok) {
                setShowModal(false); setNewName(''); setNewMessage('');
                setSelectedPhones(new Set()); setSearchQ(''); setFilterPeriod('today');
                fetchCampaigns();
            } else alert(data.error || 'Error al crear campana SMS');
        } catch (_) { alert('Error de conexion'); } finally { setCreating(false); }
    };

    const callAction = async (id, action, confirmMsg) => {
        if (confirmMsg && !confirm(confirmMsg)) return;
        setActionLoading(p => ({ ...p, [id]: true }));
        try {
            const res = await fetch(`${API_BASE}/api/sms-campaigns/${id}/${action}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) { alert(data.message); fetchCampaigns(); }
            else alert(data.error || `Error "${action}"`);
        } catch (_) { alert('Error de conexion'); } finally { setActionLoading(p => ({ ...p, [id]: false })); }
    };

    const handleTest = async (e) => {
        e.preventDefault();
        const phones = testNumbers.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
        if (!phones.length || !testMessage.trim()) return;
        setTestLoading(true); setTestResults(null);
        try {
            const res = await fetch(`${API_BASE}/api/sms-campaigns/test`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones, message: testMessage.trim() })
            });
            const data = await res.json();
            setTestResults(res.ok ? data : { error: data.error || 'Error desconocido' });
        } catch (_) { setTestResults({ error: 'Error de conexion' }); } finally { setTestLoading(false); }
    };

    const charCount = newMessage.length;
    const smsSegments = Math.ceil(charCount / 160) || 1;
    const mobilePatientsCount = patients.filter(p => p.tipoTelefono === 'CELULAR' && p.telefono).length;
    const periodOptions = [
        { key: 'today', label: 'Hoy', Icon: Clock },
        { key: 'week',  label: 'Esta semana', Icon: CalendarDays },
        { key: 'all',   label: 'Todos en BD', Icon: Users },
    ];

    return (
        <>
            {/* Banner */}
            <div className="mb-5 p-4 rounded-xl border flex items-start gap-3"
                style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.25)' }}>
                <Smartphone size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="text-blue-300 font-semibold">Campanas SMS via Onurix</p>
                    <p className="text-gray-400 text-xs mt-0.5">Envio directo al celular del paciente. No requiere WhatsApp.</p>
                </div>
            </div>

            {/* Panel de prueba */}
            <div className="mb-5 rounded-2xl border overflow-hidden"
                style={{ borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.03)' }}>
                <button type="button" onClick={() => { setTestOpen(o => !o); setTestResults(null); }}
                    className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold hover:bg-yellow-900/10 transition-colors"
                    style={{ color: '#fbbf24' }}>
                    <span className="flex items-center gap-2"><Send size={15} /> Prueba de envio SMS</span>
                    <ChevronDown size={16} className={`transition-transform duration-200 ${testOpen ? 'rotate-180' : ''}`} />
                </button>
                {testOpen && (
                    <div className="px-5 pb-5 pt-2 border-t" style={{ borderColor: 'rgba(234,179,8,0.2)' }}>
                        <p className="text-xs text-gray-500 mb-4">Envia un SMS real de prueba. No crea ninguna campana ni registro.</p>
                        <form onSubmit={handleTest} className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Numeros (coma, punto y coma o salto de linea)</label>
                                <textarea rows={2} value={testNumbers} onChange={e => setTestNumbers(e.target.value)}
                                    placeholder="3001234567, 3009876543"
                                    className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none placeholder-gray-600" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Mensaje de prueba</label>
                                <textarea rows={3} value={testMessage} onChange={e => setTestMessage(e.target.value)}
                                    placeholder="Hola, este es un SMS de prueba."
                                    className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none resize-none placeholder-gray-600" />
                                <p className="text-xs text-gray-600 mt-1 text-right">{testMessage.length} car.</p>
                            </div>
                            <button type="submit" disabled={testLoading || !testNumbers.trim() || !testMessage.trim()}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
                                style={{ background: 'rgba(234,179,8,0.15)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.4)' }}>
                                {testLoading ? <><RefreshCw size={14} className="animate-spin" /> Enviando...</> : <><Send size={14} /> Enviar prueba</>}
                            </button>
                        </form>
                        {testResults && (
                            <div className="mt-4">
                                {testResults.error
                                    ? <div className="p-3 rounded-xl text-sm text-red-400"
                                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>{testResults.error}</div>
                                    : <div className="space-y-1">
                                        {(testResults.results || []).map((r, i) => (
                                            <div key={i} className="flex justify-between px-3 py-1.5 rounded text-xs"
                                                style={{ background: '#0F0E13', border: '1px solid #2D283E' }}>
                                                <span className="font-mono text-gray-300">{r.phone}</span>
                                                <span className="font-bold"
                                                    style={{ color: r.status === 'SENT' ? '#34d399' : '#f87171' }}>{r.status}</span>
                                            </div>
                                        ))}
                                    </div>}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-end mb-4">
                <button onClick={() => setShowModal(true)}
                    className="text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all text-sm"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}>
                    <Plus size={16} /> Nueva Campana SMS
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total', value: campaigns.length, color: '#60a5fa' },
                    { label: 'Completadas', value: campaigns.filter(c => c.status === 'COMPLETED').length, color: '#34d399' },
                    { label: 'En progreso', value: campaigns.filter(c => c.status === 'SENDING').length, color: '#fbbf24' },
                    { label: 'SMS enviados', value: campaigns.reduce((a, c) => a + c.sentCount, 0).toLocaleString(), color: '#a78bfa' },
                ].map(s => (
                    <div key={s.label} className="bg-[#1E1B26] border border-[#2D283E] rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                        <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    </div>
                ))}
            </div>

            <CampaignTable campaigns={campaigns} loading={loading}
                onSend={(id, name) => callAction(id, 'send', `Enviar campana SMS "${name}"?`)}
                onPause={(id) => callAction(id, 'pause', null)}
                onResume={(id) => callAction(id, 'resume', 'Reanudar el envio SMS?')}
                actionLoading={actionLoading} />

            {/* Modal nueva campana */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#1A1721] border border-[#2D283E] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">

                        <div className="p-6 border-b border-[#2D283E] flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Smartphone size={20} className="text-blue-400" /> Nueva Campana SMS
                                </h2>
                                <p className="text-sm text-gray-400 mt-0.5">Redacta el mensaje y elige los destinatarios.</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="flex flex-col overflow-hidden flex-1">
                            <div className="p-6 overflow-y-auto flex-1 space-y-5">

                                {/* Nombre */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Nombre interno</label>
                                    <input type="text" required value={newName} onChange={e => setNewName(e.target.value)}
                                        placeholder="Ej: Recordatorio control HTA - Septiembre 2026"
                                        className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-600" />
                                </div>

                                {/* Mensaje */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-300">Mensaje SMS</label>
                                        <span className={`text-xs ${charCount > 160 ? 'text-orange-400' : 'text-gray-500'}`}>
                                            {charCount} car. · {smsSegments} SMS
                                        </span>
                                    </div>
                                    <textarea required rows={5} value={newMessage} onChange={e => setNewMessage(e.target.value)}
                                        placeholder="Estimado paciente, le recordamos su cita. Para info llame al 604-xxx-xxxx."
                                        className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none placeholder-gray-600" />
                                    <p className="mt-2 text-xs text-gray-500 bg-yellow-900/10 p-2.5 rounded-lg border border-yellow-900/20 flex items-start gap-2">
                                        <AlertCircle size={13} className="text-yellow-400/70 flex-shrink-0 mt-0.5" />
                                        SMS: sin emojis ni formato. Max. 160 caracteres por segmento.
                                    </p>
                                </div>

                                {/* Destinatarios */}
                                <div>
                                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2 mb-3">
                                        <Users size={15} className="text-blue-400" />
                                        Destinatarios
                                        {selectedPhones.size > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-bold text-blue-300"
                                                style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)' }}>
                                                {selectedPhones.size} sel.
                                            </span>
                                        )}
                                    </label>

                                    {/* Filtro periodo */}
                                    <div className="flex gap-2 mb-3 flex-wrap">
                                        {periodOptions.map(({ key, label, Icon }) => (
                                            <button key={key} type="button" onClick={() => setFilterPeriod(key)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                                style={filterPeriod === key
                                                    ? { background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.5)' }
                                                    : { background: 'rgba(30,27,38,0.8)', color: '#6b7280', border: '1px solid #2D283E' }}>
                                                <Icon size={12} /> {label}
                                            </button>
                                        ))}
                                        <span className="ml-auto text-xs text-gray-500 self-center">{mobilePatientsCount} celulares</span>
                                    </div>

                                    {/* Seleccionar todos — botón prominente */}
                                    <div className="rounded-xl p-3 mb-3 flex items-center justify-between gap-3"
                                        style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
                                        <div className="flex items-center gap-2">
                                            <CheckSquare size={14} className="text-emerald-400" />
                                            <span className="text-xs text-emerald-300 font-semibold">Seleccionar todos los celulares</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={selectAllMobile}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                                style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.4)' }}>
                                                <Smartphone size={11} /> Seleccionar ({mobilePatientsCount})
                                            </button>
                                            {selectedPhones.size > 0 && (
                                                <button type="button" onClick={clearAll}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                                                    <X size={11} /> Limpiar
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Buscador */}
                                    <div className="relative mb-2">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                                            placeholder="Buscar por nombre..."
                                            className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-600" />
                                        {patientsLoading && <RefreshCw size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" />}
                                    </div>

                                    {/* Lista */}
                                    <div className="bg-[#0F0E13] border border-[#2D283E] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                                        {patients.length === 0 && !patientsLoading && (
                                            <div className="p-8 text-center text-gray-600 text-sm">
                                                {filterPeriod === 'today' ? 'No hay citas agendadas hoy.'
                                                    : filterPeriod === 'week' ? 'No hay citas agendadas esta semana.'
                                                    : searchQ ? 'No se encontraron pacientes con ese nombre.'
                                                    : 'Escribe un nombre o cambia el filtro para ver pacientes de la BD.'}
                                            </div>
                                        )}
                                        {patients.map((p, idx) => {
                                            const isSelectable = p.tipoTelefono === 'CELULAR' && p.telefono;
                                            const isSelected = isSelectable && selectedPhones.has(p.telefono);
                                            return (
                                                <button key={p.id || idx} type="button" disabled={!isSelectable}
                                                    onClick={() => isSelectable && togglePatient(p.telefono)}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-[#1A1721] last:border-b-0 hover:bg-[#1E1B26] transition-colors"
                                                    style={{
                                                        background: isSelected ? 'rgba(59,130,246,0.12)' : 'transparent',
                                                        opacity: isSelectable ? 1 : 0.4,
                                                        cursor: isSelectable ? 'pointer' : 'not-allowed',
                                                    }}>
                                                    {isSelected
                                                        ? <CheckSquare size={16} className="text-blue-400 flex-shrink-0" />
                                                        : <Square size={16} className="flex-shrink-0 text-gray-600" />}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-white truncate">{p.nombre}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {p.telefono
                                                                ? <span className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} />{p.telefono}</span>
                                                                : <span className="text-xs text-gray-600 italic">Sin telefono en BD</span>}
                                                            <PhoneBadge tipo={p.tipoTelefono} />
                                                        </div>
                                                        {(p.fechaCita || p.medico) && (
                                                            <p className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1">
                                                                <Calendar size={9} />
                                                                {p.fechaCita}{p.horaCita && ` ${p.horaCita}`}{p.medico && ` - ${p.medico}`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-gray-600 mt-2">
                                        Solo celulares (10 digitos que empiezan por 3). Los fijos aparecen desactivados.
                                    </p>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-5 border-t border-[#2D283E] flex items-center justify-between gap-3 flex-shrink-0">
                                <p className="text-sm text-gray-400">
                                    {selectedPhones.size > 0
                                        ? <><span className="text-blue-400 font-bold">{selectedPhones.size}</span> destinatarios</>
                                        : 'Selecciona al menos uno'}
                                </p>
                                <div className="flex gap-3">
                                    <button type="button" onClick={() => setShowModal(false)}
                                        className="px-5 py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={creating || selectedPhones.size === 0}
                                        className="text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' }}>
                                        {creating ? 'Guardando...' : 'Guardar Borrador SMS'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

export default function CampaignsPage() {
    const router = useRouter();
    return (
        <div className="min-h-screen p-8 text-[#F5F5F7] font-sans" style={{ background: 'var(--chat-bg)' }}>
            <div className="max-w-5xl mx-auto">
                <div className="mb-8 border-b border-[#2D283E] pb-6">
                    <button onClick={() => router.push('/')}
                        className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors text-sm">
                        <ArrowLeft size={15} /> Volver al Inicio
                    </button>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-900/50 border border-blue-700/40 flex items-center justify-center">
                            <Smartphone className="text-blue-400" size={20} />
                        </div>
                        Campanas SMS Onurix
                    </h1>
                    <p className="text-gray-400 mt-2 text-sm max-w-2xl">
                        Envio masivo de SMS a pacientes con cita medica. Filtra por citas de hoy, la semana, o toda la base de datos.
                    </p>
                </div>
                <SmsCampaignsTab />
            </div>
        </div>
    );
}
