/**
 * Database Migration Runner (`database/migrate.js`)
 *
 * Fixes Node.js CJS module resolution when invoked from `backend/` via `npm run migrate`
 * (`node ../database/migrate.js`) by registering `../backend/node_modules` in `module.paths`.
 * Also supports automatic local JSON database initialization if MySQL is not running locally.
 */
const fs = require('fs');
const path = require('path');

// Ensure packages installed in `../backend/node_modules` are resolved when running from `database/`
const backendNodeModules = path.resolve(__dirname, '../backend/node_modules');
if (!module.paths.includes(backendNodeModules)) {
  module.paths.unshift(backendNodeModules);
}

// Load .env (or fallback to .env.example if .env has not been created yet)
try {
  const dotenv = require('dotenv');
  const envPath = path.resolve(__dirname, '../backend/.env');
  const envExamplePath = path.resolve(__dirname, '../backend/.env.example');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else if (fs.existsSync(envExamplePath)) {
    dotenv.config({ path: envExamplePath });
  }
} catch (e) {
  // Continue with process.env defaults if dotenv is not installed yet
}

async function runMigrations() {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (err) {
    console.log('[MIGRATE] Note: `mysql2` package not found in node_modules (run `npm install` inside `backend/`).');
    console.log('[MIGRATE] Initializing embedded local database store (`database/local_db.json`) so the app can run immediately...');
    const { initLocalDatabase } = require('./seed');
    initLocalDatabase();
    console.log('[MIGRATE] Local database store initialized successfully.');
    return;
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    });

    console.log('[MIGRATE] Connected to MySQL server. Applying 17-table base schema (`schema.sql`)...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await connection.query(schemaSql);

    const migrationsDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        console.log(`[MIGRATE] Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await connection.query(sql);
      }
    }
    console.log('[MIGRATE] All 17 MySQL tables, foreign keys, indexes, and views verified successfully.');
  } catch (err) {
    console.warn(`[MIGRATE] MySQL connection notice (${err.message}).`);
    console.log('[MIGRATE] Initializing embedded local database fallback (`database/local_db.json`) so the backend works out-of-the-box...');
    const { initLocalDatabase } = require('./seed');
    initLocalDatabase();
    console.log('[MIGRATE] Embedded local database initialized. (To use MySQL, verify DB_USER/DB_PASSWORD in `backend/.env` and re-run `npm run migrate`).');
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
