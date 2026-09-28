// Renders a template body like:
//   "Halo {{nama_outlet}}, jangan lupa order rutin via CITA ya, kak {{nama_ree}}."
// Unknown placeholders are left as-is (visible in the message) rather than
// silently turned into blank text, so a typo in the template is easy to spot
// before sending to hundreds of outlets.
function renderTemplate(body, variables) {
  return String(body || '').replace(/{{\s*([\w.]+)\s*}}/g, (full, key) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : full;
  });
}

// Variables available to every template — kept in one place so the dashboard's
// template editor and the actual send path always agree on what's available.
function buildVariablesForOutlet(outlet, ree) {
  return {
    nama_outlet: outlet.name,
    nama_ree: ree.name,
    // Nomor login CITA outlet ini -- kosong kalau REE belum setting-nya
    // (bukan diisi otomatis dari nomor WA, lihat outlet.citaLoginPhone).
    no_login_cita: outlet.citaLoginPhone || '',
  };
}

const AVAILABLE_PLACEHOLDERS = ['nama_outlet', 'nama_ree', 'no_login_cita'];

module.exports = { renderTemplate, buildVariablesForOutlet, AVAILABLE_PLACEHOLDERS };
