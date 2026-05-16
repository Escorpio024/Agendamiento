"use client";

import { useState, useCallback } from 'react';
import {
    Search, Filter, Bell, Calendar, CheckCircle2,
    Clock, User, Phone, Building2, Hash, Stethoscope,
    FileText, ChevronRight, AlertCircle, Activity,
    HeartPulse, Loader2, ClipboardList, X, XCircle, AlertTriangle, RefreshCw, ShieldAlert, Download
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
        // El string llega como "YYYY-MM-DD" (ej. 2026-05-04).
        // Al agregar 'T12:00:00', evitamos que la conversión a la zona horaria local 
        // (UTC-5 en Colombia) reste horas y lo empuje al día anterior.
        const d = new Date(str.includes('T') ? str : str + 'T12:00:00');
        return d.toLocaleDateString('es-CO', {
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
            <button
                onClick={() => onRemind(examen.id, examen.tipoExamen)}
                disabled={isSending}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ml-3 flex-shrink-0"
                style={{
                    background: isSending ? 'rgba(130,99,177,0.15)' : 'rgba(130,99,177,0.22)',
                    color: '#C4AFED',
                    border: '1px solid rgba(130,99,177,0.4)',
                }}
            >
                {isSending
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Bell size={13} />}
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
                {isAgendando
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Calendar size={13} />}
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

// ─── Helpers de análisis ─────────────────────────────────────────────────────
function diffMonths(fechaStr) {
    if (!fechaStr) return null;
    const d = new Date(fechaStr.includes('T') ? fechaStr : fechaStr + 'T12:00:00');
    const now = new Date();
    return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
        + (now.getDate() < d.getDate() ? -1 : 0);
}

// ─── ReportModal ──────────────────────────────────────────────────────────────
function ReportModal({ patient, programados, pendientes, realizados, onClose }) {
    const now = new Date();
    const fechaInforme = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

    // Análisis de exámenes programados
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

    // Análisis de exámenes realizados
    const exCorroborar = realizados.filter(ex => {
        const m = diffMonths(ex.fecha);
        return m !== null && m >= 1 && m < 3;
    });
    const exRenovar = realizados.filter(ex => {
        const m = diffMonths(ex.fecha);
        return m !== null && m >= 3;
    });
    const exVigentes = realizados.filter(ex => {
        const m = diffMonths(ex.fecha);
        return m !== null && m < 1;
    });

    // Nivel de alerta global
    const tieneProblemas = citasPerdidas.length > 0 || exRenovar.length > 0 || pendientes.length > 0;
    const tieneAlertas  = exCorroborar.length > 0;
    const nivelAlerta = tieneProblemas ? 'crítico' : tieneAlertas ? 'atención' : 'normal';

    const colorAlerta = nivelAlerta === 'crítico' ? '#F9A8A8'
        : nivelAlerta === 'atención' ? '#FCD34D' : '#A1E3D8';
    const bgAlerta = nivelAlerta === 'crítico' ? 'rgba(177,64,64,0.12)'
        : nivelAlerta === 'atención' ? 'rgba(251,191,36,0.1)' : 'rgba(161,227,216,0.08)';
    const borderAlerta = nivelAlerta === 'crítico' ? 'rgba(177,64,64,0.35)'
        : nivelAlerta === 'atención' ? 'rgba(251,191,36,0.3)' : 'rgba(161,227,216,0.2)';

    // ── Generador de PDF (print en ventana nueva) ──────────────────────────────
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
                <td><span class="badge badge-${badge.toLowerCase().replace(' ','-')}">${badge}</span></td>
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

    ${tableSection('Citas Programadas Perdidas', citasPerdidas, 'CITA PERDIDA',
        'Los siguientes exámenes tenían fecha asignada pero no fueron atendidos. Han pasado más de 30 días desde la fecha programada.')}
    ${tableSection('Exámenes que Requieren Renovación', exRenovar, 'RENOVAR',
        'Superan los 3 meses de antigüedad. Se requiere su renovación antes de continuar el proceso cardiovascular.')}
    ${tableSection('Exámenes para Corroborar', exCorroborar, 'CORROBORAR',
        'Superan 1 mes de antigüedad. Se recomienda corroborar su vigencia con el médico tratante.')}
    ${pendientes.length > 0 ? `
    <section>
        <h3>Exámenes Pendientes — Proceso Incompleto</h3>
        <p class="nota">El paciente tiene <strong>${pendientes.length} examen(es) sin fecha asignada</strong>. Se requiere re-agendar el proceso de cita hasta cumplir con todos los exámenes dentro de los tiempos estipulados.</p>
        <table>
            <thead><tr><th>Código</th><th>Examen</th><th>Estado</th></tr></thead>
            <tbody>${pendientes.map(ex => `<tr><td>${ex.codigo||'—'}</td><td>${ex.tipoExamen}</td><td><span class="badge badge-pendiente">PENDIENTE</span></td></tr>`).join('')}</tbody>
        </table>
    </section>` : ''}
    ${tableSection('Exámenes Realizados Vigentes', exVigentes, 'VIGENTE', '')}
    ${tableSection('Citas Próximas Programadas', citasFuturas, 'PROGRAMADA', '')}

    <footer>
        <span>Auro Bot · Módulo Cardiovascular</span>
        <span>${fechaInforme} · Cédula: ${patient?.documento}</span>
    </footer>

    <script>window.onload = function(){ window.print(); setTimeout(()=>window.close(), 800); }</script>
</body></html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (win) {
            win.document.write(html);
            win.document.close();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,7,12,0.85)', backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}>

            <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
                style={{ background: 'rgba(20,18,28,0.98)', border: '1px solid rgba(130,99,177,0.3)' }}>

                {/* Header del modal */}
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

                    {/* Fecha y datos del paciente */}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] uppercase tracking-widest font-semibold"
                                style={{ color: 'rgba(161,227,216,0.5)' }}>Fecha del informe</span>
                            <span className="text-xs font-medium" style={{ color: 'rgba(245,245,247,0.7)' }}>{fechaInforme}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 text-right">
                            <span className="text-[10px] uppercase tracking-widest font-semibold"
                                style={{ color: 'rgba(161,227,216,0.5)' }}>Cédula</span>
                            <span className="text-xs font-mono font-bold" style={{ color: '#C4AFED' }}>{patient?.documento}</span>
                        </div>
                    </div>

                    {/* Banner nivel de alerta global */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                        style={{ background: bgAlerta, border: `1px solid ${borderAlerta}` }}>
                        <ShieldAlert size={18} style={{ color: colorAlerta, flexShrink: 0 }} />
                        <div>
                            <p className="text-xs font-bold" style={{ color: colorAlerta }}>
                                {nivelAlerta === 'crítico' && '⚠️ Estado Crítico — Se requieren acciones inmediatas'}
                                {nivelAlerta === 'atención' && '🔶 Requiere Atención — Hay exámenes que deben verificarse'}
                                {nivelAlerta === 'normal'   && '✅ Estado Normal — El proceso está al día'}
                            </p>
                            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(245,245,247,0.5)' }}>
                                Generado automáticamente con base en los registros del sistema
                            </p>
                        </div>
                    </div>

                    {/* ── Sección: Citas perdidas ── */}
                    {citasPerdidas.length > 0 && (
                        <ReportSection
                            icon={<XCircle size={14} color="#F9A8A8" />}
                            title="Citas Programadas Perdidas"
                            color="rgba(177,64,64,0.15)"
                            border="rgba(177,64,64,0.3)"
                            titleColor="#F9A8A8"
                        >
                            <p className="text-xs mb-3" style={{ color: 'rgba(237,175,175,0.7)' }}>
                                Los siguientes exámenes tenían fecha asignada pero <strong>no fueron atendidos</strong>.
                                Se considera cita perdida cuando han pasado más de 30 días desde la fecha programada.
                            </p>
                            {citasPerdidas.map(ex => (
                                <ReportItem
                                    key={ex.id}
                                    codigo={ex.codigo}
                                    nombre={ex.tipoExamen}
                                    fecha={ex.fecha}
                                    badge="CITA PERDIDA"
                                    badgeColor="rgba(177,64,64,0.3)"
                                    badgeText="#F9A8A8"
                                    nota={`Han transcurrido ${diffMonths(ex.fecha)} mes(es) desde la fecha programada.`}
                                />
                            ))}
                        </ReportSection>
                    )}

                    {/* ── Sección: Exámenes a renovar ── */}
                    {exRenovar.length > 0 && (
                        <ReportSection
                            icon={<RefreshCw size={14} color="#F9A8A8" />}
                            title="Exámenes que Requieren Renovación"
                            color="rgba(177,64,64,0.1)"
                            border="rgba(177,64,64,0.25)"
                            titleColor="#F9A8A8"
                        >
                            <p className="text-xs mb-3" style={{ color: 'rgba(237,175,175,0.7)' }}>
                                Los siguientes exámenes realizados <strong>superan los 3 meses</strong> de antigüedad.
                                Se requiere su <strong>renovación</strong> antes de continuar con el proceso cardiovascular.
                            </p>
                            {exRenovar.map(ex => (
                                <ReportItem
                                    key={ex.id}
                                    codigo={ex.codigo}
                                    nombre={ex.tipoExamen}
                                    fecha={ex.fecha}
                                    badge="RENOVAR"
                                    badgeColor="rgba(177,64,64,0.25)"
                                    badgeText="#F9A8A8"
                                    nota={`Realizado hace ${diffMonths(ex.fecha)} meses — Vigencia vencida.`}
                                />
                            ))}
                        </ReportSection>
                    )}

                    {/* ── Sección: Exámenes a corroborar ── */}
                    {exCorroborar.length > 0 && (
                        <ReportSection
                            icon={<AlertTriangle size={14} color="#FCD34D" />}
                            title="Exámenes para Corroborar"
                            color="rgba(251,191,36,0.08)"
                            border="rgba(251,191,36,0.25)"
                            titleColor="#FCD34D"
                        >
                            <p className="text-xs mb-3" style={{ color: 'rgba(252,211,77,0.7)' }}>
                                Los siguientes exámenes <strong>superan 1 mes</strong> de antigüedad.
                                Se recomienda <strong>corroborar su vigencia</strong> con el médico tratante antes de continuar la cita.
                            </p>
                            {exCorroborar.map(ex => (
                                <ReportItem
                                    key={ex.id}
                                    codigo={ex.codigo}
                                    nombre={ex.tipoExamen}
                                    fecha={ex.fecha}
                                    badge="CORROBORAR"
                                    badgeColor="rgba(251,191,36,0.18)"
                                    badgeText="#FCD34D"
                                    nota={`Realizado hace ${diffMonths(ex.fecha)} mes(es) — Verificar vigencia.`}
                                />
                            ))}
                        </ReportSection>
                    )}

                    {/* ── Sección: Exámenes pendientes ── */}
                    {pendientes.length > 0 && (
                        <ReportSection
                            icon={<AlertCircle size={14} color="#F9A8A8" />}
                            title="Exámenes Pendientes — Proceso Incompleto"
                            color="rgba(177,64,64,0.1)"
                            border="rgba(177,64,64,0.25)"
                            titleColor="#F9A8A8"
                        >
                            <p className="text-xs mb-3" style={{ color: 'rgba(237,175,175,0.7)' }}>
                                El paciente tiene <strong>{pendientes.length} examen(es) sin fecha asignada</strong>.
                                Se requiere <strong>re-agendar el proceso de cita</strong> desde el inicio hasta
                                cumplir con todos los exámenes dentro de los tiempos estipulados.
                            </p>
                            {pendientes.map(ex => (
                                <ReportItem
                                    key={ex.id}
                                    codigo={ex.codigo}
                                    nombre={ex.tipoExamen}
                                    badge="PENDIENTE"
                                    badgeColor="rgba(177,64,64,0.2)"
                                    badgeText="#EDAFAF"
                                    nota="Sin fecha asignada — Re-agendar."
                                />
                            ))}
                        </ReportSection>
                    )}

                    {/* ── Sección: Exámenes vigentes ── */}
                    {exVigentes.length > 0 && (
                        <ReportSection
                            icon={<CheckCircle2 size={14} color="#A1E3D8" />}
                            title="Exámenes Realizados Vigentes"
                            color="rgba(161,227,216,0.05)"
                            border="rgba(161,227,216,0.15)"
                            titleColor="#A1E3D8"
                        >
                            {exVigentes.map(ex => (
                                <ReportItem
                                    key={ex.id}
                                    codigo={ex.codigo}
                                    nombre={ex.tipoExamen}
                                    fecha={ex.fecha}
                                    badge="VIGENTE"
                                    badgeColor="rgba(161,227,216,0.15)"
                                    badgeText="#A1E3D8"
                                    nota="Dentro del período de vigencia."
                                />
                            ))}
                        </ReportSection>
                    )}

                    {/* ── Citas futuras ── */}
                    {citasFuturas.length > 0 && (
                        <ReportSection
                            icon={<Calendar size={14} color="#C4AFED" />}
                            title="Citas Próximas Programadas"
                            color="rgba(130,99,177,0.08)"
                            border="rgba(130,99,177,0.2)"
                            titleColor="#C4AFED"
                        >
                            {citasFuturas.map(ex => (
                                <ReportItem
                                    key={ex.id}
                                    codigo={ex.codigo}
                                    nombre={ex.tipoExamen}
                                    fecha={ex.fecha}
                                    badge="PROGRAMADA"
                                    badgeColor="rgba(130,99,177,0.2)"
                                    badgeText="#C4AFED"
                                    nota="Cita futura activa."
                                />
                            ))}
                        </ReportSection>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t"
                        style={{ borderColor: 'rgba(130,99,177,0.15)' }}>
                        <span className="text-[10px]" style={{ color: 'rgba(245,245,247,0.2)' }}>
                            Auro Bot · Módulo Cardiovascular · {fechaInforme}
                        </span>
                        <div className="flex items-center gap-2">
                            {/* Botón Descargar PDF */}
                            <button id="btn-download-pdf"
                                onClick={downloadPDF}
                                className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                                style={{ background: 'linear-gradient(135deg,rgba(130,99,177,0.4),rgba(177,64,64,0.4))', color: '#E2D4FF', border: '1px solid rgba(130,99,177,0.5)' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg,rgba(130,99,177,0.7),rgba(177,64,64,0.7))'; e.currentTarget.style.boxShadow = '0 0 20px rgba(130,99,177,0.4)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg,rgba(130,99,177,0.4),rgba(177,64,64,0.4))'; e.currentTarget.style.boxShadow = 'none'; }}>
                                <Download size={12} />
                                Descargar PDF
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
                {fecha && (
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(245,245,247,0.35)' }}>
                        {formatDate(fecha)}
                    </p>
                )}
                {nota && (
                    <p className="text-[11px] mt-0.5 italic" style={{ color: 'rgba(245,245,247,0.4)' }}>{nota}</p>
                )}
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-md flex-shrink-0 mt-0.5"
                style={{ background: badgeColor, color: badgeText }}>
                {badge}
            </span>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CardiovascularPage() {
    const [searchId, setSearchId] = useState('');
    // 'all' | 'year' | 'month'
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

    // ── Filtro por fecha ──────────────────────────────────────────────────────
    const applyDateFilter = (list) => {
        if (dateFilter === 'all') return list;
        const now = new Date();
        return list.filter(ex => {
            if (!ex.fecha) return false;
            const d = new Date(ex.fecha.includes('T') ? ex.fecha : ex.fecha + 'T12:00:00');
            if (dateFilter === 'year')  return d.getFullYear() === now.getFullYear();
            if (dateFilter === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            return true;
        });
    };

    const programadosFiltrados = applyDateFilter(programados);
    const realizadosFiltrados  = applyDateFilter(realizados);

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

    const handleRemind = async (id, tipoExamen) => {
        setSendingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/cardiovascular/remind/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cedula: patient?.documento, examen: tipoExamen })
            });
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
        <div className="h-screen flex flex-col" style={{ background: 'var(--chat-bg)' }}>

            {/* ── Modal de Informe ── */}
            {showReport && patient && (
                <ReportModal
                    patient={patient}
                    programados={programados}
                    pendientes={pendientes}
                    realizados={realizados}
                    onClose={() => setShowReport(false)}
                />
            )}

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

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Activity size={14} style={{ color: 'rgba(245,245,247,0.2)' }} />
                        <span className="text-[11px]" style={{ color: 'rgba(245,245,247,0.2)' }}>
                            Auro Bot · Cardiovascular
                        </span>
                    </div>
                    {/* Botón Generar Informe */}
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

                    {/* ── Filtro de fechas ── */}
                    <div className="flex items-center gap-1 rounded-xl p-1"
                        style={{ background: 'rgba(15,14,19,0.8)', border: '1px solid var(--border)' }}>
                        {[
                            { key: 'all',   label: 'Mostrar todos' },
                            { key: 'year',  label: 'Este año' },
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
                                    }}
                                >
                                    <Calendar size={11} />
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Two-column grid ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                    {/* ══════════ LEFT COLUMN ══════════ */}
                    <div className="flex flex-col gap-6">

                        {/* ── Datos del Paciente ── */}
                        <div className="p-5" style={cardStyle}>
                            <SectionHeader icon={User} title="Datos del Paciente" />
                            {patient ? (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-1">
                                    <InfoField icon={User} label="Nombre" value={patient.nombre} />
                                    <InfoField icon={Hash} label="Cédula" value={patient.documento} />
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

                        {/* ── Exámenes Programados ── */}
                        <div className="p-5 flex flex-col" style={{ ...cardStyle, minHeight: '420px' }}>
                            <SectionHeader
                                icon={Clock}
                                title="Exámenes Programados"
                                count={programadosFiltrados.length}
                            />
                            <div className="flex-1 overflow-y-auto pr-1"
                                style={{ maxHeight: '450px' }}>
                                {programadosFiltrados.length === 0
                                    ? <EmptyState message={patient ? 'No hay exámenes programados en este período' : 'Busca un paciente para ver sus exámenes'} />
                                    : programadosFiltrados.map(ex => (
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
