const express = require('express');
const { sqlite } = require('../db');
const { requireAuth, requireRole } = require('../auth/middleware');

const router = express.Router();
// Klaim & cari data retailer TSUB cuma buat REE. SPV dapet TSUB dari admin
// (tabel spv_tsub), admin gak pegang TSUB sama sekali.
router.use(requireAuth, requireRole('ree'));

// GET /tsub/available -- daftar kode TSUB yang belum diklaim REE manapun.
// Dipakai halaman "Pilih TSUB" pas REE login pertama kali.
router.get('/available', (req, res) => {
  const rows = sqlite
    .prepare('SELECT id, code, outlet_count AS outletCount FROM tsub WHERE assigned_ree_id IS NULL ORDER BY code')
    .all();
  res.json({ items: rows });
});

// POST /tsub/claim { tsubId } -- klaim SATU KALI, gak bisa ganti-ganti lagi
// setelahnya. Atomic: kalau TSUB itu barusan diambil REE lain (race), gagal
// dengan 409 dan REE tinggal pilih yang lain.
router.post('/claim', (req, res) => {
  const { tsubId } = req.body || {};
  if (!tsubId) return res.status(400).json({ error: 'tsubId wajib diisi' });
  if (req.ree.tsubId) {
    return res.status(409).json({ error: 'Kamu sudah pernah pilih TSUB sebelumnya, gak bisa diganti lagi' });
  }

  const now = Math.floor(Date.now() / 1000);

  // Seluruh cek + tulis ini jalan sinkron di satu transaksi better-sqlite3 --
  // Node cuma single-threaded dan gak ada `await` di tengah, jadi gak ada
  // request lain yang bisa nyelip di antara SELECT dan UPDATE di bawah ini.
  const claim = sqlite.transaction(() => {
    // Cek ulang di dalam transaksi: admin bisa aja barusan nge-set TSUB REE ini.
    const fresh = sqlite.prepare('SELECT tsub_id AS tsubId FROM ree WHERE id = ?').get(req.ree.id);
    if (fresh?.tsubId) {
      const err = new Error('Kamu sudah punya TSUB, gak bisa diganti lagi');
      err.status = 409;
      throw err;
    }
    const tsubRow = sqlite.prepare('SELECT id, code, assigned_ree_id AS assignedReeId FROM tsub WHERE id = ?').get(tsubId);
    if (!tsubRow) {
      const err = new Error('TSUB tidak ditemukan');
      err.status = 404;
      throw err;
    }
    if (tsubRow.assignedReeId) {
      const err = new Error('TSUB ini baru aja diambil REE lain, coba pilih yang lain');
      err.status = 409;
      throw err;
    }

    const result = sqlite
      .prepare('UPDATE tsub SET assigned_ree_id = ?, assigned_at = ? WHERE id = ? AND assigned_ree_id IS NULL')
      .run(req.ree.id, now, tsubId);
    if (result.changes === 0) {
      // Jaga-jaga ekstra kalau ada apa-apa di luar dugaan (harusnya udah
      // ketangkep sama pengecekan assignedReeId di atas).
      const err = new Error('TSUB ini baru aja diambil REE lain, coba pilih yang lain');
      err.status = 409;
      throw err;
    }

    sqlite.prepare('UPDATE ree SET tsub_id = ? WHERE id = ?').run(tsubId, req.ree.id);
    return tsubRow;
  });

  try {
    const tsubRow = claim();
    res.json({ ok: true, tsubId, code: tsubRow.code });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// GET /tsub/retailers?search= -- cari data resmi retailer DI DALAM TSUB yang
// REE ini udah klaim. Ini referensi doang buat REE nemuin nomor login CITA
// yang bener; milih salah satu di sini gak otomatis ngubah apa-apa di outlet
// sampai REE eksplisit simpen lewat PATCH /outlets/:id.
router.get('/retailers', (req, res) => {
  if (!req.ree.tsubId) return res.status(400).json({ error: 'Kamu belum pilih TSUB' });

  const term = `%${String(req.query.search || '').trim()}%`;
  const rows = sqlite
    .prepare(
      `SELECT id, retailer_code AS retailerCode, retailer_name AS retailerName,
              cita_login_phone AS citaLoginPhone, ws_name AS wsName
       FROM cita_retailer
       WHERE tsub_id = ? AND (retailer_name LIKE ? OR retailer_code LIKE ? OR cita_login_phone LIKE ?)
       ORDER BY retailer_name
       LIMIT 30`
    )
    .all(req.ree.tsubId, term, term, term);

  res.json({ items: rows });
});

module.exports = router;
