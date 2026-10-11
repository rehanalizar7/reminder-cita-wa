const { eq, inArray } = require('drizzle-orm');
const { db, schema } = require('../db');
const { resolveTargets, TargetError } = require('../utils/resolveTargets');
const { renderTemplate, buildVariablesForOutlet } = require('../utils/template');
const { getScopeReeIds } = require('./team');
const { enqueueSend } = require('../wa/sessionManager');
const { logger } = require('../utils/logger');

// Resolves targets, renders each outlet's message, writes a PENDING MessageLog
// row per outlet (one bulk insert — atomic on its own, no explicit transaction
// needed), and hands each one to the SENDER's WA send queue. Sending itself
// happens asynchronously in the background (see sessionManager) — this
// function returns as soon as everything is queued, not once actually sent.
//
// Pengirim (`ree`) bisa REE atau SPV:
// - REE  -> outlet miliknya sendiri
// - SPV  -> outlet milik REE di timnya, dikirim dari nomor WA SPV sendiri, dan
//           dihitung ke batas harian SPV (message_log.ree_id = pengirim).
async function dispatch({ ree: sender, templateId, targetType, groupId, outletIds, targetReeId, scheduleJobId }) {
  if (!sender || sender.role === 'admin') {
    throw new TargetError('Akun admin tidak bisa mengirim reminder');
  }
  if (targetType === 'REE' && sender.role !== 'spv') {
    throw new TargetError('Target per REE cuma buat akun SPV');
  }

  const [template] = await db.select().from(schema.messageTemplate).where(eq(schema.messageTemplate.id, templateId));
  if (!template || (template.reeId && template.reeId !== sender.id)) {
    throw new TargetError('Template tidak ditemukan');
  }

  const scopeReeIds = getScopeReeIds(sender);
  if (scopeReeIds.length === 0) {
    throw new TargetError('Kamu belum pegang TSUB/tim mana pun. Minta admin atur TSUB kamu dulu.');
  }

  const found = await resolveTargets({ scopeReeIds, targetType, groupId, outletIds, targetReeId });

  // Satu nomor = satu pesan per pengiriman. Dua REE bisa nyimpen outlet dengan
  // nomor yang sama -- tanpa ini, SPV yang kirim ke "semua outlet tim" bakal
  // ngirim dobel ke nomor itu.
  const seenPhones = new Set();
  const outlets = found.filter((o) => {
    if (seenPhones.has(o.phone)) return false;
    seenPhones.add(o.phone);
    return true;
  });

  if (outlets.length === 0) {
    return { queued: 0, outlets: [] };
  }

  const ownerIds = [...new Set(outlets.map((o) => o.reeId))];
  const owners = await db
    .select({ id: schema.ree.id, name: schema.ree.name })
    .from(schema.ree)
    .where(inArray(schema.ree.id, ownerIds));
  const ownerName = Object.fromEntries(owners.map((o) => [o.id, o.name]));

  const logRows = outlets.map((outlet) => ({
    reeId: sender.id,
    outletId: outlet.id,
    templateId: template.id,
    scheduleJobId: scheduleJobId || null,
    phone: outlet.phone,
    message: renderTemplate(template.body, buildVariablesForOutlet(outlet, sender, ownerName[outlet.reeId])),
    status: 'PENDING',
  }));

  const logs = await db.insert(schema.messageLog).values(logRows).returning();

  for (const log of logs) {
    enqueueSend(sender.id, {
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
