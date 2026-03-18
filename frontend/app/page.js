"use client";

import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import MessageList from '../components/MessageList';
import InputArea from '../components/InputArea';
import { useChat } from '../hooks/useChat';
import { User, MoreVertical, Search, MessageCircle, UserPlus, Bot } from 'lucide-react';

export default function Home() {
    const {
        conversations,
        activeConversationId,
        setActiveConversationId,
        messages,
        sendMessage,
        filter,
        setFilter,
        updateStatus
    } = useChat();

    const activeConversation = conversations.find(c => c.id === activeConversationId);

    return (
        <div className="flex h-screen overflow-hidden bg-[#f5f7fa]">
            {/* Sidebar */}
            <div className="w-[350px] flex-shrink-0 h-full border-r bg-white flex flex-col shadow-sm">
                <Sidebar
                    conversations={conversations}
                    activeId={activeConversationId}
                    onSelect={setActiveConversationId}
                    filter={filter}
                    setFilter={setFilter}
                />
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-[#efeae2] relative min-w-0">
                {activeConversation ? (
                    <>
                        {/* Header */}
                        <div className="h-16 bg-[#f0f2f5] px-5 flex justify-between items-center border-b border-[#e9edef] flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-semibold shadow-sm">
                                    {activeConversation.patientName ? activeConversation.patientName.charAt(0).toUpperCase() : <User size={20} />}
                                </div>
                                <div className="flex flex-col">
                                    <h2 className="text-[15px] font-medium text-[#111b21]">
                                        {activeConversation.patientName || activeConversation.name || activeConversation.id}
                                    </h2>
                                    <div className="flex items-center gap-2 text-xs">
                                        {activeConversation.patientDocument && (
                                            <span className="text-[#667781]">
                                                CC: {activeConversation.patientDocument}
                                            </span>
                                        )}
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${activeConversation.status === 'human' ? 'bg-emerald-100 text-emerald-700' :
                                                activeConversation.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-blue-50 text-blue-700'
                                            }`}>
                                            {activeConversation.status === 'human' ? '• Agente' :
                                                activeConversation.status === 'pending' ? '• Espera' : '• Bot'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {(activeConversation.status === 'pending' || activeConversation.status === 'bot') && (
                                    <button
                                        onClick={() => updateStatus(activeConversation.id, 'human')}
                                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-full text-xs font-medium transition-colors shadow-sm"
                                    >
                                        <UserPlus size={14} />
                                        Tomar Chat
                                    </button>
                                )}
                                {activeConversation.status === 'human' && (
                                    <button
                                        onClick={() => updateStatus(activeConversation.id, 'bot')}
                                        className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-full text-xs font-medium transition-colors shadow-sm"
                                    >
                                        <Bot size={14} />
                                        Devolver a Bot
                                    </button>
                                )}
                                <div className={`px-2 py-0.5 rounded text-xs font-medium border ${activeConversation.status === 'human' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    activeConversation.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        'bg-blue-50 text-blue-700 border-blue-200'
                                    }`}>
                                    {activeConversation.status === 'human' ? '👨‍⚕️ Agente' :
                                        activeConversation.status === 'pending' ? '⏳ Espera' : '🤖 Bot'}
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <MessageList messages={messages} />

                        {/* Input Area */}
                        <InputArea onSend={sendMessage} />
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5]">
                        <div className="text-center max-w-md px-8">
                            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                                <MessageCircle size={40} className="text-white" />
                            </div>
                            <h1 className="text-2xl font-semibold text-[#111b21] mb-3">Auditoría de Conversaciones</h1>
                            <p className="text-[#667781] text-sm leading-relaxed">
                                Selecciona una conversación de la lista para revisar el historial completo de mensajes y citas del paciente.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
