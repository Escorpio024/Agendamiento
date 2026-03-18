import './globals.css';

export const metadata = {
    title: 'Auro Bot',
    description: 'Gestor de conversaciones Bot + Humano',
};

export default function RootLayout({ children }) {
    return (
        <html lang="es">
            <body>{children}</body>
        </html>
    );
}
