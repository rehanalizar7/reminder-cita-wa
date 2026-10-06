module.exports = {
  apps: [
    {
      name: 'reminder-cita-api',
      cwd: './server',
      script: 'src/index.js',
      interpreter: '/home/admin/.config/nvm/versions/node/v22.23.3/bin/node',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
