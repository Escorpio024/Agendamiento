#!/bin/bash
# ─── Script de Despliegue Automático — Aurora Bot ───────────────────────────
# Uso: bash deploy.sh
# Ejecutar en la carpeta raíz del proyecto (~/Agendamiento)

set -e  # Detener si cualquier comando falla

echo ""
echo "🚀 ======================================================"
echo "   DESPLIEGUE AURORA BOT"
echo "========================================================"
echo ""

# 1. Actualizar código desde GitHub
echo "📥 [1/5] Descargando última versión del código..."
git pull
echo "✅ Código actualizado."
echo ""

# 2. Actualizar la base de datos del bot (nuevas columnas)
echo "🗃️  [2/5] Actualizando base de datos del bot (Prisma)..."
npx prisma generate --schema=prisma/bot.prisma
npx prisma db push --schema=prisma/bot.prisma
echo "✅ Base de datos actualizada."
echo ""

# 3. Construir el frontend (Next.js)
echo "🏗️  [3/5] Construyendo interfaz web (esto tarda ~30 seg)..."
cd frontend
npm run build
cd ..
echo "✅ Frontend construido correctamente."
echo ""

# 4. Reiniciar todos los servicios con PM2
echo "🔄 [4/5] Reiniciando servicios..."
npx pm2 restart all
echo "✅ Servicios reiniciados."
echo ""

# 5. Verificar que todo está corriendo
echo "📊 [5/5] Estado de los servicios:"
npx pm2 list
echo ""
echo "========================================================"
echo "✅ ¡DESPLIEGUE COMPLETADO EXITOSAMENTE!"
echo "   Ahora recarga la página web en tu navegador (Ctrl+F5)"
echo "========================================================"
echo ""
