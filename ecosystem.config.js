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
      script: 'npm',
      args: 'start',
      cwd: './frontend',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
