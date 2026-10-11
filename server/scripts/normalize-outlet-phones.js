/**
 * Script sekali-jalan: audit normalisasi nomor outlet yang sudah ada.
 *
 * Cara pakai:
 *   node scripts/normalize-outlet-phones.js
 *
 * Output JSON ke stdout: daftar outlet per REE yang perlu dinormalisasi,
 * dan duplikat yang akan muncul setelah normalisasi.
 * Script ini TIDAK mengubah data apapun.
 */

require('dotenv').config();
const { db, schema } = require('../src/db');
const { normalizeContactPhone } = require('../src/services/importContacts');

async function main() {
  const outlets = db
    .select({
      id: schema.outlet.id,
      reeId: schema.outlet.reeId,
      name: schema.outlet.name,
      phone: schema.outlet.phone,
    })
    .from(schema.outlet)
    .all();

  const byRee = new Map();
  for (const o of outlets) {
    if (!byRee.has(o.reeId)) byRee.set(o.reeId, []);
    byRee.get(o.reeId).push(o);
  }

  const report = { totalOutlets: outlets.length, rees: [] };

  for (const [reeId, outletList] of byRee) {
    const needsUpdate = [];
    const willDuplicate = [];
    const normalizedSeen = new Map(); // normalizedPhone → original phone

    for (const o of outletList) {
      const norm = normalizeContactPhone(o.phone);
      if (norm === null) {
        needsUpdate.push({ id: o.id, name: o.name, current: o.phone, normalized: null, reason: 'invalid_after_norm' });
        continue;
      }
      if (norm !== o.phone) {
        if (normalizedSeen.has(norm)) {
          willDuplicate.push({ id: o.id, name: o.name, current: o.phone, normalized: norm, conflictsWith: normalizedSeen.get(norm) });
        } else {
          needsUpdate.push({ id: o.id, name: o.name, current: o.phone, normalized: norm });
          normalizedSeen.set(norm, o.phone);
        }
      } else {
        normalizedSeen.set(norm, norm);
      }
    }

    if (needsUpdate.length > 0 || willDuplicate.length > 0) {
      report.rees.push({ reeId, total: outletList.length, needsUpdate, willDuplicate });
    }
  }

  report.summary = {
    reeesWithIssues: report.rees.length,
    totalNeedsUpdate: report.rees.reduce((s, r) => s + r.needsUpdate.length, 0),
    totalWillDuplicate: report.rees.reduce((s, r) => s + r.willDuplicate.length, 0),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
