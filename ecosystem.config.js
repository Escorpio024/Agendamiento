module.exports = {
  apps: [
    {
      name: 'aurora-bot',
      script: 'index.js',
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'aurora-frontend',
      script: 'server.js',
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
