const express = require('express');
const { eq, and, desc } = require('drizzle-orm');
const { alias } = require('drizzle-orm/sqlite-core');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');
const { dispatch } = require('../services/dispatch');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);

const LOG_STATUSES = ['PENDING', 'SENT', 'FAILED'];

// POST /send/now
// body: { templateId, targetType: 'ALL'|'GROUP'|'SELECTED'|'REE', groupId?, outletIds?, targetReeId? }
router.post('/now', async (req, res) => {
  const { templateId, targetType, groupId, outletIds, targetReeId } = req.body || {};
  if (!templateId || !targetType) {
    return res.status(400).json({ error: 'templateId dan targetType wajib diisi' });
  }

  try {
    const result = await dispatch({ ree: req.ree, templateId, targetType, groupId, outletIds, targetReeId });
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    logger.error({ err, reeId: req.ree.id }, 'Gagal kirim pesan');
    res.status(500).json({ error: 'Gagal kirim pesan, coba lagi sebentar' });
  }
});

// GET /send/history?limit=&status=
// Riwayat pesan yang DIKIRIM akun ini (REE atau SPV). Buat SPV, outlet-nya
// milik REE tim -- `outletOwnerName` nunjukin REE pemilik outlet tersebut.
router.get('/history', async (req, res) => {
  const { limit, status } = req.query;
  const conditions = [eq(schema.messageLog.reeId, req.ree.id)];
  if (status && LOG_STATUSES.includes(String(status))) conditions.push(eq(schema.messageLog.status, String(status)));

  const owner = alias(schema.ree, 'owner');
  const logs = await db
    .select({
      id: schema.messageLog.id,
      phone: schema.messageLog.phone,
      message: schema.messageLog.message,
      status: schema.messageLog.status,
      error: schema.messageLog.error,
      createdAt: schema.messageLog.createdAt,
      sentAt: schema.messageLog.sentAt,
      outletName: schema.outlet.name,
      outletOwnerName: owner.name,
      templateName: schema.messageTemplate.name,
    })
    .from(schema.messageLog)
    .innerJoin(schema.outlet, eq(schema.outlet.id, schema.messageLog.outletId))
    .leftJoin(owner, eq(owner.id, schema.outlet.reeId))
    .leftJoin(schema.messageTemplate, eq(schema.messageTemplate.id, schema.messageLog.templateId))
    .where(and(...conditions))
    .orderBy(desc(schema.messageLog.createdAt))
    .limit(Math.min(Math.max(Number(limit) || 100, 1), 500));

  res.json(logs);
});

module.exports = router;
