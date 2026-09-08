"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Heart, ArrowRight, Activity, Bot, FileText, Loader2, CalendarCheck2 } from 'lucide-react';
import PieChart from '../components/PieChart';
import DetallesAgendamientoModal from '../components/DetallesAgendamientoModal';

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const API_BASE = `${PROTOCOL}//${SERVER_HOST}:3001`;

const mainModules = [
    {
        id: 'cardiovascular',
        title: 'Agendamiento',
        subtitle: 'Cardiovascular',
        description: 'Seguimiento especializado de pacientes.',
        icon: Heart,
        iconBg: 'linear-gradient(135deg, #B14040 0%, #8B1A1A 100%)',
        accentColor: '#F9A8A8',
        badgeColor: '#B14040',
        badgeBg: 'rgba(177,64,64,0.18)',
        badgeBorder: 'rgba(177,64,64,0.35)',
        badgeText: '#EDAFAF',
        tag: 'Pruebas',
        href: '/cardiovascular',
        features: ['Cardiología', 'Reportes'],
    },
    {
        id: 'agendamiento',
        title: 'Agendamiento',
        subtitle: 'General',
        description: 'Gestión de citas médicas y auditoría del bot.',
        icon: MessageCircle,
        iconBg: 'linear-gradient(135deg, #8263B1 0%, #5a4490 100%)',
        accentColor: '#A1E3D8',
        badgeColor: '#8263B1',
        badgeBg: 'rgba(130,99,177,0.18)',
        badgeBorder: 'rgba(130,99,177,0.35)',
        badgeText: '#C4AFED',
        tag: 'Activo',
        href: '/agendamiento',
        features: ['Auditoría', 'Citas'],
    }
];

export default function SelectorPage() {
    const router = useRouter();
    const [hoveredId, setHoveredId] = useState(null);
    
    // Estados para el Dashboard consolidado
    const [loadingData, setLoadingData] = useState(true);
    const [combinedData, setCombinedData] = useState([]);
    const [stats, setStats] = useState({ general: 0, cvd: 0, total: 0 });
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        const fetchMonthData = async () => {
            setLoadingData(true);
            try {
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();

                // 1. Fetch General Appointments
                const resGen = await fetch(`${API_BASE}/api/appointments`);
                const generalRaw = resGen.ok ? await resGen.json() : [];

                // 2. Fetch CVD Appointments (Controles)
                const resCvd = await fetch(`${API_BASE}/api/cardiovascular/controles`);
                const cvdRaw = resCvd.ok ? await resCvd.json() : [];

                const processed = [];
                let countGen = 0;
                let countCvd = 0;

                // Process General
                generalRaw.forEach(item => {
                    const d = item.appointmentDate ? new Date(item.appointmentDate + 'T12:00:00') : new Date(item.createdAt);
                    if (!isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                        countGen++;
                        processed.push({
                            modulo: 'GENERAL',
                            paciente: item.patientName,
                            documento: item.patientDocument,
                            fecha: item.appointmentDate || d.toLocaleDateString('es-CO'),
                            hora: item.appointmentTime,
                            doctor: item.doctorName,
                            servicio: item.serviceType || 'Agendamiento',
                            rawDate: d
                        });
                    }
                });

                // Process CVD
                cvdRaw.forEach(item => {
                    // Solo agendados
                    if (item.estado === 'BOOKED' || item.estado === 'BOOKED_PRESENCIAL') {
                        let d = null;
                        if (item.fechaStr && /^\d{8}$/.test(item.fechaStr)) {
                            d = new Date(`${item.fechaStr.slice(0, 4)}-${item.fechaStr.slice(4, 6)}-${item.fechaStr.slice(6, 8)}T12:00:00`);
                        } else if (item.fechaStr) {
                            d = new Date(item.fechaStr.includes('T') ? item.fechaStr : item.fechaStr + 'T12:00:00');
                        }
                        
                        if (d && !isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                            countCvd++;
                            processed.push({
                                modulo: 'CVD',
                                paciente: item.pacienteNombre,
                                documento: item.cedula,
                                fecha: d.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                                hora: item.horaStr,
                                doctor: item.doctor,
                                servicio: item.tipoExamen || 'Control',
                                rawDate: d
                            });
                        }
                    }
                });

                processed.sort((a, b) => b.rawDate - a.rawDate);

                setCombinedData(processed);
                setStats({ general: countGen, cvd: countCvd, total: countGen + countCvd });

            } catch (err) {
                console.error("Error fetching combined stats:", err);
            } finally {
                setLoadingData(false);
            }
        };

        fetchMonthData();
    }, []);

    const handleSelect = (mod) => {
        router.push(mod.href);
    };

    const pieData = [
        { value: stats.general, color: '#8263B1', label: 'General' },
        { value: stats.cvd, color: '#B14040', label: 'Cardiovascular' }
    ];

    const currentMonthName = new Date().toLocaleDateString('es-CO', { month: 'long' }).toUpperCase();

    return (
        <div
            className="min-h-screen flex flex-col items-center py-10 relative overflow-y-auto"
            style={{ background: 'var(--chat-bg)' }}
        >
            {/* ── Subtle grid background ── */}
            <div className="fixed inset-0 chat-bg pointer-events-none" />

            {/* ── Glow blobs ── */}
            <div
                className="fixed top-[-120px] left-[-120px] w-[500px] h-[500px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(130,99,177,0.10) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />
            <div
                className="fixed bottom-[-120px] right-[-120px] w-[500px] h-[500px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(161,227,216,0.07) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />

            {/* ── Header ── */}
            <div className="relative z-10 text-center mb-10 mt-6">
                <div className="flex items-center justify-center gap-3 mb-4">
                    <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
                        style={{ background: 'linear-gradient(135deg, #8263B1 0%, #5a4490 100%)' }}
                    >
                        <Activity size={24} color="#A1E3D8" />
                    </div>
                    <div className="text-left">
                        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: 'rgba(161,227,216,0.7)' }}>
                            Sistema de
                        </p>
                        <h1 className="text-xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                            Gestión Médica
                        </h1>
                    </div>
                </div>
            </div>

            {/* ── Top Row: Cards ── */}
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 px-6 w-full max-w-[1000px] mb-8">
                {mainModules.map((mod) => {
                    const Icon = mod.icon;
                    const isHovered = hoveredId === mod.id;

                    return (
                        <button
                            key={mod.id}
                            onClick={() => handleSelect(mod)}
                            onMouseEnter={() => setHoveredId(mod.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            className="w-full flex flex-col text-left rounded-2xl p-6 border transition-all duration-300 group relative overflow-hidden"
                            style={{
                                background: isHovered
                                    ? 'rgba(45,40,62,0.8)'
                                    : 'rgba(30,27,38,0.85)',
                                borderColor: isHovered
                                    ? mod.badgeColor
                                    : 'var(--border)',
                                boxShadow: isHovered
                                    ? `0 0 0 1px ${mod.badgeColor}40, 0 20px 60px rgba(0,0,0,0.4)`
                                    : '0 4px 24px rgba(0,0,0,0.3)',
                                cursor: 'pointer',
                                backdropFilter: 'blur(12px)',
                                transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                            }}
                        >
                            {/* Glow on hover */}
                            <div
                                className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300"
                                style={{
                                    background: `radial-gradient(ellipse at top left, ${mod.badgeColor}14 0%, transparent 60%)`,
                                    opacity: isHovered ? 1 : 0,
                                }}
                            />

                            <div className="flex items-center justify-between mb-5">
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                                    style={{ background: mod.iconBg }}
                                >
                                    <Icon size={22} color={mod.accentColor} />
                                </div>
                                <span
                                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                                    style={{ background: mod.badgeBg, color: mod.badgeText, border: `1px solid ${mod.badgeBorder}` }}
                                >
                                    {mod.tag}
                                </span>
                            </div>

                            <div className="mb-3">
                                <p className="text-[11px] font-semibold tracking-widest uppercase mb-0.5" style={{ color: mod.accentColor, opacity: 0.7 }}>
                                    {mod.title}
                                </p>
                                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                                    {mod.subtitle}
                                </h2>
                            </div>

                            <p className="text-sm leading-relaxed mb-5 h-[40px]" style={{ color: 'var(--text-muted)' }}>
                                {mod.description}
                            </p>

                            <div className="grid grid-cols-2 gap-2 mb-6 flex-1">
                                {mod.features.map((f) => (
                                    <span
                                        key={f}
                                        className="text-xs font-semibold px-3 py-2 rounded-lg text-center"
                                        style={{ background: `${mod.badgeColor}18`, color: mod.badgeText, border: `1px solid ${mod.badgeColor}35` }}
                                    >
                                        {f}
                                    </span>
                                ))}
                            </div>

                            <div
                                className="flex items-center pt-5"
                                style={{ borderTop: `1px solid ${mod.badgeColor}20` }}
                            >
                                <div
                                    className="w-full flex items-center justify-center gap-2 text-sm font-bold px-5 py-3 rounded-xl transition-all duration-200"
                                    style={{
                                        background: isHovered ? `${mod.badgeColor}25` : `${mod.badgeColor}12`,
                                        color: mod.accentColor,
                                        border: `1px solid ${mod.badgeColor}40`,
                                        transform: isHovered ? 'translateX(3px)' : 'translateX(0)',
                                    }}
                                >
                                    <span>Ingresar</span>
                                    <ArrowRight size={15} />
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── Bottom Row: Big Dashboard Card ── */}
            <div className="relative z-10 w-full max-w-[1000px] px-6">
                <div 
                    className="w-full rounded-2xl p-8 border flex flex-col shadow-2xl"
                    style={{
                        background: 'rgba(30,27,38,0.85)',
                        borderColor: 'var(--border)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    <div className="flex items-center justify-between mb-8 border-b pb-4" style={{ borderColor: 'rgba(130,99,177,0.2)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#8263B1]/20 flex items-center justify-center">
                                <CalendarCheck2 size={20} className="text-[#C4AFED]" />
                            </div>
                            <div>
                                <p className="text-[10px] tracking-widest uppercase font-semibold text-[#C4AFED]/70">
                                    Consolidado Global
                                </p>
                                <h2 className="text-xl font-bold text-[#F5F5F7]">
                                    Agendamientos del Mes ({currentMonthName})
                                </h2>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowModal(true)}
                            disabled={loadingData}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                            style={{
                                background: 'linear-gradient(135deg, rgba(130,99,177,0.3) 0%, rgba(90,68,144,0.3) 100%)',
                                color: '#C4AFED',
                                border: '1px solid rgba(130,99,177,0.5)',
                            }}
                        >
                            <FileText size={14} />
                            Ver Detalles
                        </button>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-12 justify-center">
                        {/* Pie Chart Section */}
                        <div className="flex flex-col items-center justify-center flex-shrink-0">
                            {loadingData ? (
                                <div className="w-[180px] h-[180px] flex items-center justify-center">
                                    <Loader2 size={30} className="animate-spin text-[#8263B1]" />
                                </div>
                            ) : stats.total === 0 ? (
                                <div className="w-[180px] h-[180px] flex items-center justify-center rounded-full border border-dashed border-[#2D283E]">
                                    <p className="text-xs text-[#F5F5F7]/40 text-center px-4">No hay agendamientos</p>
                                </div>
                            ) : (
                                <div className="relative">
                                    <PieChart data={pieData} size={180} />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-2xl font-bold text-[#F5F5F7] drop-shadow-md">{stats.total}</span>
                                        <span className="text-[10px] uppercase font-bold text-[#F5F5F7]/50 tracking-wider">Total</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Stats Info Section */}
                        <div className="flex-1 w-full flex flex-col gap-4">
                            {/* Card General */}
                            <div className="flex items-center justify-between p-4 rounded-xl border transition-all"
                                style={{ background: 'rgba(130,99,177,0.08)', borderColor: 'rgba(130,99,177,0.3)' }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#8263B1' }}>
                                        <MessageCircle size={16} color="#fff" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold" style={{ color: '#C4AFED' }}>Resumen del mes</p>
                                        <p className="text-sm font-bold text-[#F5F5F7]">Agendamiento General</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {loadingData ? <Loader2 size={16} className="animate-spin ml-auto text-[#C4AFED]" /> : (
                                        <>
                                            <p className="text-2xl font-bold" style={{ color: '#A1E3D8' }}>{stats.general}</p>
                                            <p className="text-[10px] text-[#A1E3D8]/60 uppercase tracking-widest">Citas</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Card CVD */}
                            <div className="flex items-center justify-between p-4 rounded-xl border transition-all"
                                style={{ background: 'rgba(177,64,64,0.08)', borderColor: 'rgba(177,64,64,0.3)' }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#B14040' }}>
                                        <Heart size={16} color="#fff" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold" style={{ color: '#F9A8A8' }}>Resumen del mes</p>
                                        <p className="text-sm font-bold text-[#F5F5F7]">Agendamiento Cardiovascular</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {loadingData ? <Loader2 size={16} className="animate-spin ml-auto text-[#F9A8A8]" /> : (
                                        <>
                                            <p className="text-2xl font-bold" style={{ color: '#EDAFAF' }}>{stats.cvd}</p>
                                            <p className="text-[10px] text-[#EDAFAF]/60 uppercase tracking-widest">Citas</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Total Info */}
                            <div className="mt-2 text-right">
                                <p className="text-sm text-[#F5F5F7]/50">
                                    El gráfico compara la proporción de atenciones asignadas para ambos módulos en el periodo actual.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 mt-10 pb-6 flex items-center gap-2">
                <Bot size={13} style={{ color: 'rgba(245,245,247,0.2)' }} />
                <p className="text-[11px]" style={{ color: 'rgba(245,245,247,0.2)' }}>
                    Auro Bot · Sistema de Gestión Médica
                </p>
            </div>

            {showModal && (
                <DetallesAgendamientoModal 
                    data={combinedData} 
                    onClose={() => setShowModal(false)} 
                />
            )}
        </div>
    );
}
