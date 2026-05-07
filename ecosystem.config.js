module.exports = {
  apps: [
    {
      name: 'aurora-bot',
      script: 'index.js',
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 5000,
      // Sin límite de reinicios — PM2 siempre debe mantener el bot activo
      max_restarts: 0,
      // Retardo exponencial entre reinicios (evita bucles rápidos)
      exp_backoff_restart_delay: 100,
      // Mínimo tiempo activo para que no cuente como crash inmediato
      min_uptime: '30s',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'aurora-frontend',
      script: 'npm',
      args: 'start',
      cwd: './frontend',
      watch: false,
      max_memory_restart: '500M',
      max_restarts: 0,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
