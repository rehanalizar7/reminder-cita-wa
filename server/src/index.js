require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { logger } = require('./utils/logger');
const { restoreAllSessions, startQueueResumer } = require('./wa/sessionManager');
const { startScheduler } = require('./scheduler/worker');
const { requireAuth } = require('./auth/middleware');

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

const app = express();

app.use(cors({ origin: process.env.WEB_BASE_URL || '*' }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

// Global middleware: untuk semua rute non-/auth/* dan non-/health:
// 1. Jalankan requireAuth (set req.ree, cek is_active)
// 2. Tolak 403 kalau must_change_password = true — paksa user ganti password dulu
// Router individual tetap punya router.use(requireAuth) sendiri; karena requireAuth
// short-circuit kalau req.ree sudah diset, tidak ada double DB query.
app.use((req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/health') return next();
  requireAuth(req, res, () => {
    if (req.ree.mustChangePassword) {
      return res.status(403).json({ error: 'Ganti password dulu sebelum melanjutkan.', code: 'MUST_CHANGE_PASSWORD' });
    }
    next();
  });
});

app.use('/auth', authRoutes);
app.use('/contacts', contactsRoutes);
app.use('/outlets', outletsRoutes);
app.use('/groups', groupsRoutes);
app.use('/templates', templatesRoutes);
app.use('/wa', waRoutes);
app.use('/send', sendRoutes);
app.use('/schedules', scheduleRoutes);
app.use('/tsub', tsubRoutes);
app.use('/admin', adminRoutes);

// Fallback error handler so a thrown error in a route becomes JSON, not an HTML
// stack trace (routes should still try/catch, this is a safety net).
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: 'Terjadi kesalahan di server' });
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

main().catch((err) => {
  logger.error({ err }, 'Gagal start server');
  process.exit(1);
});
