const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { eq } = require('drizzle-orm');
const { db, schema } = require('../db');
const { getAuthUrl, exchangeCodeForTokens, getUserInfo } = require('../auth/googleOAuth');
const { signSession } = require('../auth/jwt');
const { requireAuth } = require('../auth/middleware');
const { logger } = require('../utils/logger');

const router = express.Router();

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Rate limiter: maks 5 percobaan per 15 menit per IP+username.
// Melindungi dari brute-force tanpa memblokir IP-sharing (NAT, kantor).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `${req.ip}:${(req.body?.username || '').toLowerCase()}`,
  handler: (req, res) =>
    res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' }),
  standardHeaders: true,
  legacyHeaders: false,
  // Tidak skip sukses — tiap percobaan dihitung, bukan hanya yang gagal
  skipSuccessfulRequests: false,
});

// Step 1: dashboard "Login with Google" button links/redirects here.
router.get('/google', (req, res) => {
  res.redirect(getAuthUrl());
});

// Step 2: Google redirects back here with ?code=...
router.get('/google/callback', wrap(async (req, res) => {
  const { code, error } = req.query;
  const webUrl = process.env.WEB_BASE_URL || 'http://localhost:5173';

  if (error) {
    return res.redirect(`${webUrl}/login?error=${encodeURIComponent(String(error))}`);
  }
  if (!code) {
    return res.redirect(`${webUrl}/login?error=missing_code`);
  }

  try {
    const { client, tokens } = await exchangeCodeForTokens(String(code));
    const info = await getUserInfo(client);

    if (!info.email) throw new Error('Google tidak mengembalikan email');

    const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
    if (allowedDomain && !info.email.endsWith(`@${allowedDomain}`)) {
      return res.redirect(`${webUrl}/login?error=domain_not_allowed`);
    }

    // Lookup-only: email harus sudah terdaftar. Tidak ada auto-create.
    const [ree] = await db.select().from(schema.ree).where(eq(schema.ree.email, info.email));
    if (!ree) {
      return res.redirect(`${webUrl}/login?error=account_not_found`);
    }
    if (!ree.isActive) {
      return res.redirect(`${webUrl}/login?error=account_disabled`);
    }

    // Perbarui data Google (refresh_token hanya kalau ada yang baru dari exchange ini)
    const updateSet = {
      name: info.name || ree.name,
      googleId: info.id,
      ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
    };
    const [updated] = await db
      .update(schema.ree)
      .set(updateSet)
      .where(eq(schema.ree.id, ree.id))
      .returning();

    if (!updated.googleRefreshToken) {
      logger.warn({ reeId: ree.id }, 'Login tanpa refresh_token — import kontak akan gagal sampai login ulang');
    }

    const jwtToken = signSession(updated);

    // Kalau harus ganti password, arahkan ke halaman khusus dengan token di query
    if (updated.mustChangePassword) {
      return res.redirect(`${webUrl}/change-password?token=${encodeURIComponent(jwtToken)}`);
    }
    res.redirect(`${webUrl}/oauth-callback?token=${encodeURIComponent(jwtToken)}`);
  } catch (err) {
    logger.error({ err }, 'Google OAuth callback gagal');
    res.redirect(`${webUrl}/login?error=oauth_failed`);
  }
}));

// POST /auth/login — login username + password
router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi' });
  }

  const [ree] = await db
    .select()
    .from(schema.ree)
    .where(eq(schema.ree.username, username.trim().toLowerCase()));

  // Pesan error generik — jangan bocorkan "username tidak ada" vs "password salah"
  const invalidMsg = 'Username atau password salah';
  if (!ree || !ree.passwordHash) return res.status(401).json({ error: invalidMsg });

  const match = await bcrypt.compare(password, ree.passwordHash);
  if (!match) return res.status(401).json({ error: invalidMsg });

  if (!ree.isActive) return res.status(403).json({ error: 'Akun dinonaktifkan' });

  const token = signSession(ree);
  res.json({ token, mustChangePassword: ree.mustChangePassword });
}));

// POST /auth/change-password — ganti password (butuh login dulu)
// - Kalau must_change_password = true: cukup newPassword (admin reset flow)
// - Kalau false: wajib kirim currentPassword, dan newPassword != currentPassword
router.post('/change-password', requireAuth, wrap(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  }

  const ree = req.ree;

  if (!ree.mustChangePassword) {
    // Alur normal: verifikasi password lama dulu
    if (!currentPassword) {
      return res.status(400).json({ error: 'Password saat ini wajib diisi' });
    }
    if (!ree.passwordHash) {
      return res.status(400).json({ error: 'Akun ini belum punya password lokal' });
    }
    const matchCurrent = await bcrypt.compare(currentPassword, ree.passwordHash);
    if (!matchCurrent) return res.status(400).json({ error: 'Password saat ini salah' });

    const sameAsOld = await bcrypt.compare(newPassword, ree.passwordHash);
    if (sameAsOld) return res.status(400).json({ error: 'Password baru tidak boleh sama dengan password lama' });
  } else if (ree.passwordHash) {
    // Wajib ganti, tapi sudah punya hash — pastikan tidak sama dengan yang lama
    const sameAsOld = await bcrypt.compare(newPassword, ree.passwordHash);
    if (sameAsOld) return res.status(400).json({ error: 'Password baru tidak boleh sama dengan password sebelumnya' });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await db
    .update(schema.ree)
    .set({ passwordHash: hash, mustChangePassword: false })
    .where(eq(schema.ree.id, ree.id));

  res.json({ ok: true });
}));

router.get('/me', requireAuth, (req, res) => {
  const {
    id, email, name, role,
    waConnected, waPhoneNumber, waLastConnectedAt,
    contactPattern, patternIsRegex, tsubId,
    mustChangePassword,
  } = req.ree;
  res.json({
    id, email, name, role,
    waConnected, waPhoneNumber, waLastConnectedAt,
    contactPattern, patternIsRegex, tsubId,
    mustChangePassword,
  });
});

module.exports = router;
