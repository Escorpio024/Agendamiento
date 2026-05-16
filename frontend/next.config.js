/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
    // Fija el directorio raíz de Turbopack al folder frontend
    // para evitar conflicto con el package-lock.json del directorio padre
    turbopack: {
        root: path.resolve(__dirname),
    },
};

module.exports = nextConfig;

