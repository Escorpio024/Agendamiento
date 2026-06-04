"use client";

import { useState, useCallback, useEffect } from 'react';
import {
    Search, Filter, Bell, Calendar, CheckCircle2,
    Clock, User, Phone, Building2, Hash, Stethoscope,
    FileText, ChevronRight, AlertCircle, Activity,
    HeartPulse, Loader2, ClipboardList, X, XCircle, AlertTriangle, RefreshCw, ShieldAlert, Download,
    Edit3, Save, Trash2, History, CalendarPlus, ChevronDown, Check, RotateCcw, CalendarCheck2
} from 'lucide-react';

// ─── Config ──────────────────────────────────────────────────────────────────
const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const API_BASE = `http://${SERVER_HOST}:3001`;

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

// ─── ReportModal ──────────────────────────────────────────────────────────────
function ReportModal({ patient, programados, pendientes, realizados, onClose }) {
    const now = new Date();
    const fechaInforme = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

    const citasPerdidas = programados.filter(ex => {
        if (!ex.fecha) return false;
        const d = new Date(ex.fecha.includes('T') ? ex.fecha : ex.fecha + 'T12:00:00');
        return d < now && diffMonths(ex.fecha) >= 1;
    });
    const citasFuturas = programados.filter(ex => {
        if (!ex.fecha) return false;
        const d = new Date(ex.fecha.includes('T') ? ex.fecha : ex.fecha + 'T12:00:00');
        return d >= now;
    });
    const exCorroborar = realizados.filter(ex => { const m = diffMonths(ex.fecha); return m !== null && m >= 1 && m < 3; });
    const exRenovar = realizados.filter(ex => { const m = diffMonths(ex.fecha); return m !== null && m >= 3; });
    const exVigentes = realizados.filter(ex => { const m = diffMonths(ex.fecha); return m !== null && m < 1; });

    const tieneProblemas = citasPerdidas.length > 0 || exRenovar.length > 0 || pendientes.length > 0;
    const tieneAlertas = exCorroborar.length > 0;
    const nivelAlerta = tieneProblemas ? 'crítico' : tieneAlertas ? 'atención' : 'normal';

    const colorAlerta = nivelAlerta === 'crítico' ? '#F9A8A8' : nivelAlerta === 'atención' ? '#FCD34D' : '#A1E3D8';
    const bgAlerta = nivelAlerta === 'crítico' ? 'rgba(177,64,64,0.12)' : nivelAlerta === 'atención' ? 'rgba(251,191,36,0.1)' : 'rgba(161,227,216,0.08)';
    const borderAlerta = nivelAlerta === 'crítico' ? 'rgba(177,64,64,0.35)' : nivelAlerta === 'atención' ? 'rgba(251,191,36,0.3)' : 'rgba(161,227,216,0.2)';

    const downloadPDF = () => {
        const alertaLabel = nivelAlerta === 'crítico' ? '⚠️ Estado Crítico — Se requieren acciones inmediatas'
            : nivelAlerta === 'atención' ? '🔶 Requiere Atención — Hay exámenes que deben verificarse'
                : '✅ Estado Normal — El proceso está al día';

        const renderItems = (items, badge) => items.map(ex => `
            <tr>
                <td>${ex.codigo || '—'}</td>
                <td>${ex.tipoExamen}</td>
                <td>${ex.fecha ? formatDate(ex.fecha) : 'Sin fecha'}</td>
                <td>${ex.doctor || '—'}</td>
                <td><span class="badge badge-${badge.toLowerCase().replace(' ', '-')}">${badge}</span></td>
            </tr>`).join('');

        const tableSection = (title, items, badge, nota) => items.length === 0 ? '' : `
            <section>
                <h3>${title}</h3>
                ${nota ? `<p class="nota">${nota}</p>` : ''}
                <table>
                    <thead><tr><th>Código</th><th>Examen</th><th>Fecha</th><th>Médico</th><th>Estado</th></tr></thead>
                    <tbody>${renderItems(items, badge)}</tbody>
                </table>
            </section>`;

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8" />
    <title>Informe Cardiovascular — ${patient?.nombre}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; padding: 32px; }
        header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #8263B1; padding-bottom: 16px; margin-bottom: 24px; }
        header .logo { display: flex; align-items: center; gap: 12px; }
        header .logo .icon { width: 48px; height: 48px; background: linear-gradient(135deg,#B14040,#8263B1); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; }
        header h1 { font-size: 18px; font-weight: 800; color: #1a1a2e; }
        header h1 span { color: #8263B1; }
        header .meta { text-align: right; }
        header .meta p { font-size: 11px; color: #666; margin-top: 2px; }
        header .meta strong { font-size: 13px; color: #1a1a2e; }
        .paciente-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; background: #f7f5ff; border: 1px solid #d4c8f0; border-radius: 10px; padding: 14px 18px; margin-bottom: 22px; }
        .paciente-grid .field label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #8263B1; font-weight: 700; display: block; margin-bottom: 2px; }
        .paciente-grid .field span { font-size: 13px; font-weight: 600; color: #1a1a2e; }
        .alerta-banner { border-radius: 10px; padding: 12px 16px; margin-bottom: 22px; font-weight: 700; font-size: 13px; }
        .alerta-critico  { background: #fff0f0; border: 1.5px solid #e57373; color: #b71c1c; }
        .alerta-atencion { background: #fffde7; border: 1.5px solid #f9a825; color: #e65100; }
        .alerta-normal   { background: #f0faf8; border: 1.5px solid #4db6ac; color: #00695c; }
        section { margin-bottom: 20px; }
        h3 { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: #1a1a2e; border-left: 4px solid #8263B1; padding-left: 10px; margin-bottom: 8px; }
        .nota { font-size: 11px; color: #555; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        thead { background: #f3f0ff; }
        th { padding: 7px 10px; text-align: left; font-weight: 700; color: #4a3b72; border-bottom: 2px solid #c8b9f0; }
        td { padding: 6px 10px; border-bottom: 1px solid #e8e3f5; }
        tr:last-child td { border-bottom: none; }
        .badge { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; padding: 2px 8px; border-radius: 4px; }
        .badge-cita-perdida, .badge-renovar, .badge-pendiente { background: #fde8e8; color: #b71c1c; }
        .badge-corroborar { background: #fff8e1; color: #e65100; }
        .badge-vigente { background: #e0f7f4; color: #00695c; }
        .badge-programada { background: #ede7ff; color: #4a148c; }
        footer { margin-top: 30px; padding-top: 14px; border-top: 2px solid #e8e3f5; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
        @media print { body { padding: 18px; } }
    </style>
</head>
<body>
    <header>
        <div class="logo">
            <div class="icon">♥</div>
            <div>
                <div style="font-size:10px;color:#8263B1;font-weight:700;text-transform:uppercase;letter-spacing:.15em;">Informe Clínico</div>
                <h1>Riesgo <span>Cardiovascular</span></h1>
            </div>
        </div>
        <div class="meta">
            <p>Fecha del informe</p>
            <strong>${fechaInforme}</strong>
            <p style="margin-top:6px;">Generado por Auro Bot</p>
        </div>
    </header>
    <div class="paciente-grid">
        <div class="field"><label>Nombre</label><span>${patient?.nombre || '—'}</span></div>
        <div class="field"><label>Cédula</label><span>${patient?.documento || '—'}</span></div>
        <div class="field"><label>Edad</label><span>${patient?.edad ? patient.edad + ' años' : '—'}</span></div>
        <div class="field"><label>Teléfono</label><span>${patient?.telefono || '—'}</span></div>
        <div class="field" style="grid-column:span 2"><label>Entidad</label><span>${patient?.entidad || '—'}</span></div>
    </div>
    <div class="alerta-banner alerta-${nivelAlerta === 'crítico' ? 'critico' : nivelAlerta === 'atención' ? 'atencion' : 'normal'}">
        ${alertaLabel}
    </div>
    ${tableSection('Citas Programadas Perdidas', citasPerdidas, 'CITA PERDIDA', 'Los siguientes exámenes tenían fecha asignada pero no fueron atendidos.')}
    ${tableSection('Exámenes que Requieren Renovación', exRenovar, 'RENOVAR', 'Superan los 3 meses de antigüedad.')}
    ${tableSection('Exámenes para Corroborar', exCorroborar, 'CORROBORAR', 'Superan 1 mes de antigüedad.')}
    ${pendientes.length > 0 ? `<section><h3>Exámenes Pendientes</h3><table><thead><tr><th>Código</th><th>Examen</th><th>Estado</th></tr></thead><tbody>${pendientes.map(ex => `<tr><td>${ex.codigo || '—'}</td><td>${ex.tipoExamen}</td><td><span class="badge badge-pendiente">PENDIENTE</span></td></tr>`).join('')}</tbody></table></section>` : ''}
    ${tableSection('Exámenes Realizados Vigentes', exVigentes, 'VIGENTE', '')}
    ${tableSection('Citas Próximas Programadas', citasFuturas, 'PROGRAMADA', '')}
    <footer>
        <span>Auro Bot · Módulo Cardiovascular</span>
        <span>${fechaInforme} · Cédula: ${patient?.documento}</span>
    </footer>
    <script>window.onload = function(){ window.print(); setTimeout(()=>window.close(), 800); }</script>
</body></html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (win) { win.document.write(html); win.document.close(); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,7,12,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
                style={{ background: 'rgba(20,18,28,0.98)', border: '1px solid rgba(130,99,177,0.3)' }}>
                <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b"
                    style={{ background: 'rgba(20,18,28,0.98)', borderColor: 'rgba(130,99,177,0.2)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #B14040 0%, #8263B1 100%)' }}>
                            <ClipboardList size={17} color="#F5F5F7" />
                        </div>
                        <div>
                            <p className="text-[10px] tracking-widest uppercase font-semibold"
                                style={{ color: 'rgba(196,175,237,0.6)' }}>Informe Clínico</p>
                            <h2 className="text-sm font-bold" style={{ color: '#F5F5F7' }}>
                                Riesgo Cardiovascular · {patient?.nombre}
                            </h2>
                        </div>
                    </div>
                    <button id="btn-close-report" onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                        style={{ background: 'rgba(245,245,247,0.06)', color: 'rgba(245,245,247,0.5)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.06)'}>
                        <X size={15} />
                    </button>
                </div>
                <div className="p-6 flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(161,227,216,0.5)' }}>Fecha del informe</span>
                            <span className="text-xs font-medium" style={{ color: 'rgba(245,245,247,0.7)' }}>{fechaInforme}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 text-right">
                            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(161,227,216,0.5)' }}>Cédula</span>
                            <span className="text-xs font-mono font-bold" style={{ color: '#C4AFED' }}>{patient?.documento}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                        style={{ background: bgAlerta, border: `1px solid ${borderAlerta}` }}>
                        <ShieldAlert size={18} style={{ color: colorAlerta, flexShrink: 0 }} />
                        <div>
                            <p className="text-xs font-bold" style={{ color: colorAlerta }}>
                                {nivelAlerta === 'crítico' && '⚠️ Estado Crítico — Se requieren acciones inmediatas'}
                                {nivelAlerta === 'atención' && '🔶 Requiere Atención — Hay exámenes que deben verificarse'}
                                {nivelAlerta === 'normal' && '✅ Estado Normal — El proceso está al día'}
                            </p>
                            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(245,245,247,0.5)' }}>
                                Generado automáticamente con base en los registros del sistema
                            </p>
                        </div>
                    </div>
                    {citasPerdidas.length > 0 && (
                        <ReportSection icon={<XCircle size={14} color="#F9A8A8" />} title="Citas Programadas Perdidas" color="rgba(177,64,64,0.15)" border="rgba(177,64,64,0.3)" titleColor="#F9A8A8">
                            <p className="text-xs mb-3" style={{ color: 'rgba(237,175,175,0.7)' }}>Han pasado más de 30 días desde la fecha programada.</p>
                            {citasPerdidas.map(ex => <ReportItem key={ex.id} codigo={ex.codigo} nombre={ex.tipoExamen} fecha={ex.fecha} badge="CITA PERDIDA" badgeColor="rgba(177,64,64,0.3)" badgeText="#F9A8A8" nota={`Han transcurrido ${diffMonths(ex.fecha)} mes(es).`} />)}
                        </ReportSection>
                    )}
                    {exRenovar.length > 0 && (
                        <ReportSection icon={<RefreshCw size={14} color="#F9A8A8" />} title="Requieren Renovación" color="rgba(177,64,64,0.1)" border="rgba(177,64,64,0.25)" titleColor="#F9A8A8">
                            <p className="text-xs mb-3" style={{ color: 'rgba(237,175,175,0.7)' }}>Superan los 3 meses de antigüedad.</p>
                            {exRenovar.map(ex => <ReportItem key={ex.id} codigo={ex.codigo} nombre={ex.tipoExamen} fecha={ex.fecha} badge="RENOVAR" badgeColor="rgba(177,64,64,0.25)" badgeText="#F9A8A8" nota={`Realizado hace ${diffMonths(ex.fecha)} meses.`} />)}
                        </ReportSection>
                    )}
                    {exCorroborar.length > 0 && (
                        <ReportSection icon={<AlertTriangle size={14} color="#FCD34D" />} title="Para Corroborar" color="rgba(251,191,36,0.08)" border="rgba(251,191,36,0.25)" titleColor="#FCD34D">
                            <p className="text-xs mb-3" style={{ color: 'rgba(252,211,77,0.7)' }}>Superan 1 mes de antigüedad.</p>
                            {exCorroborar.map(ex => <ReportItem key={ex.id} codigo={ex.codigo} nombre={ex.tipoExamen} fecha={ex.fecha} badge="CORROBORAR" badgeColor="rgba(251,191,36,0.18)" badgeText="#FCD34D" nota={`Realizado hace ${diffMonths(ex.fecha)} mes(es).`} />)}
                        </ReportSection>
                    )}
                    {pendientes.length > 0 && (
                        <ReportSection icon={<AlertCircle size={14} color="#F9A8A8" />} title="Exámenes Pendientes" color="rgba(177,64,64,0.1)" border="rgba(177,64,64,0.25)" titleColor="#F9A8A8">
                            <p className="text-xs mb-3" style={{ color: 'rgba(237,175,175,0.7)' }}>{pendientes.length} examen(es) sin fecha asignada.</p>
                            {pendientes.map(ex => <ReportItem key={ex.id} codigo={ex.codigo} nombre={ex.tipoExamen} badge="PENDIENTE" badgeColor="rgba(177,64,64,0.2)" badgeText="#EDAFAF" nota="Sin fecha asignada." />)}
                        </ReportSection>
                    )}
                    {exVigentes.length > 0 && (
                        <ReportSection icon={<CheckCircle2 size={14} color="#A1E3D8" />} title="Vigentes" color="rgba(161,227,216,0.05)" border="rgba(161,227,216,0.15)" titleColor="#A1E3D8">
                            {exVigentes.map(ex => <ReportItem key={ex.id} codigo={ex.codigo} nombre={ex.tipoExamen} fecha={ex.fecha} badge="VIGENTE" badgeColor="rgba(161,227,216,0.15)" badgeText="#A1E3D8" nota="Dentro del período de vigencia." />)}
                        </ReportSection>
                    )}
                    {citasFuturas.length > 0 && (
                        <ReportSection icon={<Calendar size={14} color="#C4AFED" />} title="Citas Próximas" color="rgba(130,99,177,0.08)" border="rgba(130,99,177,0.2)" titleColor="#C4AFED">
                            {citasFuturas.map(ex => <ReportItem key={ex.id} codigo={ex.codigo} nombre={ex.tipoExamen} fecha={ex.fecha} badge="PROGRAMADA" badgeColor="rgba(130,99,177,0.2)" badgeText="#C4AFED" nota="Cita futura activa." />)}
                        </ReportSection>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'rgba(130,99,177,0.15)' }}>
                        <span className="text-[10px]" style={{ color: 'rgba(245,245,247,0.2)' }}>Auro Bot · Módulo Cardiovascular · {fechaInforme}</span>
                        <div className="flex items-center gap-2">
                            <button id="btn-download-pdf" onClick={downloadPDF}
                                className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                                style={{ background: 'linear-gradient(135deg,rgba(130,99,177,0.4),rgba(177,64,64,0.4))', color: '#E2D4FF', border: '1px solid rgba(130,99,177,0.5)' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg,rgba(130,99,177,0.7),rgba(177,64,64,0.7))'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg,rgba(130,99,177,0.4),rgba(177,64,64,0.4))'; }}>
                                <Download size={12} /> Descargar PDF
                            </button>
                            <button id="btn-close-report-footer" onClick={onClose}
                                className="text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                                style={{ background: 'rgba(245,245,247,0.07)', color: 'rgba(245,245,247,0.45)', border: '1px solid rgba(245,245,247,0.1)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,245,247,0.12)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.07)'}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ReportSection({ icon, title, color, border, titleColor, children }) {
    return (
        <div className="rounded-xl p-4" style={{ background: color, border: `1px solid ${border}` }}>
            <div className="flex items-center gap-2 mb-3">
                {icon}
                <span className="text-xs font-bold tracking-wide uppercase" style={{ color: titleColor }}>{title}</span>
            </div>
            {children}
        </div>
    );
}

function ReportItem({ codigo, nombre, fecha, badge, badgeColor, badgeText, nota }) {
    return (
        <div className="flex items-start justify-between gap-3 py-2 border-t first:border-t-0"
            style={{ borderColor: 'rgba(245,245,247,0.05)' }}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    {codigo && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(245,245,247,0.07)', color: 'rgba(245,245,247,0.4)' }}>
                            {codigo}
                        </span>
                    )}
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{nombre}</span>
                </div>
                {fecha && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(245,245,247,0.35)' }}>{formatDate(fecha)}</p>}
                {nota && <p className="text-[11px] mt-0.5 italic" style={{ color: 'rgba(245,245,247,0.4)' }}>{nota}</p>}
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md flex-shrink-0 mt-0.5"
                style={{ background: badgeColor, color: badgeText }}>
                {badge}
            </span>
        </div>
    );
}

// ─── InfoField editable ───────────────────────────────────────────────────────
function InfoFieldEditable({ icon: Icon, label, value, editValue, editing, onChange, full }) {
    return (
        <div className={full ? 'col-span-2' : ''}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                style={{ color: 'rgba(161,227,216,0.5)' }}>
                {label}
            </p>
            {editing ? (
                <input
                    type="text"
                    value={editValue}
                    onChange={e => onChange(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg text-sm outline-none transition-all"
                    style={{
                        background: 'rgba(15,14,19,0.8)',
                        border: '1px solid rgba(130,99,177,0.4)',
                        color: 'var(--text-primary)',
                    }}
                />
            ) : (
                <div className="flex items-center gap-1.5">
                    <Icon size={11} style={{ color: '#A1E3D8', opacity: 0.6, flexShrink: 0 }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {value || '—'}
                    </span>
                </div>
            )}
        </div>
    );
}

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

// ─── ControlesViewerModal ──────────────────────────────────────────────────
function ControlesViewerModal({ onClose }) {
    const [controles, setControles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtroFecha, setFiltroFecha] = useState('TODOS');
    const [filtroEstado, setFiltroEstado] = useState('TODOS');

    const loadControles = useCallback(() => {
        setLoading(true);
        fetch(`${API_BASE}/api/cardiovascular/controles`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setControles(data);
                } else {
                    console.error('Error del servidor:', data);
                    setControles([]);
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => { loadControles(); }, [loadControles]);

    const handleEliminar = async (id) => {
        if (!confirm('¿Seguro que deseas cancelar y eliminar este control programado?')) return;
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/controles/${id}`, { method: 'DELETE' });
            if (res.ok) {
                loadControles();
            } else {
                alert('Error al eliminar');
            }
        } catch (e) {
            alert('Error de red');
        }
    };

    const getEstadoBadge = (estado) => {
        if (estado === 'BOOKED_AND_REMINDED') return { text: 'AGENDADO Y AVISADO', bg: 'rgba(161,227,216,0.15)', color: '#A1E3D8' };
        if (estado === 'BOOKED')              return { text: 'CITA AGENDADA', bg: 'rgba(74,222,128,0.15)', color: '#86EFAC' };
        if (estado === 'BOOKING_FAILED_NO_SLOT')  return { text: 'SIN CUPO', bg: 'rgba(251,146,60,0.15)', color: '#FED7AA' };
        if (estado === 'BOOKING_FAILED_XENCO')    return { text: 'ERROR XENCO', bg: 'rgba(177,64,64,0.15)', color: '#F9A8A8' };
        if (estado === 'FAILED_NO_PHONE')         return { text: 'SIN TELÉFONO', bg: 'rgba(177,64,64,0.15)', color: '#F9A8A8' };
        if (estado === 'FAILED')                  return { text: 'FALLIDO', bg: 'rgba(177,64,64,0.15)', color: '#F9A8A8' };
        if (estado === 'REMINDED_NO_BOOKING')     return { text: 'AVISADO SIN CITA', bg: 'rgba(251,191,36,0.15)', color: '#FCD34D' };
        return { text: 'PENDIENTE', bg: 'rgba(251,191,36,0.15)', color: '#FCD34D' };
    };

    const [procesando, setProcesando] = useState(false);
    const [procesMsg, setProcesMsg] = useState('');

    // ─── Filtros calculados ───────────────────────────────────────────────
    const fechasUnicas = [...new Set(controles.map(c => c.fechaCitaOriginal))].sort().reverse();

    const estadosResumen = {
        TOTAL: controles.length,
        PENDIENTE: controles.filter(c => !['BOOKED','BOOKED_AND_REMINDED','BOOKING_FAILED_NO_SLOT','BOOKING_FAILED_XENCO','FAILED_NO_PHONE','FAILED','REMINDED_NO_BOOKING'].includes(c.estado)).length,
        AGENDADO: controles.filter(c => c.estado === 'BOOKED' || c.estado === 'BOOKED_AND_REMINDED').length,
        SIN_CUPO: controles.filter(c => c.estado === 'BOOKING_FAILED_NO_SLOT').length,
        ERROR: controles.filter(c => ['BOOKING_FAILED_XENCO','FAILED_NO_PHONE','FAILED'].includes(c.estado)).length,
    };

    const controlesFiltrados = controles.filter(c => {
        const pasaFecha = filtroFecha === 'TODOS' || c.fechaCitaOriginal === filtroFecha;
        const esPendiente = !['BOOKED','BOOKED_AND_REMINDED','BOOKING_FAILED_NO_SLOT','BOOKING_FAILED_XENCO','FAILED_NO_PHONE','FAILED','REMINDED_NO_BOOKING'].includes(c.estado);
        let pasaEstado = true;
        if (filtroEstado === 'PENDIENTE') pasaEstado = esPendiente;
        else if (filtroEstado === 'AGENDADO') pasaEstado = c.estado === 'BOOKED' || c.estado === 'BOOKED_AND_REMINDED';
        else if (filtroEstado === 'SIN_CUPO') pasaEstado = c.estado === 'BOOKING_FAILED_NO_SLOT';
        else if (filtroEstado === 'ERROR') pasaEstado = ['BOOKING_FAILED_XENCO','FAILED_NO_PHONE','FAILED'].includes(c.estado);
        return pasaFecha && pasaEstado;
    });

    const handleProcesarPendientes = async () => {
        if (!confirm('\u00bfDeseas iniciar el agendamiento automático para todos los controles PENDIENTES ahora mismo?\n\nCada paciente recibirá un WhatsApp confirmando su cita.')) return;
        setProcesando(true);
        setProcesMsg('');
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/controles/procesar-pendientes`, { method: 'POST' });
            const data = await res.json();
            setProcesMsg(data.message || 'Procesando...');
            // Recargar lista después de 5 segundos
            setTimeout(() => { loadControles(); setProcesando(false); }, 8000);
        } catch (e) {
            setProcesMsg('Error de red. Intenta de nuevo.');
            setProcesando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,7,12,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl flex flex-col shadow-2xl"
                style={{ background: 'rgba(20,18,28,0.98)', border: '1px solid rgba(130,99,177,0.3)' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
                    style={{ borderColor: 'rgba(130,99,177,0.2)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, rgba(130,99,177,0.4) 0%, rgba(90,68,144,0.4) 100%)' }}>
                            <CalendarCheck2 size={20} color="#C4AFED" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold" style={{ color: '#F5F5F7' }}>Visor de Controles</h2>
                            <p className="text-xs" style={{ color: 'rgba(196,175,237,0.7)' }}>
                                {loading ? 'Cargando...' : `${controlesFiltrados.length} de ${controles.length} pacientes`}
                            </p>
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

                {/* Barra de acciones */}
                <div className="flex items-center gap-3 px-6 py-3 flex-shrink-0" style={{ background: 'rgba(130,99,177,0.06)', borderBottom: '1px solid rgba(130,99,177,0.1)' }}>
                    <button
                        onClick={handleProcesarPendientes}
                        disabled={procesando}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                        style={{ background: procesando ? 'rgba(130,99,177,0.2)' : 'rgba(130,99,177,0.35)', color: '#C4AFED', border: '1px solid rgba(130,99,177,0.4)' }}>
                        {procesando ? <Loader2 size={13} className="animate-spin" /> : <CalendarCheck2 size={13} />}
                        {procesando ? 'Procesando y enviando WhatsApp...' : '📲 Agendar Pendientes y Avisar Ahora'}
                    </button>
                    {procesMsg && (
                        <span className="text-xs" style={{ color: '#A1E3D8' }}>✔ {procesMsg}</span>
                    )}
                </div>

                {/* ── Resumen de estados ── */}
                <div className="flex items-center gap-2 px-6 py-2 flex-shrink-0 flex-wrap" style={{ background: 'rgba(20,18,28,0.8)', borderBottom: '1px solid rgba(130,99,177,0.1)' }}>
                    {[
                        { key: 'TODOS',    label: 'Todos',     count: estadosResumen.TOTAL,    bg: 'rgba(130,99,177,0.2)',   color: '#C4AFED' },
                        { key: 'PENDIENTE',label: 'Pendientes',count: estadosResumen.PENDIENTE, bg: 'rgba(251,191,36,0.15)', color: '#FCD34D' },
                        { key: 'AGENDADO', label: 'Agendados', count: estadosResumen.AGENDADO,  bg: 'rgba(74,222,128,0.15)', color: '#86EFAC' },
                        { key: 'SIN_CUPO', label: 'Sin cupo',  count: estadosResumen.SIN_CUPO,  bg: 'rgba(251,146,60,0.15)', color: '#FED7AA' },
                        { key: 'ERROR',    label: 'Error',     count: estadosResumen.ERROR,     bg: 'rgba(177,64,64,0.15)',  color: '#F9A8A8' },
                    ].map(btn => (
                        <button key={btn.key}
                            onClick={() => setFiltroEstado(btn.key)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
                            style={{
                                background: filtroEstado === btn.key ? btn.bg : 'rgba(255,255,255,0.04)',
                                color: filtroEstado === btn.key ? btn.color : 'rgba(245,245,247,0.4)',
                                border: `1px solid ${filtroEstado === btn.key ? btn.color.replace(')', ',0.4)').replace('rgb', 'rgba') : 'rgba(255,255,255,0.07)'}`,
                                transform: filtroEstado === btn.key ? 'scale(1.05)' : 'scale(1)'
                            }}>
                            <span style={{ background: btn.bg, color: btn.color, borderRadius: '50%', width: 16, height: 16, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize: 10, fontWeight: 800 }}>{btn.count}</span>
                            {btn.label}
                        </button>
                    ))}

                    {/* Separador */}
                    <div style={{ width: 1, height: 20, background: 'rgba(130,99,177,0.2)', margin: '0 4px' }} />

                    {/* Filtro por fecha */}
                    <div className="flex items-center gap-1.5">
                        <Calendar size={12} style={{ color: 'rgba(196,175,237,0.5)' }} />
                        <select
                            value={filtroFecha}
                            onChange={e => setFiltroFecha(e.target.value)}
                            className="text-[11px] rounded-lg px-2 py-1 outline-none"
                            style={{ background: 'rgba(130,99,177,0.15)', color: '#C4AFED', border: '1px solid rgba(130,99,177,0.25)', cursor: 'pointer' }}>
                            <option value="TODOS">📅 Todos los días</option>
                            {fechasUnicas.map(f => (
                                <option key={f} value={f}>📅 {formatDate(f)}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={30} className="animate-spin text-[#8263B1]" />
                        </div>
                    ) : controles.length === 0 ? (
                        <EmptyState message="No hay controles a 3 meses programados actualmente." />
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {controlesFiltrados.length === 0 ? (
                                <div className="text-center py-12" style={{ color: 'rgba(196,175,237,0.4)' }}>
                                    <CalendarCheck2 size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                                    <p className="text-sm">No hay pacientes con este filtro</p>
                                </div>
                            ) : controlesFiltrados.map(c => {
                                const badge = getEstadoBadge(c.estado);
                                return (
                                    <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border transition-all"
                                        style={{ background: 'rgba(45,40,62,0.4)', borderColor: 'rgba(130,99,177,0.2)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(45,40,62,0.7)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(45,40,62,0.4)'}>
                                        <div className="flex-1 flex flex-col gap-2">
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="font-bold text-sm" style={{ color: '#F5F5F7' }}>{c.paciente}</span>
                                                <span className="text-xs font-mono flex items-center gap-1" style={{ color: '#C4AFED', background: 'rgba(130,99,177,0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                                                    CC: {c.cedula}
                                                </span>
                                                <span className="text-xs font-mono flex items-center gap-1" style={{ color: c.telefono === 'SIN TELÉFONO' ? '#F9A8A8' : '#A1E3D8', background: c.telefono === 'SIN TELÉFONO' ? 'rgba(177,64,64,0.15)' : 'rgba(161,227,216,0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                                                    <Phone size={10} /> {c.telefono}
                                                </span>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: badge.bg, color: badge.color }}>
                                                    {badge.text}
                                                </span>
                                                {c.canceladaEnXenco && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#FCA5A5', border: '1px solid rgba(239, 68, 68, 0.5)' }}>
                                                        CANCELADA EN XENCO
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-6 mt-1">
                                                <div className="flex items-center gap-1.5">
                                                    <History size={13} style={{ color: 'rgba(245,245,247,0.4)' }} />
                                                    <span className="text-xs" style={{ color: 'rgba(245,245,247,0.6)' }}>
                                                        Original: {formatDate(c.fechaCitaOriginal)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={13} style={{ color: '#A1E3D8' }} />
                                                    <span className="text-xs font-semibold" style={{ color: '#A1E3D8' }}>
                                                        Cita control: {formatDate(c.fechaControl)}{c.citaHora ? ` — ${c.citaHora}` : ''}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Bell size={13} style={{ color: 'rgba(245,245,247,0.4)' }} />
                                                    <span className="text-xs" style={{ color: 'rgba(245,245,247,0.6)' }}>
                                                        Recordatorio laboratorios: {formatDate(c.fechaRecordatorio)}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* EPS y código */}
                                            <div className="flex items-center gap-2 mt-1.5">
                                                {c.epsInfo && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: c.epsInfo.includes('NUEVA EPS') ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)', color: c.epsInfo.includes('NUEVA EPS') ? '#93C5FD' : '#D8B4FE' }}>
                                                        🏥 {c.epsInfo}
                                                    </span>
                                                )}
                                                {c.articuloCita && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(130,99,177,0.15)', color: '#C4AFED' }}>
                                                        {c.articuloCita}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0 ml-4">
                                            <button onClick={() => handleEliminar(c.id)}
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                                                style={{ background: 'rgba(177,64,64,0.15)', color: '#F9A8A8', border: '1px solid rgba(177,64,64,0.3)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.25)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(177,64,64,0.15)'}>
                                                <Trash2 size={13} />
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
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
    const [dateFilter, setDateFilter] = useState('all');
    const [showReport, setShowReport] = useState(false);
    const [loading, setLoading] = useState(false);
    const [patient, setPatient] = useState(MOCK_PATIENT);
    const [programados, setProgramados] = useState(MOCK_PROGRAMADOS);
    const [pendientes, setPendientes] = useState(MOCK_PENDIENTES);
    const [realizados, setRealizados] = useState(MOCK_REALIZADOS);
    const [sendingId, setSendingId] = useState(null);
    const [agendandoId, setAgendandoId] = useState(null);
    const [toast, setToast] = useState(null);

    // ── Edición de paciente ───────────────────────────────────────────────────
    const [editingPatient, setEditingPatient] = useState(false);
    const [editPhone, setEditPhone] = useState('');
    const [editPhoneErr, setEditPhoneErr] = useState('');
    const [savingPatient, setSavingPatient] = useState(false);

    // ── Eliminación de programado ─────────────────────────────────────────────
    const [eliminandoExamen, setEliminandoExamen] = useState(null); // examen en proceso
    const [eliminandoId, setEliminandoId] = useState(null);

    // ── Historial ─────────────────────────────────────────────────────────────
    const [showHistorial, setShowHistorial] = useState(false);

    // ── Programar cita ────────────────────────────────────────────────────────
    const [showProgramarCita, setShowProgramarCita] = useState(false);
    const [showControlesViewer, setShowControlesViewer] = useState(false);

    // ── Filtro por fecha ──────────────────────────────────────────────────────
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

    // ── Guardar edición del paciente ──────────────────────────────────────────
    const handleSavePatient = async () => {
        if (!patient) return;
        // ── Validar formato teléfono antes de enviar ──
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

    // ── Recordatorio WhatsApp ─────────────────────────────────────────────────
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

    // ── Eliminar programación ─────────────────────────────────────────────────
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
