"use client";

import { useState, useEffect } from 'react';
import { Megaphone, Send, Clock, CheckCircle2, AlertCircle, Plus, RefreshCw, ArrowLeft } from 'lucide-react';
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
    
    const [newName, setNewName] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [creating, setCreating] = useState(false);
    
    useEffect(() => {
        fetchCampaigns();
        const interval = setInterval(fetchCampaigns, 15000); // Poll every 15s
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

    const handleSend = async (id, name) => {
        if (!confirm(`¿Estás seguro que deseas enviar la campaña "${name}" a todos los pacientes? Esto tomará un tiempo y enviará mensajes reales por WhatsApp.`)) return;
        
        try {
            const res = await fetch(`${API_BASE}/api/campaigns/${id}/send`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                fetchCampaigns();
            } else {
                alert(data.error || 'Error al iniciar campaña');
            }
        } catch (e) {
            alert('Error de conexión al enviar campaña');
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'DRAFT': return <span className="bg-gray-800 text-gray-300 border border-gray-600 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><Clock size={12}/> Borrador</span>;
            case 'SENDING': return <span className="bg-yellow-900/40 text-yellow-500 border border-yellow-700/50 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><RefreshCw size={12} className="animate-spin"/> Enviando</span>;
            case 'COMPLETED': return <span className="bg-green-900/40 text-green-400 border border-green-700/50 px-2 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><CheckCircle2 size={12}/> Completada</span>;
            default: return <span className="bg-red-900/40 text-red-400 px-2 py-1 rounded-full text-xs font-semibold">{status}</span>;
        }
    };

    return (
        <div className="min-h-screen p-8 text-[#F5F5F7] font-sans" style={{ background: 'var(--chat-bg)' }}>
            
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8 border-b border-[#2D283E] pb-6">
                    <div>
                        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors">
                            <ArrowLeft size={16} /> Volver al Inicio
                        </button>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <Megaphone className="text-[#34d399]" size={32} />
                            Campañas de Difusión
                        </h1>
                        <p className="text-gray-400 mt-2 max-w-2xl">
                            Envía mensajes masivos por WhatsApp a todos los pacientes registrados. Ideal para jornadas de salud, prevención (como mamografías) o avisos importantes.
                        </p>
                    </div>
                    <button 
                        onClick={() => setShowModal(true)}
                        className="bg-[#10b981] hover:bg-[#059669] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"
                    >
                        <Plus size={18} /> Nueva Campaña
                    </button>
                </div>

                {/* Dashboard / Lista de Campañas */}
                <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl overflow-hidden shadow-2xl">
                    {loading ? (
                        <div className="p-12 text-center text-gray-500">Cargando campañas...</div>
                    ) : campaigns.length === 0 ? (
                        <div className="p-16 text-center">
                            <div className="w-20 h-20 bg-[#2D283E] rounded-full flex items-center justify-center mx-auto mb-4">
                                <Megaphone className="text-gray-500" size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">No hay campañas</h3>
                            <p className="text-gray-400 max-w-md mx-auto">Crea tu primera campaña para enviar información masiva a tus pacientes.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-[#1A1721] border-b border-[#2D283E]">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Nombre</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Estado</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Progreso</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Fecha</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#2D283E]">
                                {campaigns.map(camp => (
                                    <tr key={camp.id} className="hover:bg-[#2D283E]/50 transition-colors">
                                        <td className="px-6 py-5">
                                            <p className="font-bold text-white">{camp.name}</p>
                                            <p className="text-xs text-gray-500 mt-1 truncate max-w-xs">{camp.messageBody}</p>
                                        </td>
                                        <td className="px-6 py-5">
                                            {getStatusBadge(camp.status)}
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between text-xs text-gray-400">
                                                    <span>{camp.sentCount} / {camp.totalCount || '-'}</span>
                                                    <span>{camp.totalCount ? Math.round((camp.sentCount/camp.totalCount)*100) : 0}%</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-[#1A1721] rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-[#10b981] transition-all duration-500" 
                                                        style={{ width: `${camp.totalCount ? (camp.sentCount/camp.totalCount)*100 : 0}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-sm text-gray-400">
                                            {new Date(camp.createdAt).toLocaleDateString('es-CO')}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            {camp.status === 'DRAFT' && (
                                                <button 
                                                    onClick={() => handleSend(camp.id, camp.name)}
                                                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2 ml-auto transition-colors"
                                                >
                                                    <Send size={14} /> Enviar ahora
                                                </button>
                                            )}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[#1E1B26] border border-[#2D283E] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-[#2D283E]">
                            <h2 className="text-xl font-bold text-white">Redactar Nueva Campaña</h2>
                            <p className="text-sm text-gray-400 mt-1">Este mensaje se enviará a todos los pacientes.</p>
                        </div>
                        
                        <form onSubmit={handleCreate} className="p-6">
                            <div className="mb-5">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Nombre de la campaña (Interno)</label>
                                <input 
                                    type="text" 
                                    required
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Ej: Jornada Mamografía Julio"
                                    className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-[#10b981] transition-colors"
                                />
                            </div>

                            <div className="mb-5">
                                <label className="block text-sm font-medium text-gray-300 mb-2">Mensaje de WhatsApp</label>
                                <textarea 
                                    required
                                    rows={8}
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="¡Atención mujeres de Ebéjico!..."
                                    className="w-full bg-[#0F0E13] border border-[#2D283E] text-white rounded-xl px-4 py-3 focus:outline-none focus:border-[#10b981] transition-colors resize-none"
                                />
                                <div className="mt-2 text-xs flex items-start gap-2 text-gray-400 bg-blue-900/20 p-3 rounded-lg border border-blue-900/30">
                                    <AlertCircle size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                                    <p>Recuerda usar formato de WhatsApp: *negrita*, _cursiva_, ~tachado~. Puedes copiar y pegar emojis sin problema.</p>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end mt-8">
                                <button 
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-5 py-2.5 text-sm font-bold text-gray-400 hover:text-white transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    disabled={creating}
                                    className="bg-[#10b981] hover:bg-[#059669] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-colors flex items-center gap-2"
                                >
                                    {creating ? 'Guardando...' : 'Guardar Borrador'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
