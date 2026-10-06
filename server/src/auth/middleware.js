const { eq } = require('drizzle-orm');
const { verifySession } = require('./jwt');
const { db, schema } = require('../db');

// Reads "Authorization: Bearer <token>", verifies it, and attaches the REE row
// (fresh from the DB, not just the JWT payload) to req.ree.
// Short-circuits if req.ree is already set (e.g. by the global setup middleware
// in index.js) so there's no double DB query per request.
async function requireAuth(req, res, next) {
  if (req.ree) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Belum login' });
  }
  try {
    const payload = verifySession(token);
    const [reeRow] = await db.select().from(schema.ree).where(eq(schema.ree.id, payload.sub));
    if (!reeRow) return res.status(401).json({ error: 'Akun tidak ditemukan' });
    if (!reeRow.isActive) return res.status(401).json({ error: 'Akun dinonaktifkan' });
    req.ree = reeRow;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang' });
  }
}

// Protects admin-only endpoints — must run after requireAuth.
function requireAdmin(req, res, next) {
  if (req.ree?.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
