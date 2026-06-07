import { User, Search, CalendarClock, BellRing, MonitorCheck } from 'lucide-react';
import { useState } from 'react';

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const API_BASE = `${PROTOCOL}//${SERVER_HOST}:3001`;

export default function Sidebar({ conversations, activeId, onSelect, filter, setFilter, onOpenHistory, onOpenVisor, appointmentsCount }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [sendingReminders, setSendingReminders] = useState(false);
    const [reminderMsg, setReminderMsg] = useState(null);

    const handleSendReminders = async () => {
        setSendingReminders(true);
        setReminderMsg(null);
        try {
            const res = await fetch(`${API_BASE}/api/send-reminders`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setReminderMsg({ ok: true, text: `✅ ${data.sent} recordatorio${data.sent !== 1 ? 's' : ''} enviado${data.sent !== 1 ? 's' : ''}` });
            } else {
                setReminderMsg({ ok: false, text: `❌ ${data.error || 'Error al enviar'}` });
            }
        } catch (e) {
            setReminderMsg({ ok: false, text: '❌ No se pudo conectar al servidor' });
        } finally {
            setSendingReminders(false);
            setTimeout(() => setReminderMsg(null), 4000);
        }
    };

    const filteredConversations = conversations.filter(conv => {
        const matchesFilter = filter === 'all' || conv.status === filter;
        const matchesSearch = (conv.patientName || conv.name || conv.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (conv.patientDocument || '').toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';

        const now = new Date();

        // Reset times to midnight for day comparison
        const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay   = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diffDays = Math.round((today - msgDay) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Today → only time  (e.g. "3:46 p.m.")
            return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            // Yesterday → "Ayer"
            return 'Ayer';
        } else if (diffDays <= 6) {
            // This week → weekday name  (e.g. "Lunes")
            return date.toLocaleDateString('es-CO', { weekday: 'long' })
                       .replace(/^\w/, c => c.toUpperCase());
        } else {
            // Older → short date  (e.g. "5/10/26")
            return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'numeric', year: '2-digit' });
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1E1B26] text-[#F5F5F7]">
            {/* Header */}
            <div className="flex-shrink-0">
                <div className="bg-[#1A1721] border-b border-[#2D283E]">
                    {/* Fila 1: Logo + Título */}
                    <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                        <span className="text-[#A1E3D8] text-xl">🤖</span>
                        <h1 className="text-base font-bold tracking-tight whitespace-nowrap">Chat bot Aurora</h1>
                    </div>
                    {/* Fila 2: Botones de acción */}
                    <div className="px-3 pb-3 flex items-center gap-2">
                        {/* Botón Visor */}
                        <button
                            onClick={onOpenVisor}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-[#2D283E] hover:bg-[#8263B1]/40 text-[#C4A7FF] px-2 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm border border-[#8263B1]/20 hover:border-[#8263B1]/50"
                            title="Visor de agenda médica"
                        >
                            <MonitorCheck size={12} />
                            <span>Visor</span>
                        </button>
                        {/* Botón recordatorios */}
                        <button
                            onClick={handleSendReminders}
                            disabled={sendingReminders}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-[#2D283E] hover:bg-[#A1E3D8]/20 text-[#A1E3D8] px-2 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm border border-[#A1E3D8]/20 hover:border-[#A1E3D8]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Enviar recordatorios de citas de mañana"
                        >
                            <BellRing size={12} className={sendingReminders ? 'animate-pulse' : ''} />
                            <span>{sendingReminders ? 'Enviando...' : 'Recordar'}</span>
                        </button>
                        {/* Botón Citas */}
                        <button
                            onClick={onOpenHistory}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-[#2D283E] hover:bg-[#8263B1]/40 text-[#F5F5F7] px-2 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm border border-[#2D283E] hover:border-[#8263B1]/50"
                            title="Ver historial de citas"
                        >
                            <CalendarClock size={12} className="text-[#A1E3D8]" />
                            <span>Citas {appointmentsCount > 0 ? `(${appointmentsCount})` : ''}</span>
                        </button>
                    </div>
                </div>
                {/* Toast de resultado */}
                {reminderMsg && (
                    <div className={`px-4 py-2 text-xs font-medium text-center ${reminderMsg.ok ? 'bg-[#A1E3D8]/15 text-[#A1E3D8]' : 'bg-red-500/15 text-red-400'}`}>
                        {reminderMsg.text}
                    </div>
                )}

                {/* Search Bar */}
                <div className="p-3 border-b border-[#2D283E] bg-[#1E1B26]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#A1E3D8]" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o cédula..."
                            className="w-full pl-9 pr-3 py-2 text-sm bg-[#0F0E13] border border-[#2D283E] text-[#F5F5F7] rounded-md focus:outline-none focus:ring-1 focus:ring-[#8263B1] focus:border-[#8263B1] placeholder-gray-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center p-2 gap-2 overflow-x-auto border-b border-[#2D283E]">
                    <button
                        onClick={() => setFilter('all')}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'all'
                            ? 'bg-[#8263B1] text-[#F5F5F7]'
                            : 'bg-[#2D283E] text-gray-400 hover:text-[#F5F5F7] hover:bg-[#3D3754]'
                            }`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setFilter('pending')}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'pending'
                            ? 'bg-[#A1E3D8] text-[#0F0E13]'
                            : 'bg-[#2D283E] text-gray-400 hover:text-[#F5F5F7] hover:bg-[#3D3754]'
                            }`}
                    >
                        Pendientes
                    </button>
                    <button
                        onClick={() => setFilter('bot')}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'bot'
                            ? 'bg-[#8263B1] text-[#F5F5F7] bg-opacity-70'
                            : 'bg-[#2D283E] text-gray-400 hover:text-[#F5F5F7] hover:bg-[#3D3754]'
                            }`}
                    >
                        Bot
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <p>No hay conversaciones disponibles</p>
                    </div>
                ) : (
                    filteredConversations.map((conv) => (
                        <div
                            key={conv.id}
                            onClick={() => onSelect(conv.id)}
                            className={`flex p-4 border-b border-[#2D283E] cursor-pointer hover:bg-[#2D283E] transition-all duration-150 ${activeId === conv.id ? 'bg-[#2D283E] border-l-4 border-l-[#A1E3D8]' : ''
                                }`}
                        >
                            {/* Avatar */}
                            <div className="w-12 h-12 rounded-full bg-[#8263B1] flex items-center justify-center mr-3 text-[#F5F5F7] font-bold text-lg flex-shrink-0 shadow-sm border border-[#2D283E]">
                                {conv.patientName ? conv.patientName.charAt(0).toUpperCase() : '?'}
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-hidden min-w-0">
                                {/* Name and Time */}
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-semibold text-[#F5F5F7] truncate text-[15px]">
                                        {conv.patientName || 'Sin nombre'}
                                    </h3>
                                    <span className="text-[11px] text-[#A1E3D8] ml-2 flex-shrink-0 opacity-80">
                                        {formatDate(conv.lastMessageAt)}
                                    </span>
                                </div>

                                {/* Document Number */}
                                {conv.patientDocument ? (
                                    <div className="flex items-center gap-1 mb-1.5">
                                        <span className="text-xs text-[#1E1B26] bg-[#A1E3D8] px-2 py-0.5 rounded font-medium">
                                            CC: {conv.patientDocument}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 mb-1.5">
                                        <span className="text-xs text-[#F5F5F7] opacity-60 bg-[#2D283E] px-2 py-0.5 rounded">
                                            No registrado
                                        </span>
                                    </div>
                                )}

                                {/* Last Message Preview */}
                                <p className="text-sm text-gray-400 truncate leading-relaxed">
                                    {conv.messages?.[0]?.body || 'Multimedia'}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
