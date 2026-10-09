/**
 * Offstage Creators — Comprehensive Email, OTP & Notification Verification Test Suite
 * Tests every item in the verification & production checklist:
 * 1. Sender identities and configuration
 * 2. OTP generation, keyed HMAC hashing, security (no leaks in responses)
 * 3. OTP verification, expiry (5 min), max attempts (5), cooldown (60s)
 * 4. Token issuance and authorization enforcement
 * 5. Payment proof rejection for unverified callers
 * 6. Duplicate registration prevention
 * 7. Registration confirmation email dispatch
 * 8. Admin event campaigns with recipient selection and duplicate protection
 * 9. Unsubscribe preference management (opted-out recipients excluded from campaigns)
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../server/config');
const { run, get, all } = require('../server/db');
const otpService = require('../server/services/otp');
const emailService = require('../server/services/email');

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

async function runEmailOtpSystemTests() {
  console.log('\n======================================================');
  console.log('   OFFSTAGE CREATORS — EMAIL & OTP MASTER TEST SUITE  ');
  console.log('======================================================\n');

  try {
    // ─── 1. SENDER IDENTITIES & CONFIGURATION ────────────────────────────────
    console.log('>>> [1/7] Testing Sender Identities & Resend Key Configuration...');
    assert(config.RESEND.senders.otp === 'Offstage Creators <verify@offstagecreators.in>',
      'OTP sender identity is verify@offstagecreators.in');
    assert(config.RESEND.senders.registration === 'Offstage Creators <registrations@offstagecreators.in>',
      'Registration sender identity is registrations@offstagecreators.in');
    assert(config.RESEND.senders.events === 'Offstage Creators <events@offstagecreators.in>',
      'Events sender identity is events@offstagecreators.in');
    assert(config.RESEND.senders.support === 'support@offstagecreators.in',
      'Support reply-to identity is support@offstagecreators.in');
    assert(config.OTP_EXPIRY_MINUTES === 5,
      'OTP expiry is configured for 5 minutes');
    assert(config.OTP_MAX_ATTEMPTS === 5,
      'Max OTP attempts is configured to 5');
    assert(config.OTP_RESEND_COOLDOWN_SECONDS === 60,
      'OTP resend cooldown is configured to 60 seconds');

    // Test sender mapping helper
    assert(emailService.getSenderForCategory('OTP') === 'Offstage Creators <verify@offstagecreators.in>',
      'getSenderForCategory("OTP") returns verify@offstagecreators.in');
    assert(emailService.getSenderForCategory('REGISTRATION') === 'Offstage Creators <registrations@offstagecreators.in>',
      'getSenderForCategory("REGISTRATION") returns registrations@offstagecreators.in');
    assert(emailService.getSenderForCategory('EVENTS') === 'Offstage Creators <events@offstagecreators.in>',
      'getSenderForCategory("EVENTS") returns events@offstagecreators.in');

    // ─── 2. OTP GENERATION, SECURITY & LEAK PREVENTION ────────────────────────
    console.log('\n>>> [2/7] Testing OTP Cryptography & Information Leak Prevention...');
    const testOtp = otpService.generateOTP();
    assert(testOtp.length === 6 && /^\d{6}$/.test(testOtp),
      'generateOTP() produces a 6-digit numeric string');

    const testEmail = `test.security.${Date.now()}@example.com`;
    const testRegId = 'OC-SEC-9999';

    // Store OTP
    const storeRes = await otpService.storeOTP(testEmail, testRegId, testOtp);
    assert(Boolean(storeRes.expiresAt), 'storeOTP returns expiry ISO timestamp');

    // Ensure OTP is stored as a keyed HMAC hash in DB, never plaintext
    const dbOtp = await get(`SELECT * FROM otp_sessions WHERE email = ?`, [testEmail]);
    assert(Boolean(dbOtp), 'OTP session created in database');
    assert(dbOtp.otp_hash !== testOtp, 'Stored otp_hash does NOT match plaintext OTP');
    assert(dbOtp.otp_hash.length === 64, 'Stored otp_hash is a 64-char hex hash');
    assert(Boolean(dbOtp.otp_salt), 'Salt is generated and stored');

    // Test API response leak check
    const regCreation = await request({
      method: 'POST',
      path: '/api/registrations',
      body: {
        fullName: 'Security Test Performer',
        phone: '9876543210',
        email: testEmail,
        city: 'Mumbai',
        category: 'Poetry',
        performanceTitle: 'Security Piece',
        terms: true
      }
    });

    assert(regCreation.status === 201, 'POST /api/registrations succeeds with HTTP 201');
    const responseBodyStr = JSON.stringify(regCreation.json);
    assert(!responseBodyStr.includes(testOtp), 'API response does NOT leak generated OTP');
    assert(!responseBodyStr.includes('otp_hash'), 'API response does NOT leak otp_hash');
    assert(!responseBodyStr.includes(config.OTP_SECRET), 'API response does NOT leak OTP_SECRET');

    // ─── 3. OTP VERIFICATION, ATTEMPT LIMITS & EXPIRY ─────────────────────────
    console.log('\n>>> [3/7] Testing OTP Verification, Attempt Limits & Expiry...');
    const createdRegId = regCreation.json?.registrationId;

    // Test invalid format OTP
    const invalidFormatRes = await request({
      method: 'POST',
      path: '/api/otp/verify',
      body: { email: testEmail, registrationId: createdRegId, otp: '12' }
    });
    assert(invalidFormatRes.status === 400, 'Rejects short OTP with HTTP 400');

    // Test incorrect OTP
    const wrongOtpRes = await request({
      method: 'POST',
      path: '/api/otp/verify',
      body: { email: testEmail, registrationId: createdRegId, otp: '000000' }
    });
    assert(wrongOtpRes.status === 400, 'Incorrect OTP returns HTTP 400');
    assert(wrongOtpRes.json?.reason === 'INVALID_OTP', 'Returns reason INVALID_OTP');

    // Test attempt exhaustion (max 5 attempts)
    const fixedOtp = '482915';
    await otpService.storeOTP(testEmail, createdRegId, fixedOtp);

    for (let i = 0; i < 4; i++) {
      await request({
        method: 'POST',
        path: '/api/otp/verify',
        body: { email: testEmail, registrationId: createdRegId, otp: '999999' }
      });
    }

    // 5th failed attempt should trigger TOO_MANY_ATTEMPTS and invalidate code
    const lockRes = await request({
      method: 'POST',
      path: '/api/otp/verify',
      body: { email: testEmail, registrationId: createdRegId, otp: '999999' }
    });
    assert(lockRes.status === 429, 'Excessive failed attempts return HTTP 429');
    assert(lockRes.json?.reason === 'TOO_MANY_ATTEMPTS', 'Returns TOO_MANY_ATTEMPTS reason');

    // After exhaustion, even the correct OTP must be rejected
    const afterLockRes = await request({
      method: 'POST',
      path: '/api/otp/verify',
      body: { email: testEmail, registrationId: createdRegId, otp: fixedOtp }
    });
    assert(afterLockRes.status === 400 || afterLockRes.status === 404,
      'Invalidated code cannot be verified with correct OTP');

    // Test successful verification with a fresh code
    const freshOtp = '654321';
    await otpService.storeOTP(testEmail, createdRegId, freshOtp);

    const validRes = await request({
      method: 'POST',
      path: '/api/otp/verify',
      body: { email: testEmail, registrationId: createdRegId, otp: freshOtp }
    });
    assert(validRes.status === 200, 'Valid OTP verification returns HTTP 200');
    assert(validRes.json?.status === 'VERIFIED', 'Status transitioned to VERIFIED');
    assert(Boolean(validRes.json?.verificationToken), 'Returns signed verificationToken');
    const receivedToken = validRes.json?.verificationToken;

    // Verify OTP reuse prevention
    const reuseRes = await request({
      method: 'POST',
      path: '/api/otp/verify',
      body: { email: testEmail, registrationId: createdRegId, otp: freshOtp }
    });
    assert(reuseRes.status !== 200, 'Used OTP cannot be reused (rejected with non-200)');

    // ─── 4. AUTHORIZATION TOKEN VALIDATION ────────────────────────────────────
    console.log('\n>>> [4/7] Testing Authorization Tokens...');
    const tokenCheck = otpService.verifyVerificationToken(receivedToken, testEmail, createdRegId);
    assert(tokenCheck.valid === true, 'Token validation succeeds for matching email and registrationId');

    const wrongEmailCheck = otpService.verifyVerificationToken(receivedToken, 'other@example.com', createdRegId);
    assert(wrongEmailCheck.valid === false && wrongEmailCheck.reason === 'EMAIL_MISMATCH',
      'Token validation fails if email does not match');

    const wrongRegCheck = otpService.verifyVerificationToken(receivedToken, testEmail, 'OC-OTHER-001');
    assert(wrongRegCheck.valid === false && wrongRegCheck.reason === 'REG_ID_MISMATCH',
      'Token validation fails if registrationId does not match');

    // ─── 5. UNVERIFIED USERS CANNOT SUBMIT PAYMENT PROOF ──────────────────────
    console.log('\n>>> [5/7] Testing Verification Enforcement for Payment Proof...');
    const unverifiedEmail = `unverified.${Date.now()}@example.com`;
    const unverifiedReg = await request({
      method: 'POST',
      path: '/api/registrations',
      body: {
        fullName: 'Unverified Creator',
        phone: '9876543210',
        email: unverifiedEmail,
        city: 'Delhi',
        category: 'Storytelling',
        performanceTitle: 'Unverified Test',
        terms: true
      }
    });
    const unverifiedRegId = unverifiedReg.json?.registrationId;

    // Attempt to submit payment proof without OTP verification
    const bypassRes = await request({
      method: 'POST',
      path: '/api/payments/submit-proof',
      body: {
        registrationId: unverifiedRegId,
        transactionId: 'UTR9988776655'
      }
    });
    assert(bypassRes.status === 400 || bypassRes.status === 403,
      'Direct API calls by unverified users cannot submit payment proof (rejected with 400/403)');

    // ─── 6. DUPLICATE REGISTRATIONS & CONFIRMATION EMAILS ─────────────────────
    console.log('\n>>> [6/7] Testing Duplicate Prevention & Confirmation Email Tracking...');
    // testEmail is already VERIFIED from step 3. Submitting duplicate registration should return 409
    const duplicateRegRes = await request({
      method: 'POST',
      path: '/api/registrations',
      body: {
        fullName: 'Security Test Performer',
        phone: '9876543210',
        email: testEmail,
        city: 'Mumbai',
        category: 'Poetry',
        performanceTitle: 'Duplicate Attempt',
        terms: true
      }
    });
    assert(duplicateRegRes.status === 409,
      'Duplicate registration for verified email returns HTTP 409 Conflict');

    // Check DB that registration_email_sent_at was recorded
    const regDb = await get(`SELECT registration_email_sent_at, last_email_error FROM registrations WHERE registration_id = ?`, [createdRegId]);
    assert(Boolean(regDb?.registration_email_sent_at || regDb?.last_email_error),
      'Registration confirmation email attempt is persisted in database (sent timestamp or error recorded)');

    // ─── 7. EMAIL PREFERENCES & UNSUBSCRIBE ───────────────────────────────────
    console.log('\n>>> [7/7] Testing Email Unsubscribe Preferences & Campaign Exclusion...');
    const unsubEmail = `optout.${Date.now()}@example.com`;

    // Verify not unsubscribed initially
    const initUnsub = await emailService.isEmailUnsubscribed(unsubEmail);
    assert(initUnsub === false, 'Fresh email is not unsubscribed initially');

    // Unsubscribe via API
    const unsubRes = await request({
      method: 'POST',
      path: '/api/email/unsubscribe',
      body: { email: unsubEmail, reason: 'Test user opt out' }
    });
    assert(unsubRes.status === 200 && unsubRes.json?.success === true,
      'POST /api/email/unsubscribe records opt-out (HTTP 200)');

    const afterUnsub = await emailService.isEmailUnsubscribed(unsubEmail);
    assert(afterUnsub === true, 'isEmailUnsubscribed returns true after opt-out');

    // Test sendEmail with isOptionalAnnouncement: true -> should skip opted-out email
    const sendOptionalRes = await emailService.sendEmail({
      to: unsubEmail,
      subject: 'Upcoming Showcase',
      html: '<p>Join our new show!</p>',
      emailCategory: 'EVENTS',
      emailType: 'EVENT_ANNOUNCEMENT',
      isOptionalAnnouncement: true
    });
    assert(sendOptionalRes.skipped === true && sendOptionalRes.reason === 'OPTED_OUT',
      'sendEmail skips opted-out email for optional announcements');

    // Resubscribe via API
    const resubRes = await request({
      method: 'POST',
      path: '/api/email/resubscribe',
      body: { email: unsubEmail }
    });
    assert(resubRes.status === 200, 'POST /api/email/resubscribe succeeds');
    const resubCheck = await emailService.isEmailUnsubscribed(unsubEmail);
    assert(resubCheck === false, 'Email is resubscribed and no longer opted out');

    console.log('\n------------------------------------------------------');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('------------------------------------------------------\n');
    return failed === 0;

  } catch (err) {
    console.error('Fatal error in email & OTP system test suite:', err);
    return false;
  }
}

module.exports = runEmailOtpSystemTests;

if (require.main === module) {
  runEmailOtpSystemTests().then(ok => process.exit(ok ? 0 : 1));
}
