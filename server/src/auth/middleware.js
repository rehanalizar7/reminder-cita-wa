const { eq } = require('drizzle-orm');
const { verifySession } = require('./jwt');
const { db, schema } = require('../db');

const ROLES = ['ree', 'spv', 'admin'];

// Reads "Authorization: Bearer <token>", verifies it, and attaches the REE row
// (fresh from the DB, not just the JWT payload) to req.ree.
// Short-circuits if req.ree is already set (e.g. by the global setup middleware
// in index.js) so there's no double DB query per request.
//
// PENTING: role SELALU diambil dari database (req.ree.role), bukan dari JWT --
// kalau admin ganti role seseorang, efeknya langsung berlaku di request berikutnya
// walaupun token lama orang itu masih nyimpen role yang lama.
async function requireAuth(req, res, next) {
  if (req.ree) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Belum login' });
  }
  let payload;
  try {
    payload = verifySession(token);
  } catch (err) {
    return res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang' });
  }
  try {
    const [reeRow] = await db.select().from(schema.ree).where(eq(schema.ree.id, payload.sub));
    if (!reeRow) return res.status(401).json({ error: 'Akun tidak ditemukan' });
    if (!reeRow.isActive) return res.status(401).json({ error: 'Akun dinonaktifkan' });
    req.ree = reeRow;
    next();
  } catch (err) {
    // Error DB bukan masalah sesi -- jangan bikin user ditendang ke /login.
    next(err);
  }
}

// Izinkan hanya role tertentu. Harus jalan SETELAH requireAuth.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.ree || !roles.includes(req.ree.role)) {
      return res.status(403).json({ error: 'Akses ditolak untuk role akun ini' });
    }
    next();
  };
}

// Protects admin-only endpoints — must run after requireAuth.
const requireAdmin = requireRole('admin');

// Admin = akun administrasi murni. Fitur operasional (WA, outlet, kirim,
// jadwal, ...) ditolak buat admin. Kalau req.ree belum ada (rute publik kayak
// callback Google Contacts), biarin lewat -- router-nya sendiri yang ngecek auth.
function blockAdmin(req, res, next) {
  if (req.ree?.role === 'admin') {
    return res.status(403).json({
      error: 'Akun admin gak dipakai buat kirim reminder. Login pakai akun REE/SPV untuk fitur ini.',
      code: 'ADMIN_NOT_ALLOWED',
    });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireRole, blockAdmin, ROLES };
