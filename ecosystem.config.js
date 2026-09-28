// PM2 config — taruh file ini di root project, jalankan dengan:
//   pm2 start ecosystem.config.js
// Pola sama kayak yang dipakai buat TOMAS: satu VPS, PM2 jagain proses tetap hidup.
module.exports = {
  apps: [
    {
      name: 'reminder-cita-api',
      cwd: './server',
      script: 'src/index.js',
      // Scheduler (polling jadwal tiap menit) jalan built-in di dalam proses ini,
      // jadi gak perlu proses worker terpisah.
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      // Serve hasil build dashboard (web/dist) sebagai static file.
      // Alternatif yang lebih "proper": pakai nginx (lihat README.md).
      name: 'reminder-cita-web',
      cwd: './web',
      script: 'npx',
      args: 'serve -s dist -l 5173',
      env: { NODE_ENV: 'production' },
    },
  ],
};
