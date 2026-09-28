# Reminder CITA via WA

Tools internal buat REE (Retail Engagement Executive) kirim reminder WhatsApp ke outlet
supaya rutin order via CITA. Tiap REE login sendiri, import kontak outlet dari HP-nya
(lewat sinkron Google Contacts), hubungkan WA-nya sendiri, lalu kirim/jadwalkan reminder
ke outlet — manual, per grup, pilih sendiri, atau otomatis terjadwal.

Dibikin terpisah dari TOMAS (bot KPK) karena arsitekturnya beda: TOMAS satu nomor WA
sentral, ini 60 sesi WA (satu per REE). Tapi tetap dirancang buat deploy di satu VPS
yang sama, pola PM2 yang sama.

## Arsitektur singkat

- **`server/`** — Node.js + Express. Database SQLite lokal (pakai Drizzle ORM, bukan
  Prisma — sengaja, biar gak ada dependency ke server download engine binary pas
  `npm install`, jadi instalasinya lebih ringan & gak gampang gagal karena jaringan).
  WhatsApp lewat **Baileys** (`@whiskeysockets/baileys`) — satu sesi per REE, disimpan
  di `server/data/wa-sessions/<reeId>/`. Scheduler (cek jadwal tiap menit) jalan built-in
  di proses yang sama, gak perlu worker terpisah.
- **`web/`** — Dashboard React (Vite). Login Google, hubungkan WA (scan QR), review &
  import kontak, kelola outlet/grup/template, kirim & jadwalkan.

## 1. Siapkan Google Cloud (buat login + tarik kontak)

1. Buka [console.cloud.google.com](https://console.cloud.google.com), bikin project baru
   (atau pakai yang sudah ada).
2. **APIs & Services → Library** → cari **People API** → Enable.
3. **APIs & Services → OAuth consent screen**:
   - Kalau REE-REE kamu semua pakai akun Google Workspace satu domain kantor (misal
     `@sampoerna.com`), pilih **User Type: Internal**. Ini penting — dengan Internal,
     gak perlu proses verifikasi Google sama sekali dan gak ada batas jumlah user.
   - Kalau REE pakai akun Gmail pribadi (bukan Workspace), User Type-nya kepaksa
     **External**. Selama masih status **Testing**, cuma bisa 100 test user (60 REE
     masih muat) TAPI refresh token expired tiap 7 hari — REE bakal harus login ulang
     tiap minggu. Buat pakai jangka panjang tanpa batasan ini, app-nya perlu diajukan
     verifikasi Google (karena scope kontak termasuk "sensitive scope"). Proses
     verifikasi ini bisa makan waktu beberapa hari — siapkan dari awal kalau opsi
     Internal gak bisa dipakai.
4. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**, tipe
   **Web application**. Isi **Authorized redirect URI** dengan
   `https://<domain-server-kamu>/auth/google/callback` (atau
   `http://localhost:4000/auth/google/callback` buat testing lokal).
5. Catat **Client ID** dan **Client Secret** — dipakai di `server/.env`.

## 2. Deploy backend (`server/`)

```bash
cd server
npm install
cp .env.example .env
# edit .env: isi JWT_SECRET (random string panjang), GOOGLE_CLIENT_ID/SECRET,
# GOOGLE_REDIRECT_URI, WEB_BASE_URL, SERVER_BASE_URL

npm run db:migrate   # bikin database SQLite + semua tabel (sekali aja, aman diulang)
```

Kalau nanti ubah schema (`server/src/db/schema.js`), generate migration baru dulu:

```bash
npm run db:generate   # bikin file SQL migration baru di server/drizzle/
npm run db:migrate    # terapkan ke database
```

## 3. Deploy dashboard (`web/`)

```bash
cd web
npm install
cp .env.example .env
# edit .env: VITE_API_BASE_URL diisi URL backend kamu (mis. https://reminder-api.domainkamu.com)

npm run build   # hasil ada di web/dist/
```

## 4. Jalankan dengan PM2

Dari root project:

```bash
pm2 start ecosystem.config.js
pm2 save
```

Ini jalanin dua proses: `reminder-cita-api` (backend, port dari `PORT` di `.env`,
default 4000) dan `reminder-cita-web` (serve `web/dist` di port 5173 lewat `serve`).
Kalau kamu udah biasa pakai nginx buat TOMAS, lebih rapi kalau dashboard-nya
di-serve lewat nginx sebagai static file (`web/dist`) + reverse proxy `server/`
di path `/api` atau subdomain terpisah — silakan sesuaikan, `ecosystem.config.js`
di sini cuma default paling simpel biar langsung jalan.

## 5. Alur pemakaian tiap REE

1. Buka dashboard, **Login dengan Google** (izinkan akses kontak saat diminta).
2. Di halaman **Dashboard**, klik **Hubungkan WhatsApp**, scan QR pakai HP yang
   nomornya mau dipakai kirim reminder (WhatsApp → Perangkat Tertaut → Tautkan
   Perangkat).
3. Ke halaman **Import Kontak** — sistem narik semua kontak dari akun Google REE
   tersebut. Kontak yang cocok sama pola nama outlet REE (misal semua diawali
   "TOKO") otomatis kecentang di tab **Disarankan**; REE tinggal cek sekilas lalu
   klik **Import**. Kontak lain yang belum kecentang tetap bisa dipilih manual di
   tab **Lainnya**. Pola yang disimpan dipakai lagi otomatis tiap sinkron
   berikutnya (kalau ada outlet baru di kontaknya).
4. Di **Outlet**, REE bisa bikin grup (misal "Belum order minggu ini", "Prioritas")
   dan kelompokkan outlet ke situ.
5. Di **Template Pesan**, bikin isi pesan reminder — bisa pakai `{{nama_outlet}}`
   dan `{{nama_ree}}`.
6. Di **Kirim**, pilih template + target (semua outlet / satu grup / pilih manual),
   klik **Kirim Sekarang**.
7. Di **Jadwal**, bikin jadwal sekali kirim (tanggal/jam tertentu) atau berulang
   (pilih hari + jam, atau isi cron manual buat pola yang lebih rumit).

## Batasan yang perlu kamu tahu (v1, disengaja disederhanakan)

- **Antrian kirim di memory.** Kalau REE belum hubungkan WA (atau lagi putus) terus
  ada pesan yang di-"Kirim Sekarang", pesan itu nunggu di antrian dalam memory
  proses server — begitu WA konek, baru jalan diproses. Tapi kalau server-nya
  restart sebelum sempat konek, antrian itu hilang (baris di riwayat tetap kestuck
  status `PENDING` tanpa retry otomatis). Buat versi berikutnya, ini bisa
  ditambahin: proses "sapu" berkala yang re-queue semua `PENDING` yang kelamaan
  nunggu.
- **Risiko banned WhatsApp.** Baileys itu library gak resmi (bukan WhatsApp
  Business API). Ada jeda random antar pesan (`WA_MIN_DELAY_MS`/`WA_MAX_DELAY_MS`
  di `.env`) buat kurangin risiko, tapi tetap disarankan mulai pelan-pelan (jangan
  langsung blast ratusan outlet sekaligus di hari pertama tiap nomor baru
  dipairing), dan idealnya pakai nomor yang emang khusus buat ini (bukan nomor WA
  pribadi utama REE) kalau memungkinkan.
- **Belum ada dashboard admin lintas-REE.** Sekarang tiap REE cuma lihat data
  outlet/kirimnya sendiri. Kalau kamu (atau tim) mau pantau semua 60 REE dari satu
  layar (siapa yang belum hubungkan WA, total kirim per REE per hari, dsb), itu
  fitur lanjutan yang belum dibikin di v1 ini — cukup gampang ditambah nanti.
- Ini fondasi yang udah nyambung ujung ke ujung (login → import kontak → kirim →
  jadwal, semua sudah dites jalan), tapi masih layak dites lebih jauh sama REE
  asli sebelum full rollout ke 60 orang — mulai dari 2-3 REE dulu buat lihat
  perilaku asli WA-nya sebelum full rollout.

## Lanjut development

Struktur project ini didesain buat gampang dilanjutin sama Claude Code CLI di
VPS kamu (pola kerja yang udah biasa kamu pakai). File-file kuncinya:

- `server/src/db/schema.js` — schema database (Drizzle)
- `server/src/wa/sessionManager.js` — pengelola sesi WA per-REE
- `server/src/services/dispatch.js` — logic inti kirim pesan (dipakai baik oleh
  kirim manual maupun scheduler)
- `server/src/scheduler/worker.js` — polling jadwal
- `web/src/pages/` — tiap halaman dashboard
