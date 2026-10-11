#!/usr/bin/env node
/**
 * Perbaikan data sekali jalan: isi ree.tsub_id untuk semua akun seeded
 * yang sudah punya tsub.assigned_ree_id tapi ree.tsub_id masih NULL.
 *
 * Hanya menyentuh baris yang memang NULL — akun lama yang sudah benar
 * (TSUB030, TSUB032, dst) tidak diubah sama sekali.
 *
 * Usage: node scripts/fix-tsub-link.js [--dry-run]
 */
require('dotenv').config();
const { sqlite } = require('../src/db');

const dryRun = process.argv.includes('--dry-run');

// Temukan semua mismatch: tsub punya assigned_ree_id tapi ree.tsub_id masih null
const mismatches = sqlite.prepare(`
  SELECT t.id AS tsubId, t.code AS tsubCode,
         r.id AS reeId, r.username, r.tsub_id AS currentTsubId
  FROM tsub t
  JOIN ree r ON r.id = t.assigned_ree_id
  WHERE r.tsub_id IS NULL
  ORDER BY t.code
`).all();

if (mismatches.length === 0) {
  console.log('Tidak ada mismatch — semua akun sudah benar.');
  process.exit(0);
}

console.log(`Ditemukan ${mismatches.length} akun dengan ree.tsub_id = NULL:\n`);
for (const row of mismatches) {
  console.log(`  ${row.tsubCode}  →  REE username=${row.username}  reeId=${row.reeId}`);
}

if (dryRun) {
  console.log('\n[--dry-run] Tidak ada perubahan.');
  process.exit(0);
}

// Jalankan UPDATE dalam satu transaksi
const fix = sqlite.transaction(() => {
  let fixed = 0;
  const stmt = sqlite.prepare('UPDATE ree SET tsub_id = ? WHERE id = ? AND tsub_id IS NULL');
  for (const row of mismatches) {
    const result = stmt.run(row.tsubId, row.reeId);
    if (result.changes > 0) fixed++;
  }
  return fixed;
});

const fixed = fix();
console.log(`\n✓ ${fixed} akun berhasil diperbaiki (ree.tsub_id diisi).`);

// Verifikasi: tidak boleh ada mismatch tersisa
const remaining = sqlite.prepare(`
  SELECT COUNT(*) AS n FROM tsub t
  JOIN ree r ON r.id = t.assigned_ree_id
  WHERE r.tsub_id IS NULL
`).get();

if (remaining.n > 0) {
  console.error(`\n⚠ Masih ada ${remaining.n} mismatch setelah fix — periksa manual.`);
  process.exit(1);
} else {
  console.log('✓ Verifikasi OK — tidak ada mismatch tersisa.');
}
