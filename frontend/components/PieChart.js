"use client";

import { useEffect, useState } from 'react';

export default function PieChart({ data, size = 160 }) {
    const [dashArrays, setDashArrays] = useState([]);
    
    // Configuración del círculo SVG para comportarse como pie chart
    const center = size / 2;
    const strokeWidth = size / 2;
    const radius = size / 4;
    const circumference = 2 * Math.PI * radius;
    
    useEffect(() => {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        let currentOffset = 0;
        
        const calculated = data.map(item => {
            const percentage = total === 0 ? 0 : (item.value / total);
            // La longitud del borde que pintaremos
            const strokeDasharray = `${percentage * circumference} ${circumference}`;
            // El desplazamiento (offset) negativo para que empiece donde terminó el anterior
            const strokeDashoffset = -currentOffset;
            
            // Avanzar el offset
            currentOffset += percentage * circumference;
            
            return {
                ...item,
                strokeDasharray,
                strokeDashoffset
            };
        });
        
        // Animación suave de entrada
        const timer = setTimeout(() => setDashArrays(calculated), 100);
        return () => clearTimeout(timer);
    }, [data, circumference]);

    const total = data.reduce((sum, item) => sum + item.value, 0);

    return (
        <div className="relative flex items-center justify-center transition-all" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90 drop-shadow-xl rounded-full overflow-hidden">
                {total === 0 ? (
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="transparent"
                        stroke="rgba(245,245,247,0.05)"
                        strokeWidth={strokeWidth}
                    />
                ) : (
                    dashArrays.map((slice, i) => (
                        <circle
                            key={i}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="transparent"
                            stroke={slice.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={slice.strokeDasharray || `0 ${circumference}`}
                            strokeDashoffset={slice.strokeDashoffset || 0}
                            style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                        />
                    ))
                )}
            </svg>
        </div>
    );
}
