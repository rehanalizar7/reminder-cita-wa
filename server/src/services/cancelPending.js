const { sqlite } = require('../db');
const { removeQueued } = require('../wa/sessionManager');

const CANCEL_NOTE = 'Dibatalkan sebelum terkirim';

// Batalkan pesan PENDING milik satu akun pengirim (REE atau SPV).
// - ids kosong/null -> semua pesan PENDING akun itu
// - ids berisi      -> cuma id itu, dan cuma yang memang milik akun ini & masih PENDING
//
// Urutannya: status di DB diubah dulu (sinkron, satu statement), baru antrian
// kirim di memori dibersihkan. Kalaupun ada job yang lolos dari pembersihan,
// processQueue ngecek status DB sebelum kirim dan bakal ngelewatin job ini.
//
// Pesan PENDING yang ketinggalan setelah server restart (antriannya udah
// hilang dari memori) ikut kebersihin juga, karena yang diubah baris di DB.
function cancelPending(reeId, ids = null) {
  let result;
  if (Array.isArray(ids) && ids.length > 0) {
    const ph = ids.map(() => '?').join(',');
    result = sqlite
      .prepare(
        `UPDATE message_log SET status = 'CANCELLED', error = ?
         WHERE ree_id = ? AND status = 'PENDING' AND id IN (${ph})`
      )
      .run(CANCEL_NOTE, reeId, ...ids);
    removeQueued(reeId, ids);
  } else {
    result = sqlite
      .prepare(`UPDATE message_log SET status = 'CANCELLED', error = ? WHERE ree_id = ? AND status = 'PENDING'`)
      .run(CANCEL_NOTE, reeId);
    removeQueued(reeId, null);
  }
  return result.changes;
}

function countPending(reeId) {
  const row = sqlite
    .prepare(`SELECT COUNT(*) AS n FROM message_log WHERE ree_id = ? AND status = 'PENDING'`)
    .get(reeId);
  return Number(row?.n || 0);
}

module.exports = { cancelPending, countPending };
