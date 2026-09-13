"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Megaphone, Send, Clock, CheckCircle2, AlertCircle, Plus, RefreshCw,
    ArrowLeft, Pause, Play, MessageSquare, Smartphone, Search,
    Users, X, ChevronDown, CheckSquare, Square, Phone
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthProvider';

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const API_BASE = `${PROTOCOL}//${SERVER_HOST}:3001`;

// ─── Utilidades ───────────────────────────────────────────────────────────────

const statusConfig = {
    DRAFT:     { label: 'Borrador',   color: '#9ca3af', bg: 'rgba(75,85,99,0.2)',   border: 'rgba(75,85,99,0.4)',   icon: Clock },
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
                <span className="text-gray-400">{camp.sentCount.toLocaleString()} / {camp.totalCount ? camp.totalCount.toLocaleString() : '—'}</span>
                <span className="font-bold" style={{ color: isComplete ? '#34d399' : '#fbbf24' }}>{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#1A1721] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: isComplete ? '#34d399' : 'linear-gradient(90deg,#f59e0b,#fbbf24)' }} />
            </div>
        </div>
    );
}

// ─── Tab: WhatsApp Campaigns ──────────────────────────────────────────────────

function WaCampaignsTab() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [previewMessage, setPreviewMessage] = useState(false);
    const [newName, setNewName] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [creating, setCreating] = useState(false);
    const [actionLoading, setActionLoading] = useState({});

    const fetchCampaigns = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/campaigns`);
            setCampaigns(await res.json());
        } catch (_) { } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchCampaigns();
        const iv = setInterval(fetchCampaigns, 10000);
        return () => clearInterval(iv);
    }, [fetchCampaigns]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await fetch(`${API_BASE}/api/campaigns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, messageBody: newMessage })
            });
            if (res.ok) { setShowModal(false); setNewName(''); setNewMessage(''); fetchCampaigns(); }
            else alert('Error al crear campaña');
        } catch (_) { alert('Error de conexión'); }
        finally { setCreating(false); }
    };

    const callAction = async (id, action, confirmMsg) => {
        if (confirmMsg && !confirm(confirmMsg)) return;
        setActionLoading(p => ({ ...p, [id]: true }));
        try {
            const res = await fetch(`${API_BASE}/api/campaigns/${id}/${action}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) { alert(data.message); fetchCampaigns(); }
            else alert(data.error || `Error al ejecutar "${action}"`);
        } catch (_) { alert('Error de conexión'); }
        finally { setActionLoading(p => ({ ...p, [id]: false })); }
    };

    return (
        <>
            <div className="flex justify-end mb-4">
                <button onClick={() => setShowModal(true)}
                    className="bg-[#10b981] hover:bg-[#059669] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all text-sm">
                    <Plus size={16} /> Nueva Campaña WA
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total', value: campaigns.length, color: '#8263B1' },
                    { label: 'Completadas', value: campaigns.filter(c => c.status === 'COMPLETED').length, color: '#10b981' },
                    { label: 'En progreso', value: campaigns.filter(c => c.status === 'SENDING').length, color: '#f59e0b' },
                    { label: 'Msgs enviados', value: campaigns.reduce((a, c) => a + c.sentCount, 0).toLocaleString(), color: '#A1E3D8' },
                ].map(s => (
                    <div key={s.label} className="bg-[#1E1B26] border border-[#2D283E] rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                        <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Table */}
            <CampaignTable campaigns={campaigns} loading={loading}
                onSend={(id, name) => callAction(id, 'send',
                    `¿Enviar "${name}" a TODOS los pacientes con historial en el bot?\n\nPuede tardar varias horas.`)}
                onPause={(id) => callAction(id, 'pause', null)}
                onResume={(id) => callAction(id, 'resume',
                    '¿Reanudar el envío? Continuará desde donde se quedó.')}
                actionLoading={actionLoading}
                emptyMsg="No hay campañas de WhatsApp creadas." />

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-[#1A1721] border border-[#2D283E] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-[#2D283E] flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Redactar Campaña WA</h2>
                                <p className="text-sm text-gray-400 mt-0.5">Se guardará como borrador. Tú decides cuándo enviarla.</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white transition-colors"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreate} className="p-6">
                            <div className="mb-5">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Nombre interno</label>
                                <input type="text" required value={newName} onChange={e => setNewName(e.target.value)}
                                    placeholder="Ej: Jornada Mamografía Julio 2026"
                                    className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#10b981] transition-colors placeholder-gray-600" />
                            </div>
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-300">Mensaje de WhatsApp</label>
                                    <button type="button" onClick={() => setPreviewMessage(!previewMessage)} className="text-xs text-[#34d399] hover:underline">
                                        {previewMessage ? 'Editar' : 'Vista previa'}
                                    </button>
                                </div>
                                {!previewMessage ? (
                                    <textarea required rows={8} value={newMessage} onChange={e => setNewMessage(e.target.value)}
                                        placeholder={`¡Atención pacientes!\n\n📅 8 - 9 Julio\n📍 Parque Principal\n⏰ 8 am a 5 pm\n\n¡Cuida tu salud! 💚`}
                                        className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#10b981] transition-colors resize-none placeholder-gray-600" />
                                ) : (
                                    <div className="bg-[#0F0E13] border border-[#2D283E] rounded-xl p-4 min-h-[180px] text-sm text-white whitespace-pre-wrap">
                                        {newMessage || <span className="text-gray-600">El mensaje aparecerá aquí...</span>}
                                    </div>
                                )}
                                <p className="mt-2 text-xs text-gray-500 bg-blue-900/10 p-2.5 rounded-lg border border-blue-900/20 flex items-start gap-2">
                                    <AlertCircle size={13} className="text-blue-400/70 flex-shrink-0 mt-0.5" />
                                    Usa formato WhatsApp: *negrita*, _cursiva_. Los emojis (📅📍⏰) se muestran tal cual.
                                </p>
                            </div>
                            <div className="flex gap-3 justify-end mt-6">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors">Cancelar</button>
                                <button type="submit" disabled={creating}
                                    className="bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-colors">
                                    {creating ? 'Guardando...' : '💾 Guardar Borrador'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Tab: SMS Campaigns ───────────────────────────────────────────────────────

function SmsCampaignsTab() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [actionLoading, setActionLoading] = useState({});

    // Form state
    const [newName, setNewName] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [creating, setCreating] = useState(false);

    // Recipient selection
    const [patients, setPatients] = useState([]);
    const [patientsLoading, setPatientsLoading] = useState(false);
    const [searchQ, setSearchQ] = useState('');
    const [selectedPhones, setSelectedPhones] = useState(new Set());
    const searchTimer = useRef(null);

    // ── Panel de prueba ──
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

    // Buscar pacientes con debounce
    const searchPatients = useCallback(async (q) => {
        setPatientsLoading(true);
        try {
            const url = `${API_BASE}/api/sms-campaigns/patients?q=${encodeURIComponent(q)}&limit=100`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setPatients(data.patients || []);
            }
        } catch (_) { }
        finally { setPatientsLoading(false); }
    }, []);

    useEffect(() => {
        if (!showModal) return;
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => searchPatients(searchQ), 400);
    }, [searchQ, showModal, searchPatients]);

    // Load initial patients when modal opens
    useEffect(() => {
        if (showModal) searchPatients('');
    }, [showModal, searchPatients]);

    const togglePatient = (celular) => {
        setSelectedPhones(prev => {
            const next = new Set(prev);
            next.has(celular) ? next.delete(celular) : next.add(celular);
            return next;
        });
    };

    const selectAll = () => setSelectedPhones(new Set(patients.map(p => p.celular)));
    const clearAll = () => setSelectedPhones(new Set());

    const handleCreate = async (e) => {
        e.preventDefault();
        if (selectedPhones.size === 0) { alert('Selecciona al menos un destinatario.'); return; }
        setCreating(true);
        try {
            const res = await fetch(`${API_BASE}/api/sms-campaigns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, messageBody: newMessage, phones: Array.from(selectedPhones) })
            });
            const data = await res.json();
            if (res.ok) {
                setShowModal(false); setNewName(''); setNewMessage(''); setSelectedPhones(new Set()); setSearchQ('');
                fetchCampaigns();
            } else {
                alert(data.error || 'Error al crear campaña SMS');
            }
        } catch (_) { alert('Error de conexión'); }
        finally { setCreating(false); }
    };

    const callAction = async (id, action, confirmMsg) => {
        if (confirmMsg && !confirm(confirmMsg)) return;
        setActionLoading(p => ({ ...p, [id]: true }));
        try {
            const res = await fetch(`${API_BASE}/api/sms-campaigns/${id}/${action}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) { alert(data.message); fetchCampaigns(); }
            else alert(data.error || `Error al ejecutar "${action}"`);
        } catch (_) { alert('Error de conexión'); }
        finally { setActionLoading(p => ({ ...p, [id]: false })); }
    };

    const charCount = newMessage.length;
    const smsSegments = Math.ceil(charCount / 160) || 1;

    const handleTest = async (e) => {
        e.preventDefault();
        const phones = testNumbers.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
        if (phones.length === 0 || !testMessage.trim()) return;
        setTestLoading(true);
        setTestResults(null);
        try {
            const res = await fetch(`${API_BASE}/api/sms-campaigns/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones, message: testMessage.trim() })
            });
            const data = await res.json();
            setTestResults(res.ok ? data : { error: data.error || 'Error desconocido' });
        } catch (_) {
            setTestResults({ error: 'Error de conexi\u00f3n con el servidor' });
        } finally {
            setTestLoading(false);
        }
    };

    return (
        <>
            {/* Header banner SMS */}
            <div className="mb-5 p-4 rounded-xl border flex items-start gap-3"
                style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.25)' }}>
                <Smartphone size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="text-blue-300 font-semibold">Campañas SMS vía Onurix</p>
                    <p className="text-gray-400 text-xs mt-0.5">Los SMS se envían directamente al número de celular del paciente. No requieren que el paciente tenga WhatsApp.</p>
                </div>
            </div>

            {/* ── Panel de prueba ────────────────────────────────── */}
            <div className="mb-5 rounded-2xl border overflow-hidden"
                style={{ borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.03)' }}>
                <button
                    type="button"
                    onClick={() => { setTestOpen(o => !o); setTestResults(null); }}
                    className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold transition-colors hover:bg-yellow-900/10"
                    style={{ color: '#fbbf24' }}>
                    <span className="flex items-center gap-2">
                        <Send size={15} /> Prueba de env\u00edo SMS
                    </span>
                    <ChevronDown size={16} className={`transition-transform duration-200 ${testOpen ? 'rotate-180' : ''}`} />
                </button>

                {testOpen && (
                    <div className="px-5 pb-5 pt-2 border-t" style={{ borderColor: 'rgba(234,179,8,0.2)' }}>
                        <p className="text-xs text-gray-500 mb-4">
                            Env\u00eda un SMS real a los n\u00fameros que escribas. No crea ninguna campa\u00f1a ni registro.
                        </p>
                        <form onSubmit={handleTest} className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                    N\u00fameros de prueba <span className="text-gray-600">(separa por coma, enter o punto y coma &mdash; m\u00e1x. 10)</span>
                                </label>
                                <textarea
                                    rows={2}
                                    value={testNumbers}
                                    onChange={e => setTestNumbers(e.target.value)}
                                    placeholder="3001234567, 3009876543"
                                    className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors resize-none placeholder-gray-600"
                                    onFocus={e => e.target.style.borderColor = '#fbbf24'}
                                    onBlur={e => e.target.style.borderColor = ''}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5">Mensaje de prueba</label>
                                <textarea
                                    rows={3}
                                    value={testMessage}
                                    onChange={e => setTestMessage(e.target.value)}
                                    placeholder="Hola, este es un SMS de prueba del sistema Aurora."
                                    className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors resize-none placeholder-gray-600"
                                    onFocus={e => e.target.style.borderColor = '#fbbf24'}
                                    onBlur={e => e.target.style.borderColor = ''}
                                />
                                <p className="text-xs text-gray-600 mt-1 text-right">{testMessage.length} car.</p>
                            </div>
                            <div className="flex items-center justify-between">
                                <button
                                    type="submit"
                                    disabled={testLoading || !testNumbers.trim() || !testMessage.trim()}
                                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{ background: 'rgba(234,179,8,0.15)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.4)' }}>
                                    {testLoading
                                        ? <><RefreshCw size={14} className="animate-spin" /> Enviando...</>
                                        : <><Send size={14} /> Enviar prueba</>}
                                </button>
                                {testResults && !testResults.error && (
                                    <p className="text-xs text-gray-400">
                                        <span className="text-green-400 font-bold">{testResults.sentCount}</span> / {testResults.total} enviados
                                    </p>
                                )}
                            </div>
                        </form>

                        {testResults && (
                            <div className="mt-4">
                                {testResults.error ? (
                                    <div className="p-3 rounded-xl text-sm text-red-400"
                                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                                        \u274c {testResults.error}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {testResults.results.map((r, i) => {
                                            const sMap = {
                                                SENT:    { color: '#34d399', icon: '\u2705', bg: 'rgba(52,211,153,0.08)',  bd: 'rgba(52,211,153,0.25)' },
                                                FAILED:  { color: '#f87171', icon: '\u274c', bg: 'rgba(248,113,113,0.08)', bd: 'rgba(248,113,113,0.25)' },
                                                SKIPPED: { color: '#fbbf24', icon: '\u23ed\ufe0f', bg: 'rgba(251,191,36,0.08)', bd: 'rgba(251,191,36,0.25)' },
                                                INVALID: { color: '#9ca3af', icon: '\u26a0\ufe0f', bg: 'rgba(75,85,99,0.08)', bd: 'rgba(75,85,99,0.25)' },
                                            };
                                            const s = sMap[r.status] || sMap.INVALID;
                                            return (
                                                <div key={i}
                                                    className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                                                    style={{ background: s.bg, border: `1px solid ${s.bd}` }}>
                                                    <span className="font-mono text-gray-300">{s.icon} {r.phone}</span>
                                                    <div className="flex items-center gap-3">
                                                        {r.messageId && <span className="text-gray-500">ID: {r.messageId}</span>}
                                                        {r.error && <span className="text-gray-500 truncate max-w-[180px]">{r.error}</span>}
                                                        <span className="font-bold" style={{ color: s.color }}>{r.status}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-end mb-4">
                <button onClick={() => setShowModal(true)}
                    className="text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all text-sm"
                    style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}>
                    <Plus size={16} /> Nueva Campa\u00f1a SMS
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

            {/* Table */}
            <CampaignTable campaigns={campaigns} loading={loading}
                onSend={(id, name) => callAction(id, 'send',
                    `¿Enviar la campaña SMS "${name}" a ${campaigns.find(c=>c.id===id)?.totalCount || 'N'} destinatarios?\n\nSe enviará con un pequeño delay entre mensajes.`)}
                onPause={(id) => callAction(id, 'pause', null)}
                onResume={(id) => callAction(id, 'resume', '¿Reanudar el envío SMS? Continuará desde donde se quedó.')}
                actionLoading={actionLoading}
                emptyMsg="No hay campañas SMS creadas."
                accentColor="#3b82f6" />

            {/* Modal nueva campaña SMS */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#1A1721] border border-[#2D283E] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

                        {/* Header */}
                        <div className="p-6 border-b border-[#2D283E] flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Smartphone size={20} className="text-blue-400" /> Nueva Campaña SMS
                                </h2>
                                <p className="text-sm text-gray-400 mt-0.5">Redacta el mensaje y selecciona los destinatarios desde la BD.</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white transition-colors"><X size={20} /></button>
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
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className={charCount > 160 ? 'text-orange-400' : 'text-gray-500'}>
                                                {charCount} car. · {smsSegments} SMS
                                            </span>
                                        </div>
                                    </div>
                                    <textarea required rows={5} value={newMessage} onChange={e => setNewMessage(e.target.value)}
                                        placeholder="Estimado paciente, le recordamos su cita de control el próximo lunes 15 de septiembre. Para más información llame al 604-xxx-xxxx. IPS Nombre."
                                        className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none placeholder-gray-600" />
                                    <p className="mt-2 text-xs text-gray-500 bg-yellow-900/10 p-2.5 rounded-lg border border-yellow-900/20 flex items-start gap-2">
                                        <AlertCircle size={13} className="text-yellow-400/70 flex-shrink-0 mt-0.5" />
                                        Los SMS no soportan emojis ni formato especial. Máx. 160 caracteres por segmento. Mensajes más largos se cobran como 2 SMS.
                                    </p>
                                </div>

                                {/* Selector de destinatarios */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                            <Users size={15} className="text-blue-400" />
                                            Destinatarios
                                            {selectedPhones.size > 0 && (
                                                <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold text-blue-300"
                                                    style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)' }}>
                                                    {selectedPhones.size} seleccionados
                                                </span>
                                            )}
                                        </label>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={selectAll}
                                                className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                                                Todos ({patients.length})
                                            </button>
                                            {selectedPhones.size > 0 && (
                                                <button type="button" onClick={clearAll}
                                                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                                                    Limpiar
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Buscador */}
                                    <div className="relative mb-2">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                                            placeholder="Buscar por nombre o código de paciente..."
                                            className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-600" />
                                        {patientsLoading && <RefreshCw size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" />}
                                    </div>

                                    {/* Lista de pacientes */}
                                    <div className="bg-[#0F0E13] border border-[#2D283E] rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                                        {patients.length === 0 && !patientsLoading && (
                                            <div className="p-8 text-center text-gray-600 text-sm">
                                                {searchQ ? 'No se encontraron pacientes con esa búsqueda.' : 'Cargando pacientes con celular registrado...'}
                                            </div>
                                        )}
                                        {patients.map(p => {
                                            const isSelected = selectedPhones.has(p.celular);
                                            return (
                                                <button key={p.cod} type="button"
                                                    onClick={() => togglePatient(p.celular)}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-[#1A1721] last:border-b-0 hover:bg-[#1E1B26]"
                                                    style={isSelected ? { background: 'rgba(59,130,246,0.12)' } : {}}>
                                                    {isSelected
                                                        ? <CheckSquare size={16} className="text-blue-400 flex-shrink-0" />
                                                        : <Square size={16} className="text-gray-600 flex-shrink-0" />}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-white truncate">{p.nombre}</p>
                                                        <p className="text-xs text-gray-500 flex items-center gap-1">
                                                            <Phone size={10} /> {p.celular}
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {patients.length >= 100 && (
                                        <p className="text-xs text-gray-600 mt-1.5 text-center">
                                            Mostrando hasta 100 resultados. Usa el buscador para filtrar.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Footer del modal */}
                            <div className="p-5 border-t border-[#2D283E] flex items-center justify-between gap-3 flex-shrink-0">
                                <p className="text-sm text-gray-400">
                                    {selectedPhones.size > 0
                                        ? <><span className="text-blue-400 font-bold">{selectedPhones.size}</span> destinatarios seleccionados</>
                                        : 'Selecciona al menos un destinatario'}
                                </p>
                                <div className="flex gap-3">
                                    <button type="button" onClick={() => setShowModal(false)}
                                        className="px-5 py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={creating || selectedPhones.size === 0}
                                        className="text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' }}>
                                        {creating ? 'Guardando...' : '💾 Guardar Borrador SMS'}
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

// ─── Tabla de campañas compartida ─────────────────────────────────────────────

function CampaignTable({ campaigns, loading, onSend, onPause, onResume, actionLoading, emptyMsg, accentColor = '#10b981' }) {
    if (loading) {
        return (
            <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl p-12 text-center text-gray-500 flex items-center justify-center gap-3">
                <RefreshCw size={18} className="animate-spin" style={{ color: accentColor }} /> Cargando campañas...
            </div>
        );
    }
    if (campaigns.length === 0) {
        return (
            <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl p-16 text-center">
                <div className="w-20 h-20 bg-[#2D283E] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Megaphone className="text-gray-600" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Sin campañas</h3>
                <p className="text-gray-400 max-w-sm mx-auto text-sm">{emptyMsg}</p>
            </div>
        );
    }
    return (
        <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl overflow-hidden shadow-2xl">
            <table className="w-full text-left">
                <thead className="bg-[#1A1721] border-b border-[#2D283E]">
                    <tr>
                        {['Campaña', 'Estado', 'Progreso', 'Fecha', 'Acciones'].map((h, i) => (
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
                                            className="text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                            style={{ background: accentColor === '#3b82f6' ? '#2563eb' : '#1d4ed8' }}>
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
                                            className="text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                            style={{ background: accentColor === '#3b82f6' ? 'rgba(37,99,235,0.8)' : 'rgba(16,185,129,0.8)' }}>
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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CampaignsPage() {
    const router = useRouter();
    const { username } = useAuth();
    const isSpaceguard = username === 'spaceguard';
    const [activeTab, setActiveTab] = useState('wa');

    // Si el tab SMS está activo pero el usuario ya no es spaceguard, volver a WA
    useEffect(() => {
        if (!isSpaceguard && activeTab === 'sms') setActiveTab('wa');
    }, [isSpaceguard, activeTab]);

    return (
        <div className="min-h-screen p-8 text-[#F5F5F7] font-sans" style={{ background: 'var(--chat-bg)' }}>
            <div className="max-w-5xl mx-auto">

                {/* Header */}
                <div className="mb-8 border-b border-[#2D283E] pb-6">
                    <button onClick={() => router.push('/')}
                        className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors text-sm">
                        <ArrowLeft size={15} /> Volver al Inicio
                    </button>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-900/50 border border-emerald-700/40 flex items-center justify-center">
                            <Megaphone className="text-[#34d399]" size={20} />
                        </div>
                        Campañas de Difusión
                    </h1>
                    <p className="text-gray-400 mt-2 text-sm max-w-2xl">
                        Envío masivo de mensajes por WhatsApp o SMS vía Onurix.
                    </p>
                </div>

                {/* Tab bar */}
                <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'rgba(13,12,17,0.6)', border: '1px solid #2D283E' }}>
                    <button
                        onClick={() => setActiveTab('wa')}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
                        style={activeTab === 'wa'
                            ? { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }
                            : { color: '#9ca3af', border: '1px solid transparent' }}>
                        <MessageSquare size={16} /> WhatsApp
                    </button>
                    {isSpaceguard && (
                        <button
                            onClick={() => setActiveTab('sms')}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
                            style={activeTab === 'sms'
                                ? { background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }
                                : { color: '#9ca3af', border: '1px solid transparent' }}>
                            <Smartphone size={16} /> SMS Onurix
                        </button>
                    )}
                </div>

                {/* Tab content */}
                {activeTab === 'wa' && <WaCampaignsTab />}
                {activeTab === 'sms' && isSpaceguard && <SmsCampaignsTab />}

            </div>
        </div>
    );
}
