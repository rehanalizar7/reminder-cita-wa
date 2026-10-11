require('dotenv').config();
// HARUS paling atas sebelum router dibuat: bikin error di handler async
// diteruskan ke error handler JSON, bukan bikin proses crash.
require('./utils/asyncRoutes');
const express = require('express');
const cors = require('cors');
const { logger } = require('./utils/logger');
const { restoreAllSessions, startQueueResumer } = require('./wa/sessionManager');
const { startScheduler } = require('./scheduler/worker');
const { requireAuth, blockAdmin } = require('./auth/middleware');

const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const outletsRoutes = require('./routes/outlets');
const groupsRoutes = require('./routes/groups');
const templatesRoutes = require('./routes/templates');
const waRoutes = require('./routes/wa');
const sendRoutes = require('./routes/send');
const scheduleRoutes = require('./routes/schedules');
const tsubRoutes = require('./routes/tsub');
const adminRoutes = require('./routes/admin');
const spvRoutes = require('./routes/spv');

const app = express();

// Production: browser -> Cloudflare -> cloudflared -> nginx -> node, dan
// cloudflared + nginx dua-duanya di 127.0.0.1. Percayai X-Forwarded-For HANYA
// dari hop loopback biar req.ip = IP asli user (dipakai rate limiter login),
// tanpa bisa dipalsukan dari luar.
app.set('trust proxy', 'loopback');

app.use(cors({ origin: process.env.WEB_BASE_URL || '*' }));
app.use(express.json({ limit: '2mb' }));

// Matikan cache browser untuk semua respons API — mencegah browser memakai
// data lama (mis. status Google Contacts setelah disconnect → 304 stale).
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));

// Global middleware: untuk semua rute non-/auth/* dan non-/health:
// 1. Jalankan requireAuth (set req.ree, cek is_active)
// 2. Tolak 403 kalau must_change_password = true — paksa user ganti password dulu
// Router individual tetap punya router.use(requireAuth) sendiri; karena requireAuth
// short-circuit kalau req.ree sudah diset, tidak ada double DB query.
app.use((req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/health' || req.path === '/contacts/google/callback') return next();
  requireAuth(req, res, () => {
    if (req.ree.mustChangePassword) {
      return res.status(403).json({ error: 'Ganti password dulu sebelum melanjutkan.', code: 'MUST_CHANGE_PASSWORD' });
    }
    next();
  });
});

app.use('/auth', authRoutes);
// Fitur operasional (kirim reminder) cuma buat REE & SPV -- admin ditolak.
app.use('/contacts', blockAdmin, contactsRoutes);
app.use('/outlets', blockAdmin, outletsRoutes);
app.use('/groups', blockAdmin, groupsRoutes);
app.use('/templates', blockAdmin, templatesRoutes);
app.use('/wa', blockAdmin, waRoutes);
app.use('/send', blockAdmin, sendRoutes);
app.use('/schedules', blockAdmin, scheduleRoutes);
app.use('/tsub', tsubRoutes);
app.use('/spv', spvRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

// Fallback error handler so a thrown error in a route becomes JSON, not an HTML
// stack trace (routes should still try/catch, this is a safety net).
app.use((err, req, res, next) => {
  // Body JSON rusak / kegedean dari express.json() -- itu salah client, bukan server.
  if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
    return res.status(400).json({ error: err.type === 'entity.too.large' ? 'Data terlalu besar' : 'Format data tidak valid' });
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server' });
});

// Jaring pengaman terakhir: promise yang reject di luar request (callback
// Baileys, timer, dll) cukup dicatat -- jangan sampai satu error kecil
// mematikan proses dan memutus SEMUA sesi WA REE sekaligus.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

const PORT = process.env.PORT || 4000;

async function main() {
  // Reconnect every REE's WhatsApp session that was previously paired, so a
  // server restart doesn't force everyone to re-scan their QR code.
  await restoreAllSessions();
  startScheduler();
  startQueueResumer();

  app.listen(PORT, () => {
    logger.info(`Server jalan di port ${PORT}`);
  });
}

// Normalnya (PM2 / `node src/index.js`) server langsung start. Skrip tes set
// REMINDER_CITA_NO_START=1 biar cuma dapet `app` tanpa sesi WA/scheduler/listen.
if (process.env.REMINDER_CITA_NO_START !== '1') {
  main().catch((err) => {
    logger.error({ err }, 'Gagal start server');
    process.exit(1);
  });
}

module.exports = { app };
