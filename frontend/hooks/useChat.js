import { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// Auto-detectar si estamos en producción (nube) o local
const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const PROTOCOL = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const API_URL = `${PROTOCOL}//${SERVER_HOST}:3001/api`;
const SOCKET_URL = `${PROTOCOL}//${SERVER_HOST}:3001`;

export function useChat() {
    const [socket, setSocket] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [filter, setFilter] = useState('all'); // all, pending, assigned, bot
    const [appointmentsCount, setAppointmentsCount] = useState(0);

    // Connect to Socket
    useEffect(() => {
        const newSocket = io(SOCKET_URL);
        setSocket(newSocket);

        return () => newSocket.close();
    }, []);

    // Socket Events
    useEffect(() => {
        if (!socket) return;

        socket.on('new_message', async (msg) => {
            // 1. Si la conversación está activa, agregar el mensaje al hilo visible
            if (activeConversationId === msg.conversationId) {
                setMessages((prev) => {
                    if (prev.some(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
            }

            // 2. Actualizar la vista previa en el sidebar
            setConversations((prev) => {
                const index = prev.findIndex(c => c.id === msg.conversationId);

                if (index === -1) {
                    // Conversación desconocida → solicitar lista actualizada al servidor
                    axios.get(`${API_URL}/conversations`)
                        .then(res => setConversations(res.data))
                        .catch(() => {});
                    return prev;
                }

                const updated = [...prev];
                const conv = { ...updated[index] };
                conv.lastMessageAt = msg.timestamp;
                conv.messages = [msg];
                // Incrementar no leídos solo si el mensaje es entrante y la conv no está activa
                if (activeConversationId !== msg.conversationId && !msg.fromMe) {
                    conv.unreadCount = (conv.unreadCount || 0) + 1;
                }

                // Mover la conversación al tope de la lista
                updated.splice(index, 1);
                updated.unshift(conv);
                return updated;
            });
        });

        socket.on('conversation_updated', (updatedConv) => {
            setConversations((prev) => {
                return prev.map(c => c.id === updatedConv.id ? { ...c, ...updatedConv } : c);
            });
        });

        socket.on('new_appointment', async () => {
            try {
                const res = await axios.get(`${API_URL}/appointments`);
                setAppointmentsCount(res.data.length);
            } catch (err) {
                console.error('Failed to refresh appointment count', err);
            }
        });

        return () => {
            socket.off('new_message');
            socket.off('conversation_updated');
            socket.off('new_appointment');
        };
    }, [socket, activeConversationId]);

    // Load Conversations (re-fetch on filter change)
    useEffect(() => {
        fetchConversations();
    }, [filter]);

    // Polling de respaldo cada 30 segundos para no perder mensajes por fallos de socket
    useEffect(() => {
        const interval = setInterval(() => {
            fetchConversations();
        }, 30000);
        return () => clearInterval(interval);
    }, [filter]);

    // Load Appointments Count — carga inicial + polling cada 60 s como respaldo al socket
    useEffect(() => {
        const fetchCount = async () => {
            try {
                const res = await axios.get(`${API_URL}/appointments`);
                setAppointmentsCount(res.data.length);
            } catch (err) {
                console.error('Failed to fetch appointment count', err);
            }
        };
        fetchCount();
        const interval = setInterval(fetchCount, 60000);
        return () => clearInterval(interval);
    }, []);

    const fetchConversations = async () => {
        try {
            const params = filter === 'all' ? {} : { status: filter };
            const res = await axios.get(`${API_URL}/conversations`, { params });
            setConversations(res.data);
        } catch (err) {
            console.error("Failed to fetch conversations", err);
        }
    };

    // Load Messages when active chat changes
    useEffect(() => {
        if (!activeConversationId) return;

        const fetchMessages = async () => {
            try {
                const res = await axios.get(`${API_URL}/conversations/${activeConversationId}/messages`);
                setMessages(res.data);

                // Marcar como leídos localmente
                setConversations(prev =>
                    prev.map(c => c.id === activeConversationId ? { ...c, unreadCount: 0 } : c)
                );
            } catch (err) {
                console.error("Failed to fetch messages", err);
            }
        };

        fetchMessages();

        // Polling de mensajes cada 5 segundos mientras la conversación está activa
        // Esto garantiza que nunca se pierda un mensaje aunque el socket falle
        const pollInterval = setInterval(fetchMessages, 5000);
        return () => clearInterval(pollInterval);
    }, [activeConversationId]);

    const sendMessage = async (text, file) => {
        if (!activeConversationId) return;

        const formData = new FormData();
        formData.append('conversationId', activeConversationId);
        if (text) formData.append('text', text);
        if (file) formData.append('file', file);

        try {
            await axios.post(`${API_URL}/messages/send`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            // El mensaje llegará via socket 'new_message' emitido por el servidor
        } catch (err) {
            console.error("Failed to send", err);
        }
    };

    const updateStatus = async (conversationId, status) => {
        try {
            await axios.post(`${API_URL}/conversations/${conversationId}/status`, { status });
        } catch (err) {
            console.error("Failed to update status", err);
        }
    }

    return {
        socket,
        conversations,
        activeConversationId,
        setActiveConversationId,
        messages,
        sendMessage,
        filter,
        setFilter,
        updateStatus,
        appointmentsCount,
        setAppointmentsCount,
    };
}
