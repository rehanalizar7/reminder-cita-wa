const { google } = require('googleapis');

// Scopes:
// - openid/email/profile: identify who's logging in
// - contacts.readonly: read the REE's Google contacts (People API) for outlet import
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/contacts.readonly',
];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // needed to get a refresh_token
    prompt: 'consent', // force consent every time so we reliably get a refresh_token
    scope: SCOPES,
  });
}

async function exchangeCodeForTokens(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

// Returns an authenticated OAuth2 client for a REE that already logged in before,
// using their stored refresh_token. Used when re-syncing contacts later without
// asking them to log in again.
function clientFromRefreshToken(refreshToken) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

async function getUserInfo(client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return data; // { id, email, name, picture, ... }
}

module.exports = { getAuthUrl, exchangeCodeForTokens, clientFromRefreshToken, getUserInfo };
