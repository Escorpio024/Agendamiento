"use client";

import { useState, useEffect } from 'react';
import { Megaphone, Send, Clock, CheckCircle2, AlertCircle, Plus, RefreshCw, ArrowLeft, Pause, Play, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const API_BASE = `${PROTOCOL}//${SERVER_HOST}:3001`;

export default function CampaignsPage() {
    const router = useRouter();
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [previewMessage, setPreviewMessage] = useState(false);
    
    const [newName, setNewName] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [creating, setCreating] = useState(false);
    const [actionLoading, setActionLoading] = useState({});
    
    useEffect(() => {
        fetchCampaigns();
        // Polling agresivo si hay una campaña enviándose
        const interval = setInterval(fetchCampaigns, 10000);
        return () => clearInterval(interval);
    }, []);

    const fetchCampaigns = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/campaigns`);
            const data = await res.json();
            setCampaigns(data);
        } catch (error) {
            console.error("Error fetching campaigns:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            const res = await fetch(`${API_BASE}/api/campaigns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, messageBody: newMessage })
            });
            if (res.ok) {
                setShowModal(false);
                setNewName('');
                setNewMessage('');
                fetchCampaigns();
            } else {
                alert('Error al crear campaña');
            }
        } catch (e) {
            alert('Error de conexión');
        } finally {
            setCreating(false);
        }
    };

    const callAction = async (id, action, confirmMsg) => {
        if (confirmMsg && !confirm(confirmMsg)) return;
        setActionLoading(prev => ({ ...prev, [id]: true }));
        try {
            const res = await fetch(`${API_BASE}/api/campaigns/${id}/${action}`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                fetchCampaigns();
            } else {
                alert(data.error || `Error al ejecutar "${action}"`);
            }
        } catch (e) {
            alert('Error de conexión');
        } finally {
            setActionLoading(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleSend = (id, name) => callAction(id, 'send',
        `¿Enviar la campaña "${name}" a TODOS los pacientes con historial en el bot?\n\nEsto puede tardar varias horas en completarse. El progreso se actualizará aquí automáticamente.`);

    const handlePause = (id) => callAction(id, 'pause', null);
    const handleResume = (id) => callAction(id, 'resume',
        `¿Reanudar el envío? Continuará desde donde se quedó y no repetirá mensajes ya enviados.`);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'DRAFT':    return <span className="inline-flex items-center gap-1.5 bg-gray-800 text-gray-300 border border-gray-600 px-2.5 py-1 rounded-full text-xs font-semibold"><Clock size={11}/> Borrador</span>;
            case 'SENDING':  return <span className="inline-flex items-center gap-1.5 bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-2.5 py-1 rounded-full text-xs font-semibold"><RefreshCw size={11} className="animate-spin"/> Enviando...</span>;
            case 'PAUSED':   return <span className="inline-flex items-center gap-1.5 bg-orange-900/40 text-orange-400 border border-orange-700/50 px-2.5 py-1 rounded-full text-xs font-semibold"><Pause size={11}/> Pausada</span>;
            case 'COMPLETED':return <span className="inline-flex items-center gap-1.5 bg-green-900/40 text-green-400 border border-green-700/50 px-2.5 py-1 rounded-full text-xs font-semibold"><CheckCircle2 size={11}/> Completada</span>;
            default:         return <span className="text-xs text-red-400 px-2 py-1 rounded-full bg-red-900/30 border border-red-700/30">{status}</span>;
        }
    };

    const getProgress = (camp) => {
        if (!camp.totalCount) return 0;
        return Math.round((camp.sentCount / camp.totalCount) * 100);
    };

    return (
        <div className="min-h-screen p-8 text-[#F5F5F7] font-sans" style={{ background: 'var(--chat-bg)' }}>
            <div className="max-w-5xl mx-auto">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 border-b border-[#2D283E] pb-6 gap-4">
                    <div>
                        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors text-sm">
                            <ArrowLeft size={15} /> Volver al Inicio
                        </button>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-900/50 border border-emerald-700/40 flex items-center justify-center">
                                <Megaphone className="text-[#34d399]" size={20} />
                            </div>
                            Campañas de Difusión
                        </h1>
                        <p className="text-gray-400 mt-2 text-sm max-w-2xl">
                            Mensajes masivos por WhatsApp. Solo se envía a pacientes que ya tienen historial de chat con el bot, para evitar bloqueos.
                        </p>
                    </div>
                    <button 
                        onClick={() => setShowModal(true)}
                        className="flex-shrink-0 bg-[#10b981] hover:bg-[#059669] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all text-sm"
                    >
                        <Plus size={16} /> Nueva Campaña
                    </button>
                </div>

                {/* Stats rápidas */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Total campañas', value: campaigns.length, color: '#8263B1' },
                        { label: 'Enviadas', value: campaigns.filter(c => c.status === 'COMPLETED').length, color: '#10b981' },
                        { label: 'En progreso', value: campaigns.filter(c => c.status === 'SENDING').length, color: '#f59e0b' },
                        { label: 'Mensajes totales', value: campaigns.reduce((acc, c) => acc + c.sentCount, 0).toLocaleString(), color: '#A1E3D8' },
                    ].map(stat => (
                        <div key={stat.label} className="bg-[#1E1B26] border border-[#2D283E] rounded-xl p-4">
                            <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Tabla de campañas */}
                <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl overflow-hidden shadow-2xl">
                    {loading ? (
                        <div className="p-12 text-center text-gray-500 flex items-center justify-center gap-3">
                            <RefreshCw size={18} className="animate-spin text-emerald-500" /> Cargando campañas...
                        </div>
                    ) : campaigns.length === 0 ? (
                        <div className="p-16 text-center">
                            <div className="w-20 h-20 bg-[#2D283E] rounded-full flex items-center justify-center mx-auto mb-4">
                                <Megaphone className="text-gray-600" size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">No hay campañas creadas</h3>
                            <p className="text-gray-400 max-w-sm mx-auto text-sm">Crea tu primera campaña para enviar información útil a tus pacientes, como jornadas de salud o avisos importantes.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-[#1A1721] border-b border-[#2D283E]">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Campaña</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Progreso</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Fecha</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2D283E]">
                                {campaigns.map(camp => (
                                    <tr key={camp.id} className="hover:bg-[#2D283E]/40 transition-colors">
                                        <td className="px-6 py-5">
                                            <p className="font-bold text-white mb-0.5">{camp.name}</p>
                                            <p className="text-xs text-gray-500 truncate max-w-[220px]">{camp.messageBody}</p>
                                        </td>
                                        <td className="px-6 py-5">
                                            {getStatusBadge(camp.status)}
                                        </td>
                                        <td className="px-6 py-5 min-w-[140px]">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-gray-400">{camp.sentCount.toLocaleString()} / {camp.totalCount ? camp.totalCount.toLocaleString() : '—'}</span>
                                                    <span className="font-bold" style={{ color: camp.status === 'COMPLETED' ? '#10b981' : '#f59e0b' }}>{getProgress(camp)}%</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-[#1A1721] rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{
                                                            width: `${getProgress(camp)}%`,
                                                            background: camp.status === 'COMPLETED' ? '#10b981' : 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-sm text-gray-400 whitespace-nowrap">
                                            {new Date(camp.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {camp.status === 'DRAFT' && (
                                                    <button
                                                        onClick={() => handleSend(camp.id, camp.name)}
                                                        disabled={actionLoading[camp.id]}
                                                        className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                                                    >
                                                        <Send size={12} /> Enviar
                                                    </button>
                                                )}
                                                {camp.status === 'SENDING' && (
                                                    <button
                                                        onClick={() => handlePause(camp.id)}
                                                        disabled={actionLoading[camp.id]}
                                                        className="bg-orange-700/80 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                                                    >
                                                        <Pause size={12} /> Pausar
                                                    </button>
                                                )}
                                                {camp.status === 'PAUSED' && (
                                                    <button
                                                        onClick={() => handleResume(camp.id)}
                                                        disabled={actionLoading[camp.id]}
                                                        className="bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                                                    >
                                                        <Play size={12} /> Reanudar
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Modal de Nueva Campaña */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-[#1A1721] border border-[#2D283E] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-[#2D283E] flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Redactar Campaña</h2>
                                <p className="text-sm text-gray-400 mt-0.5">El mensaje se guardará como borrador. Tú decides cuándo enviarla.</p>
                            </div>
                        </div>
                        
                        <form onSubmit={handleCreate} className="p-6">
                            <div className="mb-5">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Nombre interno (no se envía)</label>
                                <input 
                                    type="text" 
                                    required
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Ej: Jornada Mamografía Julio 2026"
                                    className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#10b981] transition-colors placeholder-gray-600"
                                />
                            </div>

                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-300">Mensaje de WhatsApp</label>
                                    <button type="button" onClick={() => setPreviewMessage(!previewMessage)} className="text-xs text-[#34d399] hover:underline">
                                        {previewMessage ? 'Editar' : 'Vista previa'}
                                    </button>
                                </div>
                                {!previewMessage ? (
                                    <textarea 
                                        required
                                        rows={9}
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        placeholder={`¡Atención mujeres de Ebéjico!\nSavia Salud las invita a realizarse la mamografía totalmente gratis...\n\n📅 8 - 9 Julio\n📍 Parque Principal\n⏰ 8 am a 5 pm\n\n¡Cuida tu salud! 💚`}
                                        className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#10b981] transition-colors resize-none placeholder-gray-600"
                                    />
                                ) : (
                                    <div className="bg-[#0F0E13] border border-[#2D283E] rounded-xl p-4 min-h-[200px] text-sm text-white whitespace-pre-wrap font-sans">
                                        {newMessage || <span className="text-gray-600">El mensaje aparecerá aquí...</span>}
                                    </div>
                                )}
                                <div className="mt-2 flex items-start gap-2 text-xs text-gray-500 bg-blue-900/10 p-2.5 rounded-lg border border-blue-900/20">
                                    <AlertCircle size={13} className="text-blue-400/70 flex-shrink-0 mt-0.5" />
                                    <p>Usa formato WhatsApp: *<b>negrita</b>*, _<i>cursiva</i>_. Los emojis (📅📍⏰) se muestran tal cual.</p>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end mt-6">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    disabled={creating}
                                    className="bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-colors"
                                >
                                    {creating ? 'Guardando...' : '💾 Guardar Borrador'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
