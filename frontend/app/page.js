"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Heart, ArrowRight, Bot, Activity } from 'lucide-react';

const modules = [
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
        available: true,
    },
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
        available: true,
    },
    {
        id: 'campaigns',
        title: 'Campañas',
        subtitle: 'Difusión Masiva',
        description: 'Envía mensajes masivos por WhatsApp.',
        icon: MessageCircle,
        iconBg: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
        accentColor: '#34d399',
        badgeColor: '#10b981',
        badgeBg: 'rgba(16,185,129,0.18)',
        badgeBorder: 'rgba(16,185,129,0.35)',
        badgeText: '#6ee7b7',
        tag: 'Nuevo',
        href: '/campaigns',
        features: ['Masivos', 'Prevención'],
        available: true,
    },
    {
        id: 'mobile-monitor',
        title: 'Monitoreo',
        subtitle: 'Actividad App Móvil',
        description: 'Actividad de la app móvil en tiempo real.',
        icon: Activity,
        iconBg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        accentColor: '#93c5fd',
        badgeColor: '#3b82f6',
        badgeBg: 'rgba(59,130,246,0.18)',
        badgeBorder: 'rgba(59,130,246,0.35)',
        badgeText: '#bfdbfe',
        tag: 'Pruebas',
        href: '/mobile-monitor',
        features: ['Tiempo Real', 'Historial'],
        available: true,
    }
];

export default function SelectorPage() {
    const router = useRouter();
    const [hoveredId, setHoveredId] = useState(null);

    const handleSelect = (mod) => {
        if (!mod.available) return;
        router.push(mod.href);
    };

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
            style={{ background: 'var(--chat-bg)' }}
        >
            {/* ── Subtle grid background ── */}
            <div className="absolute inset-0 chat-bg pointer-events-none" />

            {/* ── Glow blobs ── */}
            <div
                className="absolute top-[-120px] left-[-120px] w-[500px] h-[500px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(130,99,177,0.10) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />
            <div
                className="absolute bottom-[-120px] right-[-120px] w-[500px] h-[500px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(161,227,216,0.07) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }}
            />

            {/* ── Header ── */}
            <div className="relative z-10 text-center mb-14">
                {/* Logo / brand */}
                <div className="flex items-center justify-center gap-3 mb-6">
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
                            Agendamiento Médico
                        </h1>
                    </div>
                </div>

                <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
                    Selecciona el módulo al que deseas acceder
                </p>
            </div>

            {/* ── Cards ── */}
            <div className="relative z-10 flex flex-col sm:flex-row gap-5 px-6 w-full max-w-[1400px]">
                {modules.map((mod) => {
                    const Icon = mod.icon;
                    const isHovered = hoveredId === mod.id;

                    return (
                        <button
                            key={mod.id}
                            onClick={() => handleSelect(mod)}
                            onMouseEnter={() => setHoveredId(mod.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            disabled={!mod.available}
                            className="flex-1 flex flex-col text-left rounded-2xl p-6 border transition-all duration-300 group relative overflow-hidden h-full"
                            style={{
                                background: isHovered && mod.available
                                    ? 'rgba(45,40,62,0.8)'
                                    : 'rgba(30,27,38,0.85)',
                                borderColor: isHovered && mod.available
                                    ? mod.badgeColor
                                    : 'var(--border)',
                                boxShadow: isHovered && mod.available
                                    ? `0 0 0 1px ${mod.badgeColor}40, 0 20px 60px rgba(0,0,0,0.4)`
                                    : '0 4px 24px rgba(0,0,0,0.3)',
                                cursor: mod.available ? 'pointer' : 'default',
                                opacity: mod.available ? 1 : 0.65,
                                backdropFilter: 'blur(12px)',
                                transform: isHovered && mod.available ? 'translateY(-4px)' : 'translateY(0)',
                            }}
                        >
                            {/* Glow on hover */}
                            {mod.available && (
                                <div
                                    className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300"
                                    style={{
                                        background: `radial-gradient(ellipse at top left, ${mod.badgeColor}14 0%, transparent 60%)`,
                                        opacity: isHovered ? 1 : 0,
                                    }}
                                />
                            )}

                            {/* Tag badge */}
                            <div className="flex items-center justify-between mb-5">
                                {/* Icon */}
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
                                    style={{ background: mod.iconBg }}
                                >
                                    <Icon size={22} color={mod.accentColor} />
                                </div>

                                <span
                                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                                    style={{
                                        background: mod.badgeBg,
                                        color: mod.badgeText,
                                        border: `1px solid ${mod.badgeBorder}`,
                                    }}
                                >
                                    {mod.tag}
                                </span>
                            </div>

                            {/* Title */}
                            <div className="mb-3">
                                <p className="text-[11px] font-semibold tracking-widest uppercase mb-0.5" style={{ color: mod.accentColor, opacity: 0.7 }}>
                                    {mod.title}
                                </p>
                                <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                                    {mod.subtitle}
                                </h2>
                            </div>

                            {/* Description */}
                            <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-muted)' }}>
                                {mod.description}
                            </p>

                            {/* Features */}
                            <div className="grid grid-cols-2 gap-2 mb-6 flex-1">
                                {mod.features.map((f) => (
                                    <span
                                        key={f}
                                        className="text-xs font-semibold px-3 py-2 rounded-lg text-center"
                                        style={{
                                            background: `${mod.badgeColor}18`,
                                            color: mod.badgeText,
                                            border: `1px solid ${mod.badgeColor}35`,
                                        }}
                                    >
                                        {f}
                                    </span>
                                ))}
                            </div>

                            {/* CTA */}
                            <div
                                className="flex items-center pt-5"
                                style={{ borderTop: `1px solid ${mod.badgeColor}20` }}
                            >
                                {mod.available ? (
                                    <div
                                        className="w-full flex items-center justify-center gap-2 text-sm font-bold px-5 py-3 rounded-xl transition-all duration-200"
                                        style={{
                                            background: isHovered ? `${mod.badgeColor}25` : `${mod.badgeColor}12`,
                                            color: mod.accentColor,
                                            border: `1px solid ${mod.badgeColor}40`,
                                            transform: isHovered ? 'translateX(3px)' : 'translateX(0)',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <span>Ingresar</span>
                                        <ArrowRight size={15} />
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-500 px-3 py-2 rounded-lg border border-gray-700/40 bg-gray-800/30 w-full text-center">En desarrollo</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── Footer ── */}
            <div className="relative z-10 mt-14 flex items-center gap-2">
                <Bot size={13} style={{ color: 'rgba(245,245,247,0.2)' }} />
                <p className="text-[11px]" style={{ color: 'rgba(245,245,247,0.2)' }}>
                    Auro Bot · Sistema de Gestión Médica
                </p>
            </div>
        </div>
    );
}
