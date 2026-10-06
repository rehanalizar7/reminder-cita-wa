#!/usr/bin/env node
// Naikkan user yang sudah ada menjadi admin, atau buat admin baru.
// Usage:
//   node scripts/set-admin.js --email <e> --username <u> --password <p> [--name <n>]
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { eq } = require('drizzle-orm');
const { db, schema } = require('../src/db');

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
  const { email, username, password, name } = parseArgs();

  if (!email) { console.error('Wajib: --email <email>'); process.exit(1); }
  if (!username) { console.error('Wajib: --username <username>'); process.exit(1); }
  if (!password) { console.error('Wajib: --password <password>'); process.exit(1); }
  if (password.length < 6) { console.error('Password minimal 6 karakter'); process.exit(1); }

  const uname = username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  const [existing] = await db.select().from(schema.ree).where(eq(schema.ree.email, email.trim()));

  if (existing) {
    await db
      .update(schema.ree)
      .set({ role: 'admin', username: uname, passwordHash, mustChangePassword: false, isActive: true })
      .where(eq(schema.ree.id, existing.id));
    console.log(`✓ User ${existing.email} dinaikkan jadi admin.`);
    console.log(`  Username : ${uname}`);
    console.log(`  Nama     : ${existing.name}`);
  } else {
    const displayName = (name || email).trim();
    // Cek username conflict
    const [uConflict] = await db.select({ id: schema.ree.id }).from(schema.ree).where(eq(schema.ree.username, uname));
    if (uConflict) { console.error(`Username "${uname}" sudah dipakai oleh akun lain.`); process.exit(1); }

    const [created] = await db
      .insert(schema.ree)
      .values({
        email: email.trim(),
        name: displayName,
        username: uname,
        passwordHash,
        role: 'admin',
        mustChangePassword: false,
        isActive: true,
      })
      .returning();
    console.log(`✓ Admin baru dibuat: ${created.email}`);
    console.log(`  Username : ${uname}`);
    console.log(`  Nama     : ${displayName}`);
  }

  console.log('\nLogin ke dashboard pakai username + password di atas.');
  process.exit(0);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
