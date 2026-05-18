import './globals.css';
import Script from 'next/script';

export const metadata = {
    title: 'Auro Bot',
    description: 'Gestor de conversaciones Bot + Humano',
};

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    formatDetection: {
        telephone: false,
        date: false,
        email: false,
        address: false,
    },
};

export default function RootLayout({ children }) {
    return (
        <html lang="es">
            <head>
                <Script id="uuid-polyfill" strategy="beforeInteractive">
                    {`
                        if (typeof window !== 'undefined' && window.crypto && !window.crypto.randomUUID) {
                            window.crypto.randomUUID = function() {
                                return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
                                    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
                                );
                            };
                        }
                    `}
                </Script>
            </head>
            <body>{children}</body>
        </html>
    );
}
