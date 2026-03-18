import { User, Search } from 'lucide-react';
import { useState } from 'react';

export default function Sidebar({ conversations, activeId, onSelect, filter, setFilter }) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredConversations = conversations.filter(conv => {
        const matchesFilter = filter === 'all' || conv.status === filter;
        const matchesSearch = (conv.patientName || conv.name || conv.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (conv.patientDocument || '').toLowerCase().includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            {/* Header */}
            <div className="bg-white flex-shrink-0">
                <div className="h-16 bg-gradient-to-r from-emerald-50 to-emerald-100 px-4 flex flex-col justify-center border-b border-emerald-200">
                    <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <span className="text-emerald-600">🤖</span> Chat bot Aurora
                    </h1>
                    <p className="text-xs text-gray-600">Panel de monitoreo médico</p>
                </div>

                {/* Search Bar */}
                <div className="p-2 border-b border-gray-100 bg-gray-50">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o cédula..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center p-2 gap-2 overflow-x-auto border-b border-gray-100">
                    <button
                        onClick={() => setFilter('all')}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'all'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setFilter('pending')}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        Pendientes
                    </button>
                    <button
                        onClick={() => setFilter('bot')}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'bot'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        Bot
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                        <p>No hay conversaciones disponibles</p>
                    </div>
                ) : (
                    filteredConversations.map((conv) => (
                        <div
                            key={conv.id}
                            onClick={() => onSelect(conv.id)}
                            className={`flex p-4 border-b border-gray-100 cursor-pointer hover:bg-emerald-50 transition-all duration-150 ${activeId === conv.id ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : ''
                                }`}
                        >
                            {/* Avatar */}
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mr-3 text-white font-bold text-lg flex-shrink-0 shadow-sm">
                                {conv.patientName ? conv.patientName.charAt(0).toUpperCase() : '?'}
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-hidden min-w-0">
                                {/* Name and Time */}
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-semibold text-gray-900 truncate text-[15px]">
                                        {conv.patientName || 'Sin nombre'}
                                    </h3>
                                    <span className="text-[11px] text-gray-500 ml-2 flex-shrink-0">
                                        {formatDate(conv.lastMessageAt)}
                                    </span>
                                </div>

                                {/* Document Number */}
                                {conv.patientDocument ? (
                                    <div className="flex items-center gap-1 mb-1.5">
                                        <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-medium">
                                            CC: {conv.patientDocument}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 mb-1.5">
                                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                            No registrado
                                        </span>
                                    </div>
                                )}

                                {/* Last Message Preview */}
                                <p className="text-sm text-gray-600 truncate leading-relaxed">
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
