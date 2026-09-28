const express = require('express');
const { eq } = require('drizzle-orm');
const { db, schema } = require('../db');
const { requireAuth } = require('../auth/middleware');
const { fetchAllContacts } = require('../utils/googlePeople');
const { buildMatcher } = require('../utils/matchPattern');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(requireAuth);

// GET /contacts/preview
// Pulls the REE's Google contacts and buckets them so the dashboard can show
// a review screen instead of importing blindly:
//   - alreadyImported: already an Outlet row (by phone) — shown for context, not re-importable
//   - suggested: matches the REE's saved pattern and isn't imported yet — pre-checked in the UI
//   - other: everything else not yet imported — REE can still hand-pick from these
router.get('/preview', async (req, res) => {
  const ree = req.ree;
  if (!ree.googleRefreshToken) {
    return res.status(400).json({
      error: 'Belum ada akses Google Contacts. Silakan login ulang dan izinkan akses kontak.',
    });
  }

  try {
    const [googleContacts, existingOutlets] = await Promise.all([
      fetchAllContacts(ree.googleRefreshToken),
      db.select({ phone: schema.outlet.phone }).from(schema.outlet).where(eq(schema.outlet.reeId, ree.id)),
    ]);

    const existingPhones = new Set(existingOutlets.map((o) => o.phone));
    const matches = buildMatcher(ree.contactPattern, ree.patternIsRegex);

    const alreadyImported = [];
    const suggested = [];
    const other = [];

    for (const c of googleContacts) {
      if (existingPhones.has(c.phone)) {
        alreadyImported.push(c);
      } else if (matches(c.name)) {
        suggested.push(c);
      } else {
        other.push(c);
      }
    }

    res.json({
      total: googleContacts.length,
      hasPattern: Boolean(ree.contactPattern),
      alreadyImported,
      suggested,
      other,
    });
  } catch (err) {
    logger.error({ err, reeId: ree.id }, 'Gagal ambil kontak Google');
    res.status(502).json({ error: 'Gagal ambil kontak dari Google. Coba lagi beberapa saat.' });
  }
});

// POST /contacts/import
// body: { contacts: [{ googleContactId, name, phone }], savePattern?: { pattern, isRegex } }
router.post('/import', async (req, res) => {
  const ree = req.ree;
  const { contacts, savePattern } = req.body || {};

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'Gak ada kontak yang dipilih' });
  }

  const rows = contacts
    .filter((c) => c && c.name && c.phone)
    .map((c) => ({
      reeId: ree.id,
      name: c.name,
      phone: c.phone,
      rawContactName: c.name,
      googleContactId: c.googleContactId || null,
    }));

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Data kontak yang dikirim tidak valid' });
  }

  try {
    // Single bulk insert, atomic by itself — duplicates (same reeId+phone,
    // e.g. re-submitting a batch, or a contact already imported earlier) are
    // silently skipped rather than erroring the whole import.
    const inserted = await db.insert(schema.outlet).values(rows).onConflictDoNothing().returning();

    if (savePattern && typeof savePattern.pattern === 'string' && savePattern.pattern.trim()) {
      await db
        .update(schema.ree)
        .set({ contactPattern: savePattern.pattern.trim(), patternIsRegex: Boolean(savePattern.isRegex) })
        .where(eq(schema.ree.id, ree.id));
    }

    res.json({ ok: true, imported: inserted.length });
  } catch (err) {
    logger.error({ err, reeId: ree.id }, 'Gagal import kontak');
    res.status(500).json({ error: 'Gagal simpan kontak yang dipilih' });
  }
});

// PUT /contacts/pattern — update the saved filter pattern on its own, without importing.
router.put('/pattern', async (req, res) => {
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
});

module.exports = router;
