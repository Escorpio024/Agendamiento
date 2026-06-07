import { useRef, useEffect } from 'react';

const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const BACKEND_URL = `${PROTOCOL}//${SERVER_HOST}:3001`;

export default function MessageList({ messages, currentBuffer }) {
    const endRef = useRef(null);
    const containerRef = useRef(null);
    const isFirstLoad = useRef(true);

    useEffect(() => {
        if (!containerRef.current) return;
        
        if (isFirstLoad.current) {
            endRef.current?.scrollIntoView({ behavior: 'auto' });
            if (messages && messages.length > 0) {
                isFirstLoad.current = false;
            }
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        // Si el usuario está cerca del final (a menos de 150px), hacemos auto-scroll para el nuevo mensaje
        if (scrollHeight - scrollTop - clientHeight < 150) {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const renderMedia = (msg) => {
        if (!msg.mediaUrl) return null;

        const fullUrl = msg.mediaUrl.startsWith('http') ? msg.mediaUrl : `${BACKEND_URL}${msg.mediaUrl}`;
        const ext = fullUrl.split('.').pop().toLowerCase();

        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            return (
                <div className="mt-2 text-center ml-auto mr-auto">
                    <img
                        src={fullUrl}
                        alt="Media"
                        className="max-w-[200px] max-h-[200px] rounded-lg border border-gray-200"
                        loading="lazy"
                    />
                </div>
            );
        }

        if (['mp3', 'ogg', 'wav'].includes(ext)) {
            return (
                <div className="mt-2 min-w-[200px]">
                    <audio controls src={fullUrl} className="w-full" />
                </div>
            );
        }

        return (
            <div className="mt-2">
                <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 underline flex items-center gap-2"
                >
                    📎 Descargar Archivo
                </a>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex-1 overflow-y-auto p-6 bg-[#0F0E13]" style={{
            backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px)',
            backgroundSize: '20px 20px'
        }}>
            {messages.map((msg, index) => (
                <div
                    key={`${msg.id}-${index}`}
                    className={`flex mb-3 ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                >
                    <div
                        className={`max-w-[80%] rounded-2xl shadow-md relative ${msg.fromMe
                            ? 'bg-[#8263B1] rounded-br-md text-[#F5F5F7]'
                            : 'bg-[#2D283E] rounded-bl-md text-[#F5F5F7]'
                            }`}
                    >
                        {/* Sender Label for incoming */}
                        {!msg.fromMe && (
                            <div className="px-4 pt-3 pb-1">
                                <span className="text-xs font-semibold text-[#A1E3D8]">
                                    👤 Paciente
                                </span>
                            </div>
                        )}

                        {/* Message Body */}
                        <div className="px-4 py-2">
                            {msg.body && (
                                <p className="text-[15px] leading-[22px] whitespace-pre-wrap">
                                    {msg.body.replace(/\\n/g, '\n')}
                                </p>
                            )}

                            {/* Media */}
                            {msg.mediaUrl && (
                                <div className="mt-2 text-[#A1E3D8]">
                                    {renderMedia(msg)}
                                </div>
                            )}
                        </div>

                        {/* Timestamp */}
                        <div className="px-4 pb-2 flex justify-end items-center gap-1">
                            <span className="text-[11px] opacity-70">
                                {new Date(msg.timestamp).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.fromMe && (
                                <svg className="w-4 h-4 text-[#A1E3D8]" viewBox="0 0 16 11" fill="currentColor">
                                    <path d="M11.071.653a.75.75 0 0 1 1.06 0l4.243 4.243a.75.75 0 0 1 0 1.06l-4.243 4.243a.75.75 0 0 1-1.06-1.06L14.44 5.75H.75a.75.75 0 0 1 0-1.5h13.69L11.071 1.713a.75.75 0 0 1 0-1.06z" />
                                    <path d="M5.071.653a.75.75 0 0 1 1.06 0l4.243 4.243a.75.75 0 0 1 0 1.06L6.131 10.2a.75.75 0 1 1-1.06-1.06L8.44 5.75H.75a.75.75 0 0 1 0-1.5h7.69L5.071 1.713a.75.75 0 0 1 0-1.06z" />
                                </svg>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            <div ref={endRef} />
        </div>
    );
}
