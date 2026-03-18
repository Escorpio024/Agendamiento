# Imagen base de Node.js
FROM node:20-slim

# Instalar dependencias del sistema requeridas por Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    openssl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de Node.js (incluyendo devDependencies para tener prisma CLI)
RUN npm install

# Copiar el código fuente
COPY . .

# Generar cliente de Prisma
RUN npx prisma generate

# Crear directorios necesarios para persistencia
RUN mkdir -p .wwebjs_auth .wwebjs_cache

# Exponer variable de entorno para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Comando para ejecutar el bot (limpiando posibles bloqueos de Chromium primero)
CMD ["sh", "-c", "find .wwebjs_auth -name SingletonLock -delete && node index.js"]
