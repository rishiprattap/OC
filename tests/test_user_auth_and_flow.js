/**
 * Offstage Creators — Comprehensive User Accounts & Authentication Test Suite
 * Tests all requirements for creator registration, login, returning user flow,
 * server payment verification, profile management, and historical data safety:
 * 1. User registration validation & duplicate account prevention
 * 2. OTP email verification & session cookie issuance
 * 3. Login with valid & invalid credentials & logout
 * 4. Password recovery flow (forgot-password, token hashing, reset-password, login with new password)
 * 5. User profile access control, retrieval & updates (GET/PUT /api/user/profile)
 * 6. Returning user event registration (auto-fill, skip OTP, direct verificationToken)
 * 7. Duplicate event registration prevention (409 on duplicate verified registration)
 * 8. Payment proof submission & payment_status = 'SUBMITTED'
 * 9. Server admin payment verification & payment_status = 'PAID'
 * 10. User registrations history (GET /api/user/registrations)
 * 11. Historical registration preservation & linking safety
 */

const http = require('http');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../server/config');
const { run, get, all } = require('../server/db');

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

function postMultipart(pathUrl, fields, fileField, customHeaders = {}) {
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

    const reqHeaders = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': fullBody.length,
      ...customHeaders
    };

    const req = http.request({
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      path: pathUrl,
      method: 'POST',
      headers: reqHeaders
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

async function runUserAuthAndFlowTests() {
  console.log('\n======================================================');
  console.log('   OFFSTAGE CREATORS — USER AUTH & FLOW TEST SUITE    ');
  console.log('======================================================\n');

  try {
    const timestamp = Date.now();
    const testEmail = `creator.${timestamp}@example.com`;
    const initialPassword = 'SecurePass!123';
    let userSessionCookie = '';
    let registeredUserId = null;

    // ─── 1. USER REGISTRATION VALIDATION & CREATION ────────────────────────────
    console.log('>>> [1/11] Testing User Account Registration & Validation...');

    // Test input validations
    const emptyNameRes = await request({
      method: 'POST', path: '/api/auth/register',
      body: { name: '', email: testEmail, phone: '9876543210', age: 24, city: 'Delhi', password: initialPassword }
    });
    assert(emptyNameRes.status === 400, 'Rejects empty name with HTTP 400');

    const invalidEmailRes = await request({
      method: 'POST', path: '/api/auth/register',
      body: { name: 'Test Performer', email: 'invalid-email', phone: '9876543210', age: 24, city: 'Delhi', password: initialPassword }
    });
    assert(invalidEmailRes.status === 400, 'Rejects invalid email with HTTP 400');

    const shortPhoneRes = await request({
      method: 'POST', path: '/api/auth/register',
      body: { name: 'Test Performer', email: testEmail, phone: '123', age: 24, city: 'Delhi', password: initialPassword }
    });
    assert(shortPhoneRes.status === 400, 'Rejects short phone with HTTP 400');

    const invalidAgeRes = await request({
      method: 'POST', path: '/api/auth/register',
      body: { name: 'Test Performer', email: testEmail, phone: '9876543210', age: 2, city: 'Delhi', password: initialPassword }
    });
    assert(invalidAgeRes.status === 400, 'Rejects age < 5 with HTTP 400');

    const shortPassRes = await request({
      method: 'POST', path: '/api/auth/register',
      body: { name: 'Test Performer', email: testEmail, phone: '9876543210', age: 24, city: 'Delhi', password: '123' }
    });
    assert(shortPassRes.status === 400, 'Rejects short password with HTTP 400');

    // Valid registration
    const regRes = await request({
      method: 'POST', path: '/api/auth/register',
      body: {
        name: 'Aarav Sharma',
        email: testEmail,
        phone: '9876543210',
        age: 24,
        city: 'New Delhi',
        password: initialPassword
      }
    });
    assert(regRes.status === 201, 'Valid user registration returns HTTP 201 Created');
    assert(regRes.json?.requiresVerification === true, 'Response indicates verification required');

    // Verify DB state
    const dbUser = await get('SELECT * FROM users WHERE email = ?', [testEmail]);
    assert(Boolean(dbUser), 'User record created in database');
    assert(dbUser.is_verified === 0, 'New user is unverified initially (is_verified = 0)');
    assert(dbUser.password_hash !== initialPassword, 'Password is stored as bcrypt hash, never plaintext');
    assert(Boolean(dbUser.verification_token), 'Verification token is generated and stored');
    registeredUserId = dbUser.id;

    // ─── 2. EMAIL OTP VERIFICATION & SESSION ISSUANCE ──────────────────────────
    console.log('\n>>> [2/11] Testing Email OTP Verification & Session Issuance...');

    // Wrong OTP
    const wrongOtpRes = await request({
      method: 'POST', path: '/api/auth/verify-email',
      body: { email: testEmail, otp: '000000' }
    });
    assert(wrongOtpRes.status === 400, 'Rejects incorrect email OTP with HTTP 400');

    // Set a known test OTP into verification_token
    const knownOtp = '582914';
    const salt = crypto.randomBytes(16).toString('hex');
    const secret = config.OTP_SECRET || config.SESSION_SECRET || 'oc_otp_secure_hmac_secret';
    const hash = crypto.createHmac('sha256', secret).update(`${knownOtp}:${salt}`).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await run(
      'UPDATE users SET verification_token = ?, verification_token_expires_at = ? WHERE email = ?',
      [`${hash}:${salt}`, expiresAt, testEmail]
    );

    const verifyRes = await request({
      method: 'POST', path: '/api/auth/verify-email',
      body: { email: testEmail, otp: knownOtp }
    });
    assert(verifyRes.status === 200, 'Correct OTP verification returns HTTP 200 OK');
    assert(verifyRes.json?.user?.is_verified === 1, 'Response confirms user is verified');

    const setCookie = verifyRes.headers['set-cookie'];
    assert(Boolean(setCookie), 'Email verification issues HTTP session cookie');
    userSessionCookie = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : '';
    assert(userSessionCookie.includes('oc.sid'), 'Session cookie contains oc.sid');

    // Check DB status
    const verifiedDbUser = await get('SELECT * FROM users WHERE email = ?', [testEmail]);
    assert(verifiedDbUser.is_verified === 1, 'Database is_verified updated to 1');
    assert(verifiedDbUser.verification_token === null, 'Verification token cleared after use');

    // Check Duplicate registration on verified email
    const duplicateAccountRes = await request({
      method: 'POST', path: '/api/auth/register',
      body: {
        name: 'Duplicate Performer',
        email: testEmail,
        phone: '9876543210',
        age: 25,
        city: 'Mumbai',
        password: initialPassword
      }
    });
    assert(duplicateAccountRes.status === 409, 'Duplicate account registration returns HTTP 409 Conflict');

    // ─── 3. SESSION AUTHENTICATION & LOGOUT / LOGIN ────────────────────────────
    console.log('\n>>> [3/11] Testing Session Persistence, Logout & Login...');

    // Check /me endpoint with session cookie
    const meRes = await request({
      path: '/api/auth/me',
      headers: { Cookie: userSessionCookie }
    });
    assert(meRes.status === 200, 'GET /api/auth/me returns HTTP 200');
    assert(meRes.json?.authenticated === true, 'Session reports authenticated = true');
    assert(meRes.json?.user?.email === testEmail, 'Session returns correct user email');
    assert(meRes.json?.user?.password_hash === undefined, 'Session user object omits password hash');

    // Test Logout
    const logoutRes = await request({
      method: 'POST', path: '/api/auth/logout',
      headers: { Cookie: userSessionCookie }
    });
    assert(logoutRes.status === 200, 'POST /api/auth/logout returns HTTP 200');

    // Check /me after logout
    const postLogoutMe = await request({
      path: '/api/auth/me',
      headers: { Cookie: userSessionCookie }
    });
    assert(postLogoutMe.json?.authenticated === false, 'Session is unauthenticated after logout');

    // Test Login with wrong password
    const badLoginRes = await request({
      method: 'POST', path: '/api/auth/login',
      body: { email: testEmail, password: 'WrongPassword999' }
    });
    assert(badLoginRes.status === 401, 'Login with incorrect password returns HTTP 401 Unauthorized');

    // Test Login with correct credentials
    const goodLoginRes = await request({
      method: 'POST', path: '/api/auth/login',
      body: { email: testEmail, password: initialPassword }
    });
    assert(goodLoginRes.status === 200, 'Login with valid credentials returns HTTP 200 OK');
    assert(goodLoginRes.json?.user?.name === 'Aarav Sharma', 'Login returns sanitized user profile');

    const loginCookie = goodLoginRes.headers['set-cookie'];
    assert(Boolean(loginCookie), 'Login returns new session cookie');
    userSessionCookie = Array.isArray(loginCookie) ? loginCookie[0].split(';')[0] : (typeof loginCookie === 'string' ? loginCookie.split(';')[0] : '');

    // ─── 4. PASSWORD RECOVERY FLOW ─────────────────────────────────────────────
    console.log('\n>>> [4/11] Testing Password Recovery (Forgot & Reset Password)...');

    const forgotRes = await request({
      method: 'POST', path: '/api/auth/forgot-password',
      body: { email: testEmail }
    });
    assert(forgotRes.status === 200, 'POST /api/auth/forgot-password returns HTTP 200');

    // Retrieve the reset token record from database
    const resetRecord = await get(
      'SELECT * FROM password_resets WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1',
      [testEmail]
    );
    assert(Boolean(resetRecord), 'Password reset token record created in database');
    assert(resetRecord.used === 0, 'Reset token is initially unused (used = 0)');

    // Attempt reset with invalid token
    const badResetRes = await request({
      method: 'POST', path: '/api/auth/reset-password',
      body: { email: testEmail, token: 'invalid_token_xyz', newPassword: 'BrandNewPassword!456' }
    });
    assert(badResetRes.status === 400, 'Reset with invalid token returns HTTP 400');

    // Generate valid raw token matching DB salt and hash
    const testRawToken = 'test-token-' + crypto.randomBytes(16).toString('hex');
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = crypto.createHmac('sha256', secret).update(`${testRawToken}:${newSalt}`).digest('hex');
    await run(
      'UPDATE password_resets SET token_hash = ?, token_salt = ? WHERE id = ?',
      [newHash, newSalt, resetRecord.id]
    );

    const newPassword = 'BrandNewPassword!456';
    const goodResetRes = await request({
      method: 'POST', path: '/api/auth/reset-password',
      body: { email: testEmail, token: testRawToken, newPassword }
    });
    assert(goodResetRes.status === 200, 'POST /api/auth/reset-password with valid token returns HTTP 200 OK');

    const usedResetRecord = await get('SELECT * FROM password_resets WHERE id = ?', [resetRecord.id]);
    assert(usedResetRecord.used === 1, 'Reset token marked as used (used = 1)');

    // Verify user can log in with new password
    const newPassLoginRes = await request({
      method: 'POST', path: '/api/auth/login',
      body: { email: testEmail, password: newPassword }
    });
    assert(newPassLoginRes.status === 200, 'Login with updated password succeeds with HTTP 200');
    const newPassCookie = newPassLoginRes.headers['set-cookie'];
    userSessionCookie = Array.isArray(newPassCookie) ? newPassCookie[0].split(';')[0] : (typeof newPassCookie === 'string' ? newPassCookie.split(';')[0] : userSessionCookie);

    // ─── 5. USER PROFILE RETRIEVAL & UPDATES ───────────────────────────────────
    console.log('\n>>> [5/11] Testing User Profile Endpoints (GET & PUT /api/user/profile)...');

    // Unauthenticated access
    const unauthProfileRes = await request({ path: '/api/user/profile' });
    assert(unauthProfileRes.status === 401, 'Unauthenticated GET /api/user/profile returns 401 Unauthorized');

    // Authenticated profile retrieval
    const authProfileRes = await request({
      path: '/api/user/profile',
      headers: { Cookie: userSessionCookie }
    });
    assert(authProfileRes.status === 200, 'Authenticated GET /api/user/profile returns HTTP 200');
    assert(authProfileRes.json?.user?.name === 'Aarav Sharma', 'Profile returns correct user name');
    assert(authProfileRes.json?.user?.city === 'New Delhi', 'Profile returns correct user city');

    // Profile update
    const updateProfileRes = await request({
      method: 'PUT', path: '/api/user/profile',
      headers: { Cookie: userSessionCookie },
      body: {
        name: 'Aarav K. Sharma',
        phone: '9876543210',
        age: 25,
        city: 'Bengaluru'
      }
    });
    assert(updateProfileRes.status === 200, 'PUT /api/user/profile returns HTTP 200');
    assert(updateProfileRes.json?.user?.name === 'Aarav K. Sharma', 'Updated profile reflects new name');
    assert(updateProfileRes.json?.user?.city === 'Bengaluru', 'Updated profile reflects new city');
    assert(updateProfileRes.json?.user?.age === 25, 'Updated profile reflects new age');

    // ─── 6. RETURNING USER EVENT REGISTRATION (AUTO-FILL & SKIP OTP) ───────────
    console.log('\n>>> [6/11] Testing Returning User Event Registration & Skip OTP Flow...');

    // Open active event for registration
    await run("UPDATE events SET status = 'registration_open', reg_enabled = 1, registration_provider = 'internal' WHERE slug = 'online-open-mic-2026'");

    // Returning user registers for event: only provides performance details!
    const returningRegRes = await request({
      method: 'POST', path: '/api/registrations',
      headers: { Cookie: userSessionCookie },
      body: {
        category: 'Storytelling',
        performanceTitle: 'The Midnight Journey',
        performanceDescription: 'An original story about chasing dreams in the quiet hours.',
        instagram: 'aarav_tales',
        terms: true
      }
    });

    assert(returningRegRes.status === 201, 'Returning user registration returns HTTP 201 Created');
    assert(returningRegRes.json?.skipOtp === true, 'Returning user receives skipOtp = true');
    assert(returningRegRes.json?.status === 'VERIFIED', 'Returning user registration immediately status = VERIFIED');
    assert(Boolean(returningRegRes.json?.verificationToken), 'Returns signed verificationToken directly');
    const returningRegId = returningRegRes.json?.registrationId;
    const verificationToken = returningRegRes.json?.verificationToken;
    assert(Boolean(returningRegId), 'Returns unique registrationId');

    // Verify DB linkage
    const regInDb = await get('SELECT * FROM registrations WHERE registration_id = ?', [returningRegId]);
    assert(regInDb.user_id === registeredUserId, 'Registration is linked to user_id in database');
    assert(regInDb.full_name === 'Aarav K. Sharma', 'Registration auto-filled saved user name');
    assert(regInDb.email === testEmail, 'Registration auto-filled saved user email');
    assert(regInDb.city === 'Bengaluru', 'Registration auto-filled saved user city');
    assert(regInDb.age === 25, 'Registration saved user age snapshot');
    assert(regInDb.otp_verified === 1, 'Registration marked as otp_verified = 1');

    // ─── 7. DUPLICATE REGISTRATION PREVENTION ──────────────────────────────────
    console.log('\n>>> [7/11] Testing Duplicate Event Registration Prevention...');

    const duplicateRegRes = await request({
      method: 'POST', path: '/api/registrations',
      headers: { Cookie: userSessionCookie },
      body: {
        category: 'Poetry & Shayari',
        performanceTitle: 'Another Poem',
        terms: true
      }
    });
    assert(duplicateRegRes.status === 409, 'Duplicate event registration by same user returns HTTP 409 Conflict');

    // ─── 8. PAYMENT PROOF SUBMISSION & payment_status = 'SUBMITTED' ────────────
    console.log('\n>>> [8/11] Testing Payment Proof Submission & Status Transition...');

    const fakeScreenshot = {
      name: 'screenshot',
      filename: 'receipt.png',
      mimetype: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    };

    const utrNumber = `UTR${timestamp}`.substring(0, 16);
    const proofRes = await postMultipart(
      '/api/payments/submit-proof',
      {
        registrationId: returningRegId,
        transactionId: utrNumber,
        verificationToken
      },
      fakeScreenshot,
      { Cookie: userSessionCookie }
    );

    assert(proofRes.status === 200, 'POST /api/payments/submit-proof returns HTTP 200');
    assert(proofRes.json?.success === true, 'Payment proof submission succeeds');

    // Check DB payment_status is SUBMITTED
    const submittedReg = await get('SELECT * FROM registrations WHERE registration_id = ?', [returningRegId]);
    assert(submittedReg.transaction_id === utrNumber, 'Transaction ID stored in DB');
    assert(submittedReg.payment_status === 'SUBMITTED', 'Registration payment_status is updated to SUBMITTED');

    // ─── 9. SERVER ADMIN PAYMENT VERIFICATION & payment_status = 'PAID' ─────────
    console.log('\n>>> [9/11] Testing Server Admin Payment Verification & Approval...');

    // Admin login
    const adminLoginRes = await request({
      method: 'POST', path: '/api/admin/login',
      body: { email: config.ADMIN_EMAIL, password: 'R!SHI88_Admin' }
    });
    assert(adminLoginRes.status === 200, 'Admin login succeeds with HTTP 200');
    const adminCookie = Array.isArray(adminLoginRes.headers['set-cookie'])
      ? adminLoginRes.headers['set-cookie'][0].split(';')[0]
      : '';

    // Admin approve registration
    const approveRes = await request({
      method: 'POST', path: `/api/admin/approve/${returningRegId}`,
      headers: { Cookie: adminCookie }
    });
    assert(approveRes.status === 200, 'Admin approval returns HTTP 200 OK');

    // Verify DB payment_status is PAID and verified metadata is saved
    const approvedReg = await get('SELECT * FROM registrations WHERE registration_id = ?', [returningRegId]);
    assert(approvedReg.reg_status === 'APPROVED', 'Registration reg_status transitioned to APPROVED');
    assert(approvedReg.payment_status === 'PAID', 'Registration payment_status transitioned to PAID');
    assert(Boolean(approvedReg.payment_verified_at), 'payment_verified_at timestamp is recorded');
    assert(approvedReg.payment_verified_by === config.ADMIN_EMAIL, 'payment_verified_by records admin email');

    // ─── 10. USER REGISTRATIONS DASHBOARD & PAYMENT STATUS ─────────────────────
    console.log('\n>>> [10/11] Testing User Dashboard Registrations & Payment Status...');

    const userRegistrationsRes = await request({
      path: '/api/user/registrations',
      headers: { Cookie: userSessionCookie }
    });
    assert(userRegistrationsRes.status === 200, 'GET /api/user/registrations returns HTTP 200');
    assert(Array.isArray(userRegistrationsRes.json?.registrations), 'Returns registrations array');

    const matchedReg = userRegistrationsRes.json?.registrations?.find(r => r.registrationId === returningRegId);
    assert(Boolean(matchedReg), 'User registrations list contains the registered event');
    assert(matchedReg?.paymentStatus === 'PAID', 'Registration displays paymentStatus = PAID');
    assert(matchedReg?.status === 'APPROVED', 'Registration displays status = APPROVED');
    assert(matchedReg?.eventTitle !== undefined, 'Registration is enriched with event metadata');

    // ─── 11. HISTORICAL REGISTRATION PRESERVATION & LINKING SAFETY ─────────────
    console.log('\n>>> [11/11] Testing Historical Registration Safety & Backward Compatibility...');

    // Create an unlinked historical guest registration for another event
    const historicalRegId = `OC-HIST-${timestamp}`.substring(0, 14);
    await run(
      `INSERT INTO registrations (
         registration_id, event_id, full_name, phone, email, city,
         category, performance_title, amount, otp_verified, reg_status, payment_status,
         checked_in, certificate_eligible, user_id, created_at, updated_at
       ) VALUES (?, 'online-open-mic-2026', 'Historical Performer', '9876543210', ?, 'Delhi',
         'Poetry & Shayari', 'Old Memory', 79, 1, 'APPROVED', 'PAID',
         0, 1, NULL, datetime('now', '-30 days'), datetime('now', '-30 days'))`,
      [historicalRegId, testEmail]
    );

    // Fetch user registrations again — verified user should see their historical registration
    const enrichedHistoryRes = await request({
      path: '/api/user/registrations',
      headers: { Cookie: userSessionCookie }
    });
    const foundHistorical = enrichedHistoryRes.json?.registrations?.find(r => r.registrationId === historicalRegId);
    assert(Boolean(foundHistorical), 'Verified user account safely surfaces unlinked historical registration matching their email');
    assert(foundHistorical?.registrationId === historicalRegId, 'Historical registration ID matches');

    // Clean up ephemeral test artifacts from database/local_store
    try {
      await run('DELETE FROM users WHERE email = ?', [testEmail]);
      await run('DELETE FROM password_resets WHERE email = ?', [testEmail]);
      if (returningRegId) await run('DELETE FROM registrations WHERE registration_id = ?', [returningRegId]);
      if (historicalRegId) await run('DELETE FROM registrations WHERE registration_id = ?', [historicalRegId]);
    } catch (_) {}

    console.log('\n--------------------------------------------------------');
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log('--------------------------------------------------------\n');

    return failed === 0;

  } catch (err) {
    console.error('Fatal error in user auth test suite:', err);
    return false;
  }
}

if (require.main === module) {
  const app = require('../server/index');
  const server = app.listen(config.PORT, async () => {
    try {
      const ok = await runUserAuthAndFlowTests();
      server.close(() => process.exit(ok ? 0 : 1));
    } catch (err) {
      console.error(err);
      server.close(() => process.exit(1));
    }
  });
}

module.exports = runUserAuthAndFlowTests;
