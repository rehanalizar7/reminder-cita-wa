const { sqliteTable, text, integer, primaryKey, index, uniqueIndex } = require('drizzle-orm/sqlite-core');
const { randomUUID } = require('crypto');

const id = () => text('id').primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date());
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

// One row per REE (Retail Engagement Executive) — also the dashboard login.
const ree = sqliteTable('ree', {
  id: id(),
  email: text('email').notNull(),
  googleId: text('google_id'),
  name: text('name').notNull(),
  // Google OAuth refresh token, used to pull People API contacts on demand.
  googleRefreshToken: text('google_refresh_token'),

  // Per-REE contact naming pattern, set once during onboarding, reused on every
  // re-sync so new phone contacts can be pre-filtered automatically.
  contactPattern: text('contact_pattern'),
  patternIsRegex: integer('pattern_is_regex', { mode: 'boolean' }).notNull().default(false),

  // WA pairing bookkeeping — the live socket lives in memory (wa/sessionManager),
  // this is just for the dashboard to show last-known status after a restart.
  waConnected: integer('wa_connected', { mode: 'boolean' }).notNull().default(false),
  waLastConnectedAt: integer('wa_last_connected_at', { mode: 'timestamp' }),
  // Set ONCE, the very first time this REE ever pairs a number — unlike
  // waLastConnectedAt (which updates on every reconnect), this never moves, so it's
  // what the "warm-up age" safety check uses to tell a brand-new number apart from
  // one that's just been restarted/reconnected after months of normal use.
  waFirstConnectedAt: integer('wa_first_connected_at', { mode: 'timestamp' }),
  waPhoneNumber: text('wa_phone_number'),

  // Wilayah TSUB yang REE ini klaim -- diset SEKALI pas pertama kali pakai akun,
  // gak ditanya lagi setelahnya. NULL berarti REE ini belum pilih TSUB (sistem
  // bakal ngarahin mereka ke halaman pilih TSUB dulu sebelum ke Dashboard).
  tsubId: text('tsub_id'),

  // Auth & akun management
  role: text('role').notNull().default('ree'), // 'ree' | 'admin'
  username: text('username'), // unique (lihat index), nullable buat user Google-only lama
  passwordHash: text('password_hash'),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ([
  uniqueIndex('ree_email_unique').on(t.email),
  uniqueIndex('ree_google_id_unique').on(t.googleId),
  uniqueIndex('ree_username_unique').on(t.username),
]));

// TSUB (kode wilayah/territory dari data resmi Sampoerna). Satu TSUB cuma boleh
// diklaim SATU REE -- assignedReeId NULL berarti masih tersedia buat dipilih.
// REE klaim ini sekali (pas pertama kali pakai akun), gak pernah dilepas otomatis.
const tsub = sqliteTable('tsub', {
  id: id(),
  code: text('code').notNull(), // "TSUB014"
  // Cache jumlah outlet dari data resmi terakhir diimport, buat ditampilin di
  // halaman pilih TSUB (mis. "TSUB014 · 270 outlet") tanpa perlu COUNT tiap saat.
  outletCount: integer('outlet_count').notNull().default(0),
  assignedReeId: text('assigned_ree_id').references(() => ree.id, { onDelete: 'set null' }),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
}, (t) => ([
  uniqueIndex('tsub_code_unique').on(t.code),
  uniqueIndex('tsub_assigned_ree_unique').on(t.assignedReeId),
]));

// Data resmi retailer per TSUB (diimport dari Excel yang dikasih admin). Ini
// referensi buat REE CARI nomor login CITA yang bener pas nyetel outlet mereka
// sendiri -- BUKAN buat auto-matching atau auto-bikin outlet baru.
const citaRetailer = sqliteTable('cita_retailer', {
  id: id(),
  retailerCode: text('retailer_code').notNull(), // "SUB0059785" -- kunci unik dari data resmi
  retailerName: text('retailer_name').notNull(),
  phone: text('phone'), // "Retailer Phone", dinormalisasi (62xxxxxxxxxxx)
  citaLoginPhone: text('cita_login_phone').notNull(), // "No Login", dinormalisasi
  tsubId: text('tsub_id').references(() => tsub.id, { onDelete: 'cascade' }),
  wsCode: text('ws_code'),
  wsName: text('ws_name'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ([
  uniqueIndex('cita_retailer_code_unique').on(t.retailerCode),
  index('cita_retailer_tsub_idx').on(t.tsubId),
]));

// A group REE defines to bucket their own outlets ("Belum order minggu ini",
// "Prioritas", "Wilayah A", ...).
const outletGroup = sqliteTable('outlet_group', {
  id: id(),
  reeId: text('ree_id').notNull().references(() => ree.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: createdAt(),
}, (t) => ([
  uniqueIndex('outlet_group_ree_name_unique').on(t.reeId, t.name),
]));

const outlet = sqliteTable('outlet', {
  id: id(),
  reeId: text('ree_id').notNull().references(() => ree.id, { onDelete: 'cascade' }),

  name: text('name').notNull(), // outlet name as saved in REE's contacts
  phone: text('phone').notNull(), // normalized digits, e.g. "62812xxxxxxx" -- dipakai buat kirim WA
  rawContactName: text('raw_contact_name'),
  googleContactId: text('google_contact_id'), // People API resourceName, for change detection on re-sync

  // Nomor buat LOGIN ke aplikasi CITA -- bisa BEDA dari `phone` di atas (nomor WA
  // yang dipakai buat blast reminder). REE isi manual, biasanya milih dari data
  // resmi TSUB mereka (lihat citaRetailer) lewat kotak cari di halaman Outlet.
  citaLoginPhone: text('cita_login_phone'),
  // Kalau REE milih dari daftar data resmi (bukan ketik manual), ini nyimpen baris
  // citaRetailer mana yang dipilih -- buat referensi/konteks, bukan buat matching otomatis.
  citaRetailerId: text('cita_retailer_id'),

  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true), // soft-disable instead of delete
  notes: text('notes'),

  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ([
  uniqueIndex('outlet_ree_phone_unique').on(t.reeId, t.phone),
  index('outlet_ree_active_idx').on(t.reeId, t.isActive),
]));

const outletGroupMember = sqliteTable('outlet_group_member', {
  outletId: text('outlet_id').notNull().references(() => outlet.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull().references(() => outletGroup.id, { onDelete: 'cascade' }),
}, (t) => ([
  primaryKey({ columns: [t.outletId, t.groupId] }),
]));

// Reusable message template with {{placeholder}} variables.
const messageTemplate = sqliteTable('message_template', {
  id: id(),
  reeId: text('ree_id').references(() => ree.id, { onDelete: 'cascade' }), // null = shared, usable by every REE
  name: text('name').notNull(),
  body: text('body').notNull(), // e.g. "Halo {{nama_outlet}}, jangan lupa order rutin via CITA ya..."
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// targetType: 'ALL' | 'GROUP' | 'SELECTED'
// A send job: either "send now" (fired immediately from the API, see services/dispatch)
// or a schedule the worker polls (cronExpression set, or a future one-off runAt).
const scheduleJob = sqliteTable('schedule_job', {
  id: id(),
  reeId: text('ree_id').notNull().references(() => ree.id, { onDelete: 'cascade' }),
  templateId: text('template_id').notNull().references(() => messageTemplate.id),

  targetType: text('target_type').notNull(),
  groupId: text('group_id').references(() => outletGroup.id),

  // Scheduling: exactly one of (runAt) or (cronExpression) is expected.
  runAt: integer('run_at', { mode: 'timestamp' }), // one-off, e.g. "send tomorrow 9am"
  cronExpression: text('cron_expression'), // recurring, e.g. "0 9 * * 1" (every Monday 9am)
  isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ([
  index('schedule_job_active_runat_idx').on(t.isActive, t.runAt),
]));

const scheduleJobOutlet = sqliteTable('schedule_job_outlet', {
  scheduleJobId: text('schedule_job_id').notNull().references(() => scheduleJob.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => outlet.id, { onDelete: 'cascade' }),
}, (t) => ([
  primaryKey({ columns: [t.scheduleJobId, t.outletId] }),
]));

// status: 'PENDING' | 'SENT' | 'FAILED'
// One row per actual message sent (or attempted) — the audit trail / history
// the dashboard shows.
const messageLog = sqliteTable('message_log', {
  id: id(),
  reeId: text('ree_id').notNull().references(() => ree.id, { onDelete: 'cascade' }),
  outletId: text('outlet_id').notNull().references(() => outlet.id, { onDelete: 'cascade' }),
  templateId: text('template_id').references(() => messageTemplate.id),
  scheduleJobId: text('schedule_job_id').references(() => scheduleJob.id, { onDelete: 'set null' }),

  phone: text('phone').notNull(),
  message: text('message').notNull(), // fully rendered text actually sent
  status: text('status').notNull().default('PENDING'),
  error: text('error'),

  createdAt: createdAt(),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
}, (t) => ([
  index('message_log_ree_created_idx').on(t.reeId, t.createdAt),
  index('message_log_status_idx').on(t.status),
]));

// Stores outgoing WA messages keyed by Baileys message ID so the socket can
// retrieve them for retry/receipt flows without hitting WhatsApp servers again.
// Cleaned up by a daily cron after 7 days.
const waMessages = sqliteTable('wa_messages', {
  waId: text('wa_id').notNull(),
  reeId: text('ree_id').notNull().references(() => ree.id, { onDelete: 'cascade' }),
  jid: text('jid').notNull(),
  content: text('content').notNull(), // JSON.stringify(sent.message)
  createdAt: createdAt(),
}, (t) => ([
  primaryKey({ columns: [t.waId, t.reeId] }),
  index('wa_messages_ree_created_idx').on(t.reeId, t.createdAt),
]));

module.exports = {
  ree,
  tsub,
  citaRetailer,
  outletGroup,
  outlet,
  outletGroupMember,
  messageTemplate,
  scheduleJob,
  scheduleJobOutlet,
  messageLog,
  waMessages,
};
