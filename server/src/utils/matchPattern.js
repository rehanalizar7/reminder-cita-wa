// Each REE names their phone contacts however they personally like ("TOKO -
// Barokah", "[Malang] Bu Siti", "08 - Warung Jaya", etc.) — there's no single
// convention across all 60 REEs. So instead of one hardcoded rule, every REE
// sets (and can update) their own pattern once, and we reuse it on every
// re-sync so they don't have to re-review their whole contact list each time.
//
// `pattern` is either:
//   - a plain comma-separated keyword list (patternIsRegex=false), matched
//     case-insensitively as "contact name contains any of these keywords", or
//   - a single regular expression (patternIsRegex=true) for REEs whose
//     convention needs more precision (e.g. "^\\d{2,4}\\s*-").
//
// If a REE has no pattern saved yet, everything is treated as "unmatched" —
// they'll review the full list once on first import and can save a pattern
// from what they picked (see routes/contacts.js).
function buildMatcher(pattern, isRegex) {
  if (!pattern || !pattern.trim()) {
    return () => false;
  }
  if (isRegex) {
    let re;
    try {
      re = new RegExp(pattern, 'i');
    } catch (err) {
      // Bad regex saved somehow — fail safe to "no match" rather than crashing import.
      return () => false;
    }
    return (name) => re.test(name || '');
  }
  const keywords = pattern
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  return (name) => {
    const lower = (name || '').toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  };
}

module.exports = { buildMatcher };
