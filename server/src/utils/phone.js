// Normalizes a loosely-formatted Indonesian phone number into the digits-only
// international form WhatsApp/Baileys expects (e.g. "62812xxxxxxx").
// Returns null if it doesn't look like a usable phone number at all.
function normalizeIdPhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;

  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    // Common when people save numbers without the leading 0, e.g. "812-xxxx"
    digits = '62' + digits;
  } else if (digits.startsWith('620')) {
    // e.g. "6208123..." typo — drop the extra 0 after country code
    digits = '62' + digits.slice(3);
  }
  // else: assume it already has a country code (62..., or another country's)

  // Sanity bounds: Indonesian mobile numbers are 10-13 digits after the "62".
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function toWhatsAppJid(normalizedPhone) {
  return `${normalizedPhone}@s.whatsapp.net`;
}

module.exports = { normalizeIdPhone, toWhatsAppJid };
