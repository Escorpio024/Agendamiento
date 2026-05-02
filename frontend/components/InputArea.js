import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, X } from 'lucide-react';

export default function InputArea({ onSend }) {
    const [text, setText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const textareaRef = useRef(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    }, [text]);

    const handleSend = () => {
        if (!text.trim()) return;
        onSend(text, null);
        setText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="bg-[#1E1B26] px-4 py-2 flex items-end gap-2 border-t border-[#2D283E] min-h-[62px]">
            {/* Attach Button */}
            <button className="p-2 text-[#A1E3D8] hover:bg-[#3D3754] rounded-full transition-colors mb-1">
                <Paperclip size={24} />
            </button>

            {/* Input Container */}
            <div className="flex-1 bg-[#0F0E13] rounded-lg flex items-center px-4 py-2 border border-[#2D283E] focus-within:border-[#8263B1] mb-1 transition-colors">
                <textarea
                    ref={textareaRef}
                    placeholder="Escribe un mensaje"
                    className="flex-1 outline-none text-[#F5F5F7] bg-transparent resize-none max-h-[120px] py-1 text-[15px] leading-[20px] placeholder-gray-500"
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
            </div>

            {/* Mic / Send Button */}
            {text.trim() ? (
                <button
                    className="p-3 bg-[#A1E3D8] text-[#0F0E13] rounded-full hover:bg-teal-400 transition-colors mb-1 shadow-sm"
                    onClick={handleSend}
                >
                    <Send size={20} />
                </button>
            ) : (
                <button className="p-3 text-[#A1E3D8] hover:bg-[#3D3754] rounded-full transition-colors mb-1">
                    <Mic size={24} />
                </button>
            )}
        </div>
    );
}
