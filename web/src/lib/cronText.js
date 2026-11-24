// Ubah jadwal berulang (format cron, disimpan di server) jadi kalimat yang
// gampang dibaca REE, dan sebaliknya bikin cron dari pilihan di form.
// Cron di server selalu dibaca pakai zona waktu WIB (Asia/Jakarta).

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Urutan tampil: Senin dulu, Minggu terakhir.
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function pad(n) {
  return String(n).padStart(2, '0');
}

function joinId(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

// "1-5" / "1,3,5" / "*" -> daftar angka. null kalau bentuknya di luar yang dikenali.
function parseList(field, min, max) {
  if (field === '*') return 'ALL';
  const out = new Set();
  for (const part of field.split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a > b) return null;
      for (let i = a; i <= b; i++) out.add(i);
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    } else {
      return null;
    }
  }
  for (const n of out) if (n < min || n > max) return null;
  return [...out];
}

// Baca cron yang bentuknya bisa dibikin dari form (lihat buildCron).
// Balikin null kalau bentuknya lain (cron lama yang diketik manual).
export function parseCron(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dow] = parts;
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour) || month !== '*') return null;
  const m = Number(min);
  const h = Number(hour);
  if (m > 59 || h > 23) return null;
  const time = `${pad(h)}:${pad(m)}`;

  if (dom === '*') {
    const days = parseList(dow, 0, 7);
    if (!days) return null;
    if (days === 'ALL') return { freq: 'daily', time, days: [], dates: [] };
    const norm = [...new Set(days.map((d) => (d === 7 ? 0 : d)))];
    if (norm.length === 7) return { freq: 'daily', time, days: [], dates: [] };
    return { freq: 'weekly', time, days: norm, dates: [] };
  }

  if (dow === '*') {
    const dates = parseList(dom, 1, 31);
    if (!dates || dates === 'ALL') return null;
    return { freq: 'monthly', time, days: [], dates: dates.sort((a, b) => a - b) };
  }
  return null;
}

export function buildCron({ freq, time, days, dates }) {
  const [hh, mm] = String(time || '09:00').split(':').map(Number);
  if (freq === 'daily') return `${mm} ${hh} * * *`;
  if (freq === 'weekly') return `${mm} ${hh} * * ${[...days].sort((a, b) => a - b).join(',')}`;
  return `${mm} ${hh} ${[...dates].sort((a, b) => a - b).join(',')} * *`;
}

export function describeSchedule({ freq, time, days, dates }) {
  const jam = `jam ${time} WIB`;
  if (freq === 'daily') return `Tiap hari, ${jam}`;
  if (freq === 'weekly') {
    const sorted = DAY_ORDER.filter((d) => days.includes(d));
    if (sorted.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return `Tiap Senin–Jumat, ${jam}`;
    if (sorted.length === 6 && !days.includes(0)) return `Tiap Senin–Sabtu, ${jam}`;
    return `Tiap ${joinId(sorted.map((d) => DAY_NAMES[d]))}, ${jam}`;
  }
  return `Tiap tanggal ${joinId(dates.map(String))} setiap bulan, ${jam}`;
}

// Kalimat buat ditampilin di daftar/dashboard. Cron yang gak dikenali tetap
// ditampilin apa adanya, biar gak ada info yang ilang.
export function describeCron(expr) {
  const parsed = parseCron(expr);
  if (!parsed) return `Jadwal khusus (${expr})`;
  return describeSchedule(parsed);
}

// Jam kirim di luar jam wajar toko -- cuma buat peringatan di form.
export function isOddHour(time) {
  const h = Number(String(time).split(':')[0]);
  return h < 6 || h >= 21;
}
