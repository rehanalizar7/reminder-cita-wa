const express = require('express');
const { requireAuth } = require('../auth/middleware');
const { startSession, getStatus, logoutSession, queueLength } = require('../wa/sessionManager');
const { computeSafetyReport } = require('../services/safety');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);

// Kick off pairing. The frontend should call this once, then poll GET /wa/status
// every couple seconds until it gets a qrDataUrl (show it) or status "open" (done).
router.post('/connect', async (req, res) => {
  try {
    await startSession(req.ree.id);
    res.json(getStatus(req.ree.id));
  } catch (err) {
    logger.error({ err, reeId: req.ree.id }, 'Gagal mulai sesi WA');
    res.status(500).json({ error: 'Gagal mulai koneksi WhatsApp' });
  }
});

router.get('/status', (req, res) => {
  res.json({ ...getStatus(req.ree.id), pendingInQueue: queueLength(req.ree.id) });
});

router.post('/logout', async (req, res) => {
  await logoutSession(req.ree.id);
  res.json({ ok: true });
});

// Estimasi "level keamanan" nomor buat blasting -- heuristik berdasarkan pola
// kirim REE ini sendiri (umur pemanasan nomor, volume harian, gagal kirim, seberapa
// sering kena batas harian). BUKAN sinyal resmi dari WhatsApp, cuma perkiraan.
router.get('/safety', async (req, res) => {
  try {
    const report = await computeSafetyReport(req.ree.id);
    res.json(report);
  } catch (err) {
    logger.error({ err, reeId: req.ree.id }, 'Gagal hitung laporan keamanan WA');
    res.status(500).json({ error: 'Gagal menghitung level keamanan' });
  }
});

module.exports = router;
