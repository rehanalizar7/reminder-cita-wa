const { eq, and, inArray } = require('drizzle-orm');
const { db, schema } = require('../db');

// 'REE' cuma dipakai SPV: semua outlet aktif milik satu REE di timnya.
const TARGET_TYPES = ['ALL', 'GROUP', 'SELECTED', 'REE'];

class TargetError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Resolves a (targetType, groupId, outletIds, targetReeId) selection into the
// actual list of active Outlet rows to message. Shared by the immediate-send
// route, run-now, and the scheduler worker so every path targets the same way.
//
// `scopeReeIds` = pemilik outlet yang boleh dikirimi (lihat services/team.js
// getScopeReeIds): REE -> [dirinya], SPV -> REE di timnya. Apa pun ID yang
// dikirim client, outlet di luar scope ini gak akan pernah ikut.
async function resolveTargets({ scopeReeIds, targetType, groupId, outletIds, targetReeId }) {
  if (!Array.isArray(scopeReeIds) || scopeReeIds.length === 0) return [];
  const activeInScope = and(inArray(schema.outlet.reeId, scopeReeIds), eq(schema.outlet.isActive, true));

  if (targetType === 'ALL') {
    return db.select().from(schema.outlet).where(activeInScope).orderBy(schema.outlet.name);
  }

  if (targetType === 'REE') {
    if (!targetReeId) throw new TargetError('Pilih REE tujuan dulu');
    if (!scopeReeIds.includes(targetReeId)) throw new TargetError('REE ini bukan bagian dari tim kamu');
    return db
      .select()
      .from(schema.outlet)
      .where(and(eq(schema.outlet.reeId, targetReeId), eq(schema.outlet.isActive, true)))
      .orderBy(schema.outlet.name);
  }

  if (targetType === 'GROUP') {
    if (!groupId) throw new TargetError('groupId wajib diisi untuk target GROUP');
    const [group] = await db.select().from(schema.outletGroup).where(eq(schema.outletGroup.id, String(groupId)));
    if (!group || !scopeReeIds.includes(group.reeId)) throw new TargetError('Grup tidak ditemukan');
    const memberRows = await db
      .select({ outletId: schema.outletGroupMember.outletId })
      .from(schema.outletGroupMember)
      .where(eq(schema.outletGroupMember.groupId, group.id));
    const ids = memberRows.map((m) => m.outletId);
    if (!ids.length) return [];
    return db
      .select()
      .from(schema.outlet)
      .where(and(activeInScope, inArray(schema.outlet.id, ids)))
      .orderBy(schema.outlet.name);
  }

  if (targetType === 'SELECTED') {
    if (!Array.isArray(outletIds) || outletIds.length === 0) {
      throw new TargetError('outletIds wajib diisi untuk target SELECTED');
    }
    const ids = [...new Set(outletIds.map(String))];
    return db
      .select()
      .from(schema.outlet)
      .where(and(activeInScope, inArray(schema.outlet.id, ids)))
      .orderBy(schema.outlet.name);
  }

  throw new TargetError(`targetType tidak dikenal: ${targetType}`);
}

// Validasi target SAAT DIBUAT (jadwal baru), biar kesalahan ketahuan sekarang,
// bukan diem-diem gagal pas worker jalan nanti. Balikin bentuk yang udah
// dinormalisasi buat disimpan.
async function validateTarget({ user, scopeReeIds, targetType, groupId, outletIds, targetReeId }) {
  if (!TARGET_TYPES.includes(targetType)) throw new TargetError('Jenis target tidak valid');
  if (targetType === 'REE' && user.role !== 'spv') throw new TargetError('Target per REE cuma buat akun SPV');

  if (targetType === 'GROUP') {
    if (!groupId) throw new TargetError('Pilih grup dulu');
    const [group] = await db.select().from(schema.outletGroup).where(eq(schema.outletGroup.id, String(groupId)));
    if (!group || !scopeReeIds.includes(group.reeId)) throw new TargetError('Grup tidak ditemukan');
    return { targetType, groupId: group.id, targetReeId: null, outletIds: [] };
  }

  if (targetType === 'REE') {
    if (!targetReeId) throw new TargetError('Pilih REE tujuan dulu');
    if (!scopeReeIds.includes(String(targetReeId))) throw new TargetError('REE ini bukan bagian dari tim kamu');
    return { targetType, groupId: null, targetReeId: String(targetReeId), outletIds: [] };
  }

  if (targetType === 'SELECTED') {
    if (!Array.isArray(outletIds) || outletIds.length === 0) throw new TargetError('Pilih minimal satu outlet');
    const ids = [...new Set(outletIds.map(String))];
    if (!scopeReeIds.length) throw new TargetError('Outlet tidak ditemukan');
    const found = await db
      .select({ id: schema.outlet.id })
      .from(schema.outlet)
      .where(and(inArray(schema.outlet.reeId, scopeReeIds), inArray(schema.outlet.id, ids)));
    if (found.length !== ids.length) throw new TargetError('Sebagian outlet yang dipilih tidak ditemukan');
    return { targetType, groupId: null, targetReeId: null, outletIds: ids };
  }

  return { targetType, groupId: null, targetReeId: null, outletIds: [] };
}

module.exports = { resolveTargets, validateTarget, TARGET_TYPES, TargetError };
