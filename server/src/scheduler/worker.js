const cron = require('node-cron');
const cronParser = require('cron-parser');
const { eq, inArray } = require('drizzle-orm');
const { db, schema } = require('../db');
const { dispatch } = require('../services/dispatch');
const { logger } = require('../utils/logger');
const { pruneOldWaMessages } = require('../wa/sessionManager');

// Polls every minute for ScheduleJobs that are due, and dispatches them.
// Jobs are stored in the DB and created/edited freely via the API, so instead
// of registering one node-cron task per job (which would need re-registering
// on every create/edit/delete), we run a single ticking task that re-evaluates
// all active jobs each minute.
function startScheduler() {
  // Guard biar dua tick gak jalan barengan (kalau satu tick lambat) -- dua tick
  // paralel bisa sama-sama lihat job yang belum lastRunAt lalu ngirim dobel.
  let ticking = false;
  cron.schedule('* * * * *', () => {
    if (ticking) return;
    ticking = true;
    runDueJobs()
      .catch((err) => logger.error({ err }, 'Scheduler tick gagal'))
      .finally(() => {
        ticking = false;
      });
  });

  // Bersihkan wa_messages yang lebih dari 7 hari setiap hari jam 02:00 WIB.
  cron.schedule('0 2 * * *', () => {
    pruneOldWaMessages().catch((err) => logger.error({ err }, 'Pruning wa_messages gagal'));
  }, { timezone: 'Asia/Jakarta' });

  logger.info('Scheduler worker jalan (cek tiap 1 menit)');
}

async function runDueJobs() {
  const now = new Date();

  const jobs = await db.select().from(schema.scheduleJob).where(eq(schema.scheduleJob.isActive, true));
  if (!jobs.length) return;

  // Pengirim tiap job diambil sekali per tick. Akun nonaktif atau berstatus
  // admin gak boleh ngirim -- job-nya DILEWATI tanpa diubah apa-apa, jadi
  // jalan lagi normal begitu akunnya diaktifkan / dikembalikan ke REE/SPV.
  const senderIds = [...new Set(jobs.map((j) => j.reeId))];
  const senders = await db.select().from(schema.ree).where(inArray(schema.ree.id, senderIds));
  const senderById = new Map(senders.map((r) => [r.id, r]));

  for (const job of jobs) {
    const sender = senderById.get(job.reeId);
    if (!sender || !sender.isActive || sender.role === 'admin') continue;

    try {
      if (!job.isRecurring) {
        if (job.runAt && job.runAt <= now && !job.lastRunAt) {
          try {
            await fire(job, sender);
          } finally {
            // One-off jobs run exactly once, then deactivate themselves -- JUGA
            // kalau gagal (mis. outlet terpilih udah gak ada). Tanpa ini job
            // gagal bakal dicoba ulang (dan nulis error ke log) tiap menit selamanya.
            await db
              .update(schema.scheduleJob)
              .set({ lastRunAt: now, isActive: false })
              .where(eq(schema.scheduleJob.id, job.id));
          }
        }
        continue;
      }

      if (!job.cronExpression) continue;
      const interval = cronParser.parseExpression(job.cronExpression, { currentDate: now, tz: 'Asia/Jakarta' });
      const prevFire = interval.prev().toDate();
      // Only fire the single most recent scheduled occurrence, and only once —
      // guards against double-sends if two ticks land close together, and
      // against a burst of catch-up sends if the server was down for a while
      // (in that case only the latest missed occurrence fires, not every one).
      const alreadyRanThisOccurrence = job.lastRunAt && job.lastRunAt >= prevFire;
      const withinPollWindow = now.getTime() - prevFire.getTime() < 2 * 60 * 1000; // 2 min safety margin
      if (!alreadyRanThisOccurrence && withinPollWindow) {
        // lastRunAt dicatat walau gagal, biar occurrence yang sama gak diulang tiap menit.
        try {
          await fire(job, sender);
        } finally {
          await db.update(schema.scheduleJob).set({ lastRunAt: now }).where(eq(schema.scheduleJob.id, job.id));
        }
      }
    } catch (err) {
      logger.error({ err, jobId: job.id }, 'Gagal proses schedule job');
    }
  }
}

async function fire(job, sender) {
  logger.info({ jobId: job.id, reeId: job.reeId }, 'Menjalankan schedule job');

  const targets = await db
    .select({ outletId: schema.scheduleJobOutlet.outletId })
    .from(schema.scheduleJobOutlet)
    .where(eq(schema.scheduleJobOutlet.scheduleJobId, job.id));

  const result = await dispatch({
    ree: sender,
    templateId: job.templateId,
    targetType: job.targetType,
    groupId: job.groupId,
    targetReeId: job.targetReeId,
    outletIds: targets.map((t) => t.outletId),
    scheduleJobId: job.id,
  });
  logger.info({ jobId: job.id, queued: result.queued }, 'Schedule job masuk antrian');
}

module.exports = { startScheduler, runDueJobs };
