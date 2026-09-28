const { eq } = require('drizzle-orm');
const { db, sqlite, schema } = require('../db');
const { DAILY_LIMIT } = require('../wa/sessionManager');

const DAY_MS = 24 * 60 * 60 * 1000;

// Batas "zona aman" volume kirim harian buat nomor pribadi (bukan WA Business API
// resmi). Ini perkiraan berdasarkan pola umum yang dilaporkan bikin nomor unofficial
// kena limit/blokir, BUKAN angka resmi dari WhatsApp -- WhatsApp gak pernah publikasi
// threshold pastinya, jadi ini heuristik, bukan jaminan.
const VOLUME_SAFE = 60;
const VOLUME_CAUTION = 120;
const VOLUME_RISKY = 200;

function level(score) {
  if (score >= 75) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Ambil rekap kirim per-hari (7 hari terakhir, waktu WIB) buat REE ini langsung
// lewat SQL mentah -- lebih gampang & murah daripada narik semua baris terus
// diagregasi di JS.
//
// PENTING: Drizzle nyimpen kolom integer bermode "timestamp" sebagai UNIX
// SECONDS (bukan milidetik) di SQLite -- itu konversi otomatis yang cuma
// kejadian kalau lewat query builder Drizzle sendiri. Query mentah lewat
// `sqlite` di sini gak lewat lapisan itu, jadi kita yang harus pakai satuan
// detik secara eksplisit (bukan Date.now() yang satuannya milidetik).
function dailyBreakdown(reeId, sinceSec) {
  return sqlite
    .prepare(
      `SELECT date(created_at, 'unixepoch', '+7 hours') AS day,
              SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
       FROM message_log
       WHERE ree_id = ? AND created_at >= ?
       GROUP BY day
       ORDER BY day DESC`
    )
    .all(reeId, sinceSec);
}

async function computeSafetyReport(reeId) {
  const [ree] = await db.select().from(schema.ree).where(eq(schema.ree.id, reeId));

  if (!ree?.waFirstConnectedAt) {
    return {
      level: 'gray',
      score: null,
      warmupDays: null,
      avgDailySent7d: 0,
      failureRate7d: 0,
      capHitDays7d: 0,
      dailyLimit: DAILY_LIMIT,
      summary: 'Nomor belum pernah terhubung, belum ada yang bisa dianalisis.',
      factors: [],
      recommendations: ['Hubungkan WhatsApp dulu di Dashboard sebelum mulai kirim reminder.'],
    };
  }

  const now = Date.now();
  const warmupDays = Math.floor((now - new Date(ree.waFirstConnectedAt).getTime()) / DAY_MS);
  const sinceSec = Math.floor((now - 7 * DAY_MS) / 1000);
  const rows = dailyBreakdown(reeId, sinceSec);

  const totalSent = rows.reduce((sum, r) => sum + r.sent, 0);
  const totalFailed = rows.reduce((sum, r) => sum + r.failed, 0);
  const avgDailySent7d = Math.round((totalSent / 7) * 10) / 10;
  const failureRate7d = totalSent + totalFailed > 0 ? totalFailed / (totalSent + totalFailed) : 0;
  const capHitDays7d = DAILY_LIMIT > 0 ? rows.filter((r) => r.sent >= DAILY_LIMIT).length : 0;

  const factors = [];
  let score = 100;

  // A. Umur pemanasan nomor
  if (warmupDays < 3 && avgDailySent7d >= 30) {
    score -= 40;
    factors.push({
      key: 'warmup',
      level: 'red',
      label: 'Nomor masih sangat baru',
      detail: `Baru terhubung ${warmupDays} hari tapi udah kirim rata-rata ${avgDailySent7d}/hari. Nomor baru itu paling rawan kena review WhatsApp kalau langsung dipakai volume tinggi.`,
    });
  } else if (warmupDays < 3) {
    score -= 10;
    factors.push({
      key: 'warmup',
      level: 'yellow',
      label: 'Nomor masih baru',
      detail: `Baru terhubung ${warmupDays} hari. Volume kirimnya masih rendah, tapi tetap naikkan pelan-pelan dulu.`,
    });
  } else if (warmupDays < 14) {
    const bad = avgDailySent7d > 80;
    score -= bad ? 20 : 5;
    factors.push({
      key: 'warmup',
      level: bad ? 'yellow' : 'green',
      label: 'Masih tahap pemanasan',
      detail: `Sudah terhubung ${warmupDays} hari. ${bad ? 'Volume kirimnya udah lumayan tinggi buat nomor seumur ini.' : 'Volume kirimnya wajar buat tahap ini.'}`,
    });
  } else {
    factors.push({
      key: 'warmup',
      level: 'green',
      label: 'Nomor sudah mapan',
      detail: `Sudah terhubung ${warmupDays} hari, bukan lagi nomor baru.`,
    });
  }

  // B. Volume kirim harian rata-rata (7 hari terakhir)
  if (avgDailySent7d <= VOLUME_SAFE) {
    factors.push({
      key: 'volume',
      level: 'green',
      label: 'Volume kirim wajar',
      detail: `Rata-rata ${avgDailySent7d} pesan/hari dalam 7 hari terakhir -- masih di zona aman.`,
    });
  } else if (avgDailySent7d <= VOLUME_CAUTION) {
    score -= 15;
    factors.push({
      key: 'volume',
      level: 'yellow',
      label: 'Volume kirim cukup tinggi',
      detail: `Rata-rata ${avgDailySent7d} pesan/hari. Masih oke buat nomor yang udah mapan, tapi mulai perlu diawasi.`,
    });
  } else if (avgDailySent7d <= VOLUME_RISKY) {
    score -= 30;
    factors.push({
      key: 'volume',
      level: 'red',
      label: 'Volume kirim tinggi',
      detail: `Rata-rata ${avgDailySent7d} pesan/hari. Ini udah masuk zona rawan buat nomor pribadi (bukan WA Business API resmi).`,
    });
  } else {
    score -= 50;
    factors.push({
      key: 'volume',
      level: 'red',
      label: 'Volume kirim sangat tinggi',
      detail: `Rata-rata ${avgDailySent7d} pesan/hari. Risiko tinggi kena limit/blokir kalau terus di angka ini.`,
    });
  }

  // C. Tingkat kegagalan kirim
  const failurePct = Math.round(failureRate7d * 1000) / 10;
  if (totalSent + totalFailed === 0) {
    factors.push({ key: 'failure', level: 'green', label: 'Belum ada aktivitas kirim', detail: 'Belum ada pesan yang dikirim dalam 7 hari terakhir.' });
  } else if (failureRate7d < 0.05) {
    factors.push({ key: 'failure', level: 'green', label: 'Tingkat gagal kirim rendah', detail: `${failurePct}% gagal dari total kirim -- normal.` });
  } else if (failureRate7d < 0.15) {
    score -= 10;
    factors.push({ key: 'failure', level: 'yellow', label: 'Tingkat gagal kirim mulai naik', detail: `${failurePct}% gagal dari total kirim. Cek nomor tujuan atau koneksi.` });
  } else if (failureRate7d < 0.3) {
    score -= 25;
    factors.push({ key: 'failure', level: 'red', label: 'Tingkat gagal kirim tinggi', detail: `${failurePct}% gagal dari total kirim. Ini bisa jadi tanda nomor mulai dibatasi WhatsApp.` });
  } else {
    score -= 40;
    factors.push({ key: 'failure', level: 'red', label: 'Tingkat gagal kirim sangat tinggi', detail: `${failurePct}% gagal dari total kirim. Waspada -- kemungkinan nomor lagi dibatasi.` });
  }

  // D. Seberapa sering kena batas harian (dalam 7 hari terakhir)
  if (DAILY_LIMIT > 0) {
    if (capHitDays7d === 0) {
      factors.push({ key: 'cap', level: 'green', label: 'Belum pernah kena batas harian', detail: `Batas harian saat ini ${DAILY_LIMIT} pesan/hari.` });
    } else if (capHitDays7d <= 2) {
      score -= 5;
      factors.push({ key: 'cap', level: 'yellow', label: 'Sesekali kena batas harian', detail: `${capHitDays7d} dari 7 hari terakhir nyentuh batas ${DAILY_LIMIT}/hari.` });
    } else {
      score -= 15;
      factors.push({ key: 'cap', level: 'red', label: 'Sering kena batas harian', detail: `${capHitDays7d} dari 7 hari terakhir nyentuh batas ${DAILY_LIMIT}/hari -- volume kamu konsisten mepet ke ceiling.` });
    }
  }

  score = clamp(Math.round(score), 0, 100);
  const lvl = level(score);

  const recommendations = [];
  if (lvl !== 'green') {
    if (warmupDays < 14) recommendations.push('Nomor masih dalam masa pemanasan -- naikkan volume kirim pelan-pelan, jangan langsung banyak.');
    if (avgDailySent7d > VOLUME_SAFE) recommendations.push(`Coba turunkan target kirim harian ke bawah ${VOLUME_SAFE} pesan dulu, atau sebar ke beberapa hari lewat fitur Jadwal.`);
    if (failureRate7d >= 0.15) recommendations.push('Cek daftar outlet yang gagal terkirim -- nomor salah/tidak aktif bisa nambah sinyal negatif ke akun.');
    if (capHitDays7d >= 3) recommendations.push('Sebar pengiriman ke grup-grup lebih kecil di hari berbeda daripada selalu mepet ke batas harian.');
  } else {
    recommendations.push('Pola kirim kamu masih di zona aman. Tetap pertahankan, jangan tiba-tiba lompat volume besar.');
  }

  return {
    level: lvl,
    score,
    warmupDays,
    avgDailySent7d,
    failureRate7d,
    capHitDays7d,
    dailyLimit: DAILY_LIMIT,
    summary:
      lvl === 'green'
        ? 'Pola kirim nomor ini masih di zona aman.'
        : lvl === 'yellow'
        ? 'Ada beberapa hal yang perlu diwaspadai sebelum blasting lebih banyak.'
        : 'Pola kirim nomor ini berisiko -- sebaiknya kurangi volume/waspada dulu sebelum lanjut blasting.',
    factors,
    recommendations,
  };
}

module.exports = { computeSafetyReport };
