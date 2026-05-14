"use client";

import { useState, useCallback } from 'react';
import {
    Search, Filter, Bell, Calendar, CheckCircle2,
    Clock, User, Phone, Building2, Hash, Stethoscope,
    FileText, ChevronRight, AlertCircle, Activity,
    HeartPulse, Loader2
} from 'lucide-react';

// ─── Config ──────────────────────────────────────────────────────────────────
const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const API_BASE = `http://${SERVER_HOST}:3001`;

// ─── Datos de ejemplo (se reemplazarán por fetch real) ───────────────────────
const MOCK_PATIENT = null;
const MOCK_PROGRAMADOS = [];
const MOCK_PENDIENTES = [];
const MOCK_REALIZADOS = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(str) {
    if (!str) return '—';
    try {
        return new Date(str).toLocaleDateString('es-CO', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    } catch { return str; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count }) {
    return (
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgba(130,99,177,0.2)' }}>
                    <Icon size={13} style={{ color: '#A1E3D8' }} />
                </div>
                <span className="text-[11px] font-bold tracking-widest uppercase"
                    style={{ color: 'rgba(161,227,216,0.75)' }}>
                    {title}
                </span>
            </div>
            {count !== undefined && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                        background: 'rgba(130,99,177,0.18)',
                        color: '#C4AFED',
                        border: '1px solid rgba(130,99,177,0.35)'
                    }}>
                    {count}
                </span>
            )}
        </div>
    );
}

function EmptyState({ message }) {
    return (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
            <FileText size={28} style={{ color: 'rgba(245,245,247,0.1)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{message}</p>
        </div>
    );
}

function ExamenProgramadoRow({ examen, onRemind, sendingId }) {
    const isSending = sendingId === examen.id;
    return (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl transition-all group"
            style={{
                background: 'rgba(45,40,62,0.4)',
                border: '1px solid rgba(45,40,62,0.8)',
                marginBottom: '8px',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(45,40,62,0.75)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(45,40,62,0.4)'}
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(130,99,177,0.2)', color: '#C4AFED' }}>
                        {examen.codigo}
                    </span>
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {examen.tipoExamen}
                    </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Calendar size={10} style={{ color: '#A1E3D8', opacity: 0.6 }} />
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(examen.fecha)}
                        </span>
                    </div>
                    {examen.doctor && (
                        <div className="flex items-center gap-1">
                            <Stethoscope size={10} style={{ color: '#A1E3D8', opacity: 0.6 }} />
                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {examen.doctor}
                            </span>
                        </div>
                    )}
                </div>
            </div>
            <button
                onClick={() => onRemind(examen.id)}
                disabled={isSending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ml-3 flex-shrink-0"
                style={{
                    background: isSending ? 'rgba(130,99,177,0.15)' : 'rgba(130,99,177,0.22)',
                    color: '#C4AFED',
                    border: '1px solid rgba(130,99,177,0.4)',
                }}
            >
                {isSending
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Bell size={11} />}
                Recordar
            </button>
        </div>
    );
}

function ExamenPendienteRow({ examen, onAgendar, agendandoId }) {
    const isAgendando = agendandoId === examen.id;
    return (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl transition-all"
            style={{
                background: 'rgba(177,64,64,0.08)',
                border: '1px solid rgba(177,64,64,0.2)',
                marginBottom: '8px',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.14)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(177,64,64,0.08)'}
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(177,64,64,0.2)', color: '#EDAFAF' }}>
                        {examen.codigo}
                    </span>
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {examen.tipoExamen}
                    </span>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                    <AlertCircle size={10} style={{ color: '#EDAFAF', opacity: 0.7 }} />
                    <span className="text-[11px]" style={{ color: 'rgba(237,175,175,0.6)' }}>Sin fecha asignada</span>
                </div>
            </div>
            <button
                onClick={() => onAgendar(examen.id)}
                disabled={isAgendando}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ml-3 flex-shrink-0"
                style={{
                    background: isAgendando ? 'rgba(177,64,64,0.15)' : 'rgba(177,64,64,0.25)',
                    color: '#EDAFAF',
                    border: '1px solid rgba(177,64,64,0.4)',
                }}
            >
                {isAgendando
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Calendar size={11} />}
                Agendar
            </button>
        </div>
    );
}

function ExamenRealizadoRow({ examen }) {
    return (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl transition-all"
            style={{
                background: 'rgba(161,227,216,0.05)',
                border: '1px solid rgba(161,227,216,0.12)',
                marginBottom: '8px',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(161,227,216,0.09)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(161,227,216,0.05)'}
        >
            <CheckCircle2 size={14} style={{ color: '#A1E3D8', opacity: 0.7, flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(161,227,216,0.12)', color: '#A1E3D8' }}>
                        {examen.codigo}
                    </span>
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {examen.tipoExamen}
                    </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Calendar size={10} style={{ color: '#A1E3D8', opacity: 0.5 }} />
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(examen.fecha)}
                        </span>
                    </div>
                    {examen.doctor && (
                        <div className="flex items-center gap-1">
                            <Stethoscope size={10} style={{ color: '#A1E3D8', opacity: 0.5 }} />
                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {examen.doctor}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CardiovascularPage() {
    const [searchId, setSearchId] = useState('');
    const [filterAll, setFilterAll] = useState(false);
    const [loading, setLoading] = useState(false);
    const [patient, setPatient] = useState(MOCK_PATIENT);
    const [programados, setProgramados] = useState(MOCK_PROGRAMADOS);
    const [pendientes, setPendientes] = useState(MOCK_PENDIENTES);
    const [realizados, setRealizados] = useState(MOCK_REALIZADOS);
    const [sendingId, setSendingId] = useState(null);
    const [agendandoId, setAgendandoId] = useState(null);
    const [toast, setToast] = useState(null);

    const showToast = (text, type = 'success') => {
        setToast({ text, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSearch = useCallback(async () => {
        if (!searchId.trim()) return;
        setLoading(true);
        setPatient(null);
        setProgramados([]);
        setPendientes([]);
        setRealizados([]);
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/patient/${searchId.trim()}`);
            if (!res.ok) throw new Error('Paciente no encontrado');
            const data = await res.json();
            setPatient(data.patient);
            setProgramados(data.programados || []);
            setPendientes(data.pendientes || []);
            setRealizados(data.realizados || []);
        } catch (err) {
            showToast('❌ ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [searchId]);

    const handleRemind = async (id) => {
        setSendingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/remind/${id}`, { method: 'POST' });
            if (res.ok) showToast('✅ Recordatorio enviado');
            else showToast('❌ Error al enviar recordatorio', 'error');
        } catch {
            showToast('❌ Error de conexión', 'error');
        } finally {
            setSendingId(null);
        }
    };

    const handleAgendar = async (id) => {
        setAgendandoId(id);
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/schedule/${id}`, { method: 'POST' });
            if (res.ok) showToast('✅ Cita agendada correctamente');
            else showToast('❌ Error al agendar', 'error');
        } catch {
            showToast('❌ Error de conexión', 'error');
        } finally {
            setAgendandoId(null);
        }
    };

    const cardStyle = {
        background: 'rgba(26,23,33,0.85)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        backdropFilter: 'blur(12px)',
    };

    return (
        <div className="min-h-screen flex flex-col" style={{ background: 'var(--chat-bg)' }}>

            {/* ── Subtle grid bg ── */}
            <div className="fixed inset-0 chat-bg pointer-events-none" />

            {/* ── Glow blobs ── */}
            <div className="fixed top-[-160px] left-[-160px] w-[600px] h-[600px] rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(177,64,64,0.07) 0%, transparent 70%)', filter: 'blur(50px)' }} />
            <div className="fixed bottom-[-160px] right-[-160px] w-[600px] h-[600px] rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(130,99,177,0.06) 0%, transparent 70%)', filter: 'blur(50px)' }} />

            {/* ── Top bar ── */}
            <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b"
                style={{ background: 'rgba(26,23,33,0.9)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
                        style={{ background: 'linear-gradient(135deg, #B14040 0%, #8B1A1A 100%)' }}>
                        <HeartPulse size={18} color="#F9A8A8" />
                    </div>
                    <div>
                        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                            style={{ color: 'rgba(249,168,168,0.65)' }}>Módulo</p>
                        <h1 className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                            Agendamiento Cardiovascular
                        </h1>
                    </div>
                </div>

                {/* Toast */}
                {toast && (
                    <span className={`text-xs font-medium px-3 py-1.5 rounded-lg ${toast.type === 'success'
                        ? 'text-[#A1E3D8] bg-[#A1E3D8]/10 border border-[#A1E3D8]/20'
                        : 'text-red-400 bg-red-400/10 border border-red-400/20'}`}>
                        {toast.text}
                    </span>
                )}

                <div className="flex items-center gap-2">
                    <Activity size={14} style={{ color: 'rgba(245,245,247,0.2)' }} />
                    <span className="text-[11px]" style={{ color: 'rgba(245,245,247,0.2)' }}>
                        Auro Bot · Cardiovascular
                    </span>
                </div>
            </header>

            {/* ── Main content ── */}
            <main className="relative z-10 flex-1 p-6 overflow-auto">

                {/* ── Search bar row ── */}
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                    {/* Search input */}
                    <div className="flex items-center gap-2 flex-1 min-w-[260px] px-4 py-2.5 rounded-xl"
                        style={{
                            background: 'rgba(15,14,19,0.8)',
                            border: '1px solid var(--border)',
                            maxWidth: '420px'
                        }}>
                        <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <input
                            id="search-patient-id"
                            type="text"
                            placeholder="Búsqueda del paciente por ID / Cédula..."
                            value={searchId}
                            onChange={e => setSearchId(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            className="flex-1 bg-transparent outline-none text-sm"
                            style={{ color: 'var(--text-primary)' }}
                        />
                    </div>

                    {/* Buscar button */}
                    <button
                        id="btn-buscar-paciente"
                        onClick={handleSearch}
                        disabled={loading || !searchId.trim()}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow"
                        style={{
                            background: loading ? 'rgba(177,64,64,0.5)' : '#B14040',
                            color: '#F5F5F7',
                            opacity: !searchId.trim() ? 0.5 : 1,
                        }}
                    >
                        {loading
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Search size={14} />}
                        Buscar
                    </button>

                    {/* Filtrar todos toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                        <div className="relative">
                            <input
                                id="toggle-filter-all"
                                type="checkbox"
                                checked={filterAll}
                                onChange={e => setFilterAll(e.target.checked)}
                                className="sr-only"
                            />
                            <div className="w-8 h-8 rounded-lg border flex items-center justify-center transition-all"
                                style={{
                                    background: filterAll ? 'rgba(177,64,64,0.25)' : 'rgba(45,40,62,0.5)',
                                    borderColor: filterAll ? 'rgba(177,64,64,0.6)' : 'var(--border)',
                                }}>
                                <Filter size={13} style={{ color: filterAll ? '#F9A8A8' : 'var(--text-muted)' }} />
                            </div>
                        </div>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                            Filtrar todos
                        </span>
                    </label>
                </div>

                {/* ── Two-column grid ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                    {/* ══════════ LEFT COLUMN ══════════ */}
                    <div className="flex flex-col gap-6">

                        {/* ── Exámenes Programados ── */}
                        <div className="p-5 flex flex-col" style={{ ...cardStyle, minHeight: '420px' }}>
                            <SectionHeader
                                icon={Clock}
                                title="Exámenes Programados"
                                count={programados.length}
                            />
                            <div className="flex-1 overflow-y-auto pr-1"
                                style={{ maxHeight: '360px' }}>
                                {programados.length === 0
                                    ? <EmptyState message={patient ? 'No hay exámenes programados' : 'Busca un paciente para ver sus exámenes'} />
                                    : programados.map(ex => (
                                        <ExamenProgramadoRow
                                            key={ex.id}
                                            examen={ex}
                                            onRemind={handleRemind}
                                            sendingId={sendingId}
                                        />
                                    ))
                                }
                            </div>
                        </div>
                    </div>

                    {/* ══════════ RIGHT COLUMN ══════════ */}
                    <div className="flex flex-col gap-5">

                        {/* ── Datos del Paciente ── */}
                        <div className="p-5" style={cardStyle}>
                            <SectionHeader icon={User} title="Datos del Paciente" />
                            {patient ? (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-1">
                                    <InfoField icon={User} label="Nombre" value={patient.nombre} full />
                                    <InfoField icon={Hash} label="ID / Cédula" value={patient.documento} />
                                    <InfoField icon={Clock} label="Edad" value={patient.edad ? `${patient.edad} años` : '—'} />
                                    <InfoField icon={Phone} label="Teléfono" value={patient.telefono} />
                                    <InfoField icon={Building2} label="Entidad" value={patient.entidad} full />
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 py-4 px-3 rounded-xl"
                                    style={{ background: 'rgba(45,40,62,0.4)', border: '1px solid rgba(45,40,62,0.7)' }}>
                                    <User size={28} style={{ color: 'rgba(245,245,247,0.1)', flexShrink: 0 }} />
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: 'rgba(245,245,247,0.3)' }}>
                                            NOMBRE COMPLETO · ID · AÑOS · TEL · ENTIDAD
                                        </p>
                                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(245,245,247,0.2)' }}>
                                            Busca un paciente para ver su información
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Exámenes Pendientes ── */}
                        <div className="p-5" style={cardStyle}>
                            <SectionHeader
                                icon={AlertCircle}
                                title="Exámenes Pendientes"
                                count={pendientes.length}
                            />
                            <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                                {pendientes.length === 0
                                    ? <EmptyState message={patient ? 'Sin exámenes pendientes' : 'Busca un paciente'} />
                                    : pendientes.map(ex => (
                                        <ExamenPendienteRow
                                            key={ex.id}
                                            examen={ex}
                                            onAgendar={handleAgendar}
                                            agendandoId={agendandoId}
                                        />
                                    ))
                                }
                            </div>
                        </div>

                        {/* ── Exámenes Realizados ── */}
                        <div className="p-5" style={cardStyle}>
                            <SectionHeader
                                icon={CheckCircle2}
                                title="Exámenes Realizados"
                                count={realizados.length}
                            />
                            <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                                {realizados.length === 0
                                    ? <EmptyState message={patient ? 'Sin exámenes realizados' : 'Busca un paciente'} />
                                    : realizados.map(ex => (
                                        <ExamenRealizadoRow key={ex.id} examen={ex} />
                                    ))
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─── InfoField helper ─────────────────────────────────────────────────────────
function InfoField({ icon: Icon, label, value, full }) {
    return (
        <div className={full ? 'col-span-2' : ''}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                style={{ color: 'rgba(161,227,216,0.5)' }}>
                {label}
            </p>
            <div className="flex items-center gap-1.5">
                <Icon size={11} style={{ color: '#A1E3D8', opacity: 0.6, flexShrink: 0 }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {value || '—'}
                </span>
            </div>
        </div>
    );
}
