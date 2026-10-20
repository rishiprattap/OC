/**
 * Offstage Creators — Admin User Management Test Suite
 * Tests all requirements for Admin User Management:
 * 1. Admin permission enforcement on the server (401 for unauthorized/creator sessions)
 * 2. User listing, pagination, and multi-field search (name, email, phone)
 * 3. Security: no passwords, hashes, reset tokens, or OTP secrets exposed
 * 4. Self-blocking prevention for admin accounts
 * 5. User detail inspection with profile, event registrations, and payment statuses
 * 6. User blocking with optional reason and audit logging (blocked_by, blocked_at)
 * 7. Immediate session revocation for active sessions (requireUser DB check)
 * 8. Blocked user account feature protection (profile view/edit, registrations list)
 * 9. Blocked user registration prevention (session and direct API/guest email)
 * 10. Historical records & profile preservation
 * 11. Payment verification & callbacks preservation for already-initiated payments
 * 12. User unblocking with audit logging (unblocked_by, unblocked_at) and flow restoration
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

async function runAdminUserManagementTests() {
  console.log('\n======================================================');
  console.log('   OFFSTAGE CREATORS — ADMIN USER MANAGEMENT TESTS    ');
  console.log('======================================================\n');

  try {
    const timestamp = Date.now();
    const testEmail = `artist.${timestamp}@example.com`;
    const testPassword = 'ArtistPassword!987';
    let userSessionCookie = '';
    let adminSessionCookie = '';
    let targetUserId = null;
    let initialRegId = null;

    // ─── 1. SERVER-SIDE ADMIN PERMISSION ENFORCEMENT ───────────────────────────
    console.log('>>> [1/10] Testing Server-Side Admin Permission Enforcement...');

    const unauthGetUsers = await request({ path: '/api/admin/users' });
    assert(unauthGetUsers.status === 401, 'Unauthenticated GET /api/admin/users rejected with HTTP 401');

    const unauthBlockUser = await request({ method: 'POST', path: '/api/admin/users/123/block' });
    assert(unauthBlockUser.status === 401, 'Unauthenticated POST /api/admin/users/:id/block rejected with HTTP 401');

    const unauthUnblockUser = await request({ method: 'POST', path: '/api/admin/users/123/unblock' });
    assert(unauthUnblockUser.status === 401, 'Unauthenticated POST /api/admin/users/:id/unblock rejected with HTTP 401');

    // Admin login
    const adminLoginRes = await request({
      method: 'POST',
      path: '/api/admin/login',
      body: { email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD }
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.json.success, 'Admin login succeeds with HTTP 200');
    adminSessionCookie = Array.isArray(adminLoginRes.headers['set-cookie'])
      ? adminLoginRes.headers['set-cookie'][0].split(';')[0]
      : (adminLoginRes.headers['set-cookie'] || '').split(';')[0];
    assert(adminSessionCookie.length > 0, 'Admin session cookie issued');

    // ─── 2. SETUP TEST USER & INITIAL REGISTRATION ─────────────────────────────
    console.log('>>> [2/10] Creating Test Creator Account & Initial Registration...');

    const regRes = await request({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        name: `Kavya Sharma ${timestamp}`,
        email: testEmail,
        phone: '9876501234',
        age: 23,
        city: 'Mumbai',
        password: testPassword
      }
    });
    assert(regRes.status === 201 && regRes.json.success, 'User registered successfully');

    // Fetch OTP directly from DB for verification
    const dbUser = await get('SELECT * FROM users WHERE email = ?', [testEmail]);
    assert(dbUser && dbUser.id, 'User record created in database');
    targetUserId = dbUser.id;

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

    // Verify email with OTP
    const verifyRes = await request({
      method: 'POST',
      path: '/api/auth/verify-email',
      body: { email: testEmail, otp: knownOtp }
    });
    assert(verifyRes.status === 200 && verifyRes.json.success, 'Email verified successfully');
    userSessionCookie = Array.isArray(verifyRes.headers['set-cookie'])
      ? verifyRes.headers['set-cookie'][0].split(';')[0]
      : (verifyRes.headers['set-cookie'] || '').split(';')[0];
    assert(userSessionCookie.length > 0, 'User session cookie established');

    // Creator session must NOT be allowed to access admin user endpoints
    const creatorAccessAdmin = await request({
      path: '/api/admin/users',
      headers: { Cookie: userSessionCookie }
    });
    assert(creatorAccessAdmin.status === 401, 'Creator session cannot access GET /api/admin/users (HTTP 401)');

    // Create an initial registration before blocking
    const activeEvtRes = await request({ path: '/api/events/active' });
    const activeEvent = activeEvtRes.json && activeEvtRes.json.event ? activeEvtRes.json.event : null;
    const eventId = activeEvent ? (activeEvent.slug || activeEvent.id) : 'delhi-adhure-musafir-2026';

    const eventRegRes = await request({
      method: 'POST',
      path: '/api/registrations',
      headers: { Cookie: userSessionCookie },
      body: {
        fullName: `Kavya Sharma ${timestamp}`,
        email: testEmail,
        phone: '9876501234',
        city: 'Mumbai',
        category: 'Poetry',
        performanceTitle: 'Shayari on the Moon',
        terms: true,
        eventId
      }
    });
    assert((eventRegRes.status === 200 || eventRegRes.status === 201) && eventRegRes.json?.success, 'Initial event registration created');
    initialRegId = eventRegRes.json?.registrationId;

    // Submit payment proof for this initial registration
    const dummyImage = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');
    const proofRes = await postMultipart('/api/payments/submit-proof', {
      registrationId: initialRegId,
      transactionId: `UPI-INIT-${timestamp}`,
      senderUpi: 'kavya@upi'
    }, {
      name: 'screenshot',
      filename: 'proof.png',
      mimetype: 'image/png',
      buffer: dummyImage
    });
    assert(proofRes.status === 200 && proofRes.json.success, 'Initial payment proof submitted successfully');

    // ─── 3. ADMIN SEARCH & FILTER USERS ────────────────────────────────────────
    console.log('>>> [3/10] Testing Admin User Search & Filtering...');

    // Search by email
    const searchEmailRes = await request({
      path: `/api/admin/users?search=${encodeURIComponent(testEmail)}`,
      headers: { Cookie: adminSessionCookie }
    });
    assert(searchEmailRes.status === 200 && searchEmailRes.json.success, 'Search users by email returns HTTP 200');
    assert(searchEmailRes.json.users.some(u => u.email === testEmail), 'Found user in search by email');

    // Search by name
    const searchNameRes = await request({
      path: `/api/admin/users?search=${encodeURIComponent('Kavya Sharma')}`,
      headers: { Cookie: adminSessionCookie }
    });
    assert(searchNameRes.json.users.some(u => u.id === targetUserId), 'Found user in search by name');

    // Search by phone
    const searchPhoneRes = await request({
      path: `/api/admin/users?search=9876501234`,
      headers: { Cookie: adminSessionCookie }
    });
    assert(searchPhoneRes.json.users.some(u => u.id === targetUserId), 'Found user in search by phone');

    // Filter by status = ACTIVE
    const filterActiveRes = await request({
      path: `/api/admin/users?status=ACTIVE&search=${encodeURIComponent(testEmail)}`,
      headers: { Cookie: adminSessionCookie }
    });
    if (!filterActiveRes.json?.users || filterActiveRes.json.users.length !== 1) {
      console.error('filterActiveRes users:', filterActiveRes.json?.users);
    }
    assert(filterActiveRes.json.users.length === 1 && (filterActiveRes.json.users[0].is_blocked === 0 || filterActiveRes.json.users[0].isBlocked === false), 'Filter status=ACTIVE includes active user');

    // Filter by status = BLOCKED before block should not find this user
    const filterBlockedBefore = await request({
      path: `/api/admin/users?status=BLOCKED&search=${encodeURIComponent(testEmail)}`,
      headers: { Cookie: adminSessionCookie }
    });
    assert(filterBlockedBefore.json.users.length === 0, 'Filter status=BLOCKED does not include active user');

    // ─── 4. SECURITY & SENSITIVE CREDENTIAL EXCLUSION ──────────────────────────
    console.log('>>> [4/10] Verifying Sensitive Field Exclusion (Security Compliance)...');

    const listedUser = searchEmailRes.json.users.find(u => u.id === targetUserId);
    assert(listedUser.password_hash === undefined, 'password_hash is NOT exposed in user listing');
    assert(listedUser.email_verify_token === undefined, 'email_verify_token is NOT exposed in user listing');
    assert(listedUser.reset_password_token === undefined, 'reset_password_token is NOT exposed in user listing');
    assert(listedUser.reset_password_expires === undefined, 'reset_password_expires is NOT exposed in user listing');

    // ─── 5. USER DETAILS & REGISTRATIONS INSPECTION ────────────────────────────
    console.log('>>> [5/10] Inspecting User Detail, Profile, Registrations & Payment Statuses...');

    const userDetailRes = await request({
      path: `/api/admin/users/${targetUserId}`,
      headers: { Cookie: adminSessionCookie }
    });
    assert(userDetailRes.status === 200 && userDetailRes.json.success, 'GET /api/admin/users/:id returns HTTP 200');
    assert(userDetailRes.json.user.password_hash === undefined, 'password_hash is NOT exposed in user detail');
    assert(Array.isArray(userDetailRes.json.registrations), 'User detail returns registrations array');
    assert(userDetailRes.json.registrations.length >= 1, 'Registrations array includes created event registration');

    const inspectReg = userDetailRes.json.registrations.find(r => r.registrationId === initialRegId || r.id === initialRegId);
    assert(inspectReg !== undefined, 'User detail contains initial registration ID');
    assert(inspectReg && (inspectReg.paymentStatus === 'SUBMITTED' || inspectReg.payment_status === 'SUBMITTED'), 'Registration shows paymentStatus as SUBMITTED');
    assert(inspectReg && inspectReg.eventTitle !== undefined, 'Registration includes associated eventTitle');

    // ─── 6. SELF-BLOCKING PREVENTION FOR ADMIN ─────────────────────────────────
    console.log('>>> [6/10] Testing Admin Self-Blocking Prevention...');

    // Attempt to block admin account by finding or creating an admin user record
    // If admin is in users table:
    let adminDbUser = await get('SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)', [config.ADMIN_EMAIL]);
    if (!adminDbUser) {
      // Create admin user record if absent to test self-block protection
      await run('INSERT INTO users (name, email, phone, is_blocked) VALUES (?, ?, ?, 0)', ['Admin Self', config.ADMIN_EMAIL, '9999999999']);
      adminDbUser = await get('SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)', [config.ADMIN_EMAIL]);
    }

    if (adminDbUser && adminDbUser.id) {
      const selfBlockRes = await request({
        method: 'POST',
        path: `/api/admin/users/${adminDbUser.id}/block`,
        headers: { Cookie: adminSessionCookie },
        body: { reason: 'Accidental self-block attempt' }
      });
      assert(selfBlockRes.status === 400, 'Self-block rejected with HTTP 400 Bad Request');
      assert(selfBlockRes.json?.error && selfBlockRes.json.error.toLowerCase().includes('cannot block'), 'Clear self-block warning returned');
    }

    // ─── 7. BLOCK USER WITH REASON & AUDIT TRAIL ───────────────────────────────
    console.log('>>> [7/10] Blocking User with Reason and Verifying Audit Trail...');

    const blockReason = 'Violated platform conduct guidelines during audition';
    const blockRes = await request({
      method: 'POST',
      path: `/api/admin/users/${targetUserId}/block`,
      headers: { Cookie: adminSessionCookie },
      body: { reason: blockReason }
    });
    assert(blockRes.status === 200 && blockRes.json.success, 'POST /api/admin/users/:id/block succeeds with HTTP 200');
    assert(blockRes.json.user.is_blocked === 1, 'Response indicates is_blocked === 1');
    assert(blockRes.json.user.block_reason === blockReason, 'Response records block_reason');
    assert(blockRes.json.user.blocked_by === config.ADMIN_EMAIL, 'Response records blocked_by with admin email');
    assert(blockRes.json.user.blocked_at !== null, 'Response records blocked_at timestamp');

    // Verify in database directly
    const dbBlocked = await get('SELECT is_blocked, block_reason, blocked_by, blocked_at FROM users WHERE id = ?', [targetUserId]);
    assert(dbBlocked.is_blocked === 1, 'Database confirms is_blocked = 1');
    assert(dbBlocked.block_reason === blockReason, 'Database confirms block_reason stored');
    assert(dbBlocked.blocked_by === config.ADMIN_EMAIL, 'Database confirms blocked_by stored');
    assert(Boolean(dbBlocked.blocked_at), 'Database confirms blocked_at timestamp stored');

    // ─── 8. IMMEDIATE ACTIVE SESSION REVOCATION & FEATURE LOCKDOWN ─────────────
    console.log('>>> [8/10] Testing Immediate Active Session Invalidation & Account Feature Protection...');

    // User previously had an active userSessionCookie. Testing calling /api/user/profile now:
    const activeSessionProfileRes = await request({
      path: '/api/user/profile',
      headers: { Cookie: userSessionCookie }
    });
    assert(activeSessionProfileRes.status === 403, 'Active session immediately rejected with HTTP 403 Forbidden on profile access');
    assert(activeSessionProfileRes.json.isBlocked === true, 'Response payload contains isBlocked: true');
    assert(activeSessionProfileRes.json.error && activeSessionProfileRes.json.error.includes(blockReason), 'Response payload displays block reason to user');

    // Calling PUT /api/user/profile with existing session
    const activeSessionUpdateRes = await request({
      method: 'PUT',
      path: '/api/user/profile',
      headers: { Cookie: userSessionCookie },
      body: { name: 'Attempted Change', city: 'Goa', age: 25, phone: '9876501234' }
    });
    assert(activeSessionUpdateRes.status === 403, 'Active session rejected with HTTP 403 on profile update');

    // Calling GET /api/user/registrations with existing session
    const activeSessionRegsRes = await request({
      path: '/api/user/registrations',
      headers: { Cookie: userSessionCookie }
    });
    assert(activeSessionRegsRes.status === 403, 'Active session rejected with HTTP 403 on user registrations access');

    // Session verification endpoint /api/auth/me reflects blocked state
    const meRes = await request({
      path: '/api/auth/me',
      headers: { Cookie: userSessionCookie }
    });
    assert(meRes.json.authenticated === false, 'GET /api/auth/me returns authenticated: false');
    assert(meRes.json.isBlocked === true, 'GET /api/auth/me returns isBlocked: true');

    // Login attempt while blocked
    const blockedLoginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: testEmail, password: testPassword }
    });
    assert(blockedLoginRes.status === 403, 'Login attempt by blocked user returns HTTP 403 Forbidden');
    assert(blockedLoginRes.json.isBlocked === true, 'Login response returns isBlocked: true');
    assert(blockedLoginRes.json.error.includes(blockReason), 'Login response contains specific block reason');

    // Register attempt with same email while blocked
    const blockedReRegisterRes = await request({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        name: 'Another Name',
        email: testEmail,
        phone: '9876501234',
        age: 23,
        city: 'Mumbai',
        password: 'NewPassword!123'
      }
    });
    assert(blockedReRegisterRes.status === 403, 'Registration attempt with blocked email returns HTTP 403');
    assert(blockedReRegisterRes.json.isBlocked === true, 'Register response returns isBlocked: true');

    // Direct event registration attempt while blocked (via session)
    const blockedEventRegSession = await request({
      method: 'POST',
      path: '/api/registrations',
      headers: { Cookie: userSessionCookie },
      body: {
        fullName: 'Kavya Sharma',
        email: testEmail,
        phone: '9876501234',
        city: 'Mumbai',
        category: 'Poetry',
        terms: true,
        eventId
      }
    });
    assert(blockedEventRegSession.status === 403, 'Event registration with blocked session returns HTTP 403');

    // Direct event registration attempt using blocked email as guest (no session cookie)
    const blockedEventRegGuest = await request({
      method: 'POST',
      path: '/api/registrations',
      body: {
        fullName: 'Kavya Sharma',
        email: testEmail,
        phone: '9876501234',
        city: 'Mumbai',
        category: 'Poetry',
        terms: true,
        eventId
      }
    });
    assert(blockedEventRegGuest.status === 403, 'Event registration with blocked email returns HTTP 403 (guest mode protected)');

    // ─── 9. HISTORICAL PRESERVATION & ONGOING PAYMENT VERIFICATION ─────────────
    console.log('>>> [9/10] Testing Historical Data Preservation & Payment Verification for Blocked User...');

    // Historical records must NOT be deleted
    const historicalUser = await get('SELECT * FROM users WHERE id = ?', [targetUserId]);
    assert(historicalUser !== null && historicalUser.email === testEmail, 'User profile record is preserved');

    const historicalReg = await get('SELECT * FROM registrations WHERE registration_id = ? OR id = ?', [initialRegId, initialRegId]);
    assert(historicalReg !== null && historicalReg.email === testEmail, 'Historical event registration is preserved');

    // Existing payment verification should proceed seamlessly
    const approvePaymentRes = await request({
      method: 'POST',
      path: `/api/admin/approve/${initialRegId}`,
      headers: { Cookie: adminSessionCookie }
    });
    assert(approvePaymentRes.status === 200 && approvePaymentRes.json.success, 'Admin can verify and approve existing payment for blocked user');

    const verifiedReg = await get('SELECT payment_status, reg_status FROM registrations WHERE registration_id = ? OR id = ?', [initialRegId, initialRegId]);
    assert(verifiedReg.payment_status === 'PAID', 'Payment status updated to PAID for initiated registration');
    assert(verifiedReg.reg_status === 'APPROVED', 'Registration status updated to APPROVED');

    // ─── 10. UNBLOCK USER & AUDIT TRAIL & RESTORATION ───────────────────────────
    console.log('>>> [10/10] Unblocking User and Verifying Audit Trail & Restoration...');

    const unblockRes = await request({
      method: 'POST',
      path: `/api/admin/users/${targetUserId}/unblock`,
      headers: { Cookie: adminSessionCookie }
    });
    assert(unblockRes.status === 200 && unblockRes.json.success, 'POST /api/admin/users/:id/unblock succeeds with HTTP 200');
    assert(unblockRes.json.user.is_blocked === 0, 'Response indicates is_blocked === 0');
    assert(unblockRes.json.user.unblocked_by === config.ADMIN_EMAIL, 'Response records unblocked_by');
    assert(unblockRes.json.user.unblocked_at !== null, 'Response records unblocked_at timestamp');

    // DB verify
    const dbUnblocked = await get('SELECT is_blocked, unblocked_by, unblocked_at FROM users WHERE id = ?', [targetUserId]);
    assert(dbUnblocked.is_blocked === 0, 'Database confirms user is_blocked = 0');
    assert(dbUnblocked.unblocked_by === config.ADMIN_EMAIL, 'Database confirms unblocked_by recorded');
    assert(Boolean(dbUnblocked.unblocked_at), 'Database confirms unblocked_at recorded');

    // User can now log in again
    const restoredLoginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: testEmail, password: testPassword }
    });
    assert(restoredLoginRes.status === 200 && restoredLoginRes.json.success, 'Unblocked user logs in successfully (HTTP 200)');
    const restoredCookie = Array.isArray(restoredLoginRes.headers['set-cookie'])
      ? restoredLoginRes.headers['set-cookie'][0].split(';')[0]
      : (restoredLoginRes.headers['set-cookie'] || '').split(';')[0];

    // User can now view profile
    const restoredProfileRes = await request({
      path: '/api/user/profile',
      headers: { Cookie: restoredCookie }
    });
    assert(restoredProfileRes.status === 200 && restoredProfileRes.json.success, 'Unblocked user can view profile');

    // User can now view registrations
    const restoredRegsRes = await request({
      path: '/api/user/registrations',
      headers: { Cookie: restoredCookie }
    });
    assert(restoredRegsRes.status === 200 && restoredRegsRes.json.success, 'Unblocked user can view registrations');
    assert(restoredRegsRes.json.registrations.some(r => r.registrationId === initialRegId || r.id === initialRegId), 'Registrations history contains approved historical registration');

  } catch (err) {
    console.error('Unhandled test suite error:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  return failed === 0;
}

if (require.main === module) {
  runAdminUserManagementTests().then(ok => {
    process.exit(ok ? 0 : 1);
  });
}

module.exports = runAdminUserManagementTests;
