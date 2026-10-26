// Test Certificate Generation, API, QR Code, and Auto-Verification
const http = require('http');
const assert = require('assert');
const app = require('../server/index');
const config = require('../server/config');
const db = require('../server/db');

const PORT = config.PORT || 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let ephemeralServer = null;

function ensureServerRunning() {
  return new Promise((resolve) => {
    const testReq = http.request(
      { hostname: '127.0.0.1', port: PORT, path: '/api/config', method: 'GET', timeout: 500 },
      () => { resolve(false); }
    );
    testReq.on('timeout', () => {
      testReq.destroy();
      ephemeralServer = app.listen(PORT, '127.0.0.1', () => resolve(true));
    });
    testReq.on('error', () => {
      ephemeralServer = app.listen(PORT, '127.0.0.1', () => resolve(true));
    });
    testReq.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(BASE_URL + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('======================================================');
  console.log('    TEST SUITE: NEW CERTIFICATE ENGINE & VERIFICATION ');
  console.log('======================================================\n');

  await ensureServerRunning();

  let passed = 0;
  function test(desc, cond) {
    if (cond) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  try {
    // 1. Certificate HTML Page
    console.log('>>> [1/6] Testing Certificate Page Availability & Layout...');
    const pageRes = await get('/certificate');
    test('Certificate page responds with HTTP 200', pageRes.status === 200);
    test('Page contains Cinzel font link', pageRes.body.includes('Cinzel'));
    test('Page contains Pinyon Script font link', pageRes.body.includes('Pinyon+Script'));
    test('Page contains @media print rules', pageRes.body.includes('@media print'));
    test('Page contains print button', pageRes.body.includes('id="printBtn"'));
    test('Page contains qrcodejs fallback', pageRes.body.includes('qrcode.min.js'));
    test('Page contains single Registration ID field (id="certRegId")', pageRes.body.includes('id="certRegId"'));
    test('Page does NOT contain Name & Phone tab bar', !pageRes.body.includes('id="tabNamePhone"'));
    test('Page does NOT contain certName input', !pageRes.body.includes('id="certName"'));
    test('Page does NOT contain certPhone input', !pageRes.body.includes('id="certPhone"'));

    // 2. Certificate Client Script
    console.log('\n>>> [2/6] Testing Certificate Client Script Assets...');
    const jsRes = await get('/js/certificate.js');
    test('Certificate script responds with HTTP 200', jsRes.status === 200);
    test('Script contains drawGoldSeal function', jsRes.body.includes('drawGoldSeal'));
    test('Script contains drawCornerOrnaments function', jsRes.body.includes('drawCornerOrnaments'));
    test('Script contains dynamic auto-scaling font logic for long names', jsRes.body.includes('while (ctx.measureText(name).width > maxNameWidth'));
    test('Script contains QR code scan URL parameter detection', jsRes.body.includes('urlParams.get(\'regId\')'));
    test('Script does NOT declare duplicate variables', !jsRes.body.match(/const\s+eventQueryParam\b[\s\S]*const\s+eventQueryParam\b/));

    // 3. Certificate Verification via Registration ID
    console.log('\n>>> [3/6] Testing Certificate Verification API by Registration ID...');
    const verifyRes = await post('/api/certificate/verify', { registrationId: 'OC-OM-4892' });
    test('Verification responds with HTTP 200', verifyRes.status === 200);
    test('Returns success: true', verifyRes.json && verifyRes.json.success === true);
    test('Returns verifiedName: Aarav Sharma', verifyRes.json && verifyRes.json.verifiedName === 'Aarav Sharma');
    test('Returns certificateId: OC-OM-4892', verifyRes.json && verifyRes.json.certificateId === 'OC-OM-4892');
    test('Returns event title', verifyRes.json && verifyRes.json.event.includes('Open Mic'));
    test('Returns category', verifyRes.json && typeof verifyRes.json.category === 'string');
    test('Generates base64 QR code', verifyRes.json && verifyRes.json.qrCode && verifyRes.json.qrCode.startsWith('data:image/png;base64,'));
    test('Generates verification URL linking to /certificate?regId=', verifyRes.json && verifyRes.json.verificationUrl.includes('/certificate?regId=OC-OM-4892'));

    // 4. Verification via GET Request (QR Code Direct Scan)
    console.log('\n>>> [4/6] Testing GET Verification Endpoint...');
    const getVerifyRes = await get('/api/certificate/verify?registrationId=OC-OM-4892');
    test('GET verification responds with HTTP 200', getVerifyRes.status === 200);
    const getJson = JSON.parse(getVerifyRes.body);
    test('GET verification returns success: true', getJson && getJson.success === true);
    test('GET verification returns valid QR code', getJson && getJson.qrCode && getJson.qrCode.startsWith('data:image/png;base64,'));

    // 5. Long Participant Name Verification
    console.log('\n>>> [5/6] Testing Long Participant Name Auto-Scaling Data...');
    const longNameRes = await post('/api/certificate/verify', { registrationId: 'OC-OM-9921' });
    test('Long name record lookup responds with HTTP 200', longNameRes.status === 200);
    test('Long name matches full title', longNameRes.json && longNameRes.json.verifiedName === 'Dr. Alexander Christopher Montgomery-Vanderbilt');
    test('Long name has 47 characters', longNameRes.json && longNameRes.json.verifiedName.length === 47);
    test('Long name includes category', longNameRes.json && longNameRes.json.category.includes('Storytelling'));

    // 6. Invalid Registration ID & Event Mismatch Error Handling
    console.log('\n>>> [6/6] Testing Error Messages for Invalid ID & Event Scoping...');
    const invalidRes = await post('/api/certificate/verify', { registrationId: 'OC-INVALID-99999' });
    test('Invalid Registration ID responds with HTTP 404', invalidRes.status === 404);
    test('Invalid Registration ID returns success: false', invalidRes.json && invalidRes.json.success === false);
    test('Invalid Registration ID has informative error message', invalidRes.json && invalidRes.json.error.includes('No certificate found for Registration ID'));

    // Test Event Mismatch: Requesting Event B while registration belongs to Event A
    const mismatchRes = await post('/api/certificate/verify', {
      registrationId: 'OC-OM-4892',
      eventId: 'delhi-adhure-musafir-2026'
    });
    test('Event mismatch responds with HTTP 400', mismatchRes.status === 400);
    test('Event mismatch returns informative event scoping error', mismatchRes.json && mismatchRes.json.error.includes('registered for'));

    console.log('\n======================================================');
    console.log(`TOTAL PASSED: ${passed} CHECKS`);
    console.log('======================================================\n');
  } finally {
    if (ephemeralServer) {
      ephemeralServer.close();
    }
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('Test execution failed:', err);
    if (ephemeralServer) ephemeralServer.close();
    process.exit(1);
  });
}

module.exports = runTests;
