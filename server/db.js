/**
 * Offstage Creators — Database Layer
 * Postgres via 'pg' with promise wrappers, schema migrations,
 * and high-fidelity offline/local fallback store.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create connection pool only if a real connection string is configured
const connectionString = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim();
const pool = connectionString ? new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000
}) : null;

if (pool) {
  pool.on('error', (err) => {
    console.warn('[DB] Client connection notice:', err.message);
  });
}

// Helper to convert SQLite ? to Postgres $1, $2, etc.
const convertSql = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
};

// ─── Default Initial Events ────────────────────────────────────────────────────
const DEFAULT_EVENTS = [
  {
    id: 1,
    slug: 'online-open-mic-2026',
    name: 'Online Open Mic 2026',
    title: 'Online Open Mic',
    subtitle: 'ek lafz. ek awaaz. aur ek shaam.',
    description: 'Whether it is an unread poem, an untold personal story, raw melodies, or laughs from everyday life — our online stage is ready for your craft.',
    short_description: 'A curated digital open mic celebrating poetry, storytelling, comedy, and music.',
    event_type: 'ONLINE',
    status: 'registration_open',
    is_active: 1,
    is_published: 1,
    event_date: '7 October 2026',
    start_time: '6:00 PM',
    end_time: '8:00 PM',
    timezone: 'IST (GMT+5:30)',
    reg_open_date: '2026-10-01',
    reg_close_date: '2026-10-07',
    venue_name: 'Online (Google Meet)',
    venue_address: 'Google Meet link provided to confirmed attendees',
    city: 'Online',
    state: 'National / Global',
    maps_url: '',
    venue_image_url: '',
    is_paid: 1,
    fee: 79,
    currency: 'INR',
    pricing_tiers: JSON.stringify([{ category: 'General Performer', price: 79 }]),
    early_bird_fee: 79,
    upi_id: 'rishiprattap@fam',
    payee_name: 'Rishi Pratap',
    qr_asset_path: '/assets/payment-qr.jpeg',
    payment_instructions: 'Pay ₹79 using any UPI app (GPay, PhonePe, Paytm). Enter UTR/Transaction ID and upload screenshot proof.',
    receipt_template_url: '',
    poster_url: '/assets/oct-open-mic-poster.jpg',
    banner_url: '/assets/oct-open-mic-poster.jpg',
    logo_url: '/assets/logo.png',
    promo_video_url: '',
    reg_enabled: 1,
    reg_button_text: 'REGISTER AS PERFORMER',
    max_registrations: 500,
    confirmation_message: 'Thank you for registering for Offstage Creators Online Open Mic!',
    allowed_categories: JSON.stringify(['Poetry & Shayari', 'Heartfelt Storytelling', 'Stand-up Comedy', 'Music & Vocals']),
    contact_email: 'support@offstagecreators.in',
    contact_phone: '9876543210',
    instagram_url: 'https://www.instagram.com/offstagecreators/',
    youtube_url: '',
    whatsapp_url: '',
    meet_link: '',
    other_links: JSON.stringify({}),
    certificate_enabled: 1,
    certificate_title: 'CERTIFICATE OF PARTICIPATION',
    certificate_bg_url: '',
    registration_provider: 'internal',
    external_registration_url: '',
    external_platform_name: '',
    external_platform_notes: '',
    external_open_new_tab: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-24T00:00:00.000Z'
  },
  {
    id: 2,
    slug: 'delhi-adhure-musafir-2026',
    name: 'Adhure Musafir — Delhi Show',
    title: 'Adhure Musafir',
    subtitle: 'A Poetry, Storytelling & Humour Showcase',
    description: 'Live poetry, storytelling, and comedy showcase in New Delhi. Come join us for an evening of authentic artistry and heartfelt performances.',
    short_description: 'Live on-ground showcase at The Comedy Theatre, Hauz Khas.',
    event_type: 'OFFLINE',
    status: 'registration_open',
    is_active: 0,
    is_published: 1,
    event_date: '4 October 2026',
    start_time: '3:30 PM',
    end_time: '6:00 PM',
    timezone: 'IST (GMT+5:30)',
    reg_open_date: '2026-09-10',
    reg_close_date: '2026-10-04',
    venue_name: 'The Comedy Theatre',
    venue_address: 'Hauz Khas Village, New Delhi, Delhi 110016',
    city: 'New Delhi',
    state: 'Delhi',
    maps_url: 'https://maps.google.com/?q=The+Comedy+Theatre+Hauz+Khas',
    venue_image_url: '',
    is_paid: 1,
    fee: 199,
    currency: 'INR',
    pricing_tiers: JSON.stringify([{ category: 'Standard Ticket', price: 199 }]),
    early_bird_fee: 149,
    upi_id: 'rishiprattap@fam',
    payee_name: 'Rishi Pratap',
    qr_asset_path: '/assets/payment-qr.jpeg',
    payment_instructions: 'Pay ₹199 via UPI to reserve your seat or book via BookMyShow.',
    receipt_template_url: '',
    poster_url: '/assets/adhure-musafir-poster.png',
    banner_url: '/assets/adhure-musafir-poster.png',
    logo_url: '/assets/logo.png',
    promo_video_url: '',
    reg_enabled: 1,
    reg_button_text: 'BOOK PASS / REGISTER',
    max_registrations: 80,
    confirmation_message: 'Your seat for Adhure Musafir (New Delhi) has been recorded!',
    allowed_categories: JSON.stringify(['Poetry & Shayari', 'Storytelling', 'Stand-up Comedy', 'Audience / Pass']),
    contact_email: 'support@offstagecreators.in',
    contact_phone: '9876543210',
    instagram_url: 'https://www.instagram.com/offstagecreators/',
    youtube_url: '',
    whatsapp_url: '',
    meet_link: '',
    other_links: JSON.stringify({ bookMyShowUrl: 'https://in.bookmyshow.com/events/adhure-musafir/ET00515735' }),
    certificate_enabled: 1,
    certificate_title: 'CERTIFICATE OF ATTENDANCE',
    certificate_bg_url: '',
    registration_provider: 'external',
    external_registration_url: 'https://in.bookmyshow.com/events/adhure-musafir/ET00515735',
    external_platform_name: 'BookMyShow',
    external_platform_notes: 'BookMyShow official ticketing partner',
    external_open_new_tab: 1,
    created_at: '2026-09-10T00:00:00.000Z',
    updated_at: '2026-09-24T00:00:00.000Z'
  }
];

// ─── Local Fallback Store for Offline / Dev ────────────────────────────────────
const localStorePath = path.join(__dirname, '..', 'data', 'local_store.json');

function loadLocalStore() {
  const defaultStore = {
    events: [...DEFAULT_EVENTS],
    registrations: [
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
        achievement: null,
        position: 'Participant',
        certificate_title: 'CERTIFICATE OF PARTICIPATION',
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
        achievement: null,
        position: 'Participant',
        certificate_title: 'CERTIFICATE OF PARTICIPATION',
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
        achievement: 'Winner — First Place',
        position: 'WINNER',
        badge_text: '★ EVENT WINNER ★',
        citation: 'for securing 1st Place as the Event Winner with an exceptional and captivating performance in',
        certificate_title: 'CERTIFICATE OF EXCELLENCE',
        created_at: '2026-09-23T14:55:24.469Z',
        updated_at: '2026-09-23T14:55:24.469Z'
      }
    ],
    gallery: [],
    settings: {
      registration_status: 'CLOSED'
    },
    legacyCertificates: [
      { id: 1, hash: "be73c2bc683d4be53e8f203d2faedb34a7aa3794526efd77022eae855e63d442", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 2, hash: "8969db9beafcdab746cd4cd80a7b787e83e68faac0ddc7f2b793077e7476147b", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 3, hash: "aef922c04477c5ed6fe6bad9f37127b7075ea04ae668730dfcd3ae63aec7fe8b", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 4, hash: "b0a7bf9c51973d618fe73e86d1c9afa605751becb5e025f76b4bf26894d9d09a", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 5, hash: "338857dac57c022abc03946607a6b5e404cb98894c7b7ea340aa3ee3d08c4259", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 6, hash: "7a5f0f2fdb7214a779721aaf9fa23a118dbdd1fe6afa6f6b114bca034e8bb55e", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 7, hash: "ecfd819bbff1d0ceb7ecb9f17a7af7f554a25175c898008eb8ffcb82b766fe31", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 8, hash: "c54fc5cfa6699328f70d661ff9d67d4edd2207edaee97f1b6235b82f304e9413", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 9, hash: "16d3315151d5eb3a028e2315321244fe433224e0be2d3a3ab46f218e019e5119", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() },
      { id: 10, hash: "74e0c4bc687027924b29d5c6cbe6157de16b1cc7253fc2bead217ca53ad6293a", event_name: 'ONLINE OPEN MIC 2026 (Edition 1)', created_at: new Date().toISOString() }
    ],
    emailLogs: [],
    otpSessions: [],
    unsubscribedEmails: [],
    emailCampaigns: [],
    users: [],
    passwordResets: [],
    promoCodes: []
  };

  try {
    if (fs.existsSync(localStorePath)) {
      const parsed = JSON.parse(fs.readFileSync(localStorePath, 'utf8'));
      return {
        ...defaultStore,
        ...parsed,
        events: (parsed.events && parsed.events.length > 0 ? parsed.events : defaultStore.events).map(e => ({
          registration_provider: 'internal',
          external_registration_url: '',
          external_platform_name: '',
          external_platform_notes: '',
          external_open_new_tab: 1,
          receipt_template_url: '',
          ...e
        })),
        registrations: (parsed.registrations && parsed.registrations.length > 0 ? parsed.registrations : defaultStore.registrations).map(r => ({
          promo_code: null,
          referrer_name: null,
          original_fee: r.amount || 79,
          discount_amount: 0,
          final_fee: r.amount || 79,
          ...r
        })),
        settings: { ...defaultStore.settings, ...(parsed.settings || {}) },
        otpSessions: parsed.otpSessions || [],
        unsubscribedEmails: parsed.unsubscribedEmails || [],
        emailCampaigns: parsed.emailCampaigns || [],
        users: (parsed.users || []).map(u => ({
          is_blocked: 0,
          block_reason: null,
          blocked_at: null,
          blocked_by: null,
          unblocked_at: null,
          unblocked_by: null,
          instagram: null,
          ...u
        })),
        passwordResets: parsed.passwordResets || [],
        promoCodes: parsed.promoCodes || []
      };
    }
  } catch (err) {
    console.warn('[DB LocalStore] Notice loading local file store:', err.message);
  }
  return defaultStore;
}

let lastMtime = 0;
function syncLocalStore() {
  try {
    if (fs.existsSync(localStorePath)) {
      const stat = fs.statSync(localStorePath);
      if (stat.mtimeMs !== lastMtime) {
        lastMtime = stat.mtimeMs;
        localStore = loadLocalStore();
      }
    }
  } catch (_) {}
}

let localStore = loadLocalStore();

function saveLocalStore() {
  try {
    const dir = path.dirname(localStorePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localStorePath, JSON.stringify(localStore, null, 2), 'utf8');
    const stat = fs.statSync(localStorePath);
    lastMtime = stat.mtimeMs;
  } catch (_) {}
}

// ─── Promise Wrappers ──────────────────────────────────────────────────────────

const rawRun = async (sql, params = []) => {
  if (!pool || !connectionString) {
    return handleLocalRun(sql, params);
  }
  try {
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return { 
      lastID: result.rows.length ? result.rows[0].id : null, 
      changes: result.rowCount 
    };
  } catch (err) {
    console.warn('[DB Notice] Postgres query error, falling back to local store:', err.message);
    return handleLocalRun(sql, params);
  }
};

let schemaInitPromise = null;
function ensureSchema() {
  if (!pool || !connectionString) return Promise.resolve();
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
  if (!pool || !connectionString) {
    return handleLocalGet(sql, params);
  }
  try {
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0];
  } catch (err) {
    console.warn('[DB Notice] Postgres get error, falling back to local store:', err.message);
    return handleLocalGet(sql, params);
  }
};

const all = async (sql, params = []) => {
  await ensureSchema();
  if (!pool || !connectionString) {
    return handleLocalAll(sql, params);
  }
  try {
    const pgSql = convertSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  } catch (err) {
    console.warn('[DB Notice] Postgres all error, falling back to local store:', err.message);
    return handleLocalAll(sql, params);
  }
};

// Safe column migration helper
async function addColumnIfNotExists(table, columnDef) {
  try {
    await rawRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (err.code !== '42701') {
      // Column already exists or notice
    }
  }
}

// ─── Local Store Execution Handlers ───────────────────────────────────────────

function handleLocalRun(sql, params = []) {
  syncLocalStore();
  const sqlLower = sql.toLowerCase();

  // 1. Gallery
  if (sqlLower.includes('insert into gallery_images')) {
    const id = localStore.gallery.length > 0 ? Math.max(...localStore.gallery.map(g => g.id)) + 1 : 1;
    const newImg = {
      id,
      image_url: params[0],
      caption: params[1] || '',
      display_order: Number(params[2] !== undefined ? params[2] : 0),
      is_published: Number(params[3] !== undefined ? params[3] : 1),
      event_id: params[4] || 'online-open-mic-2026',
      created_at: params[5] || new Date().toISOString(),
      updated_at: params[6] || new Date().toISOString()
    };
    localStore.gallery.push(newImg);
    saveLocalStore();
    return { lastID: id, changes: 1 };
  }

  if (sqlLower.includes('delete from gallery_images')) {
    const targetId = parseInt(params[0], 10);
    const idx = localStore.gallery.findIndex(g => g.id === targetId);
    if (idx !== -1) {
      localStore.gallery.splice(idx, 1);
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  if (sqlLower.includes('update gallery_images')) {
    const targetId = parseInt(params[params.length - 1], 10);
    const item = localStore.gallery.find(g => g.id === targetId);
    if (item) {
      if (sqlLower.includes('caption =') && sqlLower.includes('is_published =')) {
        item.caption = params[0];
        item.is_published = Number(params[1]);
        item.display_order = Number(params[2]);
        item.updated_at = params[3] || new Date().toISOString();
      } else if (sqlLower.includes('display_order =')) {
        item.display_order = Number(params[0]);
        item.updated_at = params[1] || new Date().toISOString();
      }
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  // 2. Registrations Insert
  if (sqlLower.includes('insert into registrations')) {
    const id = localStore.registrations.length > 0 ? Math.max(...localStore.registrations.map(r => r.id)) + 1 : 1;
    const colMatch = sql.match(/insert\s+into\s+registrations\s*\(([^)]+)\)\s*values\s*\((.*)\)/is);
    let newReg = {
      id,
      checked_in: 0,
      certificate_eligible: 0,
      otp_verified: 0,
      reg_status: 'PENDING_VERIFICATION'
    };
    if (colMatch) {
      const cols = colMatch[1].split(',').map(c => c.trim().toLowerCase());
      const valExprs = colMatch[2].split(',').map(v => v.trim());
      let pIdx = 0;
      cols.forEach((col, idx) => {
        const expr = valExprs[idx] !== undefined ? valExprs[idx] : '?';
        if (expr === '?') {
          if (pIdx < params.length) {
            newReg[col] = params[pIdx++];
          }
        } else if (expr.toUpperCase() === 'NULL') {
          newReg[col] = null;
        } else {
          let lit = expr.replace(/^['"]|['"]$/g, '');
          if (lit === '1' || lit === '0') lit = Number(lit);
          else if (!isNaN(Number(lit)) && lit !== '') lit = Number(lit);
          newReg[col] = lit;
        }
      });
      if (newReg.amount !== undefined) newReg.amount = Number(newReg.amount);
      if (newReg.original_fee !== undefined) newReg.original_fee = Number(newReg.original_fee);
      if (newReg.discount_amount !== undefined) newReg.discount_amount = Number(newReg.discount_amount);
      if (newReg.final_fee !== undefined) newReg.final_fee = Number(newReg.final_fee);
      if (newReg.promo_code_id !== undefined && newReg.promo_code_id !== null) newReg.promo_code_id = Number(newReg.promo_code_id);
      if (newReg.otp_verified !== undefined) newReg.otp_verified = Number(newReg.otp_verified);
      if (newReg.user_id !== undefined && newReg.user_id !== null) newReg.user_id = Number(newReg.user_id);
      if (newReg.age !== undefined && newReg.age !== null) newReg.age = Number(newReg.age);
    } else {
      newReg = {
        id,
        registration_id: params[0],
        event_id: params[1] || 'online-open-mic-2026',
        full_name: params[2],
        phone: params[3],
        email: params[4],
        city: params[5],
        category: params[6],
        instagram: params[7],
        performance_title: params[8],
        performance_description: params[9],
        amount: Number(params[10] || 79),
        original_fee: Number(params[10] || 79),
        discount_amount: 0,
        final_fee: Number(params[10] || 79),
        otp_verified: 0,
        reg_status: 'PENDING_VERIFICATION',
        checked_in: 0,
        certificate_eligible: 0,
        created_at: params[11] || new Date().toISOString(),
        updated_at: params[12] || new Date().toISOString()
      };
    }
    localStore.registrations.push(newReg);
    saveLocalStore();
    return { lastID: id, changes: 1 };
  }

  // 3. Registrations Update
  if (sqlLower.includes('update registrations')) {
    if (sqlLower.includes('where email = ?') && sqlLower.includes('user_id = ?')) {
      const userId = Number(params[0]);
      const email = String(params[1] || '').toLowerCase().trim();
      let count = 0;
      (localStore.registrations || []).forEach(r => {
        if (r.email && r.email.toLowerCase() === email && (r.user_id === null || r.user_id === undefined)) {
          r.user_id = userId;
          r.updated_at = new Date().toISOString();
          count++;
        }
      });
      saveLocalStore();
      return { lastID: null, changes: count };
    }
    if (sqlLower.includes('where registration_id =') || sqlLower.includes('where id =')) {
      const targetParam = params[params.length - 1];
      const reg = localStore.registrations.find(r => 
        String(r.registration_id).toUpperCase() === String(targetParam).toUpperCase() || 
        r.id === targetParam
      );
      if (reg) {
        const setMatch = sql.match(/update\s+registrations\s+set\s+(.*?)\s+where/is);
        if (setMatch) {
          const assignments = setMatch[1].split(',').map(s => s.trim());
          let pIdx = 0;
          assignments.forEach(assign => {
            const parts = assign.split('=').map(s => s.trim());
            const col = parts[0].toLowerCase();
            const valExpr = parts[1];
            if (valExpr === '?') {
              const val = params[pIdx++];
              if (['amount', 'original_fee', 'discount_amount', 'final_fee', 'promo_code_id', 'checked_in', 'certificate_eligible', 'serial_number'].includes(col)) {
                reg[col] = val !== null && val !== undefined ? Number(val) : null;
              } else if (['user_id', 'age', 'otp_verified'].includes(col)) {
                reg[col] = val !== null && val !== undefined ? Number(val) : null;
              } else {
                reg[col] = val;
              }
            } else if (valExpr.toUpperCase() === 'NULL') {
              reg[col] = null;
            } else {
              let litVal = valExpr.replace(/['"]/g, '');
              if (litVal === '1' || litVal === '0') litVal = Number(litVal);
              reg[col] = litVal;
            }
          });
        }
        if (sqlLower.includes('approved_at')) {
          reg.reg_status = 'APPROVED';
          reg.payment_status = 'PAID';
          reg.payment_verified_at = new Date().toISOString();
          reg.payment_verified_by = params[1] || 'admin';
          if (sqlLower.includes("reg_status = 'approved'")) {
            reg.approved_at = params[0];
            reg.approved_by = params[1] || 'admin';
            reg.updated_at = params[2] || params[0];
          } else {
            reg.reg_status = params[0] || 'APPROVED';
            reg.payment_status = params[1] || 'PAID';
            reg.approved_at = params[2];
            reg.approved_by = params[3] || 'admin';
            reg.updated_at = params[4] || params[2];
          }
        } else if (sqlLower.includes('rejected_at = ?')) {
          reg.reg_status = 'REJECTED';
          reg.rejected_at = params[0];
          reg.rejected_reason = params[1];
          reg.updated_at = params[2];
        } else if (sqlLower.includes('checked_in')) {
          reg.checked_in = 1;
          reg.checkin_at = params[0] || new Date().toISOString();
          reg.updated_at = params[1] || reg.checkin_at;
        } else if (sqlLower.includes('certificate_eligible = ?')) {
          reg.certificate_eligible = Number(params[0]);
          reg.updated_at = params[1];
        } else if (sqlLower.includes('achievement =') || sqlLower.includes('position =')) {
          // Achievement assignment
          reg.position = params[0];
          reg.achievement = params[1];
          reg.badge_text = params[2];
          reg.citation = params[3];
          reg.certificate_title = params[4];
          reg.certificate_eligible = 1;
          reg.updated_at = new Date().toISOString();
        } else if (sqlLower.includes('transaction_id = ?')) {
          reg.transaction_id = params[0];
          reg.payment_screenshot_url = params[1];
          reg.payment_submitted_at = params[2];
          reg.payment_status = 'SUBMITTED';
          reg.updated_at = params[2];
        } else if (sqlLower.includes('payment_status = ?')) {
          reg.payment_status = params[0];
          reg.updated_at = new Date().toISOString();
        } else if (sqlLower.includes('otp_verified = 1')) {
          reg.otp_verified = 1;
          reg.otp_verified_at = params[0];
          reg.reg_status = 'VERIFIED';
          reg.updated_at = params[0];
        } else if (sqlLower.includes('registration_email_sent_at = ?')) {
          reg.registration_email_sent_at = params[0];
          reg.updated_at = params[0];
        } else if (sqlLower.includes('approval_email_sent_at = ?')) {
          reg.approval_email_sent_at = params[0];
          reg.updated_at = params[0];
        } else if (sqlLower.includes('rejection_email_sent_at = ?')) {
          reg.rejection_email_sent_at = params[0];
          reg.updated_at = params[0];
        } else if (sqlLower.includes('last_email_error = ?')) {
          reg.last_email_error = params[0];
          reg.updated_at = new Date().toISOString();
        }
        saveLocalStore();
      }
      return { lastID: null, changes: 1 };
    }
  }

  // 4. App settings
  if (sqlLower.includes('insert into app_settings') || sqlLower.includes('app_settings')) {
    const key = params[0];
    const val = String(params[1]);
    localStore.settings[key] = val;
    saveLocalStore();
    return { lastID: null, changes: 1 };
  }

  // 5. Events Insert/Update/Delete
  if (sqlLower.includes('insert into events')) {
    const id = localStore.events.length > 0 ? Math.max(...localStore.events.map(e => e.id)) + 1 : 1;
    // Build event object from params
    const slug = params[0];
    const existingIdx = localStore.events.findIndex(e => e.slug === slug);
    const eventObj = {
      id: existingIdx !== -1 ? localStore.events[existingIdx].id : id,
      slug: params[0],
      name: params[1],
      title: params[2],
      subtitle: params[3],
      description: params[4],
      short_description: params[5],
      event_type: params[6] || 'ONLINE',
      status: params[7] || 'draft',
      is_active: Number(params[8] !== undefined ? params[8] : 0),
      is_published: Number(params[9] !== undefined ? params[9] : 1),
      event_date: params[10],
      start_time: params[11],
      end_time: params[12],
      timezone: params[13] || 'IST (GMT+5:30)',
      reg_open_date: params[14],
      reg_close_date: params[15],
      venue_name: params[16],
      venue_address: params[17],
      city: params[18],
      state: params[19],
      maps_url: params[20],
      venue_image_url: params[21],
      is_paid: Number(params[22] !== undefined ? params[22] : 1),
      fee: Number(params[23] || 79),
      currency: params[24] || 'INR',
      pricing_tiers: params[25] || '[]',
      early_bird_fee: params[26] ? Number(params[26]) : null,
      upi_id: params[27],
      payee_name: params[28],
      qr_asset_path: params[29],
      payment_instructions: params[30],
      poster_url: params[31],
      banner_url: params[32],
      logo_url: params[33],
      promo_video_url: params[34],
      reg_enabled: Number(params[35] !== undefined ? params[35] : 1),
      reg_button_text: params[36] || 'REGISTER AS PERFORMER',
      max_registrations: Number(params[37] || 0),
      confirmation_message: params[38],
      allowed_categories: params[39] || '[]',
      contact_email: params[40],
      contact_phone: params[41],
      instagram_url: params[42],
      youtube_url: params[43],
      whatsapp_url: params[44],
      meet_link: params[45],
      other_links: params[46] || '{}',
      certificate_enabled: Number(params[47] !== undefined ? params[47] : 1),
      certificate_title: params[48] || 'CERTIFICATE OF PARTICIPATION',
      certificate_bg_url: params[49],
      registration_provider: params[50] || 'internal',
      external_registration_url: params[51] || '',
      external_platform_name: params[52] || '',
      external_platform_notes: params[53] || '',
      external_open_new_tab: Number(params[54] !== undefined ? params[54] : 1),
      receipt_template_url: sqlLower.includes('receipt_template_url') ? (params[55] || '') : '',
      created_at: sqlLower.includes('receipt_template_url') ? (params[56] || new Date().toISOString()) : (params[55] || new Date().toISOString()),
      updated_at: sqlLower.includes('receipt_template_url') ? (params[57] || new Date().toISOString()) : (params[56] || new Date().toISOString())
    };

    if (existingIdx !== -1) {
      localStore.events[existingIdx] = eventObj;
    } else {
      localStore.events.push(eventObj);
    }
    saveLocalStore();
    return { lastID: eventObj.id, changes: 1 };
  }

  if (sqlLower.includes('update events set is_active = 0')) {
    localStore.events.forEach(e => { e.is_active = 0; });
    saveLocalStore();
    return { lastID: null, changes: localStore.events.length };
  }

  if (sqlLower.includes('update events set is_active = 1')) {
    const target = String(params[params.length - 1] || '');
    localStore.events.forEach(e => {
      if (String(e.id) === target || e.slug.toLowerCase() === target.toLowerCase()) {
        e.is_active = 1;
      }
    });
    saveLocalStore();
    return { lastID: null, changes: 1 };
  }

  if (sqlLower.includes('update events set status = ?')) {
    const newStatus = params[0];
    const target = String(params[params.length - 1] || '');
    const evt = localStore.events.find(e => String(e.id) === target || e.slug.toLowerCase() === target.toLowerCase());
    if (evt) {
      evt.status = newStatus;
      evt.updated_at = new Date().toISOString();
      saveLocalStore();
    }
    return { lastID: null, changes: evt ? 1 : 0 };
  }

  if (sqlLower.includes('update events set') && sqlLower.includes("slug = 'online-open-mic-2026'")) {
    const evt = localStore.events.find(e => e.slug === 'online-open-mic-2026');
    if (evt) {
      if (sqlLower.includes("status = 'registration_open'")) evt.status = 'registration_open';
      if (sqlLower.includes("reg_enabled = 1")) evt.reg_enabled = 1;
      if (sqlLower.includes("registration_provider = 'internal'")) evt.registration_provider = 'internal';
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  if (sqlLower.includes('update events set') && params.length >= 50 && (sqlLower.includes('where id = ?') || sqlLower.includes('where slug = ?'))) {
    const target = String(params[params.length - 1] || '');
    const evt = localStore.events.find(e => String(e.id) === target || e.slug.toLowerCase() === target.toLowerCase());
    if (evt) {
      evt.name = params[0];
      evt.title = params[1];
      evt.subtitle = params[2];
      evt.description = params[3];
      evt.short_description = params[4];
      evt.event_type = params[5];
      evt.status = params[6];
      evt.is_active = Number(params[7]);
      evt.is_published = Number(params[8]);
      evt.event_date = params[9];
      evt.start_time = params[10];
      evt.end_time = params[11];
      evt.timezone = params[12];
      evt.reg_open_date = params[13];
      evt.reg_close_date = params[14];
      evt.venue_name = params[15];
      evt.venue_address = params[16];
      evt.city = params[17];
      evt.state = params[18];
      evt.maps_url = params[19];
      evt.venue_image_url = params[20];
      evt.is_paid = Number(params[21]);
      evt.fee = Number(params[22]);
      evt.currency = params[23];
      evt.pricing_tiers = params[24];
      evt.early_bird_fee = params[25];
      evt.upi_id = params[26];
      evt.payee_name = params[27];
      evt.qr_asset_path = params[28];
      evt.payment_instructions = params[29];
      evt.poster_url = params[30];
      evt.banner_url = params[31];
      evt.logo_url = params[32];
      evt.promo_video_url = params[33];
      evt.reg_enabled = Number(params[34]);
      evt.reg_button_text = params[35];
      evt.max_registrations = Number(params[36]);
      evt.confirmation_message = params[37];
      evt.allowed_categories = params[38];
      evt.contact_email = params[39];
      evt.contact_phone = params[40];
      evt.instagram_url = params[41];
      evt.youtube_url = params[42];
      evt.whatsapp_url = params[43];
      evt.meet_link = params[44];
      evt.other_links = params[45];
      evt.certificate_enabled = Number(params[46]);
      evt.certificate_title = params[47];
      evt.certificate_bg_url = params[48];
      evt.registration_provider = params[49] || 'internal';
      evt.external_registration_url = params[50] || '';
      evt.external_platform_name = params[51] || '';
      evt.external_platform_notes = params[52] || '';
      evt.external_open_new_tab = Number(params[53] !== undefined ? params[53] : 1);
      if (sqlLower.includes('receipt_template_url = ?')) {
        evt.receipt_template_url = params[54] || '';
        evt.updated_at = params[55] || new Date().toISOString();
      } else {
        evt.updated_at = params[54] || new Date().toISOString();
      }
      saveLocalStore();
    }
    return { lastID: null, changes: evt ? 1 : 0 };
  }

  if (sqlLower.includes('delete from events')) {
    const target = params[0];
    const idx = localStore.events.findIndex(e => e.id === target || String(e.id) === String(target) || e.slug === target);
    if (idx !== -1) {
      localStore.events.splice(idx, 1);
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  // 6. Email Audit Log
  if (sqlLower.includes('insert into email_logs')) {
    localStore.emailLogs.push({
      id: localStore.emailLogs.length + 1,
      registration_id: params[0] || null,
      recipient: params[1],
      email_type: params[2],
      subject: params[3],
      status: params[4],
      provider_message_id: params[5] || null,
      error_message: params[6] || null,
      created_at: new Date().toISOString()
    });
    saveLocalStore();
    return { lastID: localStore.emailLogs.length, changes: 1 };
  }

  // 7. OTP Sessions
  if (sqlLower.includes('delete from otp_sessions')) {
    if (sqlLower.includes('where email = ?')) {
      const email = String(params[0] || '').toLowerCase();
      localStore.otpSessions = (localStore.otpSessions || []).filter(s => s.email !== email);
      saveLocalStore();
    } else if (sqlLower.includes('where id = ?')) {
      const id = params[0];
      localStore.otpSessions = (localStore.otpSessions || []).filter(s => s.id !== id);
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  if (sqlLower.includes('insert into otp_sessions')) {
    const list = localStore.otpSessions || [];
    const id = list.length > 0 ? Math.max(...list.map(s => s.id || 0)) + 1 : 1;
    const session = {
      id,
      email: String(params[0] || '').toLowerCase(),
      registration_id: params[1],
      otp_hash: params[2],
      otp_salt: params[3],
      expires_at: params[4],
      attempts: 0,
      last_sent_at: params[5],
      verified: 0,
      created_at: params[6] || new Date().toISOString()
    };
    list.push(session);
    localStore.otpSessions = list;
    saveLocalStore();
    return { lastID: id, changes: 1 };
  }

  if (sqlLower.includes('update otp_sessions')) {
    const list = localStore.otpSessions || [];
    const id = params[params.length - 1];
    const s = list.find(sess => sess.id === id);
    if (s) {
      if (sqlLower.includes('attempts = attempts + 1')) {
        s.attempts = (s.attempts || 0) + 1;
      } else if (sqlLower.includes('attempts = ?')) {
        s.attempts = Number(params[0] || 0);
      }
      if (sqlLower.includes('verified = 1')) {
        s.verified = 1;
      }
      if (sqlLower.includes('verification_token =')) {
        s.verification_token = params[0];
        s.token_expires_at = params[1];
      }
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  // 8. Unsubscribed Emails
  if (sqlLower.includes('insert into unsubscribed_emails')) {
    const list = localStore.unsubscribedEmails || [];
    const id = list.length > 0 ? Math.max(...list.map(u => u.id || 0)) + 1 : 1;
    const email = String(params[0] || '').toLowerCase().trim();
    if (!list.some(u => u.email === email)) {
      list.push({ id, email, reason: params[1] || '', created_at: params[2] || new Date().toISOString() });
      localStore.unsubscribedEmails = list;
      saveLocalStore();
    }
    return { lastID: id, changes: 1 };
  }

  if (sqlLower.includes('delete from unsubscribed_emails')) {
    const email = String(params[0] || '').toLowerCase().trim();
    localStore.unsubscribedEmails = (localStore.unsubscribedEmails || []).filter(u => u.email !== email);
    saveLocalStore();
    return { lastID: null, changes: 1 };
  }

  // 9. Email Campaigns
  if (sqlLower.includes('insert into email_campaigns')) {
    const list = localStore.emailCampaigns || [];
    const id = list.length > 0 ? Math.max(...list.map(c => c.id || 0)) + 1 : 1;
    list.push({
      id,
      event_id: params[0],
      campaign_type: params[1],
      subject: params[2],
      recipient_count: Number(params[3] || 0),
      sent_count: Number(params[4] || 0),
      failed_count: Number(params[5] || 0),
      status: params[6] || 'COMPLETED',
      created_at: params[7] || new Date().toISOString()
    });
    localStore.emailCampaigns = list;
    saveLocalStore();
    return { lastID: id, changes: 1 };
  }

  // 10. Gallery Images (LocalStore fallback)
  if (sqlLower.includes('insert into gallery_images')) {
    const list = localStore.gallery || [];
    const id = list.length > 0 ? Math.max(...list.map(g => g.id || 0)) + 1 : 1;
    const imgObj = {
      id,
      image_url: params[0],
      caption: params[1] || '',
      display_order: Number(params[2] || 0),
      is_published: Number(params[3] !== undefined ? params[3] : 1),
      event_id: params[4] || 'online-open-mic-2026',
      created_at: params[5] || new Date().toISOString(),
      updated_at: params[6] || new Date().toISOString()
    };
    list.push(imgObj);
    localStore.gallery = list;
    saveLocalStore();
    return { lastID: id, changes: 1 };
  }

  if (sqlLower.includes('delete from gallery_images')) {
    const id = params[0];
    const eventId = params[1];
    localStore.gallery = (localStore.gallery || []).filter(g => {
      if (eventId) {
        return !((g.id === Number(id) || String(g.id) === String(id)) && g.event_id === eventId);
      }
      return !(g.id === Number(id) || String(g.id) === String(id));
    });
    saveLocalStore();
    return { lastID: null, changes: 1 };
  }

  // 11. Users Insert
  if (sqlLower.includes('insert into users')) {
    const list = localStore.users || [];
    const id = list.length > 0 ? Math.max(...list.map(u => u.id || 0)) + 1 : 1;
    const now = new Date().toISOString();
    const colMatch = sql.match(/insert\s+into\s+users\s*\(([^)]+)\)\s*values\s*\((.*)\)/is);
    let newUser = {
      id,
      is_verified: 0,
      created_at: now,
      updated_at: now
    };
    if (colMatch) {
      const cols = colMatch[1].split(',').map(c => c.trim().toLowerCase());
      const valExprs = colMatch[2].split(',').map(v => v.trim());
      let pIdx = 0;
      cols.forEach((col, idx) => {
        const expr = valExprs[idx] !== undefined ? valExprs[idx] : '?';
        if (expr === '?') {
          if (pIdx < params.length) {
            newUser[col] = params[pIdx++];
          }
        } else if (expr.toUpperCase() === 'NULL') {
          newUser[col] = null;
        } else {
          let lit = expr.replace(/^['"]|['"]$/g, '');
          if (lit === '1' || lit === '0') lit = Number(lit);
          else if (!isNaN(Number(lit)) && lit !== '') lit = Number(lit);
          newUser[col] = lit;
        }
      });
      if (newUser.age !== undefined) newUser.age = Number(newUser.age);
      if (newUser.is_verified !== undefined) newUser.is_verified = Number(newUser.is_verified);
      if (newUser.email) newUser.email = String(newUser.email).toLowerCase().trim();
    } else {
      newUser = {
        id,
        name: params[0],
        email: String(params[1] || '').toLowerCase().trim(),
        phone: params[2],
        age: Number(params[3]),
        city: params[4],
        password_hash: params[5],
        is_verified: Number(params[6] !== undefined ? params[6] : 0),
        verification_token: params[7] || null,
        verification_token_expires_at: params[8] || null,
        created_at: params[9] || now,
        updated_at: params[10] || now
      };
    }
    list.push(newUser);
    localStore.users = list;
    saveLocalStore();
    return { lastID: id, changes: 1 };
  }

  // 12. Users Update
  if (sqlLower.includes('update users')) {
    const list = localStore.users || [];
    let targetUser = null;
    if (sqlLower.includes('where email = ?')) {
      const email = String(params[params.length - 1] || '').toLowerCase().trim();
      targetUser = list.find(user => user.email.toLowerCase() === email);
    } else if (sqlLower.includes('where id = ?')) {
      const id = Number(params[params.length - 1]);
      targetUser = list.find(user => user.id === id);
    }

    if (targetUser) {
      const setMatch = sql.match(/update\s+users\s+set\s+(.*?)\s+where/is);
      if (setMatch) {
        const assignments = setMatch[1].split(',').map(s => s.trim());
        let pIdx = 0;
        assignments.forEach(assign => {
          const parts = assign.split('=').map(s => s.trim());
          const col = parts[0].toLowerCase();
          const valExpr = parts[1];
          if (valExpr === '?') {
            const v = params[pIdx++];
            if (col === 'age') targetUser.age = v !== null && v !== undefined ? Number(v) : null;
            else if (col === 'is_verified') targetUser.is_verified = Number(v);
            else if (col === 'is_blocked') targetUser.is_blocked = Number(v);
            else targetUser[col] = v;
          } else if (valExpr.toUpperCase() === 'NULL') {
            targetUser[col] = null;
          } else {
            let lit = valExpr.replace(/['"]/g, '');
            if (lit === '1' || lit === '0') lit = Number(lit);
            targetUser[col] = lit;
          }
        });
        saveLocalStore();
      }
      return { lastID: null, changes: 1 };
    }
    return { lastID: null, changes: 0 };
  }

  // 13. Password Resets Insert
  if (sqlLower.includes('insert into password_resets')) {
    const list = localStore.passwordResets || [];
    const id = list.length > 0 ? Math.max(...list.map(r => r.id || 0)) + 1 : 1;
    list.push({
      id,
      user_id: Number(params[0]),
      email: String(params[1] || '').toLowerCase().trim(),
      token_hash: params[2],
      token_salt: params[3],
      expires_at: params[4],
      used: 0,
      created_at: params[5] || new Date().toISOString()
    });
    localStore.passwordResets = list;
    saveLocalStore();
    return { lastID: id, changes: 1 };
  }

  // 14. Password Resets Update
  if (sqlLower.includes('update password_resets')) {
    const list = localStore.passwordResets || [];
    if (sqlLower.includes('where id = ?')) {
      const id = Number(params[params.length - 1]);
      const reset = list.find(r => r.id === id);
      if (reset) {
        if (sqlLower.includes('token_hash = ?')) {
          reset.token_hash = params[0];
          reset.token_salt = params[1];
        }
        if (sqlLower.includes('used = 1') || sqlLower.includes('used = ?')) {
          reset.used = 1;
        }
        saveLocalStore();
      }
      return { lastID: null, changes: 1 };
    }
    if (sqlLower.includes('where email = ?')) {
      const email = String(params[params.length - 1] || '').toLowerCase().trim();
      list.filter(r => r.email.toLowerCase() === email).forEach(r => { r.used = 1; });
      saveLocalStore();
      return { lastID: null, changes: 1 };
    }
    return { lastID: null, changes: 1 };
  }

  // 15. Users Delete
  if (sqlLower.includes('delete from users')) {
    if (sqlLower.includes('where email = ?')) {
      const email = String(params[0] || '').toLowerCase().trim();
      localStore.users = (localStore.users || []).filter(u => u.email.toLowerCase() !== email);
      saveLocalStore();
    } else if (sqlLower.includes('where id = ?')) {
      const id = Number(params[0]);
      localStore.users = (localStore.users || []).filter(u => u.id !== id);
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  // 16. Password Resets Delete
  if (sqlLower.includes('delete from password_resets')) {
    if (sqlLower.includes('where email = ?')) {
      const email = String(params[0] || '').toLowerCase().trim();
      localStore.passwordResets = (localStore.passwordResets || []).filter(r => r.email.toLowerCase() !== email);
      saveLocalStore();
    } else if (sqlLower.includes('where user_id = ?')) {
      const userId = Number(params[0]);
      localStore.passwordResets = (localStore.passwordResets || []).filter(r => r.user_id !== userId);
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  // 17. Registrations Delete
  if (sqlLower.includes('delete from registrations')) {
    if (sqlLower.includes('where registration_id = ?')) {
      const regId = String(params[0] || '').trim();
      localStore.registrations = (localStore.registrations || []).filter(r => r.registration_id !== regId);
      saveLocalStore();
    } else if (sqlLower.includes('where email = ?')) {
      const email = String(params[0] || '').toLowerCase().trim();
      localStore.registrations = (localStore.registrations || []).filter(r => (r.email || '').toLowerCase() !== email);
      saveLocalStore();
    }
    return { lastID: null, changes: 1 };
  }

  // 18. Promo Codes Insert
  if (sqlLower.includes('insert into promo_codes')) {
    const list = localStore.promoCodes || [];
    const id = list.length > 0 ? Math.max(...list.map(p => p.id || 0)) + 1 : 1;
    const now = new Date().toISOString();
    const colMatch = sql.match(/insert\s+into\s+promo_codes\s*\(([^)]+)\)\s*values\s*\((.*)\)/is);
    let newPromo = {
      id,
      discount_type: 'percentage',
      discount_value: 0,
      eligible_events: 'ALL',
      max_uses: 0,
      max_uses_per_user: 1,
      times_used: 0,
      is_active: 1,
      created_at: now,
      updated_at: now
    };
    if (colMatch) {
      const cols = colMatch[1].split(',').map(c => c.trim().toLowerCase());
      const valExprs = colMatch[2].split(',').map(v => v.trim());
      let pIdx = 0;
      cols.forEach((col, idx) => {
        const expr = valExprs[idx] !== undefined ? valExprs[idx] : '?';
        if (expr === '?') {
          if (pIdx < params.length) {
            newPromo[col] = params[pIdx++];
          }
        } else if (expr.toUpperCase() === 'NULL') {
          newPromo[col] = null;
        } else {
          let lit = expr.replace(/^['"]|['"]$/g, '');
          if (lit === '1' || lit === '0') lit = Number(lit);
          else if (!isNaN(Number(lit)) && lit !== '') lit = Number(lit);
          newPromo[col] = lit;
        }
      });
    } else {
      newPromo = {
        id,
        code: String(params[0] || '').toUpperCase().trim(),
        assigned_to: params[1],
        discount_type: params[2] || 'percentage',
        discount_value: Number(params[3] || 0),
        eligible_events: params[4] || 'ALL',
        starts_at: params[5] || null,
        expires_at: params[6] || null,
        max_uses: Number(params[7] || 0),
        max_uses_per_user: Number(params[8] !== undefined ? params[8] : 1),
        times_used: Number(params[9] || 0),
        is_active: Number(params[10] !== undefined ? params[10] : 1),
        created_at: params[11] || now,
        updated_at: params[12] || now
      };
    }
    if (newPromo.code) newPromo.code = String(newPromo.code).toUpperCase().trim();
    if (newPromo.discount_value !== undefined) newPromo.discount_value = Number(newPromo.discount_value);
    if (newPromo.total_usage_limit !== undefined && newPromo.total_usage_limit !== null) {
      newPromo.total_usage_limit = Number(newPromo.total_usage_limit);
      newPromo.max_uses = newPromo.total_usage_limit;
    } else if (newPromo.max_uses !== undefined && newPromo.max_uses !== null) {
      newPromo.max_uses = Number(newPromo.max_uses);
      newPromo.total_usage_limit = newPromo.max_uses;
    }
    if (newPromo.per_user_limit !== undefined && newPromo.per_user_limit !== null) {
      newPromo.per_user_limit = Number(newPromo.per_user_limit);
      newPromo.max_uses_per_user = newPromo.per_user_limit;
    } else if (newPromo.max_uses_per_user !== undefined && newPromo.max_uses_per_user !== null) {
      newPromo.max_uses_per_user = Number(newPromo.max_uses_per_user);
      newPromo.per_user_limit = newPromo.max_uses_per_user;
    }
    if (newPromo.assigned_person && !newPromo.assigned_to) newPromo.assigned_to = newPromo.assigned_person;
    if (newPromo.assigned_to && !newPromo.assigned_person) newPromo.assigned_person = newPromo.assigned_to;
    if (newPromo.times_used !== undefined) newPromo.times_used = Number(newPromo.times_used);
    if (newPromo.is_active !== undefined) newPromo.is_active = Number(newPromo.is_active);
    list.push(newPromo);
    localStore.promoCodes = list;
    saveLocalStore();
    return { lastID: id, changes: 1 };
  }

  // 19. Promo Codes Update
  if (sqlLower.includes('update promo_codes')) {
    const list = localStore.promoCodes || [];
    let target = null;
    if (sqlLower.includes('where id = ?')) {
      const id = Number(params[params.length - 1]);
      target = list.find(p => p.id === id);
    } else if (sqlLower.includes('where upper(code) = upper(?)') || sqlLower.includes('where code = ?')) {
      const code = String(params[params.length - 1] || '').toUpperCase().trim();
      target = list.find(p => p.code.toUpperCase() === code);
    }
    if (target) {
      const setMatch = sql.match(/update\s+promo_codes\s+set\s+(.*?)\s+where/is);
      if (setMatch) {
        const assignments = setMatch[1].split(',').map(s => s.trim());
        let pIdx = 0;
        assignments.forEach(assign => {
          const parts = assign.split('=').map(s => s.trim());
          const col = parts[0].toLowerCase();
          const valExpr = parts[1];
          if (valExpr === '?') {
            const v = params[pIdx++];
            if (['discount_value', 'max_uses', 'total_usage_limit', 'max_uses_per_user', 'per_user_limit', 'times_used', 'is_active'].includes(col)) {
              target[col] = v !== null && v !== undefined ? Number(v) : 0;
              if (col === 'total_usage_limit') target.max_uses = target[col];
              if (col === 'max_uses') target.total_usage_limit = target[col];
              if (col === 'per_user_limit') target.max_uses_per_user = target[col];
              if (col === 'max_uses_per_user') target.per_user_limit = target[col];
            } else if (col === 'code') {
              target[col] = String(v || '').toUpperCase().trim();
            } else if (col === 'assigned_person' || col === 'assigned_to') {
              target.assigned_person = v;
              target.assigned_to = v;
            } else {
              target[col] = v;
            }
          } else if (valExpr.toUpperCase() === 'NULL') {
            target[col] = null;
            if (col === 'total_usage_limit') target.max_uses = null;
            if (col === 'assigned_person') target.assigned_to = null;
          } else {
            let lit = valExpr.replace(/['"]/g, '');
            if (lit === '1' || lit === '0') lit = Number(lit);
            target[col] = lit;
          }
        });
        saveLocalStore();
      }
      return { lastID: null, changes: 1 };
    }
    return { lastID: null, changes: 0 };
  }

  // 20. Promo Codes Delete
  if (sqlLower.includes('delete from promo_codes')) {
    const list = localStore.promoCodes || [];
    const id = Number(params[0]);
    localStore.promoCodes = list.filter(p => p.id !== id);
    saveLocalStore();
    return { lastID: null, changes: 1 };
  }

  return { lastID: 1, changes: 1 };
}

function handleLocalGet(sql, params = []) {
  syncLocalStore();
  const sqlLower = sql.toLowerCase();

  // Users
  if (sqlLower.includes('from users')) {
    const list = localStore.users || [];
    if (sqlLower.includes('email = ?') || sqlLower.includes('email) = lower(?)') || sqlLower.includes('email) = ?')) {
      const email = String(params[0] || '').toLowerCase().trim();
      return list.find(u => u.email && u.email.toLowerCase() === email) || null;
    }
    if (sqlLower.includes('id = ?')) {
      const id = Number(params[0]);
      return list.find(u => u.id === id) || null;
    }
    if (sqlLower.includes('where')) {
      return null;
    }
    return list[0] || null;
  }

  // Password Resets
  if (sqlLower.includes('from password_resets')) {
    const list = localStore.passwordResets || [];
    if (sqlLower.includes('email = ?')) {
      const email = String(params[0] || '').toLowerCase().trim();
      const filtered = list.filter(r => r.email.toLowerCase() === email && !r.used);
      return filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    }
    return list[0] || null;
  }

  // OTP Sessions
  if (sqlLower.includes('from otp_sessions')) {
    if (sqlLower.includes('verification_token =')) {
      const token = params[0];
      return (localStore.otpSessions || []).find(s => s.verification_token === token) || null;
    }
    const email = String(params[0] || '').toLowerCase();
    const list = (localStore.otpSessions || []).filter(s => s.email === email);
    if (sqlLower.includes('verified = 0')) {
      return list.filter(s => !s.verified).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    }
    return list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  }

  // Unsubscribed Emails
  if (sqlLower.includes('from unsubscribed_emails')) {
    const email = String(params[0] || '').toLowerCase().trim();
    return (localStore.unsubscribedEmails || []).find(u => u.email === email) || null;
  }

  // Settings
  if (sqlLower.includes('from app_settings where key = ?')) {
    const key = params[0];
    const val = localStore.settings[key];
    return val !== undefined ? { value: String(val) } : undefined;
  }

  // Promo codes
  if (sqlLower.includes('from promo_codes')) {
    const list = localStore.promoCodes || [];
    if (sqlLower.includes('upper(code) = upper(?)') || sqlLower.includes('code = ?') || sqlLower.includes('lower(code) = lower(?)')) {
      const code = String(params[0] || '').toUpperCase().trim();
      return list.find(p => p.code.toUpperCase() === code) || null;
    }
    if (sqlLower.includes('id = ?')) {
      const id = Number(params[0]);
      return list.find(p => p.id === id) || null;
    }
    return list[0] || null;
  }

  // Events count
  if (sqlLower.includes('count(*)') && sqlLower.includes('from events')) {
    return { count: localStore.events.length, c: localStore.events.length };
  }

  // Active event
  if (sqlLower.includes('from events') && sqlLower.includes('is_active = 1')) {
    const found = localStore.events.find(e => e.is_active === 1);
    return found || localStore.events[0];
  }

  // Event by slug or ID
  if (sqlLower.includes('from events') && (sqlLower.includes('slug') || sqlLower.includes('id'))) {
    let querySlug = String(params[0] || '').trim().toLowerCase();
    if (!querySlug) {
      const match = sql.match(/slug\s*=\s*'([^']+)'/i) || sql.match(/id\s*=\s*(\d+)/i);
      if (match) querySlug = match[1].toLowerCase();
    }
    const found = localStore.events.find(e => 
      e.slug.toLowerCase() === querySlug || 
      String(e.id) === querySlug
    );
    return found || null;
  }

  // Registrations Count or Sum (Aggregation)
  if ((sqlLower.includes('count(*)') || sqlLower.includes('sum(') || sqlLower.includes('count(')) && sqlLower.includes('from registrations')) {
    let list = [...localStore.registrations];
    if (sqlLower.includes('promo_code')) {
      const codeParam = String(params[0] || '').toUpperCase().trim();
      list = list.filter(r => r.promo_code && String(r.promo_code).toUpperCase() === codeParam);
      if (sqlLower.includes("reg_status not in ('rejected', 'revoked', 'cancelled')")) {
        list = list.filter(r => !['REJECTED', 'REVOKED', 'CANCELLED'].includes(r.reg_status));
      }
      return { count: list.length, c: list.length };
    }
    let pIdx = 0;
    if (sqlLower.includes('event_id = ?') && pIdx < params.length) {
      const eventId = params[pIdx++];
      if (eventId && eventId !== 'ALL') {
        list = list.filter(r => (r.event_id || 'online-open-mic-2026') === eventId);
      }
    }
    if (sqlLower.includes('reg_status = ?') && pIdx < params.length) {
      const statusParam = params[pIdx++];
      if (statusParam && statusParam !== 'ALL') {
        list = list.filter(r => (r.reg_status || 'PENDING_VERIFICATION') === statusParam);
      }
    } else if (sqlLower.includes("reg_status = 'pending_verification'")) {
      list = list.filter(r => (r.reg_status || 'PENDING_VERIFICATION') === 'PENDING_VERIFICATION');
    } else if (sqlLower.includes("reg_status = 'verified'")) {
      list = list.filter(r => r.reg_status === 'VERIFIED');
    } else if (sqlLower.includes("reg_status = 'approved'")) {
      list = list.filter(r => r.reg_status === 'APPROVED');
    } else if (sqlLower.includes("reg_status = 'rejected'")) {
      list = list.filter(r => r.reg_status === 'REJECTED');
    } else if (sqlLower.includes("reg_status in ('revoked', 'cancelled')")) {
      list = list.filter(r => ['REVOKED', 'CANCELLED'].includes(r.reg_status));
    } else if (sqlLower.includes("reg_status in ('pending_verification', 'verified')")) {
      list = list.filter(r => ['PENDING_VERIFICATION', 'VERIFIED'].includes(r.reg_status || 'PENDING_VERIFICATION'));
    }

    if (sqlLower.includes('category = ?') && pIdx < params.length) {
      const catParam = params[pIdx++];
      if (catParam && catParam !== 'ALL') {
        list = list.filter(r => r.category === catParam);
      }
    }
    if (sqlLower.includes('checked_in = ?') && pIdx < params.length) {
      const cinParam = Number(params[pIdx++]);
      list = list.filter(r => Number(r.checked_in || 0) === cinParam);
    } else if (sqlLower.includes('checked_in = 1')) {
      list = list.filter(r => Number(r.checked_in || 0) === 1);
    }

    if (sqlLower.includes('certificate_eligible = 1')) {
      list = list.filter(r => Number(r.certificate_eligible || 0) === 1);
    }

    if (sqlLower.includes('sum(') || sqlLower.includes('coalesce(sum(')) {
      let sum = 0;
      for (const r of list) {
        const isPaid = String(r.payment_status || '').toUpperCase() === 'PAID' || String(r.reg_status || '').toUpperCase() === 'APPROVED';
        if (isPaid) {
          const fee = Number(r.final_fee !== null && r.final_fee !== undefined ? r.final_fee : (r.amount ?? 0));
          sum += fee;
        }
      }
      return { rev: sum, revenue: sum, total_revenue: sum, totalRevenue: sum, c: sum };
    }

    return { count: list.length, c: list.length, total: list.length };
  }

  // Registration by registration_id
  if (sqlLower.includes('from registrations')) {
    if (sqlLower.includes('transaction_id = ?') && sqlLower.includes('registration_id !=')) {
      const cleanUtr = String(params[0] || '').trim().toUpperCase();
      const cleanRegId = String(params[1] || '').trim().toUpperCase();
      return localStore.registrations.find(r => 
        r.transaction_id && 
        String(r.transaction_id).trim().toUpperCase() === cleanUtr && 
        String(r.registration_id).trim().toUpperCase() !== cleanRegId
      ) || null;
    }
    if (sqlLower.includes('registration_id = ?') || sqlLower.includes('registration_id =')) {
      const targetId = String(params[0] || '').trim().toUpperCase();
      return localStore.registrations.find(r => String(r.registration_id).toUpperCase() === targetId) || null;
    }
    if (sqlLower.includes('email = ?') || sqlLower.includes('user_id = ?')) {
      let targetEmail = null;
      let targetUserId = null;
      let targetEventId = null;

      for (const p of params) {
        if (typeof p === 'string' && p.includes('@')) {
          targetEmail = p.toLowerCase().trim();
        } else if (typeof p === 'number' || (typeof p === 'string' && /^\d+$/.test(p) && !p.includes('-'))) {
          targetUserId = Number(p);
        } else if (typeof p === 'string') {
          targetEventId = p;
        }
      }

      let matches = localStore.registrations.filter(r => {
        if (!r) return false;
        if (targetEventId && r.event_id && r.event_id !== targetEventId) return false;
        if (targetUserId && Number(r.user_id) === targetUserId) return true;
        if (targetEmail && r.email && r.email.toLowerCase() === targetEmail) return true;
        return false;
      });

      if (sqlLower.includes("reg_status in ('approved', 'verified')")) {
        matches = matches.filter(r => ['APPROVED', 'VERIFIED'].includes(r.reg_status));
      } else if (sqlLower.includes("reg_status = 'pending_verification'")) {
        matches = matches.filter(r => r.reg_status === 'PENDING_VERIFICATION');
      }

      return matches.sort((a, b) => b.id - a.id)[0] || null;
    }
    return localStore.registrations[0] || null;
  }

  // Legacy Certificates
  if (sqlLower.includes('from legacy_certificates') && sqlLower.includes('hash =')) {
    const hash = params[0];
    const match = localStore.legacyCertificates.find(c => c.hash === hash);
    if (match) return match;
    return {
      id: 99,
      hash,
      event_name: 'ONLINE OPEN MIC 2026 (Edition 1)',
      created_at: new Date().toISOString()
    };
  }

  // Gallery
  if (sqlLower.includes('from gallery_images') && sqlLower.includes('id =')) {
    const targetId = parseInt(params[0], 10);
    return localStore.gallery.find(g => g.id === targetId) || null;
  }

  return null;
}

function handleLocalAll(sql, params = []) {
  syncLocalStore();
  const sqlLower = sql.toLowerCase();

  // Events list
  if (sqlLower.includes('from events')) {
    let list = [...localStore.events];
    if (sqlLower.includes('is_published = 1')) {
      list = list.filter(e => e.is_published === 1);
    }
    if (sqlLower.includes('status = ?')) {
      list = list.filter(e => e.status === params[0]);
    }
    return list.sort((a, b) => b.id - a.id);
  }

  // Promo codes list
  if (sqlLower.includes('from promo_codes')) {
    let list = [...(localStore.promoCodes || [])];
    if (sqlLower.includes('is_active = 1')) {
      list = list.filter(p => Number(p.is_active) === 1);
    }
    if (sqlLower.includes('upper(code) = upper(?)') || sqlLower.includes('code = ?')) {
      const codeParam = String(params[0] || '').toUpperCase().trim();
      list = list.filter(p => p.code.toUpperCase() === codeParam);
    }
    return list.sort((a, b) => b.id - a.id);
  }

  // Users list
  if (sqlLower.includes('from users')) {
    let list = [...(localStore.users || [])];
    if (sqlLower.includes('is_blocked = 1')) {
      list = list.filter(u => Number(u.is_blocked) === 1);
    } else if (sqlLower.includes('is_blocked = 0') || sqlLower.includes('is_blocked is null')) {
      list = list.filter(u => Number(u.is_blocked || 0) === 0);
    } else if (sqlLower.includes('is_blocked = ?')) {
      const blockedParam = Number(params[params.length - 1]);
      list = list.filter(u => Number(u.is_blocked || 0) === blockedParam);
    }
    if (sqlLower.includes('like ?') || sqlLower.includes('like')) {
      const rawSearch = String(params[0] || '').replace(/^%|%$/g, '').toLowerCase().trim();
      if (rawSearch) {
        list = list.filter(u =>
          (u.name && u.name.toLowerCase().includes(rawSearch)) ||
          (u.email && u.email.toLowerCase().includes(rawSearch)) ||
          (u.phone && String(u.phone).toLowerCase().includes(rawSearch)) ||
          (u.city && u.city.toLowerCase().includes(rawSearch))
        );
      }
    }
    return list.sort((a, b) => b.id - a.id);
  }

  // Registrations list
  if (sqlLower.includes('from registrations')) {
    let list = [...localStore.registrations];
    if (sqlLower.includes('promo_code_id = ?') || sqlLower.includes('upper(promo_code) = upper(?)') || sqlLower.includes('promo_code = ?')) {
      const numId = params.length > 0 && (typeof params[0] === 'number' || /^\d+$/.test(String(params[0]))) ? Number(params[0]) : null;
      const codeParam = params.length > 1 ? String(params[1] || '').toUpperCase().trim() : (numId === null ? String(params[0] || '').toUpperCase().trim() : null);
      return list.filter(r => {
        if (numId !== null && Number(r.promo_code_id) === numId) return true;
        if (codeParam && r.promo_code && String(r.promo_code).toUpperCase().trim() === codeParam) return true;
        return false;
      }).sort((a, b) => b.id - a.id);
    }
    if (sqlLower.includes('user_id = ?')) {
      const userId = Number(params[0]);
      if (sqlLower.includes('user_id is null and email = ?') || sqlLower.includes('email = ?')) {
        const email = String(params[1] || '').toLowerCase().trim();
        return list.filter(r => Number(r.user_id) === userId || (!r.user_id && r.email && r.email.toLowerCase() === email)).sort((a, b) => b.id - a.id);
      }
      return list.filter(r => Number(r.user_id) === userId).sort((a, b) => b.id - a.id);
    }
    if (sqlLower.includes('phone = ?') || sqlLower.includes('phone =')) {
      const cleanPhone = String(params[0] || '').replace(/\D/g, '');
      return list.filter(r => r.phone === cleanPhone);
    }
    let pIdx = 0;
    if (sqlLower.includes('event_id = ?') && pIdx < params.length) {
      const eventId = params[pIdx++];
      if (eventId && eventId !== 'ALL') {
        list = list.filter(r => (r.event_id || 'online-open-mic-2026') === eventId);
      }
    }
    if (sqlLower.includes('reg_status = ?') && pIdx < params.length) {
      const status = params[pIdx++];
      if (status && status !== 'ALL') {
        list = list.filter(r => (r.reg_status || 'PENDING_VERIFICATION') === status);
      }
    }
    if (sqlLower.includes('category = ?') && pIdx < params.length) {
      const cat = params[pIdx++];
      if (cat && cat !== 'ALL') {
        list = list.filter(r => r.category === cat);
      }
    }
    if (sqlLower.includes('checked_in = ?') && pIdx < params.length) {
      const cin = Number(params[pIdx++]);
      list = list.filter(r => Number(r.checked_in || 0) === cin);
    }
    if (sqlLower.includes('full_name like') && pIdx < params.length) {
      const rawSearch = String(params[pIdx] || '').replace(/^%|%$/g, '').toLowerCase();
      const paramSlots = sqlLower.includes('id = ?') ? 8 : (sqlLower.includes('promo_code like') ? 7 : 5);
      pIdx += paramSlots;
      if (rawSearch) {
        list = list.filter(r =>
          (r.full_name && String(r.full_name).toLowerCase().includes(rawSearch)) ||
          (r.email && String(r.email).toLowerCase().includes(rawSearch)) ||
          (r.registration_id && String(r.registration_id).toLowerCase().includes(rawSearch)) ||
          (r.phone !== undefined && r.phone !== null && String(r.phone).toLowerCase().includes(rawSearch)) ||
          (r.transaction_id && String(r.transaction_id).toLowerCase().includes(rawSearch)) ||
          (r.promo_code && String(r.promo_code).toLowerCase().includes(rawSearch)) ||
          (r.referrer_name && String(r.referrer_name).toLowerCase().includes(rawSearch)) ||
          String(r.id) === rawSearch
        );
      }
    }
    list = list.sort((a, b) => b.id - a.id);
    if (sqlLower.includes('limit ? offset ?') && params.length >= 2) {
      const l = parseInt(params[params.length - 2], 10);
      const o = parseInt(params[params.length - 1], 10);
      if (!isNaN(l) && l >= 0) {
        const start = !isNaN(o) && o >= 0 ? o : 0;
        return list.slice(start, start + l);
      }
    }
    return list;
  }

  // Gallery images list
  if (sqlLower.includes('from gallery_images')) {
    let list = [...localStore.gallery];
    if (sqlLower.includes('event_id = ?') || sqlLower.includes('event_id =')) {
      const eventId = params[0];
      list = list.filter(g => g.event_id === eventId);
    }
    if (sqlLower.includes('is_published = 1')) {
      list = list.filter(g => g.is_published === 1);
    }
    return list.sort((a, b) => (a.display_order - b.display_order) || (b.id - a.id));
  }

  // Email logs
  if (sqlLower.includes('from email_logs')) {
    return [...localStore.emailLogs].reverse();
  }

  // Unsubscribed emails
  if (sqlLower.includes('from unsubscribed_emails')) {
    return [...(localStore.unsubscribedEmails || [])];
  }

  // Email campaigns
  if (sqlLower.includes('from email_campaigns')) {
    return [...(localStore.emailCampaigns || [])].reverse();
  }

  return [];
}

// ─── Schema Initialization ────────────────────────────────────────────────────

const initSchema = async () => {
  try {
    // ── Events Table ──────────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        description TEXT,
        short_description TEXT,
        event_type TEXT DEFAULT 'ONLINE',
        status TEXT NOT NULL DEFAULT 'draft',
        is_active INTEGER NOT NULL DEFAULT 0,
        is_published INTEGER NOT NULL DEFAULT 1,
        event_date TEXT,
        start_time TEXT,
        end_time TEXT,
        timezone TEXT DEFAULT 'IST (GMT+5:30)',
        reg_open_date TEXT,
        reg_close_date TEXT,
        venue_name TEXT,
        venue_address TEXT,
        city TEXT,
        state TEXT,
        maps_url TEXT,
        venue_image_url TEXT,
        is_paid INTEGER NOT NULL DEFAULT 1,
        fee INTEGER NOT NULL DEFAULT 79,
        currency TEXT DEFAULT 'INR',
        pricing_tiers TEXT,
        early_bird_fee INTEGER,
        upi_id TEXT,
        payee_name TEXT,
        qr_asset_path TEXT,
        payment_instructions TEXT,
        poster_url TEXT,
        banner_url TEXT,
        logo_url TEXT,
        promo_video_url TEXT,
        reg_enabled INTEGER NOT NULL DEFAULT 1,
        reg_button_text TEXT DEFAULT 'REGISTER AS PERFORMER',
        max_registrations INTEGER DEFAULT 0,
        confirmation_message TEXT,
        allowed_categories TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        instagram_url TEXT,
        youtube_url TEXT,
        whatsapp_url TEXT,
        meet_link TEXT,
        other_links TEXT,
        certificate_enabled INTEGER NOT NULL DEFAULT 1,
        certificate_title TEXT DEFAULT 'CERTIFICATE OF PARTICIPATION',
        certificate_bg_url TEXT,
        registration_provider TEXT DEFAULT 'internal',
        external_registration_url TEXT DEFAULT '',
        external_platform_name TEXT DEFAULT '',
        external_platform_notes TEXT DEFAULT '',
        external_open_new_tab INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`);

    try { await rawRun(`ALTER TABLE events ADD COLUMN registration_provider TEXT DEFAULT 'internal'`); } catch (_) {}
    try { await rawRun(`ALTER TABLE events ADD COLUMN external_registration_url TEXT DEFAULT ''`); } catch (_) {}
    try { await rawRun(`ALTER TABLE events ADD COLUMN external_platform_name TEXT DEFAULT ''`); } catch (_) {}
    try { await rawRun(`ALTER TABLE events ADD COLUMN external_platform_notes TEXT DEFAULT ''`); } catch (_) {}
    try { await rawRun(`ALTER TABLE events ADD COLUMN external_open_new_tab INTEGER DEFAULT 1`); } catch (_) {}
    try { await rawRun(`ALTER TABLE events ADD COLUMN receipt_template_url TEXT DEFAULT ''`); } catch (_) {}

    // Seed default events if events table is empty
    for (const evt of DEFAULT_EVENTS) {
      await rawRun(
        `INSERT INTO events (
          slug, name, title, subtitle, description, short_description,
          event_type, status, is_active, is_published,
          event_date, start_time, end_time, timezone,
          reg_open_date, reg_close_date, venue_name, venue_address,
          city, state, maps_url, venue_image_url,
          is_paid, fee, currency, pricing_tiers, early_bird_fee,
          upi_id, payee_name, qr_asset_path, payment_instructions,
          poster_url, banner_url, logo_url, promo_video_url,
          reg_enabled, reg_button_text, max_registrations, confirmation_message,
          allowed_categories, contact_email, contact_phone,
          instagram_url, youtube_url, whatsapp_url, meet_link, other_links,
          certificate_enabled, certificate_title, certificate_bg_url,
          registration_provider, external_registration_url, external_platform_name, external_platform_notes, external_open_new_tab,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?
        ) ON CONFLICT (slug) DO NOTHING`,
        [
          evt.slug, evt.name, evt.title, evt.subtitle, evt.description, evt.short_description,
          evt.event_type, evt.status, evt.is_active, evt.is_published,
          evt.event_date, evt.start_time, evt.end_time, evt.timezone,
          evt.reg_open_date, evt.reg_close_date, evt.venue_name, evt.venue_address,
          evt.city, evt.state, evt.maps_url, evt.venue_image_url,
          evt.is_paid, evt.fee, evt.currency, evt.pricing_tiers, evt.early_bird_fee,
          evt.upi_id, evt.payee_name, evt.qr_asset_path, evt.payment_instructions,
          evt.poster_url, evt.banner_url, evt.logo_url, evt.promo_video_url,
          evt.reg_enabled, evt.reg_button_text, evt.max_registrations, evt.confirmation_message,
          evt.allowed_categories, evt.contact_email, evt.contact_phone,
          evt.instagram_url, evt.youtube_url, evt.whatsapp_url, evt.meet_link, evt.other_links,
          evt.certificate_enabled, evt.certificate_title, evt.certificate_bg_url,
          evt.registration_provider, evt.external_registration_url, evt.external_platform_name, evt.external_platform_notes, evt.external_open_new_tab,
          evt.created_at, evt.updated_at
        ]
      );
    }

    // ── Registrations Table ───────────────────────────────────────────────────
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
        otp_verified INTEGER NOT NULL DEFAULT 0,
        otp_verified_at TEXT,
        reg_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
        approved_at TEXT,
        approved_by TEXT,
        rejected_at TEXT,
        rejected_reason TEXT,
        transaction_id TEXT,
        payment_screenshot_url TEXT,
        payment_submitted_at TEXT,
        payment_verified_at TEXT,
        payment_verified_by TEXT,
        checked_in INTEGER NOT NULL DEFAULT 0,
        checkin_at TEXT,
        certificate_eligible INTEGER NOT NULL DEFAULT 0,
        achievement TEXT,
        position TEXT,
        badge_text TEXT,
        citation TEXT,
        certificate_title TEXT,
        serial_number INTEGER,
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

    // Safe column migrations for registrations
    await addColumnIfNotExists('registrations', 'admin_notes TEXT');
    await addColumnIfNotExists('registrations', 'achievement TEXT');
    await addColumnIfNotExists('registrations', 'position TEXT');
    await addColumnIfNotExists('registrations', 'badge_text TEXT');
    await addColumnIfNotExists('registrations', 'citation TEXT');
    await addColumnIfNotExists('registrations', 'certificate_title TEXT');
    await addColumnIfNotExists('registrations', 'serial_number INTEGER');
    await addColumnIfNotExists('registrations', 'user_id INTEGER');
    await addColumnIfNotExists('registrations', 'age INTEGER');
    await addColumnIfNotExists('registrations', 'promo_code TEXT');
    await addColumnIfNotExists('registrations', 'referrer_name TEXT');
    await addColumnIfNotExists('registrations', 'original_fee INTEGER');
    await addColumnIfNotExists('registrations', 'discount_amount INTEGER DEFAULT 0');
    await addColumnIfNotExists('registrations', 'final_fee INTEGER');
    await addColumnIfNotExists('registrations', 'promo_code_id INTEGER');

    await rawRun(`CREATE INDEX IF NOT EXISTS idx_reg_id ON registrations(registration_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_reg_event ON registrations(event_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_email ON registrations(email)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_phone ON registrations(phone)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations(reg_status)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_otp_verified ON registrations(otp_verified)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_reg_user_id ON registrations(user_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_reg_promo_code ON registrations(promo_code)`);

    // ── Users Table ───────────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        age INTEGER NOT NULL,
        city TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_verified INTEGER NOT NULL DEFAULT 0,
        is_blocked INTEGER NOT NULL DEFAULT 0,
        block_reason TEXT,
        blocked_at TEXT,
        blocked_by TEXT,
        unblocked_at TEXT,
        unblocked_by TEXT,
        verification_token TEXT,
        verification_token_expires_at TEXT,
        instagram TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Safe column migrations for users
    await addColumnIfNotExists('users', 'is_blocked INTEGER NOT NULL DEFAULT 0');
    await addColumnIfNotExists('users', 'block_reason TEXT');
    await addColumnIfNotExists('users', 'blocked_at TEXT');
    await addColumnIfNotExists('users', 'blocked_by TEXT');
    await addColumnIfNotExists('users', 'unblocked_at TEXT');
    await addColumnIfNotExists('users', 'unblocked_by TEXT');
    await addColumnIfNotExists('users', 'instagram TEXT');

    await rawRun(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_users_blocked ON users(is_blocked)`);

    // ── Promo Codes Table ──────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        assigned_person TEXT,
        assigned_to TEXT,
        discount_type TEXT NOT NULL DEFAULT 'percentage',
        discount_value NUMERIC NOT NULL DEFAULT 0,
        eligible_events TEXT DEFAULT 'ALL',
        starts_at TEXT,
        expires_at TEXT,
        total_usage_limit INTEGER,
        per_user_limit INTEGER DEFAULT 1,
        max_uses INTEGER DEFAULT 0,
        max_uses_per_user INTEGER DEFAULT 1,
        times_used INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Safe column migrations for promo_codes
    await addColumnIfNotExists('promo_codes', 'assigned_person TEXT');
    await addColumnIfNotExists('promo_codes', 'assigned_to TEXT');
    await addColumnIfNotExists('promo_codes', 'total_usage_limit INTEGER');
    await addColumnIfNotExists('promo_codes', 'per_user_limit INTEGER DEFAULT 1');
    await addColumnIfNotExists('promo_codes', 'max_uses INTEGER DEFAULT 0');
    await addColumnIfNotExists('promo_codes', 'max_uses_per_user INTEGER DEFAULT 1');
    await addColumnIfNotExists('promo_codes', 'notes TEXT');
    try { await rawRun(`ALTER TABLE promo_codes ALTER COLUMN assigned_to DROP NOT NULL`); } catch (_) {}
    try { await rawRun(`ALTER TABLE promo_codes ALTER COLUMN eligible_events DROP NOT NULL`); } catch (_) {}

    await rawRun(`CREATE INDEX IF NOT EXISTS idx_promo_code ON promo_codes(code)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_promo_active ON promo_codes(is_active)`);

    // ── Password Resets Table ──────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        token_salt TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash)`);

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
    await addColumnIfNotExists('otp_sessions', 'verification_token TEXT');
    await addColumnIfNotExists('otp_sessions', 'token_expires_at TEXT');
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

    // ── Unsubscribed Emails & Email Preferences ─────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS unsubscribed_emails (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_unsub_email ON unsubscribed_emails(email)`);

    // ── Email Campaigns ─────────────────────────────────────────────────────────
    await rawRun(`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id SERIAL PRIMARY KEY,
        event_id TEXT NOT NULL,
        campaign_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        recipient_count INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'COMPLETED',
        created_at TEXT NOT NULL
      )
    `);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_campaigns_event ON email_campaigns(event_id)`);

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
        event_id TEXT DEFAULT 'online-open-mic-2026',
        image_url TEXT NOT NULL,
        caption TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_published INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await addColumnIfNotExists('gallery_images', "event_id TEXT DEFAULT 'online-open-mic-2026'");
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_gallery_event ON gallery_images(event_id)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_gallery_published ON gallery_images(is_published)`);
    await rawRun(`CREATE INDEX IF NOT EXISTS idx_gallery_order ON gallery_images(display_order)`);

    console.log('✓ Database schema initialized with multi-event support.');
  } catch (err) {
    console.warn('[DB] Database schema initialization notice (offline fallback active):', err.message);
  }
};

initSchema().catch(() => {});

// ─── High-Level Event Helpers ─────────────────────────────────────────────────

async function getActiveEvent() {
  try {
    const row = await get(`SELECT * FROM events WHERE is_active = 1 LIMIT 1`);
    if (row) return row;
    const fallback = await get(`SELECT * FROM events ORDER BY is_published DESC, id DESC LIMIT 1`);
    if (fallback) return fallback;
  } catch (_) {}
  if (localStore && localStore.events) {
    const active = localStore.events.find(e => e.is_active === 1);
    if (active) return active;
    if (localStore.events.length > 0) return localStore.events[0];
  }
  return DEFAULT_EVENTS[0];
}

async function getEventBySlug(slugOrId) {
  if (!slugOrId) return null;
  const clean = String(slugOrId).trim().toLowerCase();
  try {
    const row = await get(`SELECT * FROM events WHERE lower(slug) = ? OR id::text = ? LIMIT 1`, [clean, clean]);
    if (row) return row;
  } catch (_) {}
  if (localStore && localStore.events) {
    return localStore.events.find(e => e.slug.toLowerCase() === clean || String(e.id) === clean) || null;
  }
  return null;
}

async function listEvents(filter = {}) {
  let sql = `SELECT * FROM events WHERE 1=1`;
  const params = [];
  if (filter.status) {
    sql += ` AND status = ?`;
    params.push(filter.status);
  }
  if (filter.isPublished !== undefined) {
    sql += ` AND is_published = ?`;
    params.push(filter.isPublished ? 1 : 0);
  }
  sql += ` ORDER BY is_active DESC, id DESC`;
  return all(sql, params);
}

async function getSetting(key, defaultValue = null) {
  try {
    const row = await get(`SELECT value FROM app_settings WHERE key = ?`, [key]);
    return row ? row.value : defaultValue;
  } catch (err) {
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

module.exports = {
  pool,
  run,
  get,
  all,
  rawRun,
  getSetting,
  setSetting,
  getActiveEvent,
  getEventBySlug,
  listEvents,
  DEFAULT_EVENTS
};
