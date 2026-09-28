const express = require('express');
const { eq } = require('drizzle-orm');
const { db, schema } = require('../db');
const { getAuthUrl, exchangeCodeForTokens, getUserInfo } = require('../auth/googleOAuth');
const { signSession } = require('../auth/jwt');
const { requireAuth } = require('../auth/middleware');
const { logger } = require('../utils/logger');

const router = express.Router();

// Step 1: dashboard "Login with Google" button links/redirects here.
router.get('/google', (req, res) => {
  res.redirect(getAuthUrl());
});

// Step 2: Google redirects back here with ?code=...
router.get('/google/callback', async (req, res) => {
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

    const insertValues = {
      email: info.email,
      name: info.name || info.email,
      googleId: info.id,
      googleRefreshToken: tokens.refresh_token || null,
    };
    // Google only sends refresh_token on the *first* consent (or when we force
    // prompt=consent, which we always do) — on the update branch, only
    // overwrite it if this exchange actually returned a new one, so a REE
    // logging in again doesn't accidentally wipe a still-valid stored token.
    const updateSet = {
      name: insertValues.name,
      googleId: insertValues.googleId,
      ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
    };

    const [ree] = await db
      .insert(schema.ree)
      .values(insertValues)
      .onConflictDoUpdate({ target: schema.ree.email, set: updateSet })
      .returning();

    if (!ree.googleRefreshToken) {
      logger.warn({ reeId: ree.id }, 'Login tanpa refresh_token — import kontak akan gagal sampai login ulang');
    }

    const jwtToken = signSession(ree);
    res.redirect(`${webUrl}/oauth-callback?token=${encodeURIComponent(jwtToken)}`);
  } catch (err) {
    logger.error({ err }, 'Google OAuth callback gagal');
    res.redirect(`${webUrl}/login?error=oauth_failed`);
  }
});

router.get('/me', requireAuth, (req, res) => {
  const { id, email, name, waConnected, waPhoneNumber, waLastConnectedAt, contactPattern, patternIsRegex, tsubId } = req.ree;
  res.json({ id, email, name, waConnected, waPhoneNumber, waLastConnectedAt, contactPattern, patternIsRegex, tsubId });
});

module.exports = router;
