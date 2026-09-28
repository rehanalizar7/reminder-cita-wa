const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const schema = require('./schema');

// DATABASE_URL is kept in the same "file:./path" shape Prisma popularized, so
// .env stays familiar — we just strip the "file:" prefix for better-sqlite3.
const rawUrl = process.env.DATABASE_URL || 'file:./data/reminder-cita.db';
const filePath = rawUrl.startsWith('file:') ? rawUrl.slice('file:'.length) : rawUrl;
const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '../../', filePath);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const sqlite = new Database(resolvedPath);
sqlite.pragma('journal_mode = WAL'); // lets the API server and scheduler worker (same process) read/write concurrently without locking issues
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

module.exports = { db, sqlite, schema };
