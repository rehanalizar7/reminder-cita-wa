const express = require('express');
const { eq, and, desc } = require('drizzle-orm');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');
const { dispatch } = require('../services/dispatch');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);

// POST /send/now
// body: { templateId, targetType: 'ALL'|'GROUP'|'SELECTED', groupId?, outletIds? }
router.post('/now', async (req, res) => {
  const { templateId, targetType, groupId, outletIds } = req.body || {};
  if (!templateId || !targetType) {
    return res.status(400).json({ error: 'templateId dan targetType wajib diisi' });
  }

  try {
    const result = await dispatch({ ree: req.ree, templateId, targetType, groupId, outletIds });
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, reeId: req.ree.id }, 'Gagal kirim pesan');
    res.status(400).json({ error: err.message || 'Gagal kirim pesan' });
  }
});

// GET /send/history?limit=&status=
router.get('/history', async (req, res) => {
  const { limit, status } = req.query;
  const conditions = [eq(schema.messageLog.reeId, req.ree.id)];
  if (status) conditions.push(eq(schema.messageLog.status, String(status)));

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
      templateName: schema.messageTemplate.name,
    })
    .from(schema.messageLog)
    .innerJoin(schema.outlet, eq(schema.outlet.id, schema.messageLog.outletId))
    .leftJoin(schema.messageTemplate, eq(schema.messageTemplate.id, schema.messageLog.templateId))
    .where(and(...conditions))
    .orderBy(desc(schema.messageLog.createdAt))
    .limit(Math.min(Number(limit) || 100, 500));

  res.json(logs);
});

module.exports = router;
