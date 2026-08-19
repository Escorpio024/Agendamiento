"use client";

import { useState, useCallback, useEffect } from 'react';
import {
    Search, Filter, Bell, Calendar, CheckCircle2,
    Clock, User, Phone, Building2, Hash, Stethoscope,
    FileText, ChevronRight, AlertCircle, Activity,
    HeartPulse, Loader2, ClipboardList, X, XCircle, AlertTriangle, RefreshCw, ShieldAlert, Download,
    Edit3, Save, Trash2, History, CalendarPlus, ChevronDown, Check, RotateCcw, CalendarCheck2,
    BarChart2, Users, TrendingUp, TrendingDown, ListFilter
} from 'lucide-react';

// ─── Config ──────────────────────────────────────────────────────────────────
const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const API_BASE = `${PROTOCOL}//${SERVER_HOST}:3001`;

// ─── Catálogo de procedimientos CVD ──────────────────────────────────────────
const CVD_PROCEDIMIENTOS = [
    { codigo: '903895', nombre: 'Creatinina en suero' },
    { codigo: '903876', nombre: 'Creatinina en orina' },
    { codigo: '903426', nombre: 'Hemoglobina Glicosilada HbA1c' },
    { codigo: '903817', nombre: 'LDL Colesterol' },
    { codigo: '903026', nombre: 'Microalbuminuria' },
    { codigo: '903815', nombre: 'Colesterol de Alta Densidad (HDL)' },
    { codigo: '903818', nombre: 'Colesterol Total' },
    { codigo: '903868', nombre: 'Triglicéridos' },
    { codigo: '907106', nombre: 'Uroanálisis con sedimento' },
    { codigo: '903841', nombre: 'Glucosa en suero' },
    { codigo: '902210', nombre: 'Hemograma IV' },
];

const MOCK_PATIENT = null;
const MOCK_PROGRAMADOS = [];
const MOCK_PENDIENTES = [];
const MOCK_REALIZADOS = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(str) {
    if (!str) return '—';
    try {
        let parsedStr = str;
        // Si es formato YYYYMMDD (8 dígitos, sin guiones)
        if (/^\d{8}$/.test(str)) {
            parsedStr = `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
        }
        
        const d = new Date(parsedStr.includes('T') ? parsedStr : parsedStr + 'T12:00:00');
        if (isNaN(d.getTime())) return str; // Retorna el string original si sigue siendo inválido
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return str; }
}

function formatDateTime(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

function diffMonths(fechaStr) {
    if (!fechaStr) return null;
    let parsedStr = fechaStr;
    if (/^\d{8}$/.test(fechaStr)) {
        parsedStr = `${fechaStr.slice(0, 4)}-${fechaStr.slice(4, 6)}-${fechaStr.slice(6, 8)}`;
    }
    const d = new Date(parsedStr.includes('T') ? parsedStr : parsedStr + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
        + (now.getDate() < d.getDate() ? -1 : 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count, action }) {
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
            <div className="flex items-center gap-2">
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
                {action}
            </div>
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

// ─── ExamenProgramadoRow — con botón Eliminar ─────────────────────────────────
function ExamenProgramadoRow({ examen, onRemind, onEliminar, sendingId, eliminandoId }) {
    const isSending = sendingId === examen.id;
    const isEliminando = eliminandoId === examen.id;
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
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded"
                        style={{ background: 'rgba(130,99,177,0.2)', color: '#C4AFED' }}>
                        {examen.codigo}
                    </span>
                    <span className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {examen.tipoExamen}
                    </span>
                </div>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <Calendar size={13} style={{ color: '#A1E3D8', opacity: 0.6 }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(examen.fecha)}
                        </span>
                    </div>
                    {examen.doctor && (
                        <div className="flex items-center gap-1.5">
                            <Stethoscope size={13} style={{ color: '#A1E3D8', opacity: 0.6 }} />
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {examen.doctor}
                            </span>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                {/* Recordar */}
                <button
                    onClick={() => onRemind(examen.id, examen.tipoExamen)}
                    disabled={isSending}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                        background: isSending ? 'rgba(130,99,177,0.15)' : 'rgba(130,99,177,0.22)',
                        color: '#C4AFED',
                        border: '1px solid rgba(130,99,177,0.4)',
                    }}
                >
                    {isSending ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                    Recordar
                </button>
                {/* Eliminar programación */}
                <button
                    onClick={() => onEliminar(examen)}
                    disabled={isEliminando}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                        background: isEliminando ? 'rgba(177,64,64,0.1)' : 'rgba(177,64,64,0.18)',
                        color: '#F9A8A8',
                        border: '1px solid rgba(177,64,64,0.35)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.32)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(177,64,64,0.18)'}
                    title="Eliminar programación"
                >
                    {isEliminando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    Eliminar
                </button>
            </div>
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
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded"
                        style={{ background: 'rgba(177,64,64,0.2)', color: '#EDAFAF' }}>
                        {examen.codigo}
                    </span>
                    <span className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {examen.tipoExamen}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                    <AlertCircle size={13} style={{ color: '#EDAFAF', opacity: 0.7 }} />
                    <span className="text-xs" style={{ color: 'rgba(237,175,175,0.6)' }}>Sin fecha asignada</span>
                </div>
            </div>
            <button
                onClick={() => onAgendar(examen.id)}
                disabled={isAgendando}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ml-3 flex-shrink-0"
                style={{
                    background: isAgendando ? 'rgba(177,64,64,0.15)' : 'rgba(177,64,64,0.25)',
                    color: '#EDAFAF',
                    border: '1px solid rgba(177,64,64,0.4)',
                }}
            >
                {isAgendando ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />}
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
            <CheckCircle2 size={18} style={{ color: '#A1E3D8', opacity: 0.7, flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded"
                        style={{ background: 'rgba(161,227,216,0.12)', color: '#A1E3D8' }}>
                        {examen.codigo}
                    </span>
                    <span className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {examen.tipoExamen}
                    </span>
                </div>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <Calendar size={13} style={{ color: '#A1E3D8', opacity: 0.5 }} />
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(examen.fecha)}
                        </span>
                    </div>
                    {examen.doctor && (
                        <div className="flex items-center gap-1.5">
                            <Stethoscope size={13} style={{ color: '#A1E3D8', opacity: 0.5 }} />
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {examen.doctor}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Modal: Eliminar Programación (confirm + motivo) ──────────────────────────
function EliminarModal({ examen, onConfirm, onCancel, loading }) {
    const [motivo, setMotivo] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,7,12,0.88)', backdropFilter: 'blur(8px)' }}>
            <div className="w-full max-w-md rounded-2xl shadow-2xl p-6"
                style={{ background: 'rgba(20,18,28,0.99)', border: '1px solid rgba(177,64,64,0.3)' }}>
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(177,64,64,0.2)' }}>
                        <Trash2 size={17} color="#F9A8A8" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-widest font-semibold"
                            style={{ color: 'rgba(249,168,168,0.6)' }}>Eliminar Programación</p>
                        <h3 className="text-sm font-bold" style={{ color: '#F5F5F7' }}>
                            {examen.tipoExamen}
                        </h3>
                    </div>
                </div>
                <p className="text-xs mb-4" style={{ color: 'rgba(245,245,247,0.5)' }}>
                    Esta programación quedará registrada en el <strong style={{ color: 'rgba(245,245,247,0.7)' }}>Historial</strong> y se ocultará del listado activo. No se modifica ningún dato en el HIS.
                </p>
                <div className="mb-5">
                    <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5"
                        style={{ color: 'rgba(161,227,216,0.55)' }}>
                        Motivo (opcional)
                    </label>
                    <input
                        type="text"
                        placeholder="Ej: Paciente canceló, reprogramar..."
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                        style={{
                            background: 'rgba(15,14,19,0.8)',
                            border: '1px solid rgba(177,64,64,0.3)',
                            color: 'var(--text-primary)',
                        }}
                    />
                </div>
                <div className="flex items-center gap-3 justify-end">
                    <button onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{ background: 'rgba(245,245,247,0.07)', color: 'rgba(245,245,247,0.5)', border: '1px solid rgba(245,245,247,0.1)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,245,247,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.07)'}>
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm(motivo)}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                        style={{ background: 'rgba(177,64,64,0.35)', color: '#F9A8A8', border: '1px solid rgba(177,64,64,0.5)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.55)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(177,64,64,0.35)'}>
                        {loading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Confirmar eliminación
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Modal: Historial de movimientos ─────────────────────────────────────────
function HistorialModal({ cedula, pacienteNombre, onClose }) {
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/cardiovascular/historial/${cedula}`)
            .then(r => r.json())
            .then(data => {
                // Guard: the API might return an error object instead of an array
                if (Array.isArray(data)) {
                    setRegistros(data);
                } else {
                    setError(data?.error || 'Respuesta inesperada del servidor');
                }
                setLoading(false);
            })
            .catch(e => { setError(e.message); setLoading(false); });
    }, [cedula]);

    const accionStyle = (accion) => accion === 'ELIMINADO'
        ? { bg: 'rgba(177,64,64,0.2)', color: '#F9A8A8', border: 'rgba(177,64,64,0.35)' }
        : { bg: 'rgba(130,99,177,0.2)', color: '#C4AFED', border: 'rgba(130,99,177,0.35)' };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,7,12,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl"
                style={{ background: 'rgba(20,18,28,0.98)', border: '1px solid rgba(130,99,177,0.3)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
                    style={{ borderColor: 'rgba(130,99,177,0.2)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: 'rgba(130,99,177,0.2)' }}>
                            <History size={17} color="#C4AFED" />
                        </div>
                        <div>
                            <p className="text-[10px] tracking-widest uppercase font-semibold"
                                style={{ color: 'rgba(196,175,237,0.6)' }}>Historial de Movimientos</p>
                            <h2 className="text-sm font-bold" style={{ color: '#F5F5F7' }}>
                                {pacienteNombre}
                            </h2>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                        style={{ background: 'rgba(245,245,247,0.06)', color: 'rgba(245,245,247,0.5)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.06)'}>
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading && (
                        <div className="flex items-center justify-center py-12 gap-3">
                            <Loader2 size={22} className="animate-spin" style={{ color: '#C4AFED' }} />
                            <span className="text-sm" style={{ color: 'rgba(245,245,247,0.4)' }}>Cargando historial...</span>
                        </div>
                    )}
                    {error && (
                        <div className="text-center py-10">
                            <p className="text-xs" style={{ color: '#F9A8A8' }}>❌ {error}</p>
                        </div>
                    )}
                    {!loading && !error && Array.isArray(registros) && registros.length === 0 && (
                        <EmptyState message="No hay movimientos registrados para este paciente" />
                    )}
                    {!loading && !error && Array.isArray(registros) && registros.map(reg => {
                        const st = accionStyle(reg.accion);
                        return (
                            <div key={reg.id} className="flex items-start gap-3 px-4 py-3 rounded-xl mb-2"
                                style={{ background: 'rgba(45,40,62,0.35)', border: '1px solid rgba(45,40,62,0.7)' }}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                            style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                                            {reg.accion}
                                        </span>
                                        <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                                            style={{ background: 'rgba(245,245,247,0.07)', color: 'rgba(245,245,247,0.4)' }}>
                                            {reg.examCodigo}
                                        </span>
                                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                            {reg.tipoExamen}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 flex-wrap">
                                        {reg.fecha && (
                                            <span className="text-[11px]" style={{ color: 'rgba(245,245,247,0.35)' }}>
                                                📅 {formatDate(reg.fecha)}
                                            </span>
                                        )}
                                        {reg.doctor && (
                                            <span className="text-[11px]" style={{ color: 'rgba(245,245,247,0.35)' }}>
                                                👨‍⚕️ {reg.doctor}
                                            </span>
                                        )}
                                        {reg.motivo && (
                                            <span className="text-[11px] italic" style={{ color: 'rgba(245,245,247,0.3)' }}>
                                                "{reg.motivo}"
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: 'rgba(245,245,247,0.25)' }}>
                                    {formatDateTime(reg.creadoEn)}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t flex justify-between items-center flex-shrink-0"
                    style={{ borderColor: 'rgba(130,99,177,0.15)' }}>
                    <span className="text-[10px]" style={{ color: 'rgba(245,245,247,0.2)' }}>
                        {Array.isArray(registros) ? registros.length : 0} registro(s) · Cédula: {cedula}
                    </span>
                    <button onClick={onClose}
                        className="text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                        style={{ background: 'rgba(245,245,247,0.07)', color: 'rgba(245,245,247,0.45)', border: '1px solid rgba(245,245,247,0.1)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,245,247,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.07)'}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Modal: Programar Cita CVD ────────────────────────────────────────────────
function ProgramarCitaModal({ patient, onClose, onSuccess }) {
    const [medicos, setMedicos] = useState([]);
    const [loadMedicos, setLoadMedicos] = useState(true);
    const [form, setForm] = useState({
        doctorId: '',
        doctorNombre: '',
        examCodigo: '',
        tipoExamen: '',
        fecha: '',
        hora: '',
        notas: '',
    });
    const [saving, setSaving] = useState(false);
    const [errMsg, setErrMsg] = useState('');

    useEffect(() => {
        fetch(`${API_BASE}/api/cardiovascular/medicos-cvd`)
            .then(r => r.json())
            .then(data => { setMedicos(Array.isArray(data) ? data : []); setLoadMedicos(false); })
            .catch(() => setLoadMedicos(false));
    }, []);

    const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

    const handleDoctorChange = (e) => {
        const opt = medicos.find(m => String(m.cod) === e.target.value);
        setField('doctorId', opt ? String(opt.cod) : '');
        setField('doctorNombre', opt ? opt.nombre : '');
    };

    const handleProcChange = (e) => {
        const proc = CVD_PROCEDIMIENTOS.find(p => p.codigo === e.target.value);
        setField('examCodigo', proc ? proc.codigo : '');
        setField('tipoExamen', proc ? proc.nombre : '');
    };

    const handleSave = async () => {
        if (!form.examCodigo) { setErrMsg('Selecciona un procedimiento.'); return; }
        setSaving(true); setErrMsg('');
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/cita`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cedula: patient.documento,
                    paciente: patient.nombre,
                    doctorId: form.doctorId || null,
                    doctorNombre: form.doctorNombre || null,
                    examCodigo: form.examCodigo,
                    tipoExamen: form.tipoExamen,
                    fecha: form.fecha || null,
                    hora: form.hora || null,
                    notas: form.notas || null,
                }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setErrMsg(d.error || 'Error al guardar');
            } else {
                onSuccess();
            }
        } catch {
            setErrMsg('Error de conexión con el servidor.');
        } finally {
            setSaving(false);
        }
    };

    const labelStyle = { color: 'rgba(161,227,216,0.55)' };
    const inputStyle = {
        background: 'rgba(15,14,19,0.8)',
        border: '1px solid rgba(130,99,177,0.3)',
        color: 'var(--text-primary)',
        borderRadius: '10px',
        padding: '10px 12px',
        fontSize: '13px',
        width: '100%',
        outline: 'none',
    };
    const selectStyle = { ...inputStyle, cursor: 'pointer' };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,7,12,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-w-lg rounded-2xl shadow-2xl"
                style={{ background: 'rgba(20,18,28,0.99)', border: '1px solid rgba(130,99,177,0.35)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b"
                    style={{ borderColor: 'rgba(130,99,177,0.2)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #B14040 0%, #8263B1 100%)' }}>
                            <CalendarPlus size={17} color="#F5F5F7" />
                        </div>
                        <div>
                            <p className="text-[10px] tracking-widest uppercase font-semibold"
                                style={{ color: 'rgba(196,175,237,0.6)' }}>Riesgo Cardiovascular</p>
                            <h2 className="text-sm font-bold" style={{ color: '#F5F5F7' }}>Programar Cita</h2>
                        </div>
                    </div>
                    <button onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                        style={{ background: 'rgba(245,245,247,0.06)', color: 'rgba(245,245,247,0.5)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.06)'}>
                        <X size={15} />
                    </button>
                </div>

                {/* Paciente info */}
                <div className="mx-6 mt-4 px-4 py-3 rounded-xl flex items-center gap-3"
                    style={{ background: 'rgba(130,99,177,0.1)', border: '1px solid rgba(130,99,177,0.2)' }}>
                    <User size={16} style={{ color: '#C4AFED', flexShrink: 0 }} />
                    <div>
                        <p className="text-xs font-bold" style={{ color: '#F5F5F7' }}>{patient.nombre}</p>
                        <p className="text-[11px]" style={{ color: 'rgba(196,175,237,0.6)' }}>
                            Cédula: {patient.documento} · {patient.edad ? `${patient.edad} años` : ''} · {patient.entidad || ''}
                        </p>
                    </div>
                </div>

                {/* Form */}
                <div className="px-6 py-5 flex flex-col gap-4">

                    {/* Doctor */}
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5"
                            style={labelStyle}>Doctor / Especialista</label>
                        {loadMedicos ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={inputStyle}>
                                <Loader2 size={13} className="animate-spin" style={{ color: '#C4AFED' }} />
                                <span className="text-xs" style={{ color: 'rgba(245,245,247,0.4)' }}>Cargando médicos...</span>
                            </div>
                        ) : (
                            <select
                                value={form.doctorId}
                                onChange={handleDoctorChange}
                                style={selectStyle}>
                                <option value="">— Sin asignar / Cualquier médico —</option>
                                {medicos.map(m => (
                                    <option key={m.cod} value={String(m.cod)}>
                                        {m.nombre}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Procedimiento */}
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5"
                            style={labelStyle}>Procedimiento Cardiovascular <span style={{ color: '#F9A8A8' }}>*</span></label>
                        <select
                            value={form.examCodigo}
                            onChange={handleProcChange}
                            style={selectStyle}>
                            <option value="">— Selecciona un procedimiento —</option>
                            {CVD_PROCEDIMIENTOS.map(p => (
                                <option key={p.codigo} value={p.codigo}>
                                    [{p.codigo}] {p.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Fecha y Hora */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5"
                                style={labelStyle}>Fecha</label>
                            <input type="date" value={form.fecha}
                                onChange={e => setField('fecha', e.target.value)}
                                style={inputStyle} />
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5"
                                style={labelStyle}>Hora</label>
                            <input type="time" value={form.hora}
                                onChange={e => setField('hora', e.target.value)}
                                style={inputStyle} />
                        </div>
                    </div>

                    {/* Notas */}
                    <div>
                        <label className="block text-[10px] uppercase tracking-widest font-semibold mb-1.5"
                            style={labelStyle}>Notas adicionales</label>
                        <textarea
                            rows={2}
                            placeholder="Observaciones, indicaciones especiales..."
                            value={form.notas}
                            onChange={e => setField('notas', e.target.value)}
                            style={{ ...inputStyle, resize: 'none' }}
                        />
                    </div>

                    {errMsg && (
                        <p className="text-xs px-3 py-2 rounded-lg"
                            style={{ background: 'rgba(177,64,64,0.15)', color: '#F9A8A8', border: '1px solid rgba(177,64,64,0.3)' }}>
                            ❌ {errMsg}
                        </p>
                    )}

                    {/* Botones */}
                    <div className="flex items-center gap-3 justify-end pt-1">
                        <button onClick={onClose}
                            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                            style={{ background: 'rgba(245,245,247,0.07)', color: 'rgba(245,245,247,0.5)', border: '1px solid rgba(245,245,247,0.1)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,245,247,0.12)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.07)'}>
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !form.examCodigo}
                            className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all"
                            style={{
                                background: (!form.examCodigo || saving)
                                    ? 'rgba(130,99,177,0.2)'
                                    : 'linear-gradient(135deg, rgba(177,64,64,0.6) 0%, rgba(130,99,177,0.6) 100%)',
                                color: (!form.examCodigo || saving) ? 'rgba(245,245,247,0.3)' : '#F5F5F7',
                                border: '1px solid rgba(130,99,177,0.4)',
                                cursor: (!form.examCodigo || saving) ? 'not-allowed' : 'pointer',
                                boxShadow: (!form.examCodigo || saving) ? 'none' : '0 0 18px rgba(130,99,177,0.25)',
                            }}>
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            Confirmar Cita
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Reporte Riesgo Modal ────────────────────────────────────────────────────
function ReporteRiesgoModal({ onClose }) {
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(0); // 0 = todos los meses del año
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    // Filtros locales (aplicados sobre los datos ya cargados)
    const [filtroRiesgo, setFiltroRiesgo] = useState('TODOS');
    const [filtroEps, setFiltroEps] = useState('TODOS');
    const [filtroControl, setFiltroControl] = useState('TODOS'); // TODOS | EN_CONTROL | SIN_CONTROL
    const [busqueda, setBusqueda] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        setFiltroRiesgo('TODOS');
        setFiltroEps('TODOS');
        setFiltroControl('TODOS');
        setBusqueda('');
        try {
            const params = new URLSearchParams({ year });
            if (month > 0) params.set('month', month);
            const res = await fetch(`${API_BASE}/api/cardiovascular/reporte-riesgo?${params}`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
            } else {
                const err = await res.json().catch(() => ({}));
                setErrorMsg(err.error || `Error ${res.status} al cargar datos`);
            }
        } catch (e) {
            setErrorMsg('Error de conexión. Verifica que el servidor backend está corriendo.');
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => { loadData(); }, [loadData]);

    // Pacientes filtrados localmente
    const pacientesFiltrados = (data?.pacientes || []).filter(p => {
        if (filtroRiesgo !== 'TODOS' && p.nivelRiesgo !== filtroRiesgo) return false;
        if (filtroEps !== 'TODOS' && p.eps !== filtroEps) return false;
        if (filtroControl === 'EN_CONTROL' && !p.enControl) return false;
        if (filtroControl === 'SIN_CONTROL' && p.enControl) return false;
        if (busqueda.trim()) {
            const q = busqueda.toLowerCase();
            if (!p.nombre.toLowerCase().includes(q) && !p.codigo.includes(q)) return false;
        }
        return true;
    });

    // Resumen calculado sobre los datos filtrados
    const totalFiltrado = pacientesFiltrados.length;
    const enControlFiltrado = pacientesFiltrados.filter(p => p.enControl).length;
    const sinControlFiltrado = totalFiltrado - enControlFiltrado;

    const riesgosUnicos = data?.filtros?.riesgosUnicos || [];
    const epsUnicas = data?.filtros?.epsUnicas || [];

    const colorRiesgo = (r) => {
        if (r === 'ALTO') return { bg: 'rgba(177,64,64,0.2)', color: '#F9A8A8', border: 'rgba(177,64,64,0.4)' };
        if (r === 'MEDIO') return { bg: 'rgba(251,191,36,0.15)', color: '#FCD34D', border: 'rgba(251,191,36,0.4)' };
        if (r === 'BAJO') return { bg: 'rgba(161,227,216,0.15)', color: '#A1E3D8', border: 'rgba(161,227,216,0.4)' };
        return { bg: 'rgba(130,99,177,0.15)', color: '#C4AFED', border: 'rgba(130,99,177,0.4)' };
    };

    const handleExportCSV = () => {
        if (!pacientesFiltrados.length) return;
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const headers = ['Cédula','Nombre','Nivel Riesgo','EPS','Fecha Valoración','En Control','Última Cita CVD'];
        const rows = pacientesFiltrados.map(p => [
            p.codigo,
            p.nombre,
            p.nivelRiesgo,
            p.eps,
            formatDate(p.fechaValoracion),
            p.enControl ? 'SÍ' : 'NO',
            p.ultimaCitaCVD ? formatDate(p.ultimaCitaCVD) : '—'
        ]);
        const csvContent = [headers, ...rows].map(row =>
            row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
        ).join('\n');
        const periodoLabel = month > 0 ? `${meses[month-1]}_${year}` : `${year}`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_riesgo_cvd_${periodoLabel}.csv`);
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportPDF = () => {
        if (!pacientesFiltrados.length) return;
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const periodoLabel = month > 0 ? `${meses[month-1]} ${year}` : `Año ${year}`;
        const now = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' });

        const riesgoColor = (r) => {
            if (r === 'ALTO') return { bg: '#fde8e8', color: '#b71c1c' };
            if (r === 'MEDIO') return { bg: '#fffde7', color: '#e65100' };
            if (r === 'BAJO') return { bg: '#e0f7f4', color: '#00695c' };
            return { bg: '#f3f0ff', color: '#4a3b72' };
        };

        const tableRows = pacientesFiltrados.map(p => {
            const rc = riesgoColor(p.nivelRiesgo);
            return `<tr>
                <td>${p.codigo}</td>
                <td>${p.nombre}</td>
                <td><span style="background:${rc.bg};color:${rc.color};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">${p.nivelRiesgo}</span></td>
                <td>${p.eps}</td>
                <td>${formatDate(p.fechaValoracion)}</td>
                <td style="color:${p.enControl ? '#00695c' : '#b71c1c'};font-weight:700">${p.enControl ? 'SÍ ✓' : 'NO ✗'}</td>
                <td>${p.ultimaCitaCVD ? formatDate(p.ultimaCitaCVD) : '—'}</td>
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Informe Riesgo Cardiovascular</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#1a1a2e; background:#fff; padding:28px; }
header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #8263B1; padding-bottom:14px; margin-bottom:20px; }
.logo-icon { width:44px;height:44px;background:linear-gradient(135deg,#B14040,#8263B1);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px; }
h1 { font-size:17px; font-weight:800; color:#1a1a2e; }
h1 span { color:#8263B1; }
.meta p { font-size:10px; color:#666; margin-top:2px; }
.meta strong { font-size:12px; }
.kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:18px; }
.kpi { border-radius:10px; padding:12px 16px; }
.kpi label { font-size:9px; text-transform:uppercase; letter-spacing:.08em; font-weight:700; display:block; margin-bottom:4px; }
.kpi .num { font-size:26px; font-weight:800; }
.kpi .pct { font-size:11px; opacity:.75; }
table { width:100%; border-collapse:collapse; font-size:10px; }
thead { background:#f3f0ff; }
th { padding:6px 8px; text-align:left; font-weight:700; color:#4a3b72; border-bottom:2px solid #c8b9f0; }
td { padding:5px 8px; border-bottom:1px solid #e8e3f5; }
tr:last-child td { border-bottom:none; }
footer { margin-top:24px; padding-top:12px; border-top:2px solid #e8e3f5; display:flex; justify-content:space-between; font-size:10px; color:#999; }
</style></head><body>
<header>
  <div style="display:flex;align-items:center;gap:12px">
    <div class="logo-icon">♥</div>
    <div>
      <div style="font-size:9px;color:#8263B1;font-weight:700;text-transform:uppercase;letter-spacing:.15em">Informe Clínico</div>
      <h1>Riesgo <span>Cardiovascular</span></h1>
    </div>
  </div>
  <div class="meta" style="text-align:right">
    <p>Período: <strong>${periodoLabel}</strong></p>
    <p>Fecha: ${now}</p>
    <p>Generado por Auro Bot</p>
  </div>
</header>
<div class="kpis">
  <div class="kpi" style="background:#f3f0ff;border:1px solid #c8b9f0">
    <label style="color:#8263B1">Total Pacientes</label>
    <div class="num" style="color:#4a3b72">${totalFiltrado}</div>
    <div class="pct">con valoración de riesgo</div>
  </div>
  <div class="kpi" style="background:#e0f7f4;border:1px solid #80cbc4">
    <label style="color:#00695c">En Control</label>
    <div class="num" style="color:#00695c">${enControlFiltrado}</div>
    <div class="pct">${totalFiltrado ? Math.round(enControlFiltrado/totalFiltrado*100) : 0}% del total</div>
  </div>
  <div class="kpi" style="background:#fde8e8;border:1px solid #e57373">
    <label style="color:#b71c1c">Sin Control</label>
    <div class="num" style="color:#b71c1c">${sinControlFiltrado}</div>
    <div class="pct">${totalFiltrado ? Math.round(sinControlFiltrado/totalFiltrado*100) : 0}% del total</div>
  </div>
</div>
<table>
<thead><tr><th>Cédula</th><th>Nombre</th><th>Riesgo</th><th>EPS</th><th>Valoración</th><th>En Control</th><th>Última Cita CVD</th></tr></thead>
<tbody>${tableRows}</tbody>
</table>
<footer>
  <span>Auro Bot · Módulo Cardiovascular</span>
  <span>${now} · ${totalFiltrado} pacientes</span>
</footer>
<script>window.onload=function(){window.print();setTimeout(()=>window.close(),800);}</script>
</body></html>`;
        const win = window.open('', '_blank', 'width=1000,height=750');
        if (win) { win.document.write(html); win.document.close(); }
    };

    const MESES = ['Todos los meses','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const inputBase = {
        background: 'rgba(15,14,19,0.8)',
        border: '1px solid rgba(130,99,177,0.3)',
        color: 'var(--text-primary)',
        borderRadius: '8px',
        padding: '6px 10px',
        fontSize: '12px',
        outline: 'none',
        cursor: 'pointer',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,7,12,0.88)', backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-w-6xl max-h-[95vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'rgba(16,14,22,0.99)', border: '1px solid rgba(130,99,177,0.3)' }}>

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
                    style={{ borderBottom: '1px solid rgba(130,99,177,0.2)', background: 'rgba(20,18,28,0.98)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, rgba(177,64,64,0.5) 0%, rgba(130,99,177,0.5) 100%)' }}>
                            <BarChart2 size={20} color="#F9A8A8" />
                        </div>
                        <div>
                            <p className="text-[10px] tracking-widest uppercase font-semibold"
                                style={{ color: 'rgba(249,168,168,0.6)' }}>Informe Poblacional</p>
                            <h2 className="text-sm font-bold" style={{ color: '#F5F5F7' }}>Riesgo Cardiovascular</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Período */}
                        <div className="flex items-center gap-2">
                            <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={inputBase}>
                                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={inputBase}>
                                {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                        </div>
                        {/* Exportar */}
                        {data && !loading && !errorMsg && (
                            <div className="flex items-center gap-2">
                                <button onClick={handleExportCSV}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                                    style={{ background: 'rgba(161,227,216,0.2)', color: '#A1E3D8', border: '1px solid rgba(161,227,216,0.35)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(161,227,216,0.3)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(161,227,216,0.2)'}>
                                    <Download size={12} /> CSV
                                </button>
                                <button onClick={handleExportPDF}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                                    style={{ background: 'rgba(177,64,64,0.25)', color: '#F9A8A8', border: '1px solid rgba(177,64,64,0.4)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.4)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(177,64,64,0.25)'}>
                                    <Download size={12} /> PDF
                                </button>
                            </div>
                        )}
                        <button onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: 'rgba(245,245,247,0.06)', color: 'rgba(245,245,247,0.5)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.06)'}>
                            <X size={15} />
                        </button>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3">
                            <Loader2 size={36} className="animate-spin" style={{ color: '#8263B1' }} />
                            <p className="text-sm" style={{ color: 'rgba(245,245,247,0.4)' }}>Consultando valoraciones de riesgo...</p>
                        </div>
                    ) : errorMsg ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 px-8">
                            <AlertTriangle size={44} style={{ color: '#F9A8A8' }} />
                            <p className="text-sm text-center" style={{ color: '#F9A8A8' }}>{errorMsg}</p>
                            <button onClick={loadData}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                                style={{ background: 'rgba(130,99,177,0.25)', color: '#C4AFED', border: '1px solid rgba(130,99,177,0.4)' }}>
                                <RefreshCw size={12} /> Reintentar
                            </button>
                        </div>
                    ) : data ? (
                        <div className="flex flex-col gap-0">

                            {/* ── KPI Cards ── */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5"
                                style={{ borderBottom: '1px solid rgba(130,99,177,0.12)', background: 'rgba(20,18,28,0.6)' }}>
                                {/* Total */}
                                <div className="rounded-xl px-5 py-4"
                                    style={{ background: 'rgba(130,99,177,0.12)', border: '1px solid rgba(130,99,177,0.25)' }}>
                                    <p className="text-[10px] tracking-widest uppercase font-semibold mb-1"
                                        style={{ color: 'rgba(196,175,237,0.6)' }}>Total Pacientes</p>
                                    <p className="text-3xl font-black" style={{ color: '#C4AFED' }}>
                                        {filtroRiesgo !== 'TODOS' || filtroEps !== 'TODOS' || filtroControl !== 'TODOS' || busqueda ? totalFiltrado : data.resumen.total}
                                    </p>
                                    <div className="flex items-center gap-1 mt-1">
                                        <Users size={11} style={{ color: 'rgba(196,175,237,0.5)' }} />
                                        <span className="text-[10px]" style={{ color: 'rgba(196,175,237,0.5)' }}>con valoración de riesgo</span>
                                    </div>
                                </div>
                                {/* En control */}
                                <div className="rounded-xl px-5 py-4"
                                    style={{ background: 'rgba(161,227,216,0.08)', border: '1px solid rgba(161,227,216,0.22)' }}>
                                    <p className="text-[10px] tracking-widest uppercase font-semibold mb-1"
                                        style={{ color: 'rgba(161,227,216,0.6)' }}>En Control</p>
                                    <p className="text-3xl font-black" style={{ color: '#A1E3D8' }}>{enControlFiltrado}</p>
                                    <div className="flex items-center gap-1 mt-1">
                                        <TrendingUp size={11} style={{ color: 'rgba(161,227,216,0.5)' }} />
                                        <span className="text-[10px]" style={{ color: 'rgba(161,227,216,0.5)' }}>
                                            {totalFiltrado ? Math.round(enControlFiltrado / totalFiltrado * 100) : 0}% del filtro
                                        </span>
                                    </div>
                                </div>
                                {/* Sin control */}
                                <div className="rounded-xl px-5 py-4"
                                    style={{ background: 'rgba(177,64,64,0.1)', border: '1px solid rgba(177,64,64,0.25)' }}>
                                    <p className="text-[10px] tracking-widest uppercase font-semibold mb-1"
                                        style={{ color: 'rgba(249,168,168,0.6)' }}>Sin Control</p>
                                    <p className="text-3xl font-black" style={{ color: '#F9A8A8' }}>{sinControlFiltrado}</p>
                                    <div className="flex items-center gap-1 mt-1">
                                        <TrendingDown size={11} style={{ color: 'rgba(249,168,168,0.5)' }} />
                                        <span className="text-[10px]" style={{ color: 'rgba(249,168,168,0.5)' }}>
                                            {totalFiltrado ? Math.round(sinControlFiltrado / totalFiltrado * 100) : 0}% del filtro
                                        </span>
                                    </div>
                                </div>
                                {/* Desglose por riesgo */}
                                <div className="rounded-xl px-5 py-4"
                                    style={{ background: 'rgba(45,40,62,0.5)', border: '1px solid rgba(130,99,177,0.18)' }}>
                                    <p className="text-[10px] tracking-widest uppercase font-semibold mb-2"
                                        style={{ color: 'rgba(196,175,237,0.6)' }}>Por Nivel de Riesgo</p>
                                    <div className="flex flex-col gap-1">
                                        {Object.entries(data.resumen.porRiesgo || {}).map(([r, stats]) => {
                                            const rc = colorRiesgo(r);
                                            return (
                                                <div key={r} className="flex items-center justify-between">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                        style={{ background: rc.bg, color: rc.color }}>{r}</span>
                                                    <span className="text-xs font-bold" style={{ color: rc.color }}>{stats.total}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* ── Barra de filtros ── */}
                            <div className="flex items-center gap-3 px-5 py-3 flex-wrap flex-shrink-0"
                                style={{ background: 'rgba(130,99,177,0.05)', borderBottom: '1px solid rgba(130,99,177,0.1)' }}>
                                <ListFilter size={13} style={{ color: 'rgba(196,175,237,0.5)' }} />
                                <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(196,175,237,0.5)' }}>Filtros:</span>

                                {/* Filtro Riesgo */}
                                <div className="flex items-center gap-1">
                                    {['TODOS', ...riesgosUnicos].map(r => {
                                        const rc = r === 'TODOS' ? { bg: 'rgba(130,99,177,0.2)', color: '#C4AFED', border: 'rgba(130,99,177,0.4)' } : colorRiesgo(r);
                                        const active = filtroRiesgo === r;
                                        return (
                                            <button key={r} onClick={() => setFiltroRiesgo(r)}
                                                className="text-[11px] font-bold px-3 py-1 rounded-full transition-all"
                                                style={{
                                                    background: active ? rc.bg : 'rgba(255,255,255,0.04)',
                                                    color: active ? rc.color : 'rgba(245,245,247,0.35)',
                                                    border: `1px solid ${active ? rc.border : 'rgba(255,255,255,0.07)'}`,
                                                    transform: active ? 'scale(1.05)' : 'scale(1)',
                                                }}>
                                                {r === 'TODOS' ? 'Todos los riesgos' : r}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div style={{ width: 1, height: 18, background: 'rgba(130,99,177,0.2)' }} />

                                {/* Filtro Control */}
                                {[
                                    { key: 'TODOS', label: 'Todos', bg: 'rgba(130,99,177,0.2)', color: '#C4AFED', border: 'rgba(130,99,177,0.4)' },
                                    { key: 'EN_CONTROL', label: '✓ En Control', bg: 'rgba(161,227,216,0.15)', color: '#A1E3D8', border: 'rgba(161,227,216,0.4)' },
                                    { key: 'SIN_CONTROL', label: '✗ Sin Control', bg: 'rgba(177,64,64,0.15)', color: '#F9A8A8', border: 'rgba(177,64,64,0.4)' },
                                ].map(btn => (
                                    <button key={btn.key} onClick={() => setFiltroControl(btn.key)}
                                        className="text-[11px] font-bold px-3 py-1 rounded-full transition-all"
                                        style={{
                                            background: filtroControl === btn.key ? btn.bg : 'rgba(255,255,255,0.04)',
                                            color: filtroControl === btn.key ? btn.color : 'rgba(245,245,247,0.35)',
                                            border: `1px solid ${filtroControl === btn.key ? btn.border : 'rgba(255,255,255,0.07)'}`,
                                            transform: filtroControl === btn.key ? 'scale(1.05)' : 'scale(1)',
                                        }}>
                                        {btn.label}
                                    </button>
                                ))}

                                <div style={{ width: 1, height: 18, background: 'rgba(130,99,177,0.2)' }} />

                                {/* Filtro EPS */}
                                <select value={filtroEps} onChange={e => setFiltroEps(e.target.value)}
                                    className="text-[11px] rounded-lg px-2 py-1 outline-none"
                                    style={{ background: 'rgba(130,99,177,0.15)', color: '#C4AFED', border: '1px solid rgba(130,99,177,0.25)', cursor: 'pointer', maxWidth: '200px' }}>
                                    <option value="TODOS">🏥 Todas las EPS</option>
                                    {epsUnicas.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>

                                {/* Búsqueda */}
                                <div className="flex items-center gap-1.5 flex-1 min-w-[140px] px-3 py-1.5 rounded-lg"
                                    style={{ background: 'rgba(15,14,19,0.8)', border: '1px solid rgba(130,99,177,0.2)', maxWidth: '220px' }}>
                                    <Search size={11} style={{ color: 'rgba(196,175,237,0.5)', flexShrink: 0 }} />
                                    <input type="text" placeholder="Nombre o cédula..."
                                        value={busqueda} onChange={e => setBusqueda(e.target.value)}
                                        className="flex-1 bg-transparent outline-none text-[11px]"
                                        style={{ color: 'var(--text-primary)' }} />
                                </div>

                                <span className="text-[11px] ml-auto" style={{ color: 'rgba(245,245,247,0.3)' }}>
                                    {totalFiltrado} paciente{totalFiltrado !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* ── Tabla de pacientes ── */}
                            <div className="overflow-auto" style={{ maxHeight: 'calc(95vh - 350px)' }}>
                                {pacientesFiltrados.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                                        <Users size={32} style={{ color: 'rgba(245,245,247,0.1)' }} />
                                        <p className="text-xs" style={{ color: 'rgba(245,245,247,0.3)' }}>No hay pacientes con este filtro</p>
                                    </div>
                                ) : (
                                    <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(130,99,177,0.1)', borderBottom: '1px solid rgba(130,99,177,0.15)' }}>
                                                {['Cédula','Nombre','Riesgo','EPS','Fecha Valoración','Control','Última Cita CVD'].map(h => (
                                                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold tracking-widest uppercase"
                                                        style={{ color: 'rgba(196,175,237,0.6)', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pacientesFiltrados.map((p, i) => {
                                                const rc = colorRiesgo(p.nivelRiesgo);
                                                return (
                                                    <tr key={`${p.codigo}-${i}`}
                                                        style={{ borderBottom: '1px solid rgba(130,99,177,0.08)', transition: 'background 0.15s' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(130,99,177,0.08)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                        <td className="px-4 py-3">
                                                            <span className="text-xs font-mono" style={{ color: '#C4AFED' }}>{p.codigo}</span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{p.nombre}</span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[10px] font-bold px-2 py-1 rounded"
                                                                style={{ background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}>
                                                                {p.nivelRiesgo}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[11px]" style={{ color: 'rgba(245,245,247,0.6)' }}>{p.eps}</span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[11px]" style={{ color: 'rgba(245,245,247,0.55)' }}>{formatDate(p.fechaValoracion)}</span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[11px] font-bold flex items-center gap-1"
                                                                style={{ color: p.enControl ? '#A1E3D8' : '#F9A8A8' }}>
                                                                {p.enControl
                                                                    ? <><CheckCircle2 size={13} /> Sí</>
                                                                    : <><XCircle size={13} /> No</>
                                                                }
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-[11px]" style={{ color: p.ultimaCitaCVD ? 'rgba(161,227,216,0.7)' : 'rgba(245,245,247,0.25)' }}>
                                                                {p.ultimaCitaCVD ? formatDate(p.ultimaCitaCVD) : '— Sin cita'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* ── Desglose por EPS ── */}
                            {data.resumen.porEps && data.resumen.porEps.length > 0 && (
                                <div className="px-5 py-4 flex-shrink-0"
                                    style={{ borderTop: '1px solid rgba(130,99,177,0.15)', background: 'rgba(20,18,28,0.6)' }}>
                                    <p className="text-[10px] tracking-widest uppercase font-semibold mb-3"
                                        style={{ color: 'rgba(196,175,237,0.5)' }}>Desglose por EPS (datos totales del período)</p>
                                    <div className="flex flex-wrap gap-2">
                                        {data.resumen.porEps.map(eps => (
                                            <div key={eps.nombre} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                                                style={{ background: 'rgba(130,99,177,0.1)', border: '1px solid rgba(130,99,177,0.18)' }}>
                                                <span className="text-[11px] font-semibold" style={{ color: '#C4AFED' }}>{eps.nombre}</span>
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                    style={{ background: 'rgba(130,99,177,0.2)', color: '#C4AFED' }}>{eps.total}</span>
                                                <span className="text-[10px]" style={{ color: '#A1E3D8' }}>✓ {eps.enControl}</span>
                                                <span className="text-[10px]" style={{ color: '#F9A8A8' }}>✗ {eps.sinControl}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

// ─── Dashboard Indicadores Modal ─────────────────────────────────────────────
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
                const res = await fetch(`${API_BASE}/api/cardiovascular/indicadores?year=${year}&month=${month}`);
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                } else {
                    setErrorMsg(`No se pudieron cargar los datos (Error ${res.status}). Asegúrate de reiniciar el servidor backend.`);
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
            csvRows.push(`"${nombre}",${num},${denom},${meta},${cump}%,${punt}`);
        };

        addRow("Porcentaje de pacientes diabéticos controlados (Hb1AC >=4 y <7%, en los últimos 6 meses)", data.mes.dmControl, "50 %");
        addRow("Usuarios estudiados bajo el algoritmo para Enfermedad Renal Crónica - ERC", data.mes.ercEstudio, "80 %");
        addRow("Porcentaje de pacientes hipertensos controlados <150/90. (>=60 años)", data.mes.htaControl, "60 %");
        addRow("Porcentaje de Control de LDL en pacientes con HTA, DM y ERC. (>= 15 mg/dl y <= 100 mg/dl)", data.mes.ldlControl, "50 %");
        addRow("Control de la presión arterial (<140/90) **", data.mes.paControl, "60 %");

        csvRows.push("");
        csvRows.push("Desglose EPS,Atendidos,DM Ctrl.,PA Ctrl.,ERC Est.");
        data.eps.forEach(e => {
            csvRows.push(`"${e.nombre}",${e.atendidos},${e.dmControl},${e.paControl},${e.ercEstudio}`);
        });

        const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `indicadores_cvd_${year}_${month}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadPDF = async () => {
        const element = document.getElementById('dashboard-pdf-content');
        if (!element) return;
        
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            const opt = {
                margin:       0.3,
                filename:     `indicadores_cvd_${year}_${month}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
            };
            html2pdf().set(opt).from(element).save();
        } catch (e) {
            console.error("Error generating PDF:", e);
        }
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
                            <div className="flex gap-2">
                                <button onClick={handleDownloadCSV}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white shadow-md transition-all transform hover:scale-105"
                                    style={{ background: '#0F9B82' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#0d8972'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#0F9B82'}>
                                    <Download size={16} /> CSV
                                </button>
                                <button onClick={handleDownloadPDF}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white shadow-md transition-all transform hover:scale-105"
                                    style={{ background: '#B14040' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#9A3636'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#B14040'}>
                                    <Download size={16} /> PDF
                                </button>
                            </div>
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
                        <div id="dashboard-pdf-content" className="flex flex-col gap-6 p-4 rounded-xl" style={{ background: '#EAECEE' }}>
                            <div className="text-center mb-2">
                                <h1 className="text-xl font-bold text-[#192C3D] uppercase">
                                    Indicadores de Riesgo Cardiovascular
                                </h1>
                                <p className="text-md font-semibold text-[#0F9B82]">
                                    {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][month - 1]} del {year}
                                </p>
                            </div>
                            
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

// ─── Main Page ─────────────────────────────────────────────────────────
function CardiovascularPage() {
    const [searchId, setSearchId] = useState('');
    const [dateFilter, setDateFilter] = useState('all');
    const [showReport, setShowReport] = useState(false);
    const [loading, setLoading] = useState(false);
    const [patient, setPatient] = useState(null);
    const [programados, setProgramados] = useState([]);
    const [pendientes, setPendientes] = useState([]);
    const [realizados, setRealizados] = useState([]);
    const [sendingId, setSendingId] = useState(null);
    const [agendandoId, setAgendandoId] = useState(null);
    const [toast, setToast] = useState(null);

    // ── Edición de paciente ────────────────────────────────────────────────────
    const [editingPatient, setEditingPatient] = useState(false);
    const [editPhone, setEditPhone] = useState('');
    const [editPhoneErr, setEditPhoneErr] = useState('');
    const [savingPatient, setSavingPatient] = useState(false);

    // ── Eliminación de programado ───────────────────────────────────────────────
    const [eliminandoExamen, setEliminandoExamen] = useState(null);
    const [eliminandoId, setEliminandoId] = useState(null);

    // ── Historial ─────────────────────────────────────────────────────────────────
    const [showHistorial, setShowHistorial] = useState(false);

    // ── Programar cita ──────────────────────────────────────────────────────────────
    const [showProgramarCita, setShowProgramarCita] = useState(false);
    const [showControlesViewer, setShowControlesViewer] = useState(false);
    const [showIndicadores, setShowIndicadores] = useState(false);
    const [showReporteRiesgo, setShowReporteRiesgo] = useState(false);

    // ── Filtro por fecha ──────────────────────────────────────────────────────────────
    const applyDateFilter = (list) => {
        if (dateFilter === 'all') return list;
        const now = new Date();
        return list.filter(ex => {
            if (!ex.fecha) return false;
            const d = new Date(ex.fecha.includes('T') ? ex.fecha : ex.fecha + 'T12:00:00');
            if (dateFilter === 'year') return d.getFullYear() === now.getFullYear();
            if (dateFilter === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            return true;
        });
    };

    const programadosFiltrados = applyDateFilter(programados);
    const realizadosFiltrados = applyDateFilter(realizados);

    const showToast = (text, type = 'success') => {
        setToast({ text, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleSearch = useCallback(async () => {
        if (!searchId.trim()) return;
        setLoading(true);
        setPatient(null);
        setProgramados([]);
        setPendientes([]);
        setRealizados([]);
        setEditingPatient(false);
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

    const handleSavePatient = async () => {
        if (!patient) return;
        const digitsOnly = editPhone.replace(/\D/g, '');
        if (digitsOnly.length < 7 || digitsOnly.length > 15) {
            setEditPhoneErr('Ingresa un número válido (7 a 15 dígitos, sin espacios ni guiones).');
            return;
        }
        setEditPhoneErr('');
        setSavingPatient(true);
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/patient/${patient.documento}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefono: digitsOnly }),
            });
            const data = await res.json();
            if (!res.ok) {
                setEditPhoneErr(data.error || 'Error al guardar');
            } else {
                setPatient(p => ({ ...p, telefono: data.telefono }));
                setEditingPatient(false);
                setEditPhoneErr('');
                showToast('✅ Teléfono actualizado correctamente');
            }
        } catch {
            setEditPhoneErr('Error de conexión con el servidor.');
        } finally {
            setSavingPatient(false);
        }
    };

    const handleRemind = async (id, tipoExamen) => {
        setSendingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/remind/${encodeURIComponent(id)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cedula: patient?.documento,
                    telefono: patient?.telefono,
                    examen: tipoExamen,
                }),
            });
            if (res.ok) showToast('✅ Recordatorio enviado por WhatsApp');
            else {
                const data = await res.json().catch(() => ({}));
                showToast(`❌ ${data.error || 'Error al enviar recordatorio'}`, 'error');
            }
        } catch {
            showToast('❌ Error de conexión', 'error');
        } finally {
            setSendingId(null);
        }
    };

    const handleEliminar = (examen) => setEliminandoExamen(examen);

    const confirmarEliminacion = async (motivo) => {
        if (!eliminandoExamen || !patient) return;
        setEliminandoId(eliminandoExamen.id);
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/programado/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cedula: patient.documento,
                    examCodigo: eliminandoExamen.codigo,
                    tipoExamen: eliminandoExamen.tipoExamen,
                    fecha: eliminandoExamen.fecha,
                    doctor: eliminandoExamen.doctor,
                    motivo: motivo || null,
                }),
            });
            if (res.ok) {
                setProgramados(prev => prev.filter(e => e.id !== eliminandoExamen.id));
                setEliminandoExamen(null);
                showToast('✅ Programación eliminada y registrada en historial');
            } else {
                const d = await res.json().catch(() => ({}));
                showToast(`❌ ${d.error || 'Error al eliminar'}`, 'error');
            }
        } catch {
            showToast('❌ Error de conexión', 'error');
        } finally {
            setEliminandoId(null);
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
        <div className="h-screen flex flex-col" style={{ background: 'var(--chat-bg)' }}>

            {/* ── Modales ── */}
            {showReport && patient && (
                <ReportModal
                    patient={patient}
                    programados={programados}
                    pendientes={pendientes}
                    realizados={realizados}
                    onClose={() => setShowReport(false)}
                />
            )}

            {eliminandoExamen && (
                <EliminarModal
                    examen={eliminandoExamen}
                    loading={!!eliminandoId}
                    onConfirm={confirmarEliminacion}
                    onCancel={() => setEliminandoExamen(null)}
                />
            )}

            {showHistorial && patient && (
                <HistorialModal
                    cedula={patient.documento}
                    pacienteNombre={patient.nombre}
                    onClose={() => setShowHistorial(false)}
                />
            )}

            {showProgramarCita && patient && (
                <ProgramarCitaModal
                    patient={patient}
                    onClose={() => setShowProgramarCita(false)}
                    onSuccess={() => {
                        setShowProgramarCita(false);
                        showToast('✅ Cita programada y registrada en el historial');
                    }}
                />
            )}

            {showControlesViewer && (
                <ControlesViewerModal onClose={() => setShowControlesViewer(false)} />
            )}

            {showIndicadores && (
                <DashboardIndicadoresModal onClose={() => setShowIndicadores(false)} />
            )}

            {showReporteRiesgo && (
                <ReporteRiesgoModal onClose={() => setShowReporteRiesgo(false)} />
            )}

            {/* ── Decorativos ── */}
            <div className="fixed inset-0 chat-bg pointer-events-none" />
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

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Activity size={14} style={{ color: 'rgba(245,245,247,0.2)' }} />
                        <span className="text-[11px]" style={{ color: 'rgba(245,245,247,0.2)' }}>
                            Auro Bot · Cardiovascular
                        </span>
                    </div>
                    <button
                        id="btn-generar-informe"
                        onClick={() => setShowReport(true)}
                        disabled={!patient}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                        style={{
                            background: patient ? 'linear-gradient(135deg, rgba(130,99,177,0.35) 0%, rgba(177,64,64,0.35) 100%)' : 'rgba(45,40,62,0.3)',
                            color: patient ? '#E2D4FF' : 'rgba(245,245,247,0.2)',
                            border: patient ? '1px solid rgba(130,99,177,0.5)' : '1px solid rgba(45,40,62,0.5)',
                            cursor: patient ? 'pointer' : 'not-allowed',
                            boxShadow: patient ? '0 0 18px rgba(130,99,177,0.2)' : 'none',
                        }}
                        onMouseEnter={e => patient && (e.currentTarget.style.boxShadow = '0 0 28px rgba(130,99,177,0.4)')}
                        onMouseLeave={e => patient && (e.currentTarget.style.boxShadow = '0 0 18px rgba(130,99,177,0.2)')}>
                        <ClipboardList size={13} />
                        Generar Informe
                    </button>
                    <button
                        onClick={() => setShowControlesViewer(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                        style={{
                            background: 'linear-gradient(135deg, rgba(130,99,177,0.3) 0%, rgba(90,68,144,0.3) 100%)',
                            color: '#E2D4FF',
                            border: '1px solid rgba(130,99,177,0.4)',
                            boxShadow: '0 0 15px rgba(130,99,177,0.15)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 25px rgba(130,99,177,0.3)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 15px rgba(130,99,177,0.15)'}>
                        <CalendarCheck2 size={13} />
                        Visor de Controles
                    </button>
                    <button
                        onClick={() => setShowIndicadores(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                        style={{
                            background: 'linear-gradient(135deg, rgba(177,64,64,0.3) 0%, rgba(139,26,26,0.3) 100%)',
                            color: '#F9A8A8',
                            border: '1px solid rgba(177,64,64,0.4)',
                            boxShadow: '0 0 15px rgba(177,64,64,0.15)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 25px rgba(177,64,64,0.3)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 15px rgba(177,64,64,0.15)'}>
                        <Activity size={13} />
                        Indicadores CVD
                    </button>
                    <button
                        onClick={() => setShowReporteRiesgo(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                        style={{
                            background: 'linear-gradient(135deg, rgba(130,99,177,0.35) 0%, rgba(177,64,64,0.35) 100%)',
                            color: '#E2D4FF',
                            border: '1px solid rgba(130,99,177,0.5)',
                            boxShadow: '0 0 15px rgba(130,99,177,0.15)',
                        }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 25px rgba(130,99,177,0.35)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 15px rgba(130,99,177,0.15)'}>
                        <BarChart2 size={13} />
                        Informe Riesgo
                    </button>
                </div>
            </header>


            {/* ── Main content ── */}
            <main className="relative z-10 flex-1 p-6 overflow-auto">

                {/* ── Search bar row ── */}
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                    {/* Search input */}
                    <div className="flex items-center gap-2 flex-1 min-w-[260px] px-4 py-2.5 rounded-xl"
                        style={{ background: 'rgba(15,14,19,0.8)', border: '1px solid var(--border)', maxWidth: '420px' }}>
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
                        }}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        Buscar
                    </button>

                    {/* ── Filtro de fechas ── */}
                    <div className="flex items-center gap-1 rounded-xl p-1"
                        style={{ background: 'rgba(15,14,19,0.8)', border: '1px solid var(--border)' }}>
                        {[
                            { key: 'all', label: 'Todos' },
                            { key: 'year', label: 'Este año' },
                            { key: 'month', label: 'Este mes' },
                        ].map(({ key, label }) => {
                            const active = dateFilter === key;
                            return (
                                <button
                                    key={key}
                                    id={`date-filter-${key}`}
                                    onClick={() => setDateFilter(key)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                    style={{
                                        background: active ? 'rgba(177,64,64,0.3)' : 'transparent',
                                        color: active ? '#F9A8A8' : 'var(--text-muted)',
                                        border: active ? '1px solid rgba(177,64,64,0.5)' : '1px solid transparent',
                                    }}>
                                    <Calendar size={11} />
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Programar Cita ── */}
                    <button
                        id="btn-programar-cita"
                        onClick={() => setShowProgramarCita(true)}
                        disabled={!patient}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={{
                            background: patient
                                ? 'linear-gradient(135deg, rgba(130,99,177,0.4) 0%, rgba(177,64,64,0.4) 100%)'
                                : 'rgba(45,40,62,0.3)',
                            color: patient ? '#E2D4FF' : 'rgba(245,245,247,0.2)',
                            border: patient ? '1px solid rgba(130,99,177,0.45)' : '1px solid rgba(45,40,62,0.5)',
                            cursor: patient ? 'pointer' : 'not-allowed',
                            boxShadow: patient ? '0 0 14px rgba(130,99,177,0.18)' : 'none',
                        }}
                        onMouseEnter={e => patient && (e.currentTarget.style.boxShadow = '0 0 24px rgba(130,99,177,0.35)')}
                        onMouseLeave={e => patient && (e.currentTarget.style.boxShadow = '0 0 14px rgba(130,99,177,0.18)')}>
                        <CalendarPlus size={14} />
                        Programar Cita
                    </button>
                </div>

                {/* ── Two-column grid ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                    {/* ══════════ LEFT COLUMN ══════════ */}
                    <div className="flex flex-col gap-6">

                        {/* ── Datos del Paciente ── */}
                        <div className="p-5" style={cardStyle}>
                            <SectionHeader
                                icon={User}
                                title="Datos del Paciente"
                                action={patient && (
                                    <div className="flex items-center gap-2">
                                        {editingPatient ? (
                                            <>
                                                <button
                                                    onClick={handleSavePatient}
                                                    disabled={savingPatient}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                                    style={{ background: 'rgba(161,227,216,0.18)', color: '#A1E3D8', border: '1px solid rgba(161,227,216,0.35)' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(161,227,216,0.3)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(161,227,216,0.18)'}>
                                                    {savingPatient
                                                        ? <Loader2 size={11} className="animate-spin" />
                                                        : <Save size={11} />}
                                                    Guardar
                                                </button>
                                                <button
                                                    onClick={() => setEditingPatient(false)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                                    style={{ background: 'rgba(245,245,247,0.07)', color: 'rgba(245,245,247,0.4)', border: '1px solid rgba(245,245,247,0.1)' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,245,247,0.14)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.07)'}>
                                                    <X size={11} /> Cancelar
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => { setEditPhone(patient.telefono || ''); setEditingPatient(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                                style={{ background: 'rgba(130,99,177,0.15)', color: '#C4AFED', border: '1px solid rgba(130,99,177,0.3)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(130,99,177,0.28)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(130,99,177,0.15)'}>
                                                <Edit3 size={11} /> Editar
                                            </button>
                                        )}
                                    </div>
                                )}
                            />
                            {patient ? (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-1">
                                    <InfoField icon={User} label="Nombre" value={patient.nombre} />
                                    <InfoField icon={Hash} label="Cédula" value={patient.documento} />
                                    <InfoField icon={Clock} label="Edad" value={patient.edad ? `${patient.edad} años` : '—'} />
                                    {editingPatient ? (
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                                                style={{ color: 'rgba(161,227,216,0.5)' }}>Teléfono / Celular</p>
                                            <div className="flex items-center gap-2">
                                                <Phone size={11} style={{ color: '#A1E3D8', opacity: 0.6, flexShrink: 0 }} />
                                                <input
                                                    type="tel"
                                                    value={editPhone}
                                                    onChange={e => { setEditPhone(e.target.value); setEditPhoneErr(''); }}
                                                    placeholder="Ej: 3001234567"
                                                    className="flex-1 px-2 py-1.5 rounded-lg text-sm outline-none transition-all"
                                                    style={{
                                                        background: 'rgba(15,14,19,0.8)',
                                                        border: editPhoneErr ? '1px solid rgba(177,64,64,0.7)' : '1px solid rgba(130,99,177,0.4)',
                                                        color: 'var(--text-primary)',
                                                    }}
                                                />
                                            </div>
                                            {editPhoneErr && (
                                                <p className="text-[10px] mt-1" style={{ color: '#F9A8A8' }}>⚠️ {editPhoneErr}</p>
                                            )}
                                        </div>
                                    ) : (
                                        <InfoField icon={Phone} label="Teléfono / Celular" value={patient.telefono} />
                                    )}
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

                        {/* ── Exámenes Programados ── */}
                        <div className="p-5 flex flex-col" style={{ ...cardStyle, minHeight: '420px' }}>
                            <SectionHeader
                                icon={Clock}
                                title="Exámenes Programados"
                                count={programadosFiltrados.length}
                                action={patient && (
                                    <button
                                        onClick={() => setShowHistorial(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                        style={{ background: 'rgba(130,99,177,0.15)', color: '#C4AFED', border: '1px solid rgba(130,99,177,0.3)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(130,99,177,0.28)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(130,99,177,0.15)'}>
                                        <History size={11} /> Historial
                                    </button>
                                )}
                            />
                            <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: '450px' }}>
                                {programadosFiltrados.length === 0
                                    ? <EmptyState message={patient ? 'No hay exámenes programados en este período' : 'Busca un paciente para ver sus exámenes'} />
                                    : programadosFiltrados.map(ex => (
                                        <ExamenProgramadoRow
                                            key={ex.id}
                                            examen={ex}
                                            onRemind={handleRemind}
                                            onEliminar={handleEliminar}
                                            sendingId={sendingId}
                                            eliminandoId={eliminandoId}
                                        />
                                    ))
                                }
                            </div>
                        </div>
                    </div>

                    {/* ══════════ RIGHT COLUMN ══════════ */}
                    <div className="flex flex-col gap-5">

                        {/* ── Exámenes Pendientes ── */}
                        <div className="p-5" style={cardStyle}>
                            <SectionHeader
                                icon={AlertCircle}
                                title="Exámenes Pendientes"
                                count={pendientes.length}
                            />
                            <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
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
                                count={realizadosFiltrados.length}
                            />
                            <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
                                {realizadosFiltrados.length === 0
                                    ? <EmptyState message={patient ? 'Sin exámenes realizados en este período' : 'Busca un paciente'} />
                                    : realizadosFiltrados.map(ex => (
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

export default CardiovascularPage;
