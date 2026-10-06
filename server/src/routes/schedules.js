const express = require('express');
const cronParser = require('cron-parser');
const { eq, and, desc } = require('drizzle-orm');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');
const { dispatch } = require('../services/dispatch');

const router = express.Router();
router.use(requireAuth);

// Express 4 doesn't forward rejected promises from async handlers to error
// middleware automatically — this wrapper does that so every route below gets
// proper 500 JSON responses instead of hanging requests on unexpected errors.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const jobs = await db
    .select({
      id: schema.scheduleJob.id,
      templateId: schema.scheduleJob.templateId,
      templateName: schema.messageTemplate.name,
      targetType: schema.scheduleJob.targetType,
      groupId: schema.scheduleJob.groupId,
      groupName: schema.outletGroup.name,
      runAt: schema.scheduleJob.runAt,
      cronExpression: schema.scheduleJob.cronExpression,
      isRecurring: schema.scheduleJob.isRecurring,
      isActive: schema.scheduleJob.isActive,
      lastRunAt: schema.scheduleJob.lastRunAt,
      createdAt: schema.scheduleJob.createdAt,
    })
    .from(schema.scheduleJob)
    .innerJoin(schema.messageTemplate, eq(schema.messageTemplate.id, schema.scheduleJob.templateId))
    .leftJoin(schema.outletGroup, eq(schema.outletGroup.id, schema.scheduleJob.groupId))
    .where(eq(schema.scheduleJob.reeId, req.ree.id))
    .orderBy(desc(schema.scheduleJob.createdAt));
  res.json(jobs);
}));

// POST /schedules
// One-off: { templateId, targetType, groupId?, outletIds?, runAt: ISOString }
// Recurring: { templateId, targetType, groupId?, outletIds?, cronExpression, isRecurring: true }
router.post('/', wrap(async (req, res) => {
  const { templateId, targetType, groupId, outletIds, runAt, cronExpression, isRecurring } = req.body || {};

  if (!templateId || !targetType) return res.status(400).json({ error: 'templateId dan targetType wajib diisi' });
  if (isRecurring) {
    if (!cronExpression) return res.status(400).json({ error: 'cronExpression wajib diisi untuk jadwal berulang' });
    try {
      cronParser.parseExpression(cronExpression, { tz: 'Asia/Jakarta' });
    } catch (err) {
      return res.status(400).json({ error: 'Format cron tidak valid' });
    }
  } else if (!runAt) {
    return res.status(400).json({ error: 'runAt wajib diisi untuk jadwal sekali kirim' });
  }

  const job = db.transaction((tx) => {
    const [created] = tx
      .insert(schema.scheduleJob)
      .values({
        reeId: req.ree.id,
        templateId,
        targetType,
        groupId: targetType === 'GROUP' ? groupId : null,
        runAt: !isRecurring ? new Date(runAt) : null,
        cronExpression: isRecurring ? cronExpression : null,
        isRecurring: Boolean(isRecurring),
      })
      .returning()
      .all();

    if (targetType === 'SELECTED' && Array.isArray(outletIds) && outletIds.length) {
      tx.insert(schema.scheduleJobOutlet)
        .values(outletIds.map((outletId) => ({ scheduleJobId: created.id, outletId })))
        .run();
    }

    return created;
  });

  res.status(201).json(job);
}));

router.patch('/:id', wrap(async (req, res) => {
  const [existing] = await db.select().from(schema.scheduleJob).where(eq(schema.scheduleJob.id, req.params.id));
  if (!existing || existing.reeId !== req.ree.id) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
  const { isActive } = req.body || {};
  const [updated] = await db
    .update(schema.scheduleJob)
    .set({ ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}) })
    .where(eq(schema.scheduleJob.id, req.params.id))
    .returning();
  res.json(updated);
}));

router.delete('/:id', wrap(async (req, res) => {
  const [existing] = await db.select().from(schema.scheduleJob).where(
    and(eq(schema.scheduleJob.id, req.params.id), eq(schema.scheduleJob.reeId, req.ree.id))
  );
  if (!existing) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
  const deleted = await db.delete(schema.scheduleJob).where(eq(schema.scheduleJob.id, req.params.id)).returning();
  if (!deleted.length) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
  res.json({ ok: true });
}));

// Fire a saved schedule right now, on demand, without waiting for its cron/runAt.
router.post('/:id/run-now', wrap(async (req, res) => {
  const [job] = await db.select().from(schema.scheduleJob).where(eq(schema.scheduleJob.id, req.params.id));
  if (!job || job.reeId !== req.ree.id) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });

  const targets = await db
    .select({ outletId: schema.scheduleJobOutlet.outletId })
    .from(schema.scheduleJobOutlet)
    .where(eq(schema.scheduleJobOutlet.scheduleJobId, job.id));

  const result = await dispatch({
    ree: req.ree,
    templateId: job.templateId,
    targetType: job.targetType,
    groupId: job.groupId,
    outletIds: targets.map((t) => t.outletId),
    scheduleJobId: job.id,
  });
  await db.update(schema.scheduleJob).set({ lastRunAt: new Date() }).where(eq(schema.scheduleJob.id, job.id));
  res.json({ ok: true, ...result });
}));

module.exports = router;
