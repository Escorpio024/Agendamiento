import { useRef, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:3001';

export default function MessageList({ messages, currentBuffer }) {
    const endRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        <div className="flex-1 overflow-y-auto p-6 bg-[#efeae2]" style={{
            backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px)',
            backgroundSize: '20px 20px'
        }}>
            {messages.map((msg, index) => (
                <div
                    key={`${msg.id}-${index}`}
                    className={`flex mb-3 ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                >
                    <div
                        className={`max-w-[80%] rounded-2xl shadow-sm relative ${msg.fromMe
                            ? 'bg-[#d9fdd3] rounded-br-md'
                            : 'bg-white rounded-bl-md'
                            }`}
                    >
                        {/* Sender Label for incoming */}
                        {!msg.fromMe && (
                            <div className="px-4 pt-3 pb-1">
                                <span className="text-xs font-semibold text-emerald-600">
                                    👤 Paciente
                                </span>
                            </div>
                        )}

                        {/* Message Body */}
                        <div className="px-4 py-2">
                            {msg.body && (
                                <p className="text-[#111b21] text-[15px] leading-[22px] whitespace-pre-wrap">
                                    {msg.body.replace(/\\n/g, '\n')}
                                </p>
                            )}

                            {/* Media */}
                            {msg.mediaUrl && (
                                <div className="mt-2">
                                    {renderMedia(msg)}
                                </div>
                            )}
                        </div>

                        {/* Timestamp */}
                        <div className="px-4 pb-2 flex justify-end items-center gap-1">
                            <span className="text-[11px] text-[#667781]">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.fromMe && (
                                <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 16 11" fill="currentColor">
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
