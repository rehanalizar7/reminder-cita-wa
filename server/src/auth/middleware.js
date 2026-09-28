const { eq } = require('drizzle-orm');
const { verifySession } = require('./jwt');
const { db, schema } = require('../db');

// Reads "Authorization: Bearer <token>", verifies it, and attaches the REE row
// (fresh from the DB, not just the JWT payload) to req.ree.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Belum login' });
  }
  try {
    const payload = verifySession(token);
    const [reeRow] = await db.select().from(schema.ree).where(eq(schema.ree.id, payload.sub));
    if (!reeRow) return res.status(401).json({ error: 'Akun tidak ditemukan' });
    req.ree = reeRow;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang' });
  }
}

module.exports = { requireAuth };
