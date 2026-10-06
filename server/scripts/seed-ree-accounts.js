#!/usr/bin/env node
// Buat atau perbarui akun REE untuk setiap TSUB yang ada.
// - username = kode TSUB (lowercase), TSUB langsung diklaim
// - Kalau TSUB sudah diklaim: set/update username+password untuk REE yang sudah ada
// - Kalau TSUB belum diklaim: cek dulu apakah ada REE dengan username=kode; kalau ada
//   langsung klaim, kalau tidak ada buat REE baru lalu klaim
// - Idempotent: aman dijalankan berkali-kali
// - TSUB032 dilewati
// - must_change_password = true supaya REE ganti password saat pertama login
//
// Usage: node scripts/seed-ree-accounts.js --password <password>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { eq, isNull } = require('drizzle-orm');
const { db, schema } = require('../src/db');

const SKIP_CODES = new Set(['TSUB032']);

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1]) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

async function main() {
  const { password } = parseArgs();
  if (!password) { console.error('Wajib: --password <password>'); process.exit(1); }
  if (password.length < 6) { console.error('Password minimal 6 karakter'); process.exit(1); }

  const passwordHash = await bcrypt.hash(password, 12);

  const tsubList = await db
    .select()
    .from(schema.tsub)
    .orderBy(schema.tsub.code);

  let created = 0, updated = 0, skipped = 0;
  const summary = [];

  for (const tsub of tsubList) {
    if (SKIP_CODES.has(tsub.code)) {
      summary.push(`  SKIP  ${tsub.code} (dilewati)`);
      skipped++;
      continue;
    }

    const uname = tsub.code.toLowerCase(); // e.g. "tsub014"

    if (tsub.assignedReeId) {
      // TSUB sudah diklaim — update kredensial REE yang sudah ada
      const [ree] = await db.select().from(schema.ree).where(eq(schema.ree.id, tsub.assignedReeId));
      if (!ree) {
        summary.push(`  ERROR ${tsub.code} — assignedReeId ${tsub.assignedReeId} tidak ditemukan`);
        skipped++;
        continue;
      }
      await db
        .update(schema.ree)
        .set({ username: uname, passwordHash, mustChangePassword: true })
        .where(eq(schema.ree.id, ree.id));
      summary.push(`  UPDT  ${tsub.code} → ${ree.name} (${ree.email || uname})`);
      updated++;
    } else {
      // TSUB belum diklaim — cari atau buat REE, lalu klaim
      const [existingByUsername] = await db
        .select()
        .from(schema.ree)
        .where(eq(schema.ree.username, uname));

      let reeId;
      if (existingByUsername) {
        // REE sudah ada (dari run sebelumnya) — update password saja
        await db
          .update(schema.ree)
          .set({ passwordHash, mustChangePassword: true })
          .where(eq(schema.ree.id, existingByUsername.id));
        reeId = existingByUsername.id;
        summary.push(`  UPDT  ${tsub.code} → akun ${uname} sudah ada, password diperbarui`);
        updated++;
      } else {
        // Buat REE baru
        const [newRee] = await db
          .insert(schema.ree)
          .values({
            name: tsub.code,
            email: `${uname}@local`,
            username: uname,
            passwordHash,
            mustChangePassword: true,
            role: 'ree',
            isActive: true,
          })
          .returning();
        reeId = newRee.id;
        summary.push(`  NEW   ${tsub.code} → akun baru dibuat (${uname})`);
        created++;
      }

      // Klaim TSUB
      await db
        .update(schema.tsub)
        .set({ assignedReeId: reeId, assignedAt: new Date() })
        .where(eq(schema.tsub.id, tsub.id));
    }
  }

  console.log('\n=== Hasil seed akun REE ===');
  summary.forEach((l) => console.log(l));
  console.log(`\nRingkasan: ${created} dibuat, ${updated} diperbarui, ${skipped} dilewati`);
  console.log('Semua akun disetel must_change_password=true — REE harus ganti password saat pertama login.');
  process.exit(0);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
