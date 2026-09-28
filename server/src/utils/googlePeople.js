const { google } = require('googleapis');
const { clientFromRefreshToken } = require('../auth/googleOAuth');
const { normalizeIdPhone } = require('./phone');

// Pulls every contact from the REE's Google account (People API) that has at
// least one phone number. Handles pagination — a REE with 300+ outlet
// contacts mixed into their personal contacts can easily be 500-1000+ total.
async function fetchAllContacts(refreshToken) {
  const auth = clientFromRefreshToken(refreshToken);
  const people = google.people({ version: 'v1', auth });

  const results = [];
  let pageToken;
  do {
    const { data } = await people.people.connections.list({
      resourceName: 'people/me',
      personFields: 'names,phoneNumbers',
      pageSize: 1000,
      pageToken,
    });

    for (const person of data.connections || []) {
      const name = person.names?.[0]?.displayName;
      const phoneRaw = person.phoneNumbers?.[0]?.value;
      const phone = normalizeIdPhone(phoneRaw);
      if (!name || !phone) continue; // skip unusable rows rather than fail the whole import
      results.push({
        googleContactId: person.resourceName, // e.g. "people/c12345"
        name,
        phone,
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

module.exports = { fetchAllContacts };
