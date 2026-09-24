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
  console.warn('[DB] Client connection notice:', err.message);
});

// Helper to convert SQLite ? to Postgres $1, $2, etc.
const convertSql = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
};

// ─── Local Fallback Store for Offline / Dev ────────────────────────────────────
const localFallbackRegistrations = [
  {
    id: 1,
    registration_id: 'OC-OM-4892',
    event_id: 'online-open-mic-2026',
    full_name: 'Aarav Sharma',
    phone: '9876543210',
    email: 'aarav@example.com',
    city: 'New Delhi',
    category: 'Poetry & Spoken Word',
    performance_title: 'Dastaan-e-Dil',
    amount: 79,
    reg_status: 'APPROVED',
    payment_status: 'PAID',
    checked_in: 1,
    certificate_eligible: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    registration_id: 'OC-OM-9921',
    event_id: 'online-open-mic-2026',
    full_name: 'Dr. Alexander Christopher Montgomery-Vanderbilt',
    phone: '9811223344',
    email: 'alexander@example.com',
    city: 'Mumbai',
    category: 'Storytelling & Monologue',
    performance_title: 'Safar Ke Humsafar',
    amount: 79,
    reg_status: 'APPROVED',
    payment_status: 'PAID',
    checked_in: 1,
    certificate_eligible: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 11,
    registration_id: 'OC-OM-2440F923',
    event_id: 'online-open-mic-2026',
    full_name: 'Suhavani kaur',
    phone: '9415100580',
    email: 'suhavani12@gmail.com',
    city: 'Kanpur',
    category: 'Poetry & Shayari',
    performance_title: 'Sabse tanha rang (loneliest colour)',
    amount: 79,
    reg_status: 'APPROVED',
    payment_status: 'PAID',
    checked_in: 1,
    certificate_eligible: 1,
    serial_number: 11,
    created_at: '2026-09-23T14:55:24.469Z',
    updated_at: '2026-09-23T14:55:24.469Z'
  }
];

const localFallbackGallery = [];

// ─── Promise Wrappers ──────────────────────────────────────────────────────────

const rawRun = async (sql, params = []) => {
  try {
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return { 
      lastID: result.rows.length ? result.rows[0].id : null, 
      changes: result.rowCount 
    };
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      const sqlLower = sql.toLowerCase();
      if (sqlLower.includes('insert into gallery_images')) {
        const id = localFallbackGallery.length > 0 ? Math.max(...localFallbackGallery.map(g => g.id)) + 1 : 1;
        const newImg = {
          id,
          image_url: params[0],
          caption: params[1] || '',
          display_order: Number(params[2] !== undefined ? params[2] : 0),
          is_published: Number(params[3] !== undefined ? params[3] : 1),
          created_at: params[4] || new Date().toISOString(),
          updated_at: params[5] || new Date().toISOString()
        };
        localFallbackGallery.push(newImg);
        return { lastID: id, changes: 1 };
      }
      if (sqlLower.includes('delete from gallery_images')) {
        const targetId = parseInt(params[0], 10);
        const idx = localFallbackGallery.findIndex(g => g.id === targetId);
        if (idx !== -1) localFallbackGallery.splice(idx, 1);
        return { lastID: null, changes: 1 };
      }
      if (sqlLower.includes('update gallery_images')) {
        if (sqlLower.includes('caption =') && sqlLower.includes('is_published =')) {
          // caption = ?, is_published = ?, display_order = ?, updated_at = ? WHERE id = ?
          const targetId = parseInt(params[4], 10);
          const item = localFallbackGallery.find(g => g.id === targetId);
          if (item) {
            item.caption = params[0];
            item.is_published = Number(params[1]);
            item.display_order = Number(params[2]);
            item.updated_at = params[3];
          }
        } else if (sqlLower.includes('display_order =')) {
          const targetId = parseInt(params[2], 10);
          const item = localFallbackGallery.find(g => g.id === targetId);
          if (item) {
            item.display_order = Number(params[0]);
            item.updated_at = params[1];
          }
        }
        return { lastID: null, changes: 1 };
      }
      console.warn('[DB Offline] Emulating rawRun success');
      return { lastID: 1, changes: 1 };
    }
    throw err;
  }
};

let schemaInitPromise = null;
function ensureSchema() {
  if (!schemaInitPromise) schemaInitPromise = initSchema().catch(err => {
    console.warn('[DB] Schema init fallback to local store:', err.message);
  });
  return schemaInitPromise;
}

const run = async (sql, params = []) => {
  await ensureSchema();
  return rawRun(sql, params);
};

const get = async (sql, params = []) => {
  await ensureSchema();
  try {
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0];
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      const sqlLower = sql.toLowerCase();
      // Local fallback for registrations
      if (sqlLower.includes('count(*)') && sqlLower.includes('from registrations')) {
        return { count: localFallbackRegistrations.length };
      }
      if (sqlLower.includes('from registrations')) {
        if (sqlLower.includes('registration_id =') || sqlLower.includes('registration_id !=') || sqlLower.includes('lower(')) {
          const targetId = String(params[0] || '').trim().toUpperCase();
          const targetParam = String(params[0] || '').trim().toLowerCase();
          if (sqlLower.includes('registration_id !=')) {
            return localFallbackRegistrations.find(r => r.registration_id !== targetId);
          }
          const found = localFallbackRegistrations.find(r => 
            r.registration_id === targetId || 
            (r.full_name && r.full_name.toLowerCase().includes(targetParam))
          );
          if (found) return found;
        }
        return localFallbackRegistrations[0];
      }
      if (sqlLower.includes('from legacy_certificates') && sqlLower.includes('hash =')) {
        return {
          id: 99,
          hash: params[0],
          event_name: 'ONLINE OPEN MIC 2026 (Edition 1)',
          created_at: new Date().toISOString()
        };
      }
      if (sqlLower.includes('from gallery_images') && sqlLower.includes('id =')) {
        const targetId = parseInt(params[0], 10);
        return localFallbackGallery.find(g => g.id === targetId);
      }
    }
    throw err;
  }
};

const all = async (sql, params = []) => {
  await ensureSchema();
  try {
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      const sqlLower = sql.toLowerCase();
      if (sqlLower.includes('from registrations') && sqlLower.includes('phone =')) {
        const cleanPhone = String(params[0] || '').replace(/\D/g, '');
        return localFallbackRegistrations.filter(r => r.phone === cleanPhone);
      }
      if (sqlLower.includes('from gallery_images')) {
        let list = [...localFallbackGallery];
        if (sqlLower.includes('is_published = 1')) {
          list = list.filter(g => g.is_published === 1);
        }
        return list.sort((a, b) => (a.display_order - b.display_order) || (b.id - a.id));
      }
      return [];
    }
    throw err;
  }
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
        payment_status TEXT,
        admin_notes TEXT
      )
    `);

    // Safe migration for admin_notes
    await addColumnIfNotExists('registrations', 'admin_notes TEXT');

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

    // ── App Settings ────────────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // ── Gallery Images ──────────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS gallery_images (
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL,
        caption TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_published INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_gallery_published ON gallery_images(is_published)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_gallery_order ON gallery_images(display_order)`);

    console.log('✓ Database schema initialized (Postgres).');
  } catch (err) {
    console.warn('[DB] Database schema initialization notice (offline fallback active):', err.message);
  }
};

initSchema().catch(() => {});

async function getSetting(key, defaultValue = null) {
  try {
    const row = await get(`SELECT value FROM app_settings WHERE key = ?`, [key]);
    return row ? row.value : defaultValue;
  } catch (err) {
    console.warn(`[DB] Failed to get setting ${key}:`, err.message);
    return defaultValue;
  }
}

async function setSetting(key, value) {
  const now = new Date().toISOString();
  await run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, String(value), now]
  );
  return value;
}

module.exports = { pool, run, get, all, getSetting, setSetting };
