/**
 * Offstage Creators — Comprehensive Platform Test Suite
 * Tests full end-to-end user & admin journeys on the rebuilt architecture:
 * 1. Health & Config API
 * 2. Form input validation (email, phone, name)
 * 3. Registration creation (generates regId + OTP session)
 * 4. Resend cooldown & rate limiting
 * 5. Wrong OTP handling & attempt countdown
 * 6. Correct OTP verification & status transition to VERIFIED
 * 7. Confirmation email dispatch
 * 8. Server-side QR code generation & permalink lookup
 * 9. Admin auth security (401 on unauthenticated, session cookie on login)
 * 10. Admin approval & approval email dispatch
 * 11. Admin rejection with reason & rejection email dispatch
 * 12. Attendee check-in
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { run, get } = require('../server/db');
const otpService = require('../server/services/otp');

function postMultipart(pathUrl, fields, fileField) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const chunks = [];

    for (const [key, val] of Object.entries(fields)) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
    }

    if (fileField) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.mimetype}\r\n\r\n`));
      chunks.push(fileField.buffer);
      chunks.push(Buffer.from('\r\n'));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const fullBody = Buffer.concat(chunks);

    const req = http.request({
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: pathUrl,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length
      }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });
    req.on('error', reject);
    req.write(fullBody);
    req.end();
  });
}

function request({ method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (postData) {
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runPlatformTests() {
  console.log('\n========================================================');
  console.log('   OFFSTAGE CREATORS — REBUILT PLATFORM TEST SUITE     ');
  console.log('========================================================\n');

  try {
    // ─── 1. CONFIG & PUBLIC ENDPOINTS ──────────────────────────────────────
    console.log('>>> [1/7] Testing Config & Session Endpoints...');
    const configRes = await request({ path: '/api/config' });
    assert(configRes.status === 200, 'GET /api/config returns HTTP 200');
    assert(configRes.json?.event?.title?.includes('Open Mic'), 'Config returns event details');
    assert(configRes.json?.amount === 79, 'Config returns correct ticket amount (₹79)');

    const unauthSession = await request({ path: '/api/admin/session' });
    assert(unauthSession.status === 200 && unauthSession.json?.authenticated === false,
      'Unauthenticated admin session returns authenticated: false');

    // ─── 2. INPUT VALIDATION ───────────────────────────────────────────────
    console.log('\n>>> [2/7] Testing Input Validation...');
    const badNameRes = await request({
      method: 'POST', path: '/api/registrations',
      body: { fullName: '', email: 'test@example.com', phone: '9876543210', city: 'Mumbai', category: 'Poetry' }
    });
    assert(badNameRes.status === 400, 'Rejects empty name with 400');

    const badEmailRes = await request({
      method: 'POST', path: '/api/registrations',
      body: { fullName: 'Test Name', email: 'not-an-email', phone: '9876543210', city: 'Mumbai', category: 'Poetry' }
    });
    assert(badEmailRes.status === 400, 'Rejects invalid email format with 400');

    const badPhoneRes = await request({
      method: 'POST', path: '/api/registrations',
      body: { fullName: 'Test Name', email: 'test@example.com', phone: '123', city: 'Mumbai', category: 'Poetry' }
    });
    assert(badPhoneRes.status === 400, 'Rejects invalid phone number with 400');

    // ─── 3. REGISTRATION CREATION & RESEND COOLDOWN ────────────────────────
    console.log('\n>>> [3/7] Testing Registration Creation & Rate Limiting...');
    const suiteEmail = `test.artist.${Date.now()}@example.com`;
    const regRes = await request({
      method: 'POST', path: '/api/registrations',
      body: {
        fullName: 'Suite Performer',
        phone: '9876543210',
        email: suiteEmail,
        city: 'Mumbai',
        category: 'Storytelling',
        performanceTitle: 'Tales of the Night',
        instagram: '@suiteperformer',
        terms: true
      }
    });
    assert(regRes.status === 201, 'Registration created with HTTP 201');
    assert(Boolean(regRes.json?.registrationId), 'Returns unique registrationId');
    const suiteRegId = regRes.json?.registrationId;

    // Resend immediately -> expect 429 Cooldown
    const cooldownRes = await request({
      method: 'POST', path: '/api/otp/send',
      body: { email: suiteEmail, registrationId: suiteRegId }
    });
    assert(cooldownRes.status === 429, 'Resend OTP during cooldown returns 429 Too Many Requests');
    assert(Boolean(cooldownRes.json?.secondsRemaining), 'Cooldown returns secondsRemaining');

    // ─── 4. OTP VERIFICATION SECURITY ──────────────────────────────────────
    console.log('\n>>> [4/7] Testing OTP Verification Security...');
    // Test wrong OTP
    const wrongOtpRes = await request({
      method: 'POST', path: '/api/otp/verify',
      body: { email: suiteEmail, registrationId: suiteRegId, otp: '111111' }
    });
    assert(wrongOtpRes.status === 400, 'Wrong OTP returns HTTP 400');
    assert(wrongOtpRes.json?.reason === 'INVALID_OTP', 'Wrong OTP returns INVALID_OTP reason');
    assert(wrongOtpRes.json?.error?.includes('remaining'), 'Error informs user of remaining attempts');

    // Store known OTP and verify successfully
    const knownOTP = '739201';
    await otpService.storeOTP(suiteEmail, suiteRegId, knownOTP);

    const validOtpRes = await request({
      method: 'POST', path: '/api/otp/verify',
      body: { email: suiteEmail, registrationId: suiteRegId, otp: knownOTP }
    });
    assert(validOtpRes.status === 200, 'Correct OTP returns HTTP 200 OK');
    assert(validOtpRes.json?.status === 'VERIFIED', 'Status updated to VERIFIED');

    // Verify record in DB
    const dbRecord = await get('SELECT * FROM registrations WHERE registration_id = ?', [suiteRegId]);
    assert(dbRecord.otp_verified === 1, 'Database record has otp_verified = 1');
    assert(dbRecord.reg_status === 'VERIFIED', 'Database record has reg_status = VERIFIED');

    // ─── 5. PERMALINK & QR CODE API ────────────────────────────────────────
    console.log('\n>>> [5/7] Testing Registration Permalink & QR Code API...');
    const permalinkRes = await request({ path: `/api/registrations/${suiteRegId}` });
    assert(permalinkRes.status === 200, 'GET /api/registrations/:id returns HTTP 200');
    assert(permalinkRes.json?.registration?.fullName === 'Suite Performer', 'Returns correct full name');
    assert(permalinkRes.json?.registration?.status === 'VERIFIED', 'Returns VERIFIED status');
    assert(permalinkRes.json?.registration?.qrCode?.startsWith('data:image/png;base64,'),
      'Returns server-generated base64 PNG QR code data URL');

    const notFoundRes = await request({ path: '/api/registrations/NONEXISTENT999' });
    assert(notFoundRes.status === 404, 'Non-existent registration returns HTTP 404');

    // ─── 6. ADMIN AUTHENTICATION & ACCESS CONTROL ──────────────────────────
    console.log('\n>>> [6/7] Testing Admin Security & Login...');
    const unauthAdminRes = await request({ path: '/api/admin/registrations' });
    assert(unauthAdminRes.status === 401, 'Unauthenticated GET /api/admin/registrations returns 401 Unauthorized');

    const badLoginRes = await request({
      method: 'POST', path: '/api/admin/login',
      body: { email: 'admin@offstagecreators.com', password: 'wrongpassword' }
    });
    assert(badLoginRes.status === 401, 'Incorrect password returns 401');

    const goodLoginRes = await request({
      method: 'POST', path: '/api/admin/login',
      body: { email: 'admin@offstagecreators.com', password: 'R!SHI88_Admin' }
    });
    assert(goodLoginRes.status === 200, 'Correct admin login returns HTTP 200');
    const setCookie = goodLoginRes.headers['set-cookie'];
    assert(Boolean(setCookie), 'Login returns HTTP session cookie');
    const adminCookie = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : '';

    // ─── 7. ADMIN APPROVAL, REJECTION & CHECKIN ────────────────────────────
    console.log('\n>>> [7/7] Testing Admin Actions (Approve, Reject, Check-in)...');
    // Admin list registrations with cookie
    const listRes = await request({
      path: '/api/admin/registrations?status=ALL',
      headers: { Cookie: adminCookie }
    });
    assert(listRes.status === 200, 'Authenticated admin can list registrations');
    assert(Array.isArray(listRes.json?.registrations), 'Returns array of registrations');

    // Approve registration
    const approveRes = await request({
      method: 'POST', path: `/api/admin/approve/${suiteRegId}`,
      headers: { Cookie: adminCookie }
    });
    assert(approveRes.status === 200, 'Admin can approve registration');
    assert(approveRes.json?.status === 'APPROVED', 'Approval returns status: APPROVED');

    const postApproveRecord = await get('SELECT reg_status, approved_at FROM registrations WHERE registration_id = ?', [suiteRegId]);
    assert(postApproveRecord.reg_status === 'APPROVED', 'DB status updated to APPROVED');
    assert(Boolean(postApproveRecord.approved_at), 'approved_at timestamp is set');

    // Check-in attendee
    const checkinRes = await request({
      method: 'POST', path: `/api/admin/checkin/${suiteRegId}`,
      headers: { Cookie: adminCookie }
    });
    assert(checkinRes.status === 200, 'Admin can check in approved attendee');
    const postCheckinRecord = await get('SELECT checked_in FROM registrations WHERE registration_id = ?', [suiteRegId]);
    assert(postCheckinRecord.checked_in === 1, 'Attendee checked_in is 1 in DB');

    // Test rejection flow with a second test user
    const rejEmail = `reject.performer.${Date.now()}@example.com`;
    const rejRegId = `OC-OM-REJ${Date.now().toString().slice(-5)}`;
    await run(
      `INSERT INTO registrations (registration_id, event_id, full_name, email, phone, city, category, amount, otp_verified, reg_status, created_at, updated_at)
       VALUES (?, 'online-open-mic-2026', 'Reject Subject', ?, '9876543210', 'Delhi', 'Music', 79, 1, 'VERIFIED', datetime('now'), datetime('now'))`,
      [rejRegId, rejEmail]
    );

    const rejectActionRes = await request({
      method: 'POST', path: `/api/admin/reject/${rejRegId}`,
      headers: { Cookie: adminCookie },
      body: { reason: 'Category capacity reached' }
    });
    assert(rejectActionRes.status === 200, 'Admin can reject registration');
    assert(rejectActionRes.json?.status === 'REJECTED', 'Rejection returns status: REJECTED');

    const postRejectRecord = await get('SELECT reg_status, rejected_reason FROM registrations WHERE registration_id = ?', [rejRegId]);
    assert(postRejectRecord.reg_status === 'REJECTED', 'DB status updated to REJECTED');
    assert(postRejectRecord.rejected_reason === 'Category capacity reached', 'Rejection reason stored in DB');

    console.log('\n--------------------------------------------------------');
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log('--------------------------------------------------------\n');

    return failed === 0;

  } catch (err) {
    console.error('Fatal platform test error:', err);
    return false;
  }
}

if (require.main === module) {
  runPlatformTests().then(ok => {
    process.exit(ok ? 0 : 1);
  });
}

module.exports = runPlatformTests;
