/**
 * Offstage Creators — Database Layer
 * Postgres via 'pg' with promise wrappers and schema migrations.
 */
const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper to convert SQLite ? to Postgres $1, $2, etc.
const convertSql = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
};

// ─── Promise Wrappers ──────────────────────────────────────────────────────────

const rawRun = async (sql, params = []) => {
  const pgSql = convertSql(sql);
  const result = await pool.query(pgSql, params);
  // Return something similar to what sqlite3 returned
  return { 
    lastID: result.rows.length ? result.rows[0].id : null, 
    changes: result.rowCount 
  };
};

let schemaInitPromise = null;
function ensureSchema() {
  if (!schemaInitPromise) schemaInitPromise = initSchema();
  return schemaInitPromise;
}

const run = async (sql, params = []) => {
  await ensureSchema();
  return rawRun(sql, params);
};

const get = async (sql, params = []) => {
  await ensureSchema();
  const pgSql = convertSql(sql);
  const result = await pool.query(pgSql, params);
  return result.rows[0];
};

const all = async (sql, params = []) => {
  await ensureSchema();
  const pgSql = convertSql(sql);
  const result = await pool.query(pgSql, params);
  return result.rows;
};

// Safe column migration helper
async function addColumnIfNotExists(table, columnDef) {
  try {
    await rawRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    // Expected if column exists, PG throws error 42701 "duplicate_column"
    if (err.code !== '42701') {
      console.warn(`Column migration notice: ${err.message}`);
    }
  }
}

// ─── Schema Initialization ────────────────────────────────────────────────────

const initSchema = async () => {
  try {
    // ── Registrations ──────────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS registrations (
        id SERIAL PRIMARY KEY,
        registration_id TEXT UNIQUE NOT NULL,
        event_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        city TEXT,
        category TEXT NOT NULL,
        instagram TEXT,
        performance_title TEXT,
        performance_description TEXT,
        amount INTEGER NOT NULL DEFAULT 79,
        -- OTP verification state
        otp_verified INTEGER NOT NULL DEFAULT 0,
        otp_verified_at TEXT,
        -- Registration status
        reg_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
        -- Admin approval
        approved_at TEXT,
        approved_by TEXT,
        rejected_at TEXT,
        rejected_reason TEXT,
        -- Payment proof (UPI)
        transaction_id TEXT,
        payment_screenshot_url TEXT,
        payment_submitted_at TEXT,
        payment_verified_at TEXT,
        payment_verified_by TEXT,
        -- Event check-in
        checked_in INTEGER NOT NULL DEFAULT 0,
        checkin_at TEXT,
        certificate_eligible INTEGER NOT NULL DEFAULT 0,
        -- Email tracking
        registration_email_sent_at TEXT,
        approval_email_sent_at TEXT,
        rejection_email_sent_at TEXT,
        last_email_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payment_status TEXT
      )
    `);

    // Indexes (Postgres doesn't need 'IF NOT EXISTS' for indexes universally without a block, 
    // but standard PG 9.5+ supports CREATE INDEX IF NOT EXISTS)
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_reg_id ON registrations(registration_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_email ON registrations(email)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_phone ON registrations(phone)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations(reg_status)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_otp_verified ON registrations(otp_verified)`);

    // ── OTP Sessions ────────────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS otp_sessions (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        registration_id TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        otp_salt TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_sent_at TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_sessions(email)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_otp_reg_id ON otp_sessions(registration_id)`);

    // ── Email Audit Log ─────────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY,
        registration_id TEXT,
        recipient TEXT NOT NULL,
        email_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_message_id TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_email_logs_reg ON email_logs(registration_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs(email_type)`);

    // ── Legacy certificates ─────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS legacy_certificates (
        id SERIAL PRIMARY KEY,
        hash TEXT UNIQUE NOT NULL,
        event_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    const legacyHashes = [
      "be73c2bc683d4be53e8f203d2faedb34a7aa3794526efd77022eae855e63d442",
      "8969db9beafcdab746cd4cd80a7b787e83e68faac0ddc7f2b793077e7476147b",
      "aef922c04477c5ed6fe6bad9f37127b7075ea04ae668730dfcd3ae63aec7fe8b",
      "b0a7bf9c51973d618fe73e86d1c9afa605751becb5e025f76b4bf26894d9d09a",
      "338857dac57c022abc03946607a6b5e404cb98894c7b7ea340aa3ee3d08c4259",
      "7a5f0f2fdb7214a779721aaf9fa23a118dbdd1fe6afa6f6b114bca034e8bb55e",
      "ecfd819bbff1d0ceb7ecb9f17a7af7f554a25175c898008eb8ffcb82b766fe31",
      "c54fc5cfa6699328f70d661ff9d67d4edd2207edaee97f1b6235b82f304e9413",
      "16d3315151d5eb3a028e2315321244fe433224e0be2d3a3ab46f218e019e5119",
      "74e0c4bc687027924b29d5c6cbe6157de16b1cc7253fc2bead217ca53ad6293a"
    ];
    for (const h of legacyHashes) {
      await rawRun(
        `INSERT INTO legacy_certificates (hash, event_name, created_at) VALUES (?, 'ONLINE OPEN MIC 2026 (Edition 1)', NOW()) ON CONFLICT (hash) DO NOTHING`,
        [h]
      );
    }

    console.log('✓ Database schema initialized (Postgres).');
  } catch (err) {
    console.error('Database schema initialization error:', err);
    throw err;
  }
};

initSchema();

module.exports = { pool, run, get, all };
