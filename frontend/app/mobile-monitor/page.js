"use client";

import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Activity, ArrowLeft, RefreshCw, Smartphone, Calendar, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function MobileMonitorPage() {
    const router = useRouter();
    const [events, setEvents] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const eventsEndRef = useRef(null);

    useEffect(() => {
        // Asumiendo que el backend corre en el mismo host o en el puerto por defecto (e.g. localhost:3000 o 3001)
        // Usamos la URL base actual si es necesario, o dejamos que socket.io la deduzca
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://agenda.aurora-ia.co';
        const socket = io(API_URL);

        socket.on('connect', () => {
            setIsConnected(true);
            console.log('Conectado al monitor de citas móviles');
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
        });

        socket.on('mobile_appointment_update', (data) => {
            console.log('Nueva actualización móvil recibida:', data);
            
            // data debería tener: { action: 'CREATED'|'CANCELLED'|'RESCHEDULED', details: {...} }
            const newEvent = {
                id: Date.now() + Math.random().toString(),
                timestamp: new Date(),
                ...data
            };
            
            setEvents(prev => [...prev, newEvent].slice(-50)); // Mantener máximo los últimos 50 eventos
        });

        // Limpieza al desmontar
        return () => {
            socket.disconnect();
        };
    }, []);

    // Auto-scroll al final cuando llegan nuevos eventos
    useEffect(() => {
        eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    const getActionIcon = (action) => {
        switch (action) {
            case 'CREATED': return <CheckCircle className="text-emerald-400" size={24} />;
            case 'CANCELLED': return <Trash2 className="text-red-400" size={24} />;
            case 'RESCHEDULED': return <RefreshCw className="text-blue-400" size={24} />;
            default: return <AlertCircle className="text-gray-400" size={24} />;
        }
    };

    const getActionLabel = (action) => {
        switch (action) {
            case 'CREATED': return 'Cita Agendada';
            case 'CANCELLED': return 'Cita Cancelada';
            case 'RESCHEDULED': return 'Cita Reagendada';
            default: return 'Actualización';
        }
    };

    const getActionColor = (action) => {
        switch (action) {
            case 'CREATED': return 'border-emerald-500/30 bg-emerald-500/10';
            case 'CANCELLED': return 'border-red-500/30 bg-red-500/10';
            case 'RESCHEDULED': return 'border-blue-500/30 bg-blue-500/10';
            default: return 'border-gray-500/30 bg-gray-500/10';
        }
    };

    return (
        <div className="min-h-screen bg-[#13111C] text-white p-6 md:p-12 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 chat-bg pointer-events-none opacity-50" />
            <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[100px] bg-blue-500/5 pointer-events-none" />

            <div className="max-w-5xl mx-auto relative z-10 flex flex-col h-[calc(100vh-6rem)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/')}
                            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                <Activity className="text-blue-400" /> Monitor App Móvil
                            </h1>
                            <p className="text-gray-400 text-sm">Actividad de citas en tiempo real</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500'}`} />
                        <span className="text-sm font-medium">{isConnected ? 'En vivo' : 'Desconectado'}</span>
                    </div>
                </div>

                {/* Dashboard Area */}
                <div className="flex-1 bg-[#1A1726]/80 backdrop-blur-md rounded-2xl border border-white/10 p-6 flex flex-col overflow-hidden shadow-2xl">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Smartphone size={20} className="text-gray-400" />
                            Registro de Eventos
                        </h2>
                        <span className="text-xs bg-white/10 px-3 py-1 rounded-full text-gray-300">
                            Últimos 50 eventos
                        </span>
                    </div>

                    {/* Events List */}
                    <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                        {events.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60">
                                <Activity size={48} className="mb-4 text-gray-600" />
                                <p>Esperando actividad desde la app móvil...</p>
                                <p className="text-xs mt-2">Realiza pruebas de agendamiento para ver los eventos aquí.</p>
                            </div>
                        ) : (
                            events.map((ev) => (
                                <div 
                                    key={ev.id} 
                                    className={`p-4 rounded-xl border ${getActionColor(ev.action)} backdrop-blur-sm transition-all animate-in slide-in-from-bottom-4 fade-in duration-300`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className="mt-1 bg-black/20 p-2 rounded-lg">
                                                {getActionIcon(ev.action)}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                                                    {getActionLabel(ev.action)}
                                                </h3>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm mt-3">
                                                    {ev.details?.paciente && (
                                                        <div className="flex items-center gap-2 text-gray-300">
                                                            <span className="text-gray-500">Paciente:</span>
                                                            <span className="font-medium text-white">{ev.details.paciente}</span>
                                                        </div>
                                                    )}
                                                    {ev.details?.cedula && (
                                                        <div className="flex items-center gap-2 text-gray-300">
                                                            <span className="text-gray-500">Cédula:</span>
                                                            <span className="font-mono text-white">{ev.details.cedula}</span>
                                                        </div>
                                                    )}
                                                    {ev.details?.fecha && (
                                                        <div className="flex items-center gap-2 text-gray-300">
                                                            <span className="text-gray-500">Fecha Cita:</span>
                                                            <span className="flex items-center gap-1 text-white">
                                                                <Calendar size={14} /> {ev.details.fecha}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {ev.details?.medico && (
                                                        <div className="flex items-center gap-2 text-gray-300">
                                                            <span className="text-gray-500">Médico:</span>
                                                            <span className="text-white">{ev.details.medico}</span>
                                                        </div>
                                                    )}
                                                    {ev.details?.sede && (
                                                        <div className="flex items-center gap-2 text-gray-300">
                                                            <span className="text-gray-500">Sede:</span>
                                                            <span className="text-white">{ev.details.sede}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Mensaje extra si existe */}
                                                {ev.details?.mensaje && (
                                                    <p className="mt-3 text-sm text-gray-400 italic bg-black/20 p-2 rounded">
                                                        "{ev.details.mensaje}"
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-500 flex flex-col items-end">
                                            <span>{ev.timestamp.toLocaleDateString()}</span>
                                            <span>{ev.timestamp.toLocaleTimeString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={eventsEndRef} />
                    </div>
                </div>
            </div>
            
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.02);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}
