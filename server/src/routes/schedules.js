const express = require('express');
const cronParser = require('cron-parser');
const { eq, and, desc, or, isNull } = require('drizzle-orm');
const { alias } = require('drizzle-orm/sqlite-core');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');
const { dispatch } = require('../services/dispatch');
const { validateTarget } = require('../utils/resolveTargets');
const { getScopeReeIds } = require('../services/team');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const targetRee = alias(schema.ree, 'target_ree');
  const jobs = await db
    .select({
      id: schema.scheduleJob.id,
      templateId: schema.scheduleJob.templateId,
      templateName: schema.messageTemplate.name,
      targetType: schema.scheduleJob.targetType,
      groupId: schema.scheduleJob.groupId,
      groupName: schema.outletGroup.name,
      targetReeId: schema.scheduleJob.targetReeId,
      targetReeName: targetRee.name,
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
    .leftJoin(targetRee, eq(targetRee.id, schema.scheduleJob.targetReeId))
    .where(eq(schema.scheduleJob.reeId, req.ree.id))
    .orderBy(desc(schema.scheduleJob.createdAt));
  res.json(jobs);
});

// POST /schedules
// One-off: { templateId, targetType, groupId?, outletIds?, targetReeId?, runAt: ISOString }
// Recurring: { templateId, targetType, groupId?, outletIds?, targetReeId?, cronExpression, isRecurring: true }
router.post('/', async (req, res) => {
  const { templateId, targetType, groupId, outletIds, targetReeId, runAt, cronExpression, isRecurring } = req.body || {};

  if (!templateId || !targetType) return res.status(400).json({ error: 'templateId dan targetType wajib diisi' });

  let runAtDate = null;
  if (isRecurring) {
    if (!cronExpression || !String(cronExpression).trim()) {
      return res.status(400).json({ error: 'cronExpression wajib diisi untuk jadwal berulang' });
    }
    try {
      cronParser.parseExpression(String(cronExpression).trim(), { tz: 'Asia/Jakarta' });
    } catch (err) {
      return res.status(400).json({ error: 'Format cron tidak valid' });
    }
  } else {
    if (!runAt) return res.status(400).json({ error: 'runAt wajib diisi untuk jadwal sekali kirim' });
    runAtDate = new Date(runAt);
    if (Number.isNaN(runAtDate.getTime())) return res.status(400).json({ error: 'Tanggal/jam kirim tidak valid' });
  }

  // Template harus milik akun ini atau template bersama.
  const [template] = await db
    .select({ id: schema.messageTemplate.id })
    .from(schema.messageTemplate)
    .where(
      and(
        eq(schema.messageTemplate.id, String(templateId)),
        or(eq(schema.messageTemplate.reeId, req.ree.id), isNull(schema.messageTemplate.reeId))
      )
    );
  if (!template) return res.status(400).json({ error: 'Template tidak ditemukan' });

  let target;
  try {
    target = await validateTarget({
      user: req.ree,
      scopeReeIds: getScopeReeIds(req.ree),
      targetType,
      groupId,
      outletIds,
      targetReeId,
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    throw err;
  }

  const job = db.transaction((tx) => {
    const [created] = tx
      .insert(schema.scheduleJob)
      .values({
        reeId: req.ree.id,
        templateId: template.id,
        targetType: target.targetType,
        groupId: target.groupId,
        targetReeId: target.targetReeId,
        runAt: !isRecurring ? runAtDate : null,
        cronExpression: isRecurring ? String(cronExpression).trim() : null,
        isRecurring: Boolean(isRecurring),
      })
      .returning()
      .all();

    if (target.targetType === 'SELECTED' && target.outletIds.length) {
      tx.insert(schema.scheduleJobOutlet)
        .values(target.outletIds.map((outletId) => ({ scheduleJobId: created.id, outletId })))
        .run();
    }

    return created;
  });

  res.status(201).json(job);
});

router.patch('/:id', async (req, res) => {
  const [existing] = await db.select().from(schema.scheduleJob).where(eq(schema.scheduleJob.id, req.params.id));
  if (!existing || existing.reeId !== req.ree.id) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
  const { isActive } = req.body || {};
  if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive harus boolean' });
  const [updated] = await db
    .update(schema.scheduleJob)
    .set({ isActive })
    .where(eq(schema.scheduleJob.id, req.params.id))
    .returning();
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const [existing] = await db.select().from(schema.scheduleJob).where(
    and(eq(schema.scheduleJob.id, req.params.id), eq(schema.scheduleJob.reeId, req.ree.id))
  );
  if (!existing) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
  const deleted = await db.delete(schema.scheduleJob).where(eq(schema.scheduleJob.id, req.params.id)).returning();
  if (!deleted.length) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });
  res.json({ ok: true });
});

// Fire a saved schedule right now, on demand, without waiting for its cron/runAt.
router.post('/:id/run-now', async (req, res) => {
  const [job] = await db.select().from(schema.scheduleJob).where(eq(schema.scheduleJob.id, req.params.id));
  if (!job || job.reeId !== req.ree.id) return res.status(404).json({ error: 'Jadwal tidak ditemukan' });

  const targets = await db
    .select({ outletId: schema.scheduleJobOutlet.outletId })
    .from(schema.scheduleJobOutlet)
    .where(eq(schema.scheduleJobOutlet.scheduleJobId, job.id));

  let result;
  try {
    result = await dispatch({
      ree: req.ree,
      templateId: job.templateId,
      targetType: job.targetType,
      groupId: job.groupId,
      targetReeId: job.targetReeId,
      outletIds: targets.map((t) => t.outletId),
      scheduleJobId: job.id,
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    throw err;
  }
  await db.update(schema.scheduleJob).set({ lastRunAt: new Date() }).where(eq(schema.scheduleJob.id, job.id));
  res.json({ ok: true, ...result });
});

module.exports = router;
