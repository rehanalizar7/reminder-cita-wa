const { eq, and, inArray } = require('drizzle-orm');
const { db, schema } = require('../db');

// Resolves a (targetType, groupId, outletIds) selection into the actual list
// of active Outlet rows to message. Shared by the immediate-send route and
// the scheduler worker so "send now" and "scheduled send" always target
// exactly the same way.
async function resolveTargets({ reeId, targetType, groupId, outletIds }) {
  if (targetType === 'ALL') {
    return db.select().from(schema.outlet).where(and(eq(schema.outlet.reeId, reeId), eq(schema.outlet.isActive, true)));
  }
  if (targetType === 'GROUP') {
    if (!groupId) throw new Error('groupId wajib diisi untuk target GROUP');
    const memberRows = await db
      .select({ outletId: schema.outletGroupMember.outletId })
      .from(schema.outletGroupMember)
      .where(eq(schema.outletGroupMember.groupId, groupId));
    const ids = memberRows.map((m) => m.outletId);
    if (!ids.length) return [];
    return db
      .select()
      .from(schema.outlet)
      .where(and(eq(schema.outlet.reeId, reeId), eq(schema.outlet.isActive, true), inArray(schema.outlet.id, ids)));
  }
  if (targetType === 'SELECTED') {
    if (!Array.isArray(outletIds) || outletIds.length === 0) {
      throw new Error('outletIds wajib diisi untuk target SELECTED');
    }
    return db
      .select()
      .from(schema.outlet)
      .where(
        and(eq(schema.outlet.reeId, reeId), eq(schema.outlet.isActive, true), inArray(schema.outlet.id, outletIds))
      );
  }
  throw new Error(`targetType tidak dikenal: ${targetType}`);
}

module.exports = { resolveTargets };
