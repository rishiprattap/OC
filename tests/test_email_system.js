const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { get, run } = require('../server/db');

function request(options, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: process.env.PORT || 3000,
      headers: { ...headers },
      ...options
    };

    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });

    req.on('error', reject);

    if (data) {
      if (Buffer.isBuffer(data) || typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

function createMultipartFormData(fields, fileField) {
  const boundary = '----EmailSystemTestBoundary' + Date.now().toString(16);
  const CRLF = '\r\n';
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}${value}${CRLF}`
    ));
  }

  if (fileField) {
    const header = `--${boundary}${CRLF}Content-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"${CRLF}Content-Type: ${fileField.contentType}${CRLF}${CRLF}`;
    chunks.push(Buffer.from(header));
    chunks.push(fileField.data);
    chunks.push(Buffer.from(CRLF));
  }

  chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

  const payload = Buffer.concat(chunks);
  return {
    payload,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length
    }
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runEmailTests() {
  console.log('=== STARTING COMPLETE GMAIL SMTP & EMAIL VERIFICATION SYSTEM TESTS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${message}`);
      failed++;
    }
  }

  const adminSecret = process.env.ADMIN_SECRET || 'offstage_admin_secret_placeholder';

  try {
    // Test 1: Admin SMTP Health Check API
    const healthRes = await request(
      {
        path: '/api/admin/email/health-check',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
      },
      { sendTestMessage: false }
    );
    assert(healthRes.status === 200 && healthRes.json.success === true, 'SMTP Health Check verifies Gmail connection (HTTP 200)');
    assert(healthRes.json.smtp.host === 'smtp.gmail.com', 'SMTP Host verified as smtp.gmail.com');
    assert(healthRes.json.smtp.user === 'offstagecreators77@gmail.com', 'Authenticated user is offstagecreators77@gmail.com');

    // Test 2: Register participant -> Creates registration with email_verified = 0
    const rand = Math.floor(1000 + Math.random() * 9000);
    const testEmail = `performer.${rand}@example.com`;
    const regRes = await request(
      {
        path: '/api/registrations',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'Kavya Verma',
        phone: '98' + rand + '4321',
        email: testEmail,
        city: 'New Delhi',
        category: 'Storytelling',
        performanceTitle: 'Dilli Ki Dhoop',
        terms: true
      }
    );

    assert(regRes.status === 201, 'Registration created with HTTP 201');
    assert(regRes.json.needsVerification === true, 'Registration reports needsVerification: true');
    assert(regRes.json.emailVerified === false, 'Registration starts with emailVerified: false');
    const regId = regRes.json.registrationId;

    // Test 3: Check database stores hashed OTP and salt, never plain text
    const dbRecord = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    assert(dbRecord.email_verified === 0, 'Database confirms email_verified is 0');
    assert(dbRecord.email_otp_hash && dbRecord.email_otp_hash.length === 64, 'OTP is stored as a 64-char SHA256 hash');
    assert(dbRecord.email_otp_salt && dbRecord.email_otp_salt.length === 32, 'Salt is securely stored with OTP');
    assert(new Date(dbRecord.email_otp_expires_at) > new Date(), 'OTP expiration set in future (10m)');

    // Test 4: Attempting to submit payment proof BEFORE email verification is blocked
    const dummyImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const unverifiedProof = createMultipartFormData(
      { registrationId: regId, transactionId: 'UPI' + Date.now() },
      { name: 'screenshot', filename: 'test.png', contentType: 'image/png', data: dummyImageBuffer }
    );
    const blockedProofRes = await request(
      { path: '/api/payments/submit-proof', method: 'POST' },
      unverifiedProof.payload,
      unverifiedProof.headers
    );
    assert(blockedProofRes.status === 403, 'Payment proof submission blocked when email is not verified (HTTP 403)');
    assert(blockedProofRes.json.error.includes('Email verification required'), 'Error explicitly mentions email verification requirement');

    // Test 5: Invalid OTP is rejected and attempt counter increments
    const invalidOtpRes = await request(
      {
        path: '/api/email/verify-otp',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { registrationId: regId, otp: '000000' }
    );
    assert(invalidOtpRes.status === 400, 'Invalid OTP rejected with HTTP 400');
    const recordAfterFailed = await get(`SELECT email_verification_attempts FROM registrations WHERE registration_id = ?`, [regId]);
    assert(recordAfterFailed.email_verification_attempts === 1, 'Verification attempt counter incremented in database');

    // Test 6: Valid OTP verification succeeds
    const { hashOtp } = require('../server/services/email');
    const knownOtp = '123456';
    const knownSalt = dbRecord.email_otp_salt;
    const knownHash = hashOtp(knownOtp, knownSalt);
    await run(`UPDATE registrations SET email_otp_hash = ? WHERE registration_id = ?`, [knownHash, regId]);

    const validOtpRes = await request(
      {
        path: '/api/email/verify-otp',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { registrationId: regId, otp: knownOtp }
    );
    assert(validOtpRes.status === 200 && validOtpRes.json.emailVerified === true, 'Valid OTP verifies email successfully (HTTP 200)');

    const verifiedRecord = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    assert(verifiedRecord.email_verified === 1, 'Database confirms email_verified = 1');
    assert(verifiedRecord.email_verified_at !== null, 'Database records email_verified_at timestamp');
    assert(verifiedRecord.email_otp_hash === null, 'OTP hash cleared from database after verification');

    // Test 7: Submit payment proof now succeeds with verified email
    const testUtr = 'UTR' + Date.now();
    const verifiedProof = createMultipartFormData(
      { registrationId: regId, transactionId: testUtr },
      { name: 'screenshot', filename: 'verified_proof.png', contentType: 'image/png', data: dummyImageBuffer }
    );
    const submitProofRes = await request(
      { path: '/api/payments/submit-proof', method: 'POST' },
      verifiedProof.payload,
      verifiedProof.headers
    );
    assert(submitProofRes.status === 200, 'Payment proof submitted successfully now that email is verified');
    assert(submitProofRes.json.paymentStatus === 'PENDING_VERIFICATION', 'Status transitioned to PENDING_VERIFICATION');

    // Test 8: Check email_logs for Payment Proof and Admin Notification
    const proofLogs = await request(
      {
        path: '/api/admin/email-logs',
        method: 'GET',
        headers: { 'x-admin-secret': adminSecret }
      }
    );
    assert(proofLogs.status === 200, 'Admin can access email_logs');
    assert(proofLogs.json.logs.length >= 1, 'Email audit logs recorded deliveries');

    // Test 9: Admin verifies payment -> Sends payment approval & confirmation emails
    const verifyPayRes = await request(
      {
        path: '/api/admin/verify-payment',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
      },
      { registrationId: regId, adminName: 'Organizer' }
    );
    assert(verifyPayRes.status === 200 && verifyPayRes.json.paymentStatus === 'PAID', 'Admin verifies payment to PAID');

    const paidRecord = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    assert(paidRecord.payment_status === 'PAID', 'Database confirms registration is PAID');
    assert(paidRecord.payment_verified_by === 'Organizer', 'Database tracks payment_verified_by');

    // Test 10: Admin Resend Email endpoint
    await sleep(1500);
    const resendRes = await request(
      {
        path: '/api/admin/email/resend',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
      },
      { registrationId: regId, emailType: 'REGISTRATION_CONFIRMED' }
    );
    assert(resendRes.status === 200 && resendRes.json.success === true, 'Admin can resend transactional emails on demand');

    // Test 11: Scanner check-in sends check-in confirmation email
    const checkinRes = await request(
      {
        path: '/api/scanner/check-in',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { registrationId: regId }
    );
    assert(checkinRes.status === 200 && checkinRes.json.success === true, 'Venue check-in confirms participant');

    // Test 12: Certificate portal unlocks and triggers certificate available email
    const certRes = await request(
      {
        path: '/api/certificate/verify',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { registrationId: regId }
    );
    assert(certRes.status === 200, 'Certificate verification succeeds for checked-in participant');

    // Test 13: Rejection email flow on second registration
    const reg2Res = await request(
      {
        path: '/api/registrations',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        fullName: 'Devansh Roy',
        phone: '97' + rand + '9999',
        email: `devansh.${rand}@example.com`,
        city: 'Jaipur',
        category: 'Poetry & Shayari',
        performanceTitle: 'Khamoshiyan',
        terms: true
      }
    );
    const reg2Id = reg2Res.json.registrationId;
    await run(`UPDATE registrations SET email_verified = 1 WHERE registration_id = ?`, [reg2Id]);
    const reg2Proof = createMultipartFormData(
      { registrationId: reg2Id, transactionId: 'UTR_REJECT_' + rand },
      { name: 'screenshot', filename: 'reject.png', contentType: 'image/png', data: dummyImageBuffer }
    );
    await request({ path: '/api/payments/submit-proof', method: 'POST' }, reg2Proof.payload, reg2Proof.headers);

    const rejectRes = await request(
      {
        path: '/api/admin/reject-payment',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
      },
      { registrationId: reg2Id, reason: 'Payment screenshot blurred; transaction unreadable.' }
    );
    assert(rejectRes.status === 200 && rejectRes.json.paymentStatus === 'REJECTED', 'Admin reject payment succeeds and triggers rejection email');

    const reg2Db = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [reg2Id]);
    assert(reg2Db.rejection_reason === 'Payment screenshot blurred; transaction unreadable.', 'Rejection reason preserved in database');

    // Test 14: Security - Credentials protection
    const configRes = await request({ path: '/api/config', method: 'GET' });
    assert(configRes.body.includes('password') === false, 'Public API config does NOT contain password');
    assert(configRes.body.includes(process.env.MAIL_PASSWORD || 'secret') === false, 'App Password never exposed in public API config');

    console.log(`\n======================================================`);
    console.log(`EMAIL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log(`======================================================\n`);

    return failed === 0;

  } catch (err) {
    console.error('Test suite error:', err);
    return false;
  }
}

if (require.main === module) {
  runEmailTests().then(success => process.exit(success ? 0 : 1));
}

module.exports = runEmailTests;
