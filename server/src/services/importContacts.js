const { eq, and, inArray } = require('drizzle-orm');
const { db, schema } = require('../db');

// Lebih ketat dari normalizeIdPhone: setelah normalisasi harus diawali '628'
// (nomor mobile Indonesia). Nomor non-mobile (PSTN, luar negeri) ditolak.
function normalizeContactPhone(raw) {
  if (raw === null || raw === undefined) return null;
  // Konversi ke string dulu (menangani angka dari Excel)
  let str = String(raw).trim();
  if (!str) return null;

  // Lepas notasi ilmiah dari Excel (mis. 6.2812e+12 → "62812...")
  if (/e[+-]?\d+/i.test(str)) {
    const n = Number(str);
    if (!isFinite(n)) return null;
    str = n.toFixed(0);
  }

  let digits = str.replace(/[^\d]/g, '');
  if (!digits) return null;

  // Normalisasi prefix
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  } else if (digits.startsWith('620')) {
    digits = '62' + digits.slice(3);
  } else if (digits.startsWith('+')) {
    // + sudah di-strip, tapi kalau ada kasus lain
    digits = digits.slice(1);
  }

  // Valid: 10-15 digit total, diawali 628 (mobile Indonesia)
  if (digits.length < 10 || digits.length > 15) return null;
  if (!digits.startsWith('628')) return null;

  return digits;
}

// Ambil semua data TSUB REE untuk validasi no_login_cita.
// Return Set dari citaLoginPhone yang valid.
async function loadCitaPhones(reeId) {
  const tsubRow = await db
    .select({ tsubId: schema.ree.tsubId })
    .from(schema.ree)
    .where(eq(schema.ree.id, reeId))
    .then((rows) => rows[0]);

  if (!tsubRow?.tsubId) return new Set();

  const retailers = await db
    .select({ phone: schema.citaRetailer.citaLoginPhone })
    .from(schema.citaRetailer)
    .where(eq(schema.citaRetailer.tsubId, tsubRow.tsubId));

  return new Set(retailers.map((r) => r.phone));
}

// Preview baris dari sumber manapun (Google, Excel, Manual).
// Input: rows = [{ name, phone, loginCita?, group?, googleContactId? }]
// Output: rows dengan tambahan field status + warnings.
async function previewRows(reeId, rows) {
  // Load data referensi
  const [existingOutlets, existingGroups, citaPhones] = await Promise.all([
    db
      .select({ phone: schema.outlet.phone })
      .from(schema.outlet)
      .where(eq(schema.outlet.reeId, reeId)),
    db
      .select({ id: schema.outletGroup.id, name: schema.outletGroup.name })
      .from(schema.outletGroup)
      .where(eq(schema.outletGroup.reeId, reeId)),
    loadCitaPhones(reeId),
  ]);

  const existingPhones = new Set(existingOutlets.map((o) => o.phone));
  const groupMap = new Map(existingGroups.map((g) => [g.name.toLowerCase(), g.id]));
  const seenInBatch = new Set(); // dedup dalam batch

  return rows.map((row) => {
    const name = (row.name || '').trim();
    const loginCita = (row.loginCita || '').trim() || null;
    const group = (row.group || '').trim() || null;
    const googleContactId = row.googleContactId || null;

    const normalizedPhone = normalizeContactPhone(row.phone);
    const warnings = [];

    if (!normalizedPhone) {
      return {
        name,
        phone: String(row.phone ?? ''),
        normalizedPhone: null,
        loginCita,
        group,
        googleContactId,
        status: 'invalid',
        reason: 'format_nomor',
        warnings,
      };
    }

    if (seenInBatch.has(normalizedPhone)) {
      return {
        name,
        phone: String(row.phone ?? ''),
        normalizedPhone,
        loginCita,
        group,
        googleContactId,
        status: 'duplicate_in_batch',
        reason: null,
        warnings,
      };
    }
    seenInBatch.add(normalizedPhone);

    if (existingPhones.has(normalizedPhone)) {
      return {
        name,
        phone: String(row.phone ?? ''),
        normalizedPhone,
        loginCita,
        group,
        googleContactId,
        status: 'exists',
        reason: null,
        warnings,
      };
    }

    // Cek warnings
    if (group && !groupMap.has(group.toLowerCase())) {
      warnings.push('group_new');
    }
    if (loginCita && !citaPhones.has(loginCita)) {
      warnings.push('cita_not_found');
    }

    return {
      name,
      phone: String(row.phone ?? ''),
      normalizedPhone,
      loginCita,
      group,
      googleContactId,
      status: 'new',
      reason: null,
      warnings,
    };
  });
}

// Simpan baris yang dicentang user dalam satu transaksi SQLite sinkron.
// Input: rows = baris dari previewRows yang status === 'new' (sudah difilter frontend)
// Return: { created: N }
function commitRows(reeId, rows) {
  return db.transaction((tx) => {
    // 1. Pastikan semua grup yang dibutuhkan ada
    const groupNames = [...new Set(rows.filter((r) => r.group).map((r) => r.group))];
    const groupIdByName = new Map();

    if (groupNames.length > 0) {
      const existing = tx
        .select({ id: schema.outletGroup.id, name: schema.outletGroup.name })
        .from(schema.outletGroup)
        .where(and(eq(schema.outletGroup.reeId, reeId), inArray(schema.outletGroup.name, groupNames)))
        .all();

      for (const g of existing) groupIdByName.set(g.name, g.id);

      for (const gName of groupNames) {
        if (!groupIdByName.has(gName)) {
          const inserted = tx
            .insert(schema.outletGroup)
            .values({ reeId, name: gName })
            .returning({ id: schema.outletGroup.id })
            .get();
          groupIdByName.set(gName, inserted.id);
        }
      }
    }

    // 2. Insert outlet
    let created = 0;
    for (const row of rows) {
      const outletValues = {
        reeId,
        name: row.name,
        phone: row.normalizedPhone,
        rawContactName: row.name,
        googleContactId: row.googleContactId || null,
        citaLoginPhone: row.loginCita || null,
      };

      const [inserted] = tx
        .insert(schema.outlet)
        .values(outletValues)
        .onConflictDoNothing()
        .returning({ id: schema.outlet.id })
        .all();

      if (!inserted) continue; // sudah ada (race condition atau double-submit)
      created++;

      // 3. Assign grup kalau ada
      if (row.group && groupIdByName.has(row.group)) {
        tx.insert(schema.outletGroupMember)
          .values({ outletId: inserted.id, groupId: groupIdByName.get(row.group) })
          .onConflictDoNothing()
          .run();
      }
    }

    return { created };
  });
}

module.exports = { normalizeContactPhone, previewRows, commitRows };
