const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { eq, and, gte, sql } = require('drizzle-orm');
const { db, schema } = require('../db');
const { logger } = require('../utils/logger');
const { toWhatsAppJid } = require('../utils/phone');

const SESSIONS_DIR = process.env.WA_SESSIONS_DIR || path.join(__dirname, '../../data/wa-sessions');
const MIN_DELAY = Number(process.env.WA_MIN_DELAY_MS || 4000);
const MAX_DELAY = Number(process.env.WA_MAX_DELAY_MS || 12000);
// Anti-ban safety valve: max pesan yang boleh terkirim per REE per hari (WIB).
// Baileys itu library tidak resmi — WhatsApp gampang curiga kalau satu nomor
// tiba-tiba kirim ratusan pesan proaktif (bukan balasan) dalam waktu singkat.
// Set ke 0 buat mematikan batas ini (tidak disarankan buat blast pertama kali).
const DAILY_LIMIT = Number(process.env.WA_DAILY_LIMIT ?? 120);

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// reeId -> { sock, status: 'connecting'|'qr'|'open'|'closed', qrDataUrl, queue: [], processing: bool }
const sessions = new Map();

// @whiskeysockets/baileys ships as an ESM package — dynamic import() works
// whether this file itself is CJS or ESM, so we load it lazily and cache it.
let _baileys = null;
async function getBaileys() {
  if (!_baileys) _baileys = await import('@whiskeysockets/baileys');
  return _baileys;
}

function sessionDir(reeId) {
  return path.join(SESSIONS_DIR, reeId);
}

function getSessionState(reeId) {
  if (!sessions.has(reeId)) {
    sessions.set(reeId, { sock: null, status: 'closed', qrDataUrl: null, queue: [], processing: false });
  }
  return sessions.get(reeId);
}

function randomDelay() {
  return MIN_DELAY + Math.floor(Math.random() * Math.max(1, MAX_DELAY - MIN_DELAY));
}

// 00:00 hari ini dalam WIB (UTC+7), sebagai Date UTC yang bisa langsung
// dibandingkan ke kolom timestamp di database — supaya batas harian tetap
// konsisten dengan jam Indonesia walaupun servernya sendiri jalan di UTC (VPS)
// atau di zona waktu lain.
function startOfTodayJakarta() {
  const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
  const shifted = new Date(Date.now() + JAKARTA_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - JAKARTA_OFFSET_MS);
}

async function countSentToday(reeId) {
  const [row] = await db
    .select({ count: sql`count(*)`.as('count') })
    .from(schema.messageLog)
    .where(
      and(
        eq(schema.messageLog.reeId, reeId),
        eq(schema.messageLog.status, 'SENT'),
        gte(schema.messageLog.sentAt, startOfTodayJakarta())
      )
    );
  return Number(row?.count || 0);
}

async function startSession(reeId) {
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = await getBaileys();
  const state = getSessionState(reeId);

  // Already connecting/connected — don't spin up a duplicate socket.
  if (state.sock && (state.status === 'open' || state.status === 'connecting')) {
    return state;
  }

  const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir(reeId));

  const sock = makeWASocket({
    auth: authState,
    logger: logger.child({ module: 'baileys', reeId }),
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  state.sock = sock;
  state.status = 'connecting';
  state.qrDataUrl = null;
  sessions.set(reeId, state);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.status = 'qr';
      try {
        state.qrDataUrl = await QRCode.toDataURL(qr);
      } catch (err) {
        logger.error({ err, reeId }, 'Gagal generate QR image');
      }
    }

    if (connection === 'open') {
      state.status = 'open';
      state.qrDataUrl = null;
      const waPhoneNumber = sock.user?.id?.split(':')[0] || null;
      logger.info({ reeId, waPhoneNumber }, 'WA session tersambung');

      // waFirstConnectedAt dicatat SEKALI SAJA (beda dari waLastConnectedAt, yang
      // ke-update tiap reconnect) -- ini yang dipakai fitur "level keamanan akun"
      // buat tahu umur pemanasan nomor ini, bukan cuma kapan terakhir online.
      const [existing] = await db
        .select({ waFirstConnectedAt: schema.ree.waFirstConnectedAt })
        .from(schema.ree)
        .where(eq(schema.ree.id, reeId))
        .catch(() => [null]);
      const updates = { waConnected: true, waLastConnectedAt: new Date(), waPhoneNumber };
      if (!existing?.waFirstConnectedAt) updates.waFirstConnectedAt = new Date();

      await db
        .update(schema.ree)
        .set(updates)
        .where(eq(schema.ree.id, reeId))
        .catch((err) => logger.error({ err, reeId }, 'Gagal update status WA di DB'));
      processQueue(reeId);
    }

    if (connection === 'close') {
      state.status = 'closed';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      await db
        .update(schema.ree)
        .set({ waConnected: false })
        .where(eq(schema.ree.id, reeId))
        .catch((err) => logger.error({ err, reeId }, 'Gagal update status WA di DB'));

      if (loggedOut) {
        logger.warn({ reeId }, 'REE logout dari WA — perlu scan QR ulang');
        // Wipe the stale auth so the next startSession() cleanly issues a fresh QR.
        fs.rmSync(sessionDir(reeId), { recursive: true, force: true });
      } else {
        logger.warn({ reeId, statusCode }, 'Koneksi WA putus, mencoba reconnect...');
        setTimeout(() => startSession(reeId).catch((err) => logger.error({ err, reeId }, 'Reconnect gagal')), 3000);
      }
    }
  });

  return state;
}

// On server boot, resume every REE that had paired before (has a saved auth
// folder), so a PM2 restart doesn't force all 60 REEs to re-scan their QR.
async function restoreAllSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  logger.info({ count: entries.length }, 'Restoring saved WA sessions...');
  for (const entry of entries) {
    startSession(entry.name).catch((err) => logger.error({ err, reeId: entry.name }, 'Gagal restore sesi WA'));
  }
}

function getStatus(reeId) {
  const s = getSessionState(reeId);
  return { status: s.status, qrDataUrl: s.qrDataUrl, dailyCapReached: Boolean(s.dailyCapReached) };
}

async function logoutSession(reeId) {
  const s = getSessionState(reeId);
  try {
    if (s.sock) await s.sock.logout();
  } catch (err) {
    logger.warn({ err, reeId }, 'Error saat logout (mungkin sudah putus), lanjut bersihkan sesi lokal');
  }
  fs.rmSync(sessionDir(reeId), { recursive: true, force: true });
  sessions.delete(reeId);
  await db.update(schema.ree).set({ waConnected: false }).where(eq(schema.ree.id, reeId)).catch(() => {});
}

// --- Outgoing queue: one per REE, throttled so we don't blast 300 messages
// instantly from a single WhatsApp account (a fast way to get banned). ---

function enqueueSend(reeId, job) {
  const s = getSessionState(reeId);
  s.queue.push(job);
  if (!s.processing) processQueue(reeId);
}

async function processQueue(reeId) {
  const s = getSessionState(reeId);
  if (s.processing) return;
  if (s.status !== 'open') return; // will resume once connection.update fires 'open'
  s.processing = true;

  while (s.queue.length > 0 && s.status === 'open') {
    if (DAILY_LIMIT > 0) {
      const sentToday = await countSentToday(reeId);
      if (sentToday >= DAILY_LIMIT) {
        if (!s.dailyCapReached) {
          logger.warn(
            { reeId, sentToday, DAILY_LIMIT, sisaAntrian: s.queue.length },
            'Batas kirim harian tercapai — sisa antrian ditahan, lanjut otomatis besok (anti-banned WA)'
          );
        }
        s.dailyCapReached = true;
        break; // sisa job TETAP di antrian — dicoba lagi oleh resumeAllQueues() tiap beberapa menit
      }
    }
    s.dailyCapReached = false;

    const job = s.queue.shift();
    try {
      await s.sock.sendMessage(toWhatsAppJid(job.phone), { text: job.text });
      await job.onSuccess?.();
    } catch (err) {
      logger.error({ err, reeId, phone: job.phone }, 'Gagal kirim pesan WA');
      await job.onError?.(err);
    }
    if (s.queue.length > 0) {
      await new Promise((r) => setTimeout(r, randomDelay()));
    }
  }

  s.processing = false;
}

function queueLength(reeId) {
  return getSessionState(reeId).queue.length;
}

// Kalau processQueue berhenti karena batas harian tercapai, gak ada yang
// otomatis mencoba lagi sampai ada pesan baru di-enqueue — sesi bisa nunggu
// gitu terus padahal harinya udah ganti. Ini "nudge" berkala biar antrian yang
// tertahan otomatis lanjut begitu hari berganti (WIB), tanpa REE harus buka
// dashboard atau kirim ulang.
function startQueueResumer() {
  setInterval(() => {
    for (const [reeId, s] of sessions.entries()) {
      if (s.status === 'open' && s.queue.length > 0 && !s.processing) {
        processQueue(reeId).catch((err) => logger.error({ err, reeId }, 'Gagal resume antrian kirim'));
      }
    }
  }, 5 * 60 * 1000); // tiap 5 menit
}

module.exports = {
  startSession,
  restoreAllSessions,
  getStatus,
  logoutSession,
  enqueueSend,
  queueLength,
  startQueueResumer,
  DAILY_LIMIT,
};
