const { eq } = require('drizzle-orm');
const { db, schema } = require('../db');
const { resolveTargets } = require('../utils/resolveTargets');
const { renderTemplate, buildVariablesForOutlet } = require('../utils/template');
const { enqueueSend } = require('../wa/sessionManager');
const { logger } = require('../utils/logger');

// Resolves targets, renders each outlet's message, writes a PENDING MessageLog
// row per outlet (one bulk insert — atomic on its own, no explicit transaction
// needed), and hands each one to the REE's WA send queue. Sending itself
// happens asynchronously in the background (see sessionManager) — this
// function returns as soon as everything is queued, not once actually sent.
async function dispatch({ ree, templateId, targetType, groupId, outletIds, scheduleJobId }) {
  const [template] = await db.select().from(schema.messageTemplate).where(eq(schema.messageTemplate.id, templateId));
  if (!template || (template.reeId && template.reeId !== ree.id)) {
    throw new Error('Template tidak ditemukan');
  }

  const outlets = await resolveTargets({ reeId: ree.id, targetType, groupId, outletIds });
  if (outlets.length === 0) {
    return { queued: 0, outlets: [] };
  }

  const logRows = outlets.map((outlet) => ({
    reeId: ree.id,
    outletId: outlet.id,
    templateId: template.id,
    scheduleJobId: scheduleJobId || null,
    phone: outlet.phone,
    message: renderTemplate(template.body, buildVariablesForOutlet(outlet, ree)),
    status: 'PENDING',
  }));

  const logs = await db.insert(schema.messageLog).values(logRows).returning();

  for (const log of logs) {
    enqueueSend(ree.id, {
      phone: log.phone,
      text: log.message,
      onSuccess: () =>
        db
          .update(schema.messageLog)
          .set({ status: 'SENT', sentAt: new Date() })
          .where(eq(schema.messageLog.id, log.id))
          .catch((err) => logger.error({ err, logId: log.id }, 'Gagal update log jadi SENT')),
      onError: (err) =>
        db
          .update(schema.messageLog)
          .set({ status: 'FAILED', error: String(err?.message || err) })
          .where(eq(schema.messageLog.id, log.id))
          .catch((e) => logger.error({ err: e, logId: log.id }, 'Gagal update log jadi FAILED')),
    });
  }

  return { queued: logs.length, outlets: outlets.map((o) => o.id) };
}

module.exports = { dispatch };
