// PM2 production config — Crackers Hyderabad API.
// Run: pm2 start ecosystem.config.cjs --env production && pm2 save
// Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: 'crackers-api',
      script: './api/server.js',
      cwd: __dirname,
      instances: 1, // single process: rate limiters + notify tokens are in-memory
      exec_mode: 'fork',
      env: {
        // This file IS the production config (KVM only; local dev uses
        // `npm run dev --prefix api`). The default must be production-safe:
        // a fallback of 'development' here previously disabled media
        // persistence on any start/restart without `--env production`.
        NODE_ENV: 'production',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '512M',
      kill_timeout: 10000,
      wait_ready: false,
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
