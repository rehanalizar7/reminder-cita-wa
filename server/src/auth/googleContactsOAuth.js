const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

// Scope minimal: hanya baca kontak + tahu email akun yang dihubungkan.
const CONTACTS_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getContactsOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CONTACTS_REDIRECT_URI
  );
}

// Buat URL OAuth dengan state = JWT bertanda tangan (reeId + nonce pendek).
// State diverifikasi di callback supaya tidak bisa di-forge oleh pihak lain.
function getContactsAuthUrl(reeId) {
  const client = getContactsOAuthClient();
  const state = jwt.sign({ reeId }, process.env.JWT_SECRET, { expiresIn: '10m' });
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: CONTACTS_SCOPES,
    state,
  });
}

// Decode + verifikasi state JWT; throws kalau tidak valid / expired.
function verifyContactsState(state) {
  return jwt.verify(state, process.env.JWT_SECRET);
}

// Tukar authorization code → { refreshToken, email }.
// refreshToken bisa null kalau Google tidak mengeluarkan yang baru (jarang, tapi mungkin).
async function exchangeContactsCode(code) {
  const client = getContactsOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();

  return { refreshToken: tokens.refresh_token || null, email: data.email };
}

// Buat OAuth2 client dari refresh token yang tersimpan.
function contactsClientFromRefreshToken(refreshToken) {
  const client = getContactsOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// Revoke refresh token di sisi Google supaya token tidak bisa dipakai lagi.
// Best-effort: kalau gagal (mis. token sudah tidak valid), tidak throw.
async function revokeContactsToken(refreshToken) {
  try {
    const client = getContactsOAuthClient();
    await client.revokeToken(refreshToken);
  } catch {
    // Abaikan — token mungkin sudah expired atau dicabut user dari Google Account
  }
}

module.exports = { getContactsAuthUrl, verifyContactsState, exchangeContactsCode, contactsClientFromRefreshToken, revokeContactsToken };
