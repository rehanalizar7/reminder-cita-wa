const { sqlite } = require('../db');

// Hapus template dengan aman. Dua tabel nge-refer template tanpa ON DELETE:
// - schedule_job.template_id  -> kalau masih dipakai jadwal, TOLAK (user harus
//   hapus jadwalnya dulu; jangan diam-diam ngehapus jadwal orang).
// - message_log.template_id   -> riwayat tetap disimpan (isi pesan yang dirender
//   udah ada di kolom message), referensinya aja yang dikosongin.
// Dulu ini langsung DELETE -> error FOREIGN KEY -> proses server crash.
function deleteTemplateSafely(templateId) {
  const run = sqlite.transaction(() => {
    const used = sqlite.prepare('SELECT COUNT(*) AS n FROM schedule_job WHERE template_id = ?').get(templateId).n;
    if (used > 0) {
      return {
        ok: false,
        error: `Template ini masih dipakai ${used} jadwal. Hapus jadwal yang pakai template ini dulu.`,
      };
    }
    sqlite.prepare('UPDATE message_log SET template_id = NULL WHERE template_id = ?').run(templateId);
    sqlite.prepare('DELETE FROM message_template WHERE id = ?').run(templateId);
    return { ok: true };
  });
  return run();
}

module.exports = { deleteTemplateSafely };
