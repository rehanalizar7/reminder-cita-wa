// Penugasan TSUB oleh admin. Semua fungsi di sini SINKRON dan dipanggil di
// dalam sqlite.transaction() -- better-sqlite3 gak boleh ada `await` di tengah
// transaksi. Klaim TSUB disimpan di DUA tempat (tsub.assigned_ree_id dan
// ree.tsub_id), jadi keduanya selalu diubah bareng di sini.
const { sqlite } = require('../db');

class AssignError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// Set (atau lepas, kalau reeId null) REE pemegang sebuah TSUB.
// - Kalau REE tujuan lagi pegang TSUB lain, TSUB lama itu dilepas.
// - Kalau TSUB ini lagi dipegang REE lain, REE lama itu jadi tanpa TSUB
//   (dia bakal diminta pilih TSUB lagi pas buka dashboard).
function assignReeToTsubTx(tsubId, reeId) {
  const tsub = sqlite.prepare('SELECT id, code, assigned_ree_id AS assignedReeId FROM tsub WHERE id = ?').get(tsubId);
  if (!tsub) throw new AssignError('TSUB tidak ditemukan', 404);

  const previousReeId = tsub.assignedReeId || null;

  if (!reeId) {
    // Lepas: bersihin kedua sisi, termasuk sisa data gak konsisten (REE yang
    // ree.tsub_id-nya nunjuk ke sini padahal bukan pemegang resminya).
    sqlite.prepare('UPDATE ree SET tsub_id = NULL WHERE tsub_id = ?').run(tsub.id);
    sqlite.prepare('UPDATE tsub SET assigned_ree_id = NULL, assigned_at = NULL WHERE id = ?').run(tsub.id);
    return { tsubCode: tsub.code, previousReeId, releasedTsubCode: null };
  }

  const ree = sqlite.prepare('SELECT id, role, tsub_id AS tsubId FROM ree WHERE id = ?').get(reeId);
  if (!ree) throw new AssignError('Akun REE tidak ditemukan', 404);
  if (ree.role !== 'ree') throw new AssignError('TSUB per REE cuma bisa di-set ke akun ber-role REE');

  if (previousReeId === ree.id && ree.tsubId === tsub.id) {
    return { tsubCode: tsub.code, previousReeId, releasedTsubCode: null };
  }

  // TSUB lama milik REE tujuan (kalau ada) -- dilepas dulu biar unique index
  // tsub.assigned_ree_id gak bentrok.
  const oldTsub = sqlite.prepare('SELECT id, code FROM tsub WHERE assigned_ree_id = ? AND id != ?').get(ree.id, tsub.id);
  if (oldTsub) {
    sqlite.prepare('UPDATE tsub SET assigned_ree_id = NULL, assigned_at = NULL WHERE id = ?').run(oldTsub.id);
  }

  // REE lain yang nyantol ke TSUB ini (pemegang lama + sisa data gak konsisten).
  sqlite.prepare('UPDATE ree SET tsub_id = NULL WHERE tsub_id = ? AND id != ?').run(tsub.id, ree.id);

  sqlite.prepare('UPDATE tsub SET assigned_ree_id = ?, assigned_at = ? WHERE id = ?').run(ree.id, nowSec(), tsub.id);
  sqlite.prepare('UPDATE ree SET tsub_id = ? WHERE id = ?').run(tsub.id, ree.id);

  return {
    tsubCode: tsub.code,
    previousReeId: previousReeId && previousReeId !== ree.id ? previousReeId : null,
    releasedTsubCode: oldTsub?.code || null,
  };
}

// Set (atau lepas) SPV pemegang sebuah TSUB. Satu TSUB = maks satu SPV.
function assignSpvToTsubTx(tsubId, spvId) {
  const tsub = sqlite.prepare('SELECT id, code FROM tsub WHERE id = ?').get(tsubId);
  if (!tsub) throw new AssignError('TSUB tidak ditemukan', 404);

  const prev = sqlite.prepare('SELECT spv_id AS spvId FROM spv_tsub WHERE tsub_id = ?').get(tsub.id);

  if (spvId) {
    const spv = sqlite.prepare('SELECT id, role FROM ree WHERE id = ?').get(spvId);
    if (!spv) throw new AssignError('Akun SPV tidak ditemukan', 404);
    if (spv.role !== 'spv') throw new AssignError('Akun ini bukan SPV');
    if (prev?.spvId === spv.id) return { tsubCode: tsub.code, previousSpvId: null };
  }

  sqlite.prepare('DELETE FROM spv_tsub WHERE tsub_id = ?').run(tsub.id);
  if (spvId) {
    sqlite.prepare('INSERT INTO spv_tsub (spv_id, tsub_id, created_at) VALUES (?, ?, ?)').run(spvId, tsub.id, nowSec());
  }
  return { tsubCode: tsub.code, previousSpvId: prev?.spvId || null };
}

module.exports = { assignReeToTsubTx, assignSpvToTsubTx, AssignError };
