// Offstage Creators — Comprehensive Certificate System & Event-Scoped Verification Tests
const http = require('http');
const assert = require('assert');
const app = require('../server/index');
const db = require('../server/db');
const config = require('../server/config');
const certificateService = require('../server/services/certificate');

const BASE_URL = `http://localhost:${config.PORT}`;

let serverInstance = null;
function ensureServerRunning() {
  return new Promise((resolve) => {
    const testReq = http.request({ hostname: 'localhost', port: config.PORT, path: '/api/config', method: 'GET' }, () => {
      resolve(false);
    });
    testReq.on('error', () => {
      serverInstance = app.listen(config.PORT, () => {
        resolve(true);
      });
    });
    testReq.end();
  });
}

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL + path, { headers }, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const text = buffer.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: text, buffer, json });
      });
    }).on('error', reject);
  });
}

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(BASE_URL + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    }, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const text = buffer.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: text, buffer, json });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runCertificateSystemTests() {
  console.log('================================================================');
  console.log('    TEST SUITE: EVENT-SCOPED CERTIFICATES & OPTIONS INTEGRITY   ');
  console.log('================================================================\n');

  await ensureServerRunning();

  let passed = 0;
  let total = 0;

  function test(desc, cond) {
    total++;
    if (cond) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  // 1. Setup Test Events & Participants in DB
  console.log('>>> [1/6] Setting up Dual Events and Cross-Event Registrations...');

  const eventAId = 'online-open-mic-2026';
  const eventBId = 'delhi-adhure-musafir-2026';

  const regAId = 'OC-TEST-EVTA-001';
  const regBId = 'OC-TEST-EVTB-002';
  const samePersonName = 'Pooja Sharma';
  const samePersonPhone = '9988776655';
  const samePersonEmail = 'pooja.sharma.test@example.com';

  // Clean any old test records
  await db.run('DELETE FROM registrations WHERE registration_id IN (?, ?)', [regAId, regBId]);

  // Insert Participant in Event A (Winner)
  await db.run(
    `INSERT INTO registrations (
      registration_id, event_id, full_name, phone, email, city, category,
      performance_title, amount, reg_status, payment_status, checked_in,
      certificate_eligible, position, certificate_title, badge_text, citation,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      regAId, eventAId, samePersonName, samePersonPhone, samePersonEmail, 'New Delhi', 'Poetry & Shayari',
      'Shaam Ki Roshni', 79, 'APPROVED', 'PAID', 1,
      1, 'WINNER', 'CERTIFICATE OF EXCELLENCE', '★ EVENT WINNER — 1ST PLACE ★', 'for delivering the most outstanding poetic performance of the evening',
      new Date().toISOString(), new Date().toISOString()
    ]
  );

  // Insert Same Participant in Event B (Participant Only — NOT A WINNER)
  await db.run(
    `INSERT INTO registrations (
      registration_id, event_id, full_name, phone, email, city, category,
      performance_title, amount, reg_status, payment_status, checked_in,
      certificate_eligible, position, certificate_title, badge_text, citation,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      regBId, eventBId, samePersonName, samePersonPhone, samePersonEmail, 'New Delhi', 'Storytelling',
      'Dilli Ka Safar', 199, 'APPROVED', 'PAID', 1,
      1, 'PARTICIPANT', 'CERTIFICATE OF PARTICIPATION', '', '',
      new Date().toISOString(), new Date().toISOString()
    ]
  );

  test('Registered test participant Pooja Sharma in Event A and Event B', true);

  // 2. Test Bug 1: Verify Winner Scoping & Cross-Event Isolation
  console.log('\n>>> [2/6] Verifying Winner Scoping & Cross-Event Winner Isolation (Bug 1 Fix)...');

  // Verify Reg A (Event A)
  const verifyResA = await post('/api/certificate/verify', { registrationId: regAId });
  test('Event A verification responds 200', verifyResA.status === 200);
  test('Event A marks participant as Winner', verifyResA.json?.isWinner === true);
  test('Event A returns position: WINNER', verifyResA.json?.position === 'WINNER');
  test('Event A returns custom title: CERTIFICATE OF EXCELLENCE', verifyResA.json?.certificateTitle === 'CERTIFICATE OF EXCELLENCE');
  test('Event A returns custom badge: ★ EVENT WINNER — 1ST PLACE ★', verifyResA.json?.badgeText === '★ EVENT WINNER — 1ST PLACE ★');

  // Verify Reg B (Event B) — MUST NOT BE MARKED AS WINNER
  const verifyResB = await post('/api/certificate/verify', { registrationId: regBId });
  test('Event B verification responds 200', verifyResB.status === 200);
  test('Event B strictly DOES NOT mark participant as Winner (isWinner === false)', verifyResB.json?.isWinner === false);
  test('Event B returns position: PARTICIPANT', verifyResB.json?.position === 'PARTICIPANT');
  test('Event B returns title: CERTIFICATE OF PARTICIPATION', verifyResB.json?.certificateTitle === 'CERTIFICATE OF PARTICIPATION');
  test('Event B badgeText is empty (no leaked winner badge)', !verifyResB.json?.badgeText || verifyResB.json?.badgeText === '');

  // 3. Test Historical Winner Records (Suhavani Kaur preservation & isolation)
  console.log('\n>>> [3/6] Preserving Historical Winner Records (Suhavani Kaur in Edition 1)...');
  const suhavaniRes = await post('/api/certificate/verify', { registrationId: 'OC-OM-2440F923' });
  test('Historical winner OC-OM-2440F923 responds 200', suhavaniRes.status === 200);
  test('Historical winner OC-OM-2440F923 remains verified winner', suhavaniRes.json?.isWinner === true);
  test('Historical winner OC-OM-2440F923 event is Online Open Mic', suhavaniRes.json?.eventId === 'online-open-mic-2026');

  // Insert a mock registration for another person named "Suhavani" in Event B (delhi show) as a standard participant
  const suhavaniEventBId = 'OC-TEST-SUHAVANI-EVTB';
  await db.run('DELETE FROM registrations WHERE registration_id = ?', [suhavaniEventBId]);
  await db.run(
    `INSERT INTO registrations (
      registration_id, event_id, full_name, phone, email, category,
      amount, reg_status, payment_status, checked_in, certificate_eligible,
      position, certificate_title, badge_text, citation,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      suhavaniEventBId, eventBId, 'Suhavani Verma', '9123456780', 'suhavani.verma@example.com', 'Storytelling',
      199, 'APPROVED', 'PAID', 1, 1,
      'PARTICIPANT', 'CERTIFICATE OF PARTICIPATION', '', '',
      new Date().toISOString(), new Date().toISOString()
    ]
  );

  const suhavaniBRes = await post('/api/certificate/verify', { registrationId: suhavaniEventBId });
  test('New participant with name Suhavani in Event B is NOT a winner', suhavaniBRes.json?.isWinner === false);
  test('New participant in Event B position is PARTICIPANT', suhavaniBRes.json?.position === 'PARTICIPANT');

  // 4. Test Bug 2: Dynamic Certificate Options Reflection (Titles, Badges, Citations, Signatories)
  console.log('\n>>> [4/6] Verifying Certificate Options Reflection (Bug 2 Fix)...');

  // Configure Event B Certificate Settings (Event-scoped signatories & dates)
  const customSettingsB = {
    certificateTitle: 'OFFICIAL CERTIFICATE OF HONOUR',
    date: '4 October 2026',
    signatory1Name: 'Ananya Deshmukh',
    signatory1Title: 'Honorary Patron',
    signatory2Name: 'Kabir Mehta',
    signatory2Title: 'Festival Director'
  };

  const adminLoginRes = await post('/api/admin/login', {
    email: 'admin@offstagecreators.com',
    password: 'R!SHI88_Admin'
  });
  const setCookie = adminLoginRes.headers['set-cookie'];
  const adminCookie = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : '';

  await db.run(
    `UPDATE events SET certificate_settings = ?, updated_at = ? WHERE slug = ?`,
    [JSON.stringify(customSettingsB), new Date().toISOString(), eventBId]
  );

  // Retrieve settings
  const getSettingsRes = await get(`/api/admin/events/${eventBId}/certificate-settings`, { Cookie: adminCookie });
  test('Event B certificate settings endpoint responds 200', getSettingsRes.status === 200);
  test('Event B certificate settings date matches', getSettingsRes.json?.settings?.date === '4 October 2026');
  test('Event B signatory 1 is Ananya Deshmukh', getSettingsRes.json?.settings?.signatory1Name === 'Ananya Deshmukh');

  // Check SVG Download for Reg B
  const svgResB = await get(`/api/certificate/svg/${regBId}?_t=${Date.now()}`);
  test('Reg B SVG generated with HTTP 200', svgResB.status === 200);
  test('Reg B SVG Content-Type is image/svg+xml', svgResB.headers['content-type']?.includes('image/svg+xml'));
  test('Reg B SVG contains event date 4 October 2026', svgResB.body.includes('4 October 2026'));
  test('Reg B SVG contains custom signatory Ananya Deshmukh', svgResB.body.includes('Ananya Deshmukh'));
  test('Reg B SVG contains custom signatory Kabir Mehta', svgResB.body.includes('Kabir Mehta'));
  test('Reg B SVG does NOT contain default Muskaan signature', !svgResB.body.includes('Muskaan'));

  // Update Reg A options (Changing certificate options dynamically)
  const updatedCertData = {
    registrationId: regAId,
    position: 'SPECIAL RECOGNITION',
    certificateTitle: 'CERTIFICATE OF JURY SPECIAL RECOGNITION',
    badgeText: '✦ SPECIAL CRITICS CHOICE AWARD ✦',
    citation: 'For creating unforgettable emotional resonance through masterful performance'
  };

  // Directly update in DB or call admin API
  await db.run(
    `UPDATE registrations SET
      position = ?,
      achievement = ?,
      badge_text = ?,
      citation = ?,
      certificate_title = ?,
      updated_at = ?
     WHERE registration_id = ?`,
    [
      updatedCertData.position,
      'Jury Special Recognition',
      updatedCertData.badgeText,
      updatedCertData.citation,
      updatedCertData.certificateTitle,
      new Date().toISOString(),
      regAId
    ]
  );

  // Verify SVG immediately reflects new options (no stale cache)
  const svgResA = await get(`/api/certificate/svg/${regAId}?_t=${Date.now()}`);
  test('Updated Reg A SVG responds 200', svgResA.status === 200);
  test('Reg A SVG reflects updated title: CERTIFICATE OF JURY SPECIAL RECOGNITION', svgResA.body.includes('CERTIFICATE OF JURY SPECIAL RECOGNITION'));
  test('Reg A SVG reflects updated badge: ✦ SPECIAL CRITICS CHOICE AWARD ✦', svgResA.body.includes('✦ SPECIAL CRITICS CHOICE AWARD ✦'));
  test('Reg A SVG reflects updated citation', svgResA.body.includes('masterful performance'));
  test('Cache-Control headers specify no-cache, no-store', svgResA.headers['cache-control']?.includes('no-cache'));

  // 5. Test Bulk Certificate Archive Generation
  console.log('\n>>> [5/6] Verifying Bulk Certificate ZIP Archive Generation...');
  const bulkRes = await get(`/api/admin/certificate/bulk-download?eventId=${eventAId}&_t=${Date.now()}`, { Cookie: adminCookie });
  test('Bulk download responds 200', bulkRes.status === 200);
  test('Bulk download Content-Type is application/zip', bulkRes.headers['content-type']?.includes('application/zip'));
  test('Bulk download Content-Disposition specifies zip attachment', bulkRes.headers['content-disposition']?.includes('.zip'));
  test('ZIP buffer size is greater than 1KB', bulkRes.buffer.length > 1024);

  // 6. Test Email Attachment Handling Safety
  console.log('\n>>> [6/6] Verifying Email Attachment Handling & Safety Guard...');
  const sendEmailRes = await post('/api/admin/certificate/send-email', {
    registrationId: regAId,
    testOnly: true
  }, { Cookie: adminCookie });
  test('Send email with testOnly flag responds 200', sendEmailRes.status === 200);
  test('Send email testOnly returns simulated flag', sendEmailRes.json?.simulated === true);
  test('Send email verified participant name and email without contacting real user', sendEmailRes.json?.recipient === samePersonEmail);

  // Clean up test records
  await db.run('DELETE FROM registrations WHERE registration_id IN (?, ?, ?)', [regAId, regBId, suhavaniEventBId]);

  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }

  console.log('\n================================================================');
  console.log(`CERTIFICATE SYSTEM CHECKS COMPLETED: ${passed} / ${total} PASSED`);
  console.log('================================================================\n');

  return passed === total;
}

if (require.main === module) {
  runCertificateSystemTests()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => {
      console.error('Test failed with error:', err);
      process.exit(1);
    });
}

module.exports = runCertificateSystemTests;
