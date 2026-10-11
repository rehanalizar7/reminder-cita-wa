#!/usr/bin/env node
// Buat akun admin baru, atau naikkan akun yang sudah ada jadi admin.
// Admin = akun administrasi murni: TIDAK pegang TSUB dan TIDAK kirim reminder.
//
// Usage:
//   node scripts/set-admin.js --username <u> --password <p> [--name <n>] [--email <e>]
//
// - Kalau username (atau email, kalau diisi) sudah ada -> akun itu dinaikkan jadi
//   admin + password di-reset. DITOLAK kalau akun itu masih pegang TSUB (sebagai
//   REE maupun SPV) -- pakai username baru, atau lepas TSUB-nya dulu.
// - Kalau belum ada -> dibuat akun admin baru (email boleh kosong).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sqlite, db, schema } = require('../src/db');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

async function main() {
  const { email, username, password, name } = parseArgs();

  if (!username) { console.error('Wajib: --username <username>'); process.exit(1); }
  if (!password) { console.error('Wajib: --password <password>'); process.exit(1); }
  if (password.length < 6) { console.error('Password minimal 6 karakter'); process.exit(1); }

  const uname = username.trim().toLowerCase();
  if (!USERNAME_RE.test(uname)) {
    console.error('Username 3-32 karakter: huruf kecil, angka, titik, strip, atau garis bawah');
    process.exit(1);
  }
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  const passwordHash = await bcrypt.hash(password, 12);

  const byUsername = sqlite.prepare('SELECT * FROM ree WHERE username = ?').get(uname);
  const byEmail = cleanEmail ? sqlite.prepare('SELECT * FROM ree WHERE lower(trim(email)) = ?').get(cleanEmail) : null;

  if (byUsername && byEmail && byUsername.id !== byEmail.id) {
    console.error(`Username "${uname}" dan email "${cleanEmail}" dipakai dua akun berbeda. Pakai salah satu saja.`);
    process.exit(1);
  }
  const existing = byUsername || byEmail;

  if (existing) {
    const spvCount = sqlite.prepare('SELECT COUNT(*) AS n FROM spv_tsub WHERE spv_id = ?').get(existing.id).n;
    if (existing.tsub_id || spvCount > 0) {
      const code = existing.tsub_id ? sqlite.prepare('SELECT code FROM tsub WHERE id = ?').get(existing.tsub_id)?.code : null;
      console.error(
        `Akun "${existing.username || existing.email}" masih pegang TSUB${code ? ` (${code})` : ''}.\n` +
          'Admin gak boleh pegang TSUB. Bikin admin pakai username lain, mis:\n' +
          '  node scripts/set-admin.js --username admin --password <password> --name "Admin"'
      );
      process.exit(1);
    }
    if (byEmail && !byUsername) {
      const clash = sqlite.prepare('SELECT id FROM ree WHERE username = ? AND id != ?').get(uname, existing.id);
      if (clash) { console.error(`Username "${uname}" sudah dipakai akun lain.`); process.exit(1); }
    }
    sqlite
      .prepare(
        `UPDATE ree SET role = 'admin', username = ?, password_hash = ?, must_change_password = 0, is_active = 1,
                        updated_at = ? WHERE id = ?`
      )
      .run(uname, passwordHash, Math.floor(Date.now() / 1000), existing.id);
    console.log(`✓ Akun ${existing.username || existing.email} dinaikkan jadi admin.`);
    console.log(`  Username : ${uname}`);
    console.log(`  Nama     : ${existing.name}`);
  } else {
    const finalEmail = cleanEmail || `${uname}@local`;
    const emailClash = sqlite.prepare('SELECT id FROM ree WHERE lower(trim(email)) = ?').get(finalEmail);
    if (emailClash) { console.error(`Email "${finalEmail}" sudah dipakai akun lain.`); process.exit(1); }

    const displayName = (name || 'Admin').trim();
    const [created] = db
      .insert(schema.ree)
      .values({
        email: finalEmail,
        name: displayName,
        username: uname,
        passwordHash,
        role: 'admin',
        mustChangePassword: false,
        isActive: true,
      })
      .returning()
      .all();
    console.log(`✓ Admin baru dibuat.`);
    console.log(`  Username : ${created.username}`);
    console.log(`  Nama     : ${created.name}`);
  }

  console.log('\nLogin ke dashboard pakai username + password di atas.');
  process.exit(0);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
