const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { eq } = require('drizzle-orm');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');
const { google } = require('googleapis');
const { clientFromRefreshToken } = require('../auth/googleOAuth');
const { getContactsAuthUrl, verifyContactsState, exchangeContactsCode, contactsClientFromRefreshToken, revokeContactsToken } = require('../auth/googleContactsOAuth');
const { normalizeIdPhone } = require('../utils/phone');
const { buildMatcher } = require('../utils/matchPattern');
const { previewRows, commitRows } = require('../services/importContacts');
const { logger } = require('../utils/logger');

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Multer: simpan di memory (bukan disk), batas 2 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file .xlsx yang diterima'));
    }
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Tarik semua kontak Google menggunakan refresh token. Throw dengan code
// CONTACTS_TOKEN_INVALID kalau token kadaluwarsa/dicabut (invalid_grant).
async function fetchGoogleContacts(refreshToken) {
  const auth = contactsClientFromRefreshToken(refreshToken);
  const people = google.people({ version: 'v1', auth });

  const results = [];
  let pageToken;
  try {
    do {
      const { data } = await people.people.connections.list({
        resourceName: 'people/me',
        personFields: 'names,phoneNumbers',
        pageSize: 1000,
        pageToken,
      });
      for (const person of data.connections || []) {
        const name = person.names?.[0]?.displayName;
        const phoneRaw = person.phoneNumbers?.[0]?.value;
        const phone = normalizeIdPhone(phoneRaw);
        if (!name || !phone) continue;
        results.push({ googleContactId: person.resourceName, name, phone });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    const httpStatus = err?.response?.status || err?.status;
    const errData = String(err?.response?.data?.error || '');
    const errMsg = String(err?.message || '');
    const isGoogleAuthError =
      errData === 'invalid_grant' ||
      errMsg.includes('invalid_grant') ||
      httpStatus === 401 ||
      httpStatus === 403;
    if (isGoogleAuthError) {
      const e = new Error('Token kontak Google kadaluwarsa atau dicabut. Hubungkan ulang.');
      e.code = 'GOOGLE_RECONNECT_REQUIRED';
      throw e;
    }
    throw err;
  }
  return results;
}

// Status terhubung ditentukan HANYA dari contacts_google_refresh_token (fix 8).
// Tidak fallback ke googleRefreshToken — user harus hubungkan lewat flow kontak.
function pickContactsToken(ree) {
  return ree.contactsGoogleRefreshToken || null;
}

// ─── Google Contacts OAuth ────────────────────────────────────────────────────

// Status koneksi kontak Google user ini.
// "terhubung" hanya kalau contacts_google_refresh_token benar-benar ada di DB.
router.get('/google/status', requireAuth, (req, res) => {
  const ree = req.ree;
  const connected = Boolean(ree.contactsGoogleRefreshToken);
  res.json({ connected, email: connected ? (ree.contactsGoogleEmail || null) : null });
});

// Kembalikan URL OAuth untuk kontak sebagai JSON — frontend yang redirect,
// bukan server. Ini supaya request tetap bawa Bearer token (browser navigation
// tidak bisa attach Authorization header).
router.post('/google/connect-url', requireAuth, (req, res) => {
  if (!process.env.GOOGLE_CONTACTS_REDIRECT_URI) {
    return res.status(503).json({ error: 'GOOGLE_CONTACTS_REDIRECT_URI belum dikonfigurasi di .env' });
  }
  const url = getContactsAuthUrl(req.ree.id);
  res.json({ url });
});

// Callback Google setelah user setujui izin kontak
router.get('/google/callback', wrap(async (req, res) => {
  const webUrl = process.env.WEB_BASE_URL || 'http://localhost:5173';
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${webUrl}/contacts?google=error&reason=${encodeURIComponent(String(error))}`);
  }
  if (!code || !state) {
    return res.redirect(`${webUrl}/contacts?google=error&reason=missing_params`);
  }

  let reeId;
  try {
    ({ reeId } = verifyContactsState(String(state)));
  } catch {
    // State tidak valid atau sudah expired (> 10 menit)
    return res.redirect(`${webUrl}/contacts?google=error&reason=state_invalid`);
  }

  try {
    const { refreshToken, email } = await exchangeContactsCode(String(code));
    // Tanpa refresh_token tidak ada gunanya — jangan simpan status "terhubung" palsu
    if (!refreshToken) {
      logger.warn({ reeId }, 'Contacts OAuth callback: Google tidak mengembalikan refresh_token');
      return res.redirect(`${webUrl}/contacts?google=error&reason=no_refresh_token`);
    }

    await db
      .update(schema.ree)
      .set({ contactsGoogleRefreshToken: refreshToken, contactsGoogleEmail: email })
      .where(eq(schema.ree.id, reeId));

    res.redirect(`${webUrl}/contacts?google=ok`);
  } catch (err) {
    logger.error({ err, reeId }, 'Gagal exchange contacts OAuth code');
    res.redirect(`${webUrl}/contacts?google=error&reason=oauth_failed`);
  }
}));

// Putuskan koneksi kontak Google: revoke di Google dulu, lalu bersihkan DB.
router.delete('/google/disconnect', requireAuth, wrap(async (req, res) => {
  const token = req.ree.contactsGoogleRefreshToken;
  if (token) {
    await revokeContactsToken(token); // best-effort, tidak throw kalau gagal
  }
  await db
    .update(schema.ree)
    .set({ contactsGoogleRefreshToken: null, contactsGoogleEmail: null })
    .where(eq(schema.ree.id, req.ree.id));
  res.json({ ok: true });
}));

// ─── Google Preview ───────────────────────────────────────────────────────────

router.get('/google/preview', requireAuth, wrap(async (req, res) => {
  const ree = req.ree;
  const token = pickContactsToken(ree);

  if (!token) {
    return res.status(400).json({
      error: 'Belum ada koneksi Google Contacts. Hubungkan dulu.',
      code: 'CONTACTS_NOT_CONNECTED',
    });
  }

  let contacts;
  try {
    contacts = await fetchGoogleContacts(token);
  } catch (err) {
    if (err.code === 'GOOGLE_RECONNECT_REQUIRED') {
      // Kosongkan token yang rusak supaya status langsung jadi "tidak terhubung"
      await db
        .update(schema.ree)
        .set({ contactsGoogleRefreshToken: null, contactsGoogleEmail: null })
        .where(eq(schema.ree.id, ree.id));
      // Gunakan 409 bukan 401 — 401 di frontend berarti JWT app tidak valid → auto-logout
      return res.status(409).json({ error: err.message, code: 'GOOGLE_RECONNECT_REQUIRED' });
    }
    logger.error({ err, reeId: ree.id }, 'Gagal ambil kontak Google');
    return res.status(502).json({ error: 'Gagal ambil kontak dari Google. Coba lagi beberapa saat.' });
  }

  // Bucket: alreadyImported vs suggested (match pattern) vs other
  const existingOutlets = await db
    .select({ phone: schema.outlet.phone })
    .from(schema.outlet)
    .where(eq(schema.outlet.reeId, ree.id));

  const existingPhones = new Set(existingOutlets.map((o) => o.phone));
  const matches = buildMatcher(ree.contactPattern, ree.patternIsRegex);

  const alreadyImported = [];
  const suggested = [];
  const other = [];

  for (const c of contacts) {
    if (existingPhones.has(c.phone)) alreadyImported.push(c);
    else if (matches(c.name)) suggested.push(c);
    else other.push(c);
  }

  res.json({ total: contacts.length, hasPattern: Boolean(ree.contactPattern), alreadyImported, suggested, other });
}));

// ─── Excel template download ──────────────────────────────────────────────────

router.get('/template', requireAuth, wrap(async (req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Reminder CITA';

  // Sheet Data
  const ws = wb.addWorksheet('Data');
  ws.columns = [
    { header: 'nama_outlet', key: 'nama_outlet', width: 30 },
    { header: 'no_hp', key: 'no_hp', width: 20 },
    { header: 'no_login_cita', key: 'no_login_cita', width: 20 },
    { header: 'grup', key: 'grup', width: 20 },
  ];

  // Format kolom no_hp dan no_login_cita sebagai Text supaya Excel tidak makan nol depan
  ws.getColumn('no_hp').numFmt = '@';
  ws.getColumn('no_login_cita').numFmt = '@';

  // Header bold
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  // Baris contoh
  ws.addRow({ nama_outlet: 'Toko Maju Jaya', no_hp: '081234567890', no_login_cita: '082198765432', grup: 'Prioritas' });

  // Sheet Petunjuk
  const wsInfo = wb.addWorksheet('Petunjuk');
  wsInfo.getColumn(1).width = 70;
  const info = [
    'PETUNJUK PENGISIAN',
    '',
    'nama_outlet  : Nama toko/outlet (wajib diisi)',
    'no_hp        : Nomor WhatsApp outlet. Format bebas: 08xxx, +62xxx, 62xxx, atau 8xxx.',
    '               Kolom ini sengaja diformat Text — ketik apa adanya, jangan ubah format sel.',
    'no_login_cita: Nomor login di aplikasi CITA (opsional). Biarkan kosong kalau tidak tahu.',
    'grup         : Nama grup outlet (opsional). Kalau belum ada, grup baru akan dibuat otomatis.',
    '',
    'Maksimal 2.000 baris data per file.',
    'Simpan file sebagai .xlsx sebelum diupload.',
  ];
  info.forEach((line, i) => {
    wsInfo.getCell(`A${i + 1}`).value = line;
    if (i === 0) wsInfo.getCell(`A${i + 1}`).font = { bold: true };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="template-import-outlet.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

// ─── Excel upload → preview ───────────────────────────────────────────────────

router.post('/upload/excel', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File terlalu besar. Maksimal 2 MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan dalam request.' });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);

  const ws = wb.getWorksheet('Data') || wb.worksheets[0];
  if (!ws) return res.status(400).json({ error: 'Sheet "Data" tidak ditemukan di file.' });

  // Cari kolom berdasarkan header baris pertama (case-insensitive)
  const headerRow = ws.getRow(1);
  const colIndex = {};
  headerRow.eachCell((cell, colNum) => {
    const key = String(cell.value || '').trim().toLowerCase();
    colIndex[key] = colNum;
  });

  if (!colIndex['nama_outlet'] || !colIndex['no_hp']) {
    return res.status(400).json({ error: 'Header kolom tidak sesuai. Gunakan template yang disediakan.' });
  }

  const rows = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const name = String(row.getCell(colIndex['nama_outlet'])?.value ?? '').trim();
    const phoneRaw = row.getCell(colIndex['no_hp'])?.value;
    const loginCita = colIndex['no_login_cita']
      ? String(row.getCell(colIndex['no_login_cita'])?.value ?? '').trim()
      : '';
    const group = colIndex['grup']
      ? String(row.getCell(colIndex['grup'])?.value ?? '').trim()
      : '';

    if (!name && !phoneRaw) return; // baris kosong

    // Konversi phone ke string — Excel bisa simpan sebagai angka
    let phone = phoneRaw;
    if (phone !== null && phone !== undefined && phone !== '') {
      if (typeof phone === 'object' && phone.richText) {
        phone = phone.richText.map((r) => r.text).join('');
      } else {
        phone = String(phone);
      }
    } else {
      phone = '';
    }

    rows.push({ name, phone, loginCita: loginCita || null, group: group || null });
  });

  if (rows.length === 0) return res.status(400).json({ error: 'File tidak berisi data.' });
  if (rows.length > 2000) {
    return res.status(400).json({ error: `File berisi ${rows.length} baris. Maksimal 2.000 baris per upload.` });
  }

  const preview = await previewRows(req.ree.id, rows);
  res.json({ rows: preview });
}));

// ─── Manual preview ───────────────────────────────────────────────────────────

router.post('/preview/manual', requireAuth, wrap(async (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows harus berupa array dan tidak boleh kosong.' });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ error: 'Maksimal 2.000 baris per preview.' });
  }
  const preview = await previewRows(req.ree.id, rows);
  res.json({ rows: preview });
}));

// ─── Commit (unified, semua sumber) ──────────────────────────────────────────

router.post('/import', requireAuth, wrap(async (req, res) => {
  const { rows, savePattern } = req.body || {};

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows harus berupa array dan tidak boleh kosong.' });
  }

  // Hanya proses baris yang status === 'new' dan punya normalizedPhone
  const toInsert = rows.filter((r) => r.status === 'new' && r.normalizedPhone);
  if (toInsert.length === 0) {
    return res.status(400).json({ error: 'Tidak ada baris baru yang valid untuk diimport.' });
  }

  try {
    const result = commitRows(req.ree.id, toInsert);

    if (savePattern && typeof savePattern.pattern === 'string' && savePattern.pattern.trim()) {
      await db
        .update(schema.ree)
        .set({ contactPattern: savePattern.pattern.trim(), patternIsRegex: Boolean(savePattern.isRegex) })
        .where(eq(schema.ree.id, req.ree.id));
    }

    res.json({ ok: true, imported: result.created });
  } catch (err) {
    logger.error({ err, reeId: req.ree.id }, 'Gagal commit import kontak');
    res.status(500).json({ error: err.message || 'Gagal menyimpan kontak yang dipilih.' });
  }
}));

// ─── Pattern (tidak berubah) ──────────────────────────────────────────────────

router.put('/pattern', requireAuth, wrap(async (req, res) => {
  const { pattern, isRegex } = req.body || {};
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return res.status(400).json({ error: 'Pattern kosong' });
  }
  const [updated] = await db
    .update(schema.ree)
    .set({ contactPattern: pattern.trim(), patternIsRegex: Boolean(isRegex) })
    .where(eq(schema.ree.id, req.ree.id))
    .returning();
  res.json({ contactPattern: updated.contactPattern, patternIsRegex: updated.patternIsRegex });
}));

// ─── index.js: /contacts/google/callback tidak butuh auth (callback dari Google)
// Tapi global middleware di index.js akan intercept semua /contacts/* kecuali /auth/*.
// Kita perlu bypass global must_change_password check untuk /contacts/google/callback.
// Sudah di-handle di index.js karena pathnya bukan /auth/ — harus ditambahkan exemption.
// → Lihat catatan di index.js, atau tambahkan route ini di LUAR router.use(requireAuth).

module.exports = router;
