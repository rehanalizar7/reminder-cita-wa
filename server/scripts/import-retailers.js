// Import satu-kali (atau ulang, aman dijalankan berkali-kali) buat narik data
// resmi retailer + TSUB dari file Excel yang dikasih admin ke tabel referensi
// `tsub` dan `cita_retailer`.
//
// Data ini CUMA jadi referensi buat REE nyari nomor login CITA yang bener pas
// nyetel outlet mereka sendiri di halaman Outlet (lihat citaRetailerId di
// schema.js) -- BUKAN buat auto-matching atau auto-bikin outlet baru.
//
// Cara pakai:
//   node scripts/import-retailers.js <path-ke-file.xlsx>
//   (atau taruh filenya di ./data/import/retailers.xlsx dan jalankan tanpa argumen)
//
// Kolom yang diharapkan (urutan A..G): Retailer Code, Retailer Name,
// Retailer Phone, No Login, TSUB, WS Code, WS Name.
//
// Baris dengan TSUB #N/A (rusak/gak ke-mapping di data sumbernya) DILEWATIN --
// gak masuk ke tabel `tsub` maupun `cita_retailer`, soalnya REE nyari retailer
// selalu lewat TSUB yang dia klaim, jadi baris tanpa TSUB valid gak akan pernah
// kepilih di manapun.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { randomUUID } = require('crypto');
const { sqlite } = require('../src/db');
const { normalizeIdPhone } = require('../src/utils/phone');

const DEFAULT_PATH = path.join(__dirname, '../data/import/retailers.xlsx');

function cellText(cellValue) {
  if (cellValue == null) return null;
  if (typeof cellValue === 'object') {
    // Cell formula (mis. No Login = MID(Retailer Phone, 3, 20)) -- ambil hasil
    // yang udah dihitung Excel, bukan rumusnya.
    if ('result' in cellValue) return cellValue.result != null ? String(cellValue.result) : null;
    if ('error' in cellValue) return null; // #N/A dkk
    if ('richText' in cellValue) return cellValue.richText.map((r) => r.text).join('');
    if ('text' in cellValue) return String(cellValue.text);
    return null;
  }
  return String(cellValue).trim();
}

async function readRows(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File Excel gak punya sheet sama sekali.');

  const rows = [];
  let skippedNoTsub = 0;
  let skippedNoCode = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const retailerCode = cellText(row.getCell(1).value);
    const retailerName = cellText(row.getCell(2).value);
    const phoneRaw = cellText(row.getCell(3).value);
    const noLoginRaw = cellText(row.getCell(4).value);
    const tsubRaw = cellText(row.getCell(5).value);
    const wsCode = cellText(row.getCell(6).value);
    const wsName = cellText(row.getCell(7).value);

    if (!retailerCode) {
      skippedNoCode++;
      return;
    }
    if (!tsubRaw || tsubRaw === '#N/A') {
      skippedNoTsub++;
      return;
    }

    rows.push({
      retailerCode,
      retailerName: retailerName || retailerCode,
      phone: normalizeIdPhone(phoneRaw),
      citaLoginPhone: normalizeIdPhone(noLoginRaw) || noLoginRaw, // fallback: simpen mentah kalau gak kebaca sbg nomor
      tsub: tsubRaw.trim(),
      wsCode,
      wsName,
    });
  });

  return { rows, skippedNoTsub, skippedNoCode };
}

function runImport(rows) {
  const now = Math.floor(Date.now() / 1000);

  const tsubCodes = [...new Set(rows.map((r) => r.tsub))].sort();

  const upsertTsub = sqlite.prepare(`
    INSERT INTO tsub (id, code, outlet_count, created_at)
    VALUES (@id, @code, @outletCount, @createdAt)
    ON CONFLICT(code) DO UPDATE SET outlet_count = excluded.outlet_count
  `);

  const upsertRetailer = sqlite.prepare(`
    INSERT INTO cita_retailer
      (id, retailer_code, retailer_name, phone, cita_login_phone, tsub_id, ws_code, ws_name, created_at, updated_at)
    VALUES
      (@id, @retailerCode, @retailerName, @phone, @citaLoginPhone, @tsubId, @wsCode, @wsName, @createdAt, @updatedAt)
    ON CONFLICT(retailer_code) DO UPDATE SET
      retailer_name = excluded.retailer_name,
      phone = excluded.phone,
      cita_login_phone = excluded.cita_login_phone,
      tsub_id = excluded.tsub_id,
      ws_code = excluded.ws_code,
      ws_name = excluded.ws_name,
      updated_at = excluded.updated_at
  `);

  const getTsubIdByCode = sqlite.prepare('SELECT id FROM tsub WHERE code = ?');

  const tx = sqlite.transaction((rows, tsubCodes) => {
    // 1) Pastikan setiap kode TSUB ada, dengan outlet_count ke-update sesuai data terbaru.
    for (const code of tsubCodes) {
      const count = rows.filter((r) => r.tsub === code).length;
      upsertTsub.run({ id: randomUUID(), code, outletCount: count, createdAt: now });
    }

    // 2) Upsert semua baris retailer, ditautkan ke tsub.id yang sesuai.
    let inserted = 0;
    for (const r of rows) {
      const tsubRow = getTsubIdByCode.get(r.tsub);
      upsertRetailer.run({
        id: randomUUID(),
        retailerCode: r.retailerCode,
        retailerName: r.retailerName,
        phone: r.phone,
        citaLoginPhone: r.citaLoginPhone,
        tsubId: tsubRow ? tsubRow.id : null,
        wsCode: r.wsCode,
        wsName: r.wsName,
        createdAt: now,
        updatedAt: now,
      });
      inserted++;
    }
    return inserted;
  });

  return tx(rows, tsubCodes);
}

async function main() {
  const filePath = process.argv[2] || DEFAULT_PATH;
  if (!fs.existsSync(filePath)) {
    console.error(`File gak ketemu: ${filePath}`);
    console.error('Cara pakai: node scripts/import-retailers.js <path-ke-file.xlsx>');
    process.exit(1);
  }

  console.log(`Baca file: ${filePath}`);
  const { rows, skippedNoTsub, skippedNoCode } = await readRows(filePath);
  console.log(`Baris valid (ada TSUB & kode retailer): ${rows.length}`);
  console.log(`Dilewatin (TSUB #N/A/kosong): ${skippedNoTsub}`);
  console.log(`Dilewatin (kode retailer kosong): ${skippedNoCode}`);

  if (rows.length === 0) {
    console.log('Gak ada baris valid buat diimport, berhenti.');
    return;
  }

  const distinctTsub = new Set(rows.map((r) => r.tsub));
  console.log(`Kode TSUB unik ditemukan: ${distinctTsub.size}`);

  const count = runImport(rows);
  console.log(`Selesai. ${count} baris retailer diupsert ke ${distinctTsub.size} TSUB.`);
}

main()
  .catch((err) => {
    console.error('Import gagal:', err);
    process.exit(1);
  })
  .finally(() => {
    sqlite.close();
  });
