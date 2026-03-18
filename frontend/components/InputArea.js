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
        <div className="bg-[#f0f2f5] px-4 py-2 flex items-end gap-2 border-t border-[#e9edef] min-h-[62px]">
            {/* Attach Button */}
            <button className="p-2 text-[#54656f] hover:bg-gray-200 rounded-full transition-colors mb-1">
                <Paperclip size={24} />
            </button>

            {/* Input Container */}
            <div className="flex-1 bg-white rounded-lg flex items-center px-4 py-2 border border-white focus-within:border-white mb-1">
                <textarea
                    ref={textareaRef}
                    placeholder="Escribe un mensaje"
                    className="flex-1 outline-none text-[#111b21] bg-transparent resize-none max-h-[120px] py-1 text-[15px] leading-[20px]"
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
            </div>

            {/* Mic / Send Button */}
            {text.trim() ? (
                <button
                    className="p-3 bg-[#00a884] text-white rounded-full hover:bg-[#008f6f] transition-colors mb-1 shadow-sm"
                    onClick={handleSend}
                >
                    <Send size={20} />
                </button>
            ) : (
                <button className="p-3 text-[#54656f] hover:bg-gray-200 rounded-full transition-colors mb-1">
                    <Mic size={24} />
                </button>
            )}
        </div>
    );
}
