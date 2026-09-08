"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Lock, User, ArrowRight } from 'lucide-react';
import logoImg from '../img/AURORA.IA png-07.png';

const USERS = {
    'agendamiento!26': '28*14.22',
    '$teven!26': '22.41*82',
    'spaceguard': '10*13.24'
};

export default function AuthProvider({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogout = () => {
        localStorage.removeItem('auro_auth_v1');
        setIsAuthenticated(false);
    };

    useEffect(() => {
        const auth = localStorage.getItem('auro_auth_v1');
        if (auth === 'true') {
            setIsAuthenticated(true);
        }
        setIsChecking(false);
    }, []);

    useEffect(() => {
        let inactivityTimer;

        const resetTimer = () => {
            clearTimeout(inactivityTimer);
            if (isAuthenticated) {
                // 20 minutos = 20 * 60 * 1000 = 1200000 ms
                inactivityTimer = setTimeout(handleLogout, 1200000);
            }
        };

        const handleActivity = () => {
            resetTimer();
        };

        if (isAuthenticated) {
            window.addEventListener('mousemove', handleActivity);
            window.addEventListener('keydown', handleActivity);
            window.addEventListener('click', handleActivity);
            window.addEventListener('scroll', handleActivity);
            resetTimer();
        }

        return () => {
            clearTimeout(inactivityTimer);
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('scroll', handleActivity);
        };
    }, [isAuthenticated]);

    const handleLogin = (e) => {
        e.preventDefault();
        if (USERS[username] && USERS[username] === password) {
            localStorage.setItem('auro_auth_v1', 'true');
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('Credenciales incorrectas');
        }
    };

    if (isChecking) {
        return <div className="min-h-screen flex items-center justify-center chat-bg" style={{ background: 'var(--chat-bg)' }}></div>;
    }

    if (!isAuthenticated) {
        return (
            <div
                className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
                style={{ background: 'var(--chat-bg)' }}
            >
                {/* Subtle grid background */}
                <div className="absolute inset-0 chat-bg pointer-events-none" />

                {/* Glow blobs */}
                <div
                    className="absolute top-[-120px] left-[-120px] w-[500px] h-[500px] rounded-full pointer-events-none"
                    style={{
                        background: 'radial-gradient(circle, rgba(130,99,177,0.15) 0%, transparent 70%)',
                        filter: 'blur(40px)',
                    }}
                />
                <div
                    className="absolute bottom-[-120px] right-[-120px] w-[500px] h-[500px] rounded-full pointer-events-none"
                    style={{
                        background: 'radial-gradient(circle, rgba(161,227,216,0.10) 0%, transparent 70%)',
                        filter: 'blur(40px)',
                    }}
                />

                <div className="relative z-10 w-full max-w-md px-6">
                    <div 
                        className="rounded-3xl p-8 border"
                        style={{
                            background: 'rgba(30,27,38,0.85)',
                            borderColor: 'var(--border)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            backdropFilter: 'blur(12px)',
                        }}
                    >
                        <div className="flex flex-col items-center mb-8">
                            <div className="w-48 h-32 mb-2 relative flex items-center justify-center">
                                <Image 
                                    src={logoImg} 
                                    alt="Aurora IA" 
                                    fill 
                                    style={{ objectFit: 'contain' }}
                                    priority
                                />
                            </div>
                            <h1 className="text-2xl font-bold mb-1 text-center" style={{ color: 'var(--text-primary)' }}>
                                Bienvenido a Aurora
                            </h1>
                            <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                                Ingresa tus credenciales para continuar
                            </p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="block text-xs font-semibold mb-2 tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
                                    Usuario
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <User size={18} style={{ color: 'var(--text-muted)' }} />
                                    </div>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 rounded-xl border outline-none transition-all duration-300"
                                        style={{
                                            background: 'var(--input-bg)',
                                            borderColor: 'var(--border)',
                                            color: 'var(--text-primary)',
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--bubble-out)'}
                                        onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                                        placeholder="Ingresa tu usuario"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold mb-2 tracking-wide uppercase" style={{ color: 'var(--text-muted)' }}>
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock size={18} style={{ color: 'var(--text-muted)' }} />
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 rounded-xl border outline-none transition-all duration-300"
                                        style={{
                                            background: 'var(--input-bg)',
                                            borderColor: 'var(--border)',
                                            color: 'var(--text-primary)',
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'var(--bubble-out)'}
                                        onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="text-sm text-center py-2.5 rounded-lg" style={{ background: 'rgba(177,64,64,0.18)', color: '#EDAFAF', border: '1px solid rgba(177,64,64,0.35)' }}>
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold transition-all duration-300 hover:opacity-90 active:scale-[0.98] mt-4"
                                style={{
                                    background: 'linear-gradient(135deg, #8263B1 0%, #5a4490 100%)',
                                    color: '#fff',
                                    boxShadow: '0 4px 14px rgba(130,99,177,0.4)',
                                }}
                            >
                                Iniciar Sesión
                                <ArrowRight size={18} />
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
