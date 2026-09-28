require('dotenv').config();

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: (process.env.DATABASE_URL || 'file:./data/reminder-cita.db').replace(/^file:/, ''),
  },
};
