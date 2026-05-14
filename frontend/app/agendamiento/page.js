"use client";

import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import Sidebar from '../../components/Sidebar';
import MessageList from '../../components/MessageList';
import InputArea from '../../components/InputArea';
import VisorAgenda from '../../components/VisorAgenda';
import { useChat } from '../../hooks/useChat';
import {
    User, UserPlus, Bot, MessageCircle,
    CalendarCheck2, X, Calendar, Clock, Stethoscope, Hash, Phone, BellRing
} from 'lucide-react';

// ─── Appointments Modal ───────────────────────────────────────────────
const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const API_BASE = `http://${SERVER_HOST}:3001`;

function AppointmentsModal({ onClose }) {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sendingId, setSendingId] = useState(null);
    const [toast, setToast] = useState(null);

    const loadAppointments = useCallback(() => {
        setLoading(true);
        fetch(`${API_BASE}/api/appointments`)
            .then(r => r.json())
            .then(data => { setAppointments(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    useEffect(() => {
        const host = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
            ? window.location.hostname : 'localhost';
        const socket = io(`http://${host}:3001`);
        socket.on('new_appointment', () => loadAppointments());
        return () => socket.disconnect();
    }, [loadAppointments]);

    const fmt = (dateStr) => {
        if (!dateStr) return '—';
        return dateStr;
    };

    const sendIndividualReminder = async (apptId) => {
        setSendingId(apptId);
        try {
            const res = await fetch(`${API_BASE}/api/appointments/${apptId}/remind`, { method: 'POST' });
            if (res.ok) {
                setToast({ text: '✅ Recordatorio enviado', type: 'success' });
            } else {
                setToast({ text: '❌ Error al enviar', type: 'error' });
            }
        } catch (e) {
            setToast({ text: '❌ Error de conexión', type: 'error' });
        } finally {
            setSendingId(null);
            setTimeout(() => setToast(null), 3000);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#2D283E] flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#8263B1]/20 flex items-center justify-center">
                            <CalendarCheck2 size={18} className="text-[#A1E3D8]" />
                        </div>
                        <div>
                            <h2 className="text-[#F5F5F7] font-semibold text-base">Citas Agendadas</h2>
                            <p className="text-[11px] text-[#A1E3D8]/70 mt-0.5">
                                {loading ? 'Actualizando...' : `${appointments.length} cita${appointments.length !== 1 ? 's' : ''} registrada${appointments.length !== 1 ? 's' : ''}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadAppointments}
                            disabled={loading}
                            title="Recargar citas"
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1E3D8]/60 hover:text-[#A1E3D8] hover:bg-[#2D283E] transition-colors disabled:opacity-40"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                <path d="M3 3v5h5"/>
                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                                <path d="M16 21h5v-5"/>
                            </svg>
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[#F5F5F7]/60 hover:text-[#F5F5F7] hover:bg-[#2D283E] transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Stats bar */}
                {!loading && (
                    <div className="flex items-center gap-4 px-6 py-3 bg-[#8263B1]/10 border-b border-[#2D283E] flex-shrink-0">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="w-2 h-2 rounded-full bg-[#A1E3D8] pulse-dot" />
                            <span className="text-[#F5F5F7]/70">Total:</span>
                            <span className="font-bold text-[#A1E3D8] text-lg leading-none">{appointments.length}</span>
                        </div>
                        <div className="h-4 w-px bg-[#2D283E]" />
                        <span className="text-[11px] text-[#F5F5F7]/40">Historial completo de citas confirmadas por el bot</span>
                    </div>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-2 border-[#8263B1] border-t-transparent rounded-full animate-spin" />
                                <span className="text-[#F5F5F7]/50 text-sm">Cargando citas...</span>
                            </div>
                        </div>
                    ) : appointments.length === 0 ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="text-center">
                                <CalendarCheck2 size={40} className="text-[#2D283E] mx-auto mb-3" />
                                <p className="text-[#F5F5F7]/40 text-sm">No hay citas registradas aún</p>
                            </div>
                        </div>
                    ) : (
                        <div className="divide-y divide-[#2D283E]">
                            {appointments.map((appt, i) => (
                                <div key={appt.id} className="px-6 py-4 hover:bg-[#2D283E]/40 transition-colors group">
                                    <div className="flex items-start gap-4">
                                        <div className="w-7 h-7 rounded-lg bg-[#8263B1]/20 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#8263B1]/30 transition-colors">
                                            <span className="text-[10px] font-bold text-[#8263B1]">{i + 1}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2 mb-2">
                                                <h3 className="font-semibold text-[#F5F5F7] truncate">{appt.patientName}</h3>
                                                <div className="flex items-center gap-3 flex-shrink-0">
                                                    <span className="text-[10px] text-[#F5F5F7]/35">
                                                        {new Date(appt.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                    </span>
                                                    <button
                                                        onClick={() => sendIndividualReminder(appt.id)}
                                                        disabled={sendingId === appt.id}
                                                        className="flex items-center gap-1.5 px-2 py-1 bg-[#8263B1]/20 hover:bg-[#8263B1]/40 text-[#C4AFED] rounded transition-colors text-[10px] font-semibold disabled:opacity-50"
                                                        title="Enviar recordatorio por WhatsApp a este paciente"
                                                    >
                                                        {sendingId === appt.id ? (
                                                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            <BellRing size={12} />
                                                        )}
                                                        Recordar
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Hash size={11} className="text-[#A1E3D8]/60 flex-shrink-0" />
                                                    <span className="text-xs text-[#F5F5F7]/55 truncate">CC: {appt.patientDocument}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Phone size={11} className="text-[#A1E3D8]/60 flex-shrink-0" />
                                                    <span className="text-xs text-[#F5F5F7]/55 truncate">
                                                        {appt.patientPhone
                                                            ? appt.patientPhone
                                                            : appt.whatsappId?.replace(/@(c\.us|lid)$/, '') || '—'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={11} className="text-[#A1E3D8]/60 flex-shrink-0" />
                                                    <span className="text-xs text-[#F5F5F7]/55">{fmt(appt.appointmentDate)}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={11} className="text-[#A1E3D8]/60 flex-shrink-0" />
                                                    <span className="text-xs text-[#F5F5F7]/55">{appt.appointmentTime || '—'}</span>
                                                </div>
                                                {appt.doctorName && (
                                                    <div className="col-span-2 flex items-center gap-1.5">
                                                        <Stethoscope size={11} className="text-[#A1E3D8]/60 flex-shrink-0" />
                                                        <span className="text-xs text-[#A1E3D8]/80 truncate">{appt.doctorName}</span>
                                                    </div>
                                                )}
                                                {appt.serviceType && (
                                                    <div className="col-span-2">
                                                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-[#8263B1]/20 text-[#C4AFED] border border-[#8263B1]/30">
                                                            {appt.serviceType}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-[#2D283E] flex-shrink-0 flex justify-between items-center">
                    <div className="flex-1">
                        {toast && (
                            <span className={`text-xs font-medium ${toast.type === 'success' ? 'text-[#A1E3D8]' : 'text-red-400'}`}>
                                {toast.text}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-lg bg-[#2D283E] hover:bg-[#3D3754] text-[#F5F5F7]/70 hover:text-[#F5F5F7] transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function AgendamientoPage() {
    const {
        conversations,
        activeConversationId,
        setActiveConversationId,
        messages,
        sendMessage,
        filter,
        setFilter,
        updateStatus,
        appointmentsCount,
    } = useChat();

    const [showAppointments, setShowAppointments] = useState(false);
    const [showVisor, setShowVisor] = useState(false);

    const activeConversation = conversations.find(c => c.id === activeConversationId);

    const statusLabel = (status) => {
        if (status === 'human')   return { text: '👨‍⚕️ Agente',   cls: 'badge-human' };
        if (status === 'pending') return { text: '⏳ Espera',    cls: 'badge-pending' };
        return                         { text: '🤖 Bot',        cls: 'badge-bot' };
    };

    const avatarInitial = (conv) =>
        conv?.patientName ? conv.patientName.charAt(0).toUpperCase() : <User size={18} />;

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--chat-bg)' }}>
            {/* ── Sidebar ─────────────────────────── */}
            <div className="w-[350px] flex-shrink-0 h-full flex flex-col" style={{ background: 'var(--sidebar-bg)' }}>
                <Sidebar
                    conversations={conversations}
                    activeId={activeConversationId}
                    onSelect={setActiveConversationId}
                    filter={filter}
                    setFilter={setFilter}
                    onOpenHistory={() => setShowAppointments(true)}
                    onOpenVisor={() => setShowVisor(true)}
                    appointmentsCount={appointmentsCount}
                />
            </div>

            {/* ── Chat Area ────────────────────────── */}
            <div className="flex-1 flex flex-col relative min-w-0">
                {activeConversation ? (
                    <>
                        {/* Header */}
                        <div
                            className="h-[62px] px-5 flex justify-between items-center border-b flex-shrink-0"
                            style={{ background: 'var(--header-bg)', borderColor: 'var(--border)' }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[#F5F5F7] font-bold text-lg flex-shrink-0 shadow"
                                    style={{ background: 'linear-gradient(135deg, #8263B1 0%, #6a4fa0 100%)' }}
                                >
                                    {avatarInitial(activeConversation)}
                                </div>
                                <div className="flex flex-col">
                                    <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {activeConversation.patientName || activeConversation.name || activeConversation.id}
                                    </h2>
                                    <div className="flex items-center gap-2 text-xs mt-0.5">
                                        {activeConversation.patientDocument && (
                                            <span className="text-[#A1E3D8]/70">CC: {activeConversation.patientDocument}</span>
                                        )}
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusLabel(activeConversation.status).cls}`}>
                                            {statusLabel(activeConversation.status).text}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-2">
                                {(activeConversation.status === 'pending' || activeConversation.status === 'bot') && (
                                    <button
                                        onClick={() => updateStatus(activeConversation.id, 'human')}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all shadow-sm"
                                        style={{ background: 'var(--accent)', color: '#0F0E13' }}
                                    >
                                        <UserPlus size={13} />
                                        Tomar Chat
                                    </button>
                                )}
                                {activeConversation.status === 'human' && (
                                    <button
                                        onClick={() => updateStatus(activeConversation.id, 'bot')}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                                        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bubble-in)' }}
                                    >
                                        <Bot size={13} />
                                        Devolver al Bot
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Messages */}
                        <MessageList messages={messages} />

                        {/* Input */}
                        <InputArea onSend={sendMessage} />
                    </>
                ) : (
                    /* Empty state */
                    <div className="flex-1 flex flex-col items-center justify-center chat-bg">
                        <div className="text-center max-w-sm px-8 select-none">
                            <div
                                className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl"
                                style={{ background: 'linear-gradient(135deg, #8263B1 0%, #2D283E 100%)' }}
                            >
                                <MessageCircle size={44} style={{ color: '#A1E3D8' }} />
                            </div>
                            <h1 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                                Auditoría de Conversaciones
                            </h1>
                            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                Selecciona una conversación de la lista para revisar el historial completo de mensajes y citas del paciente.
                            </p>
                            <button
                                onClick={() => setShowAppointments(true)}
                                className="mt-6 flex items-center gap-2 mx-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow"
                                style={{ background: '#8263B1', color: '#F5F5F7' }}
                            >
                                <CalendarCheck2 size={16} style={{ color: '#A1E3D8' }} />
                                Ver Citas Agendadas
                                {appointmentsCount > 0 && (
                                    <span className="ml-1 bg-[#A1E3D8] text-[#0F0E13] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                        {appointmentsCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Modals ────────────────────────────── */}
            {showAppointments && (
                <AppointmentsModal onClose={() => setShowAppointments(false)} />
            )}
            {showVisor && (
                <VisorAgenda onClose={() => setShowVisor(false)} />
            )}
        </div>
    );
}
