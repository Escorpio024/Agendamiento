"use client";

import { useState, useEffect } from 'react';
import { Calendar, BarChart3, Clock, CalendarDays, Loader2 } from 'lucide-react';

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const API_BASE = `${PROTOCOL}//${SERVER_HOST}:3001`;

// --- Date Utils ---
const getStartOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

const getStartOfWeek = () => {
    const d = getStartOfToday();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
};

const getStartOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
};

export default function AgendamientoDashboard() {
    const [filterView, setFilterView] = useState('Semana'); // 'Dia', 'Semana', 'Mes'
    const [loading, setLoading] = useState(true);
    const [allAppointments, setAllAppointments] = useState([]);

    useEffect(() => {
        const fetchAppointments = async () => {
            setLoading(true);
            try {
                const res = await fetch(`${API_BASE}/api/appointments`);
                if (res.ok) {
                    const data = await res.json();
                    setAllAppointments(data);
                }
            } catch (err) {
                console.error("Error fetching appointments:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAppointments();
    }, []);

    // Filter appointments based on selected view
    const filteredAppointments = allAppointments.filter(app => {
        const targetDate = app.appointmentDate 
            ? new Date(app.appointmentDate + 'T12:00:00') 
            : new Date(app.createdAt);
            
        if (isNaN(targetDate.getTime())) return false;

        const today = getStartOfToday();
        const startWeek = getStartOfWeek();
        const startMonth = getStartOfMonth();

        if (filterView === 'Dia') {
            return targetDate >= today && targetDate < new Date(today.getTime() + 86400000);
        } else if (filterView === 'Semana') {
            return targetDate >= startWeek && targetDate < new Date(startWeek.getTime() + 7 * 86400000);
        } else if (filterView === 'Mes') {
            const endMonth = new Date(startMonth.getFullYear(), startMonth.getMonth() + 1, 0, 23, 59, 59);
            return targetDate >= startMonth && targetDate <= endMonth;
        }
        return true;
    });

    // Generate Chart Data
    let chartData = [];
    if (filterView === 'Dia') {
        // Horas (6am a 6pm)
        const hours = Array.from({ length: 13 }, (_, i) => i + 6);
        chartData = hours.map(h => ({ label: `${h}:00`, value: 0, key: h }));
        
        filteredAppointments.forEach(app => {
            let hour = null;
            if (app.appointmentTime) {
                hour = parseInt(app.appointmentTime.split(':')[0], 10);
            } else {
                hour = new Date(app.createdAt).getHours();
            }
            if (hour >= 6 && hour <= 18) {
                const bin = chartData.find(d => d.key === hour);
                if (bin) bin.value += 1;
            }
        });
    } else if (filterView === 'Semana') {
        // Días (L, M, M, J, V, S, D)
        chartData = [
            { label: 'L', value: 0, key: 1 },
            { label: 'M', value: 0, key: 2 },
            { label: 'M', value: 0, key: 3 },
            { label: 'J', value: 0, key: 4 },
            { label: 'V', value: 0, key: 5 },
            { label: 'S', value: 0, key: 6 },
            { label: 'D', value: 0, key: 0 } // Sunday is 0 in JS
        ];
        filteredAppointments.forEach(app => {
            const targetDate = app.appointmentDate 
                ? new Date(app.appointmentDate + 'T12:00:00') 
                : new Date(app.createdAt);
            const day = targetDate.getDay();
            const bin = chartData.find(d => d.key === day);
            if (bin) bin.value += 1;
        });
    } else if (filterView === 'Mes') {
        // Semanas (S1, S2, S3, S4, S5)
        chartData = [
            { label: 'Sem 1', value: 0, key: 1 },
            { label: 'Sem 2', value: 0, key: 2 },
            { label: 'Sem 3', value: 0, key: 3 },
            { label: 'Sem 4', value: 0, key: 4 },
            { label: 'Sem 5', value: 0, key: 5 }
        ];
        const startMonth = getStartOfMonth();
        filteredAppointments.forEach(app => {
            const targetDate = app.appointmentDate 
                ? new Date(app.appointmentDate + 'T12:00:00') 
                : new Date(app.createdAt);
            const date = targetDate.getDate();
            // Approx week of month
            const week = Math.ceil((date + startMonth.getDay() - 1) / 7) || 1;
            const binKey = week > 5 ? 5 : week;
            const bin = chartData.find(d => d.key === binKey);
            if (bin) bin.value += 1;
        });
    }

    const maxValue = Math.max(...chartData.map(d => d.value), 1); // evite divide by zero
    const chartHeight = 180;
    const barWidth = filterView === 'Mes' ? 40 : filterView === 'Semana' ? 30 : 20;

    return (
        <div className="flex-1 flex flex-col items-center justify-start p-8 chat-bg h-full overflow-y-auto w-full">
            <div className="w-full max-w-4xl flex flex-col gap-6">
                
                {/* Header & Filters */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            Resumen de Agendamientos
                        </h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                            Monitorea la cantidad de citas agendadas según el período seleccionado.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 bg-[#1A1721] p-1.5 rounded-xl border border-[#2D283E]">
                        {['Dia', 'Semana', 'Mes'].map(v => (
                            <button
                                key={v}
                                onClick={() => setFilterView(v)}
                                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2"
                                style={{
                                    background: filterView === v ? '#8263B1' : 'transparent',
                                    color: filterView === v ? '#F5F5F7' : 'var(--text-muted)'
                                }}
                            >
                                {v === 'Dia' && <Clock size={14} />}
                                {v === 'Semana' && <CalendarDays size={14} />}
                                {v === 'Mes' && <Calendar size={14} />}
                                {v}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Bar Chart Section */}
                <div 
                    className="w-full p-6 rounded-2xl border flex flex-col"
                    style={{ background: 'rgba(30,27,38,0.7)', borderColor: 'var(--border)' }}
                >
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-[#8263B1]/20 flex items-center justify-center">
                            <BarChart3 size={20} className="text-[#C4AFED]" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-[#F5F5F7]">
                                Actividad de Agendamiento ({filterView})
                            </h2>
                            <p className="text-xs text-[#A1E3D8]/70 font-semibold uppercase tracking-widest mt-0.5">
                                Total periodo: {filteredAppointments.length} citas
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="h-[200px] flex items-center justify-center">
                            <Loader2 size={30} className="animate-spin text-[#8263B1]" />
                        </div>
                    ) : (
                        <div className="w-full flex items-end justify-around relative px-4" style={{ height: chartHeight }}>
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="w-full border-t border-[#F5F5F7]" />
                                ))}
                            </div>

                            {chartData.map((d, i) => {
                                const height = (d.value / maxValue) * chartHeight * 0.85; // Max 85% height
                                return (
                                    <div key={i} className="flex flex-col items-center justify-end h-full z-10 group relative">
                                        <div 
                                            className="rounded-t-lg transition-all duration-500 ease-out flex items-start justify-center pt-2 overflow-hidden relative"
                                            style={{ 
                                                width: barWidth, 
                                                height: Math.max(height, 4), // min height 4px for empty bars
                                                background: d.value > 0 ? 'linear-gradient(180deg, #8263B1 0%, rgba(130,99,177,0.3) 100%)' : 'rgba(245,245,247,0.05)',
                                                border: d.value > 0 ? '1px solid rgba(196,175,237,0.4)' : 'none',
                                                borderBottom: 'none'
                                            }}
                                        >
                                            {/* Glow on hover */}
                                            {d.value > 0 && (
                                                <div className="absolute inset-0 bg-[#A1E3D8] opacity-0 group-hover:opacity-20 transition-opacity" />
                                            )}
                                        </div>
                                        
                                        {/* Value tooltip on hover */}
                                        <div className="absolute -top-8 bg-[#1A1721] text-[#A1E3D8] text-[10px] font-bold px-2 py-1 rounded border border-[#8263B1]/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                            {d.value} citas
                                        </div>

                                        <span className="text-xs font-semibold mt-3 text-[#F5F5F7]/50 group-hover:text-[#F5F5F7] transition-colors">
                                            {d.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Table Section */}
                <div 
                    className="w-full rounded-2xl border flex flex-col flex-1 overflow-hidden"
                    style={{ background: 'rgba(30,27,38,0.7)', borderColor: 'var(--border)' }}
                >
                    <div className="px-6 py-4 border-b border-[#2D283E]">
                        <h3 className="font-bold text-[#F5F5F7]">Listado de Citas ({filterView})</h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto max-h-[300px]">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-[#1A1721] z-10 border-b border-[#2D283E]">
                                <tr>
                                    <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase text-[#F5F5F7]/40">Paciente</th>
                                    <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase text-[#F5F5F7]/40">Cédula</th>
                                    <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase text-[#F5F5F7]/40">Fecha Cita</th>
                                    <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase text-[#F5F5F7]/40">Especialista</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="4" className="text-center py-8 text-[#F5F5F7]/30 text-sm">Cargando...</td>
                                    </tr>
                                ) : filteredAppointments.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="text-center py-8 text-[#F5F5F7]/30 text-sm">No hay citas en este periodo.</td>
                                    </tr>
                                ) : (
                                    filteredAppointments.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map((app, i) => (
                                        <tr key={i} className="hover:bg-[#2D283E]/30 transition-colors border-b border-[#2D283E]/30 last:border-0">
                                            <td className="px-6 py-3 text-sm font-semibold text-[#F5F5F7]">{app.patientName || '—'}</td>
                                            <td className="px-6 py-3 text-xs text-[#F5F5F7]/60">{app.patientDocument || '—'}</td>
                                            <td className="px-6 py-3 text-xs text-[#F5F5F7]/80">
                                                {app.appointmentDate || '—'} {app.appointmentTime || ''}
                                            </td>
                                            <td className="px-6 py-3 text-xs text-[#F5F5F7]/80">{app.doctorName || '—'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}
