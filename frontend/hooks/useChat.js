import { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

// Auto-detectar si estamos en producción (nube) o local
const IS_PROD = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
const SERVER_HOST = IS_PROD ? window.location.hostname : 'localhost';
const API_URL = `http://${SERVER_HOST}:3001/api`;
const SOCKET_URL = `http://${SERVER_HOST}:3001`;

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

        socket.on('new_message', (msg) => {
            // Update messages if active chat
            if (activeConversationId === msg.conversationId) {
                setMessages((prev) => {
                    if (prev.some(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
            }

            // Update conversation list preview / unread
            setConversations((prev) => {
                const index = prev.findIndex(c => c.id === msg.conversationId);
                if (index === -1) return prev; // Or fetch new conversation

                const updated = [...prev];
                const conv = { ...updated[index] };
                conv.lastMessageAt = msg.timestamp;
                conv.messages = [msg]; // Start preview
                if (activeConversationId !== msg.conversationId && !msg.fromMe) {
                    conv.unreadCount += 1;
                }

                updated.splice(index, 1);
                updated.unshift(conv); // Move to top
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

    // Load Conversations
    useEffect(() => {
        fetchConversations();
    }, [filter]);

    // Load Appointments Count
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

                // Mark as read locally (could call API)
                setConversations(prev =>
                    prev.map(c => c.id === activeConversationId ? { ...c, unreadCount: 0 } : c)
                );
            } catch (err) {
                console.error("Failed to fetch messages", err);
            }
        };

        fetchMessages();
    }, [activeConversationId]);

    const sendMessage = async (text, file) => {
        if (!activeConversationId) return;

        // Optimistic update
        const tempId = Date.now().toString();
        /*
        const tempMsg = {
            id: tempId,
            conversationId: activeConversationId,
            fromMe: true,
            body: text || (file ? '[Archivo]' : ''),
            timestamp: new Date().toISOString(),
            pending: true
        };
        setMessages(prev => [...prev, tempMsg]);
        */

        const formData = new FormData();
        formData.append('conversationId', activeConversationId);
        if (text) formData.append('text', text);
        if (file) formData.append('file', file);

        try {
            await axios.post(`${API_URL}/messages/send`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
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
    };
}
