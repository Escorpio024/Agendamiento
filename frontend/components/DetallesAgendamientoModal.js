"use client";

import { X, CalendarCheck2, Heart, Search, FileText, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function DetallesAgendamientoModal({ onClose, data }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterModule, setFilterModule] = useState('ALL'); // ALL | GENERAL | CVD

    const filteredData = data.filter(item => {
        if (filterModule !== 'ALL' && item.modulo !== filterModule) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (
                (item.paciente && item.paciente.toLowerCase().includes(term)) ||
                (item.documento && item.documento.toLowerCase().includes(term)) ||
                (item.doctor && item.doctor.toLowerCase().includes(term))
            );
        }
        return true;
    });

    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadPDF = async () => {
        setIsDownloading(true);
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            
            const element = document.createElement('div');
            element.innerHTML = `
                <div style="padding: 20px; font-family: Arial, sans-serif; color: #333;">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <h2 style="margin: 0; color: #1e1b26;">Reporte de Agendamientos</h2>
                        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Generado el ${new Date().toLocaleString('es-CO')}</p>
                        <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Total de registros: ${filteredData.length}</p>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="background-color: #f3f4f6; text-align: left;">
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Módulo</th>
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Paciente</th>
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Cédula</th>
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Fecha Cita</th>
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Especialista</th>
                                <th style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Servicio/Examen</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredData.map(item => `
                                <tr>
                                    <td style="padding: 8px 10px; border: 1px solid #ddd;">${item.modulo}</td>
                                    <td style="padding: 8px 10px; border: 1px solid #ddd;">${item.paciente || '—'}</td>
                                    <td style="padding: 8px 10px; border: 1px solid #ddd;">${item.documento || '—'}</td>
                                    <td style="padding: 8px 10px; border: 1px solid #ddd;">${item.fecha ? `${item.fecha} ${item.hora || ''}` : '—'}</td>
                                    <td style="padding: 8px 10px; border: 1px solid #ddd;">${item.doctor || '—'}</td>
                                    <td style="padding: 8px 10px; border: 1px solid #ddd;">${item.servicio || '—'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            const opt = {
                margin:       10,
                filename:     `reporte_agendamientos_${new Date().getTime()}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };

            await html2pdf().set(opt).from(element).save();
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Hubo un error al generar el PDF.");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(8,7,12,0.88)', backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
                style={{ background: 'rgba(20,18,28,0.98)', border: '1px solid rgba(130,99,177,0.3)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
                    style={{ borderColor: 'rgba(130,99,177,0.2)' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                            style={{ background: 'linear-gradient(135deg, #2D283E 0%, #1A1721 100%)', border: '1px solid rgba(130,99,177,0.4)' }}
                        >
                            <FileText size={18} color="#C4AFED" />
                        </div>
                        <div>
                            <p className="text-[10px] tracking-widest uppercase font-semibold"
                                style={{ color: 'rgba(196,175,237,0.6)' }}>
                                Consolidado del Mes
                            </p>
                            <h2 className="text-lg font-bold" style={{ color: '#F5F5F7' }}>
                                Detalles de Agendamientos
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleDownloadPDF}
                            disabled={isDownloading || filteredData.length === 0}
                            className="h-8 px-3 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: '1px solid rgba(16,185,129,0.4)', boxShadow: '0 2px 8px rgba(16,185,129,0.2)' }}
                        >
                            {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                            Descargar PDF
                        </button>
                        <button onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ background: 'rgba(245,245,247,0.06)', color: 'rgba(245,245,247,0.5)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(177,64,64,0.2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,245,247,0.06)'}
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0 gap-4"
                    style={{ borderColor: 'rgba(130,99,177,0.1)' }}
                >
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setFilterModule('ALL')}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                            style={{
                                background: filterModule === 'ALL' ? 'rgba(130,99,177,0.3)' : 'transparent',
                                color: filterModule === 'ALL' ? '#C4AFED' : 'rgba(245,245,247,0.5)',
                                border: `1px solid ${filterModule === 'ALL' ? 'rgba(130,99,177,0.5)' : 'transparent'}`
                            }}
                        >
                            Todos ({data.length})
                        </button>
                        <button
                            onClick={() => setFilterModule('GENERAL')}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                            style={{
                                background: filterModule === 'GENERAL' ? 'rgba(130,99,177,0.3)' : 'transparent',
                                color: filterModule === 'GENERAL' ? '#A1E3D8' : 'rgba(245,245,247,0.5)',
                                border: `1px solid ${filterModule === 'GENERAL' ? 'rgba(130,99,177,0.5)' : 'transparent'}`
                            }}
                        >
                            <CalendarCheck2 size={13} /> General
                        </button>
                        <button
                            onClick={() => setFilterModule('CVD')}
                            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                            style={{
                                background: filterModule === 'CVD' ? 'rgba(177,64,64,0.2)' : 'transparent',
                                color: filterModule === 'CVD' ? '#F9A8A8' : 'rgba(245,245,247,0.5)',
                                border: `1px solid ${filterModule === 'CVD' ? 'rgba(177,64,64,0.4)' : 'transparent'}`
                            }}
                        >
                            <Heart size={13} /> Cardiovascular
                        </button>
                    </div>

                    <div className="relative w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={14} style={{ color: 'rgba(245,245,247,0.3)' }} />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar paciente, cédula, doc..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs outline-none transition-all"
                            style={{
                                background: 'rgba(15,14,19,0.5)',
                                border: '1px solid rgba(130,99,177,0.3)',
                                color: '#F5F5F7'
                            }}
                            onFocus={e => e.target.style.borderColor = 'rgba(130,99,177,0.8)'}
                            onBlur={e => e.target.style.borderColor = 'rgba(130,99,177,0.3)'}
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10" style={{ background: 'rgba(20,18,28,0.95)', backdropFilter: 'blur(4px)' }}>
                            <tr>
                                <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(245,245,247,0.4)', borderBottom: '1px solid rgba(130,99,177,0.2)' }}>Módulo</th>
                                <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(245,245,247,0.4)', borderBottom: '1px solid rgba(130,99,177,0.2)' }}>Paciente</th>
                                <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(245,245,247,0.4)', borderBottom: '1px solid rgba(130,99,177,0.2)' }}>Cédula</th>
                                <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(245,245,247,0.4)', borderBottom: '1px solid rgba(130,99,177,0.2)' }}>Fecha Cita</th>
                                <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(245,245,247,0.4)', borderBottom: '1px solid rgba(130,99,177,0.2)' }}>Especialista</th>
                                <th className="px-6 py-3 text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(245,245,247,0.4)', borderBottom: '1px solid rgba(130,99,177,0.2)' }}>Servicio/Examen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="py-12 text-center text-sm" style={{ color: 'rgba(245,245,247,0.4)' }}>
                                        No se encontraron resultados
                                    </td>
                                </tr>
                            ) : (
                                filteredData.map((item, i) => (
                                    <tr key={i} className="hover:bg-[rgba(45,40,62,0.3)] transition-colors border-b" style={{ borderColor: 'rgba(130,99,177,0.05)' }}>
                                        <td className="px-6 py-3">
                                            {item.modulo === 'GENERAL' ? (
                                                <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full w-max" style={{ background: 'rgba(130,99,177,0.15)', color: '#C4AFED', border: '1px solid rgba(130,99,177,0.3)' }}>
                                                    <CalendarCheck2 size={10} /> General
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full w-max" style={{ background: 'rgba(177,64,64,0.15)', color: '#F9A8A8', border: '1px solid rgba(177,64,64,0.3)' }}>
                                                    <Heart size={10} /> Cardio
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-sm font-semibold" style={{ color: '#F5F5F7' }}>{item.paciente || '—'}</td>
                                        <td className="px-6 py-3 text-xs" style={{ color: 'rgba(245,245,247,0.6)' }}>{item.documento || '—'}</td>
                                        <td className="px-6 py-3 text-xs" style={{ color: 'rgba(245,245,247,0.8)' }}>
                                            {item.fecha ? `${item.fecha} ${item.hora || ''}` : '—'}
                                        </td>
                                        <td className="px-6 py-3 text-xs" style={{ color: 'rgba(245,245,247,0.8)' }}>{item.doctor || '—'}</td>
                                        <td className="px-6 py-3 text-xs" style={{ color: 'rgba(245,245,247,0.8)' }}>{item.servicio || '—'}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
