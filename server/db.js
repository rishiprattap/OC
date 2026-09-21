const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const defaultDataDir = path.join(__dirname, '..', 'data');
const dataDir = isVercel ? path.join('/tmp', 'data') : defaultDataDir;

if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {}
}

const dbPath = path.join(dataDir, 'offstage.db');
if (isVercel && !fs.existsSync(dbPath)) {
  const seedDb = path.join(defaultDataDir, 'offstage.db');
  if (fs.existsSync(seedDb)) {
    try {
      fs.copyFileSync(seedDb, dbPath);
    } catch (e) {}
  }
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database at:', dbPath, err);
  } else {
    console.log('Connected to persistent SQLite database at:', dbPath);
  }
});

// Raw execution without schema hook (used internally by initSchema)
const rawRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

let schemaInitPromise = null;
function ensureSchema() {
  if (!schemaInitPromise) {
    schemaInitPromise = initSchema();
  }
  return schemaInitPromise;
}

// Promise wrappers for async/await with schema readiness guarantee
const run = async (sql, params = []) => {
  await ensureSchema();
  return rawRun(sql, params);
};

const get = async (sql, params = []) => {
  await ensureSchema();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const all = async (sql, params = []) => {
  await ensureSchema();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Safe helper to add column if it doesn't already exist
async function addColumnIfNotExists(table, columnDef) {
  try {
    await rawRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    // Error is expected if column already exists
  }
}

// Initialize schema and migrations
const initSchema = async () => {
  try {
    await rawRun(`
      CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        payment_status TEXT NOT NULL DEFAULT 'PENDING',
        transaction_id TEXT,
        payment_screenshot_url TEXT,
        payment_submitted_at TEXT,
        payment_verified_at TEXT,
        payment_verified_by TEXT,
        rejection_reason TEXT,
        checked_in INTEGER NOT NULL DEFAULT 0,
        checkin_at TEXT,
        certificate_eligible INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Run migrations for manual UPI and email columns if upgrading from earlier version
    await addColumnIfNotExists('registrations', 'transaction_id TEXT');
    await addColumnIfNotExists('registrations', 'payment_screenshot_url TEXT');
    await addColumnIfNotExists('registrations', 'payment_submitted_at TEXT');
    await addColumnIfNotExists('registrations', 'payment_verified_at TEXT');
    await addColumnIfNotExists('registrations', 'payment_verified_by TEXT');
    await addColumnIfNotExists('registrations', 'rejection_reason TEXT');
    await addColumnIfNotExists('registrations', 'checkin_at TEXT');

    // Email verification and delivery tracking columns
    await addColumnIfNotExists('registrations', 'email_verified INTEGER NOT NULL DEFAULT 0');
    await addColumnIfNotExists('registrations', 'email_verified_at TEXT');
    await addColumnIfNotExists('registrations', 'email_otp_hash TEXT');
    await addColumnIfNotExists('registrations', 'email_otp_salt TEXT');
    await addColumnIfNotExists('registrations', 'email_otp_expires_at TEXT');
    await addColumnIfNotExists('registrations', 'email_verification_attempts INTEGER NOT NULL DEFAULT 0');
    await addColumnIfNotExists('registrations', 'email_last_sent_at TEXT');
    await addColumnIfNotExists('registrations', 'registration_email_sent_at TEXT');
    await addColumnIfNotExists('registrations', 'payment_proof_email_sent_at TEXT');
    await addColumnIfNotExists('registrations', 'payment_confirmation_email_sent_at TEXT');
    await addColumnIfNotExists('registrations', 'payment_rejection_email_sent_at TEXT');
    await addColumnIfNotExists('registrations', 'checkin_email_sent_at TEXT');
    await addColumnIfNotExists('registrations', 'certificate_email_sent_at TEXT');
    await addColumnIfNotExists('registrations', 'last_email_type TEXT');
    await addColumnIfNotExists('registrations', 'last_email_sent_at TEXT');
    await addColumnIfNotExists('registrations', 'email_error TEXT');
    await addColumnIfNotExists('registrations', 'email_status TEXT DEFAULT "PENDING"');

    // Indexes for fast lookup
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_reg_id ON registrations(registration_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_phone ON registrations(phone)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_trans_id ON registrations(transaction_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_status ON registrations(payment_status)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_email_verified ON registrations(email_verified)`);

    // Audit log table for all sent & attempted emails
    await rawRun(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status)`);

    // Google Meet Sessions and Email Delivery Audit Tables
    await rawRun(`
      CREATE TABLE IF NOT EXISTS meet_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        meet_url TEXT NOT NULL,
        message TEXT,
        scheduled_at TEXT,
        status TEXT NOT NULL DEFAULT 'SENT',
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_meet_sessions_event ON meet_sessions(event_id)`);

    await rawRun(`
      CREATE TABLE IF NOT EXISTS meet_email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meet_session_id INTEGER NOT NULL,
        registration_id TEXT,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT,
        status TEXT NOT NULL,
        provider_message_id TEXT,
        error_message TEXT,
        sent_at TEXT NOT NULL,
        FOREIGN KEY (meet_session_id) REFERENCES meet_sessions(id)
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_meet_logs_session ON meet_email_logs(meet_session_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_meet_logs_reg ON meet_email_logs(registration_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_meet_logs_status ON meet_email_logs(status)`);

    // Legacy certificates table to retain previous participants from certificate.html
    await rawRun(`
      CREATE TABLE IF NOT EXISTS legacy_certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT UNIQUE NOT NULL,
        event_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Seed previous 10 legacy hashes if not present
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
      await rawRun(`
        INSERT OR IGNORE INTO legacy_certificates (hash, event_name, created_at)
        VALUES (?, 'ONLINE OPEN MIC 2026 (Edition 1)', datetime('now'))
      `, [h]);
    }

    console.log('Database schema and manual UPI columns initialized successfully.');
  } catch (err) {
    console.error('Database schema initialization error:', err);
  }
};

initSchema();

module.exports = {
  db,
  run,
  get,
  all
};
