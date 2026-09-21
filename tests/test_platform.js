const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

// Multipart FormData helper for testing screenshot upload
function createMultipartFormData(fields, fileField) {
  const boundary = '----OffstageCreatorsBoundary' + Date.now().toString(16);
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

async function runTests() {
  console.log('=== STARTING MANUAL UPI PAYMENT & EVENT VERIFICATION SYSTEM TESTS ===\n');
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

  try {
    // Test 1: Config API returns genuine UPI details
    const configRes = await request({ path: '/api/config', method: 'GET' });
    assert(configRes.status === 200, 'Config API returns 200 OK');
    const upiId = configRes.json.upi.upiId || configRes.json.upi.id;
    const qrPath = configRes.json.upi.qrAssetPath || configRes.json.upi.qr;
    assert(upiId === 'preetiyadav15071985@okaxis', 'UPI ID is preetiyadav15071985@okaxis');
    assert(configRes.json.upi.amount === 79, 'UPI payment amount is strictly ₹79');
    assert(qrPath === '/assets/payment-qr.jpeg', 'Verified payment QR asset path configured');

    // Test 2: Homepage loads with Event #1 first, ₹79 fee, and no "Coming Soon"
    const homeRes = await request({ path: '/', method: 'GET' });
    assert(homeRes.status === 200, 'Homepage returns 200 OK');
    assert(homeRes.body.includes('Online<br><span>Open Mic</span>'), 'Online Open Mic headline present on homepage');
    const openMicIndex = homeRes.body.indexOf('Online<br><span>Open Mic</span>');
    const delhiIndex = homeRes.body.indexOf('Adhure<br><span>Musafir</span>');
    assert(openMicIndex > 0 && delhiIndex > openMicIndex, 'Event #1 (Online Open Mic) appears BEFORE Event #2 (Delhi Show)');
    assert(homeRes.body.includes('₹79'), '₹79 registration fee displayed on homepage');
    const hasComingSoon = /next open mic.*coming soon/i.test(homeRes.body) || /slots opening soon/i.test(homeRes.body);
    assert(!hasComingSoon, 'Completely free of "Coming Soon" or "Slots opening soon" text for Open Mic');

    // Test 3: Register participant -> payment_status = PENDING
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const testPhone = '98' + randomSuffix + '1234';
    const regPayload = {
      fullName: 'Aarav Sharma',
      phone: testPhone,
      email: `aarav.${randomSuffix}@example.com`,
      city: 'Delhi',
      category: 'Poetry & Shayari',
      instagram: 'aarav_sharma',
      performanceTitle: 'Dastaan-e-Dil',
      performanceDescription: 'Urdu nazm with acoustic background.',
      terms: true
    };

    const regRes = await request(
      { path: '/api/registrations', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      regPayload
    );

    assert(regRes.status === 201, 'Participant registration created with HTTP 201');
    assert(regRes.json && regRes.json.registrationId, `Registration ID generated: ${regRes.json?.registrationId}`);
    assert(regRes.json && regRes.json.amount === 79, 'Amount is exactly ₹79');
    assert(regRes.json.upi && regRes.json.upi.id === 'preetiyadav15071985@okaxis', 'Returns verified UPI details');

    const regId = regRes.json.registrationId;

    // Test 4: Registration status is initially PENDING
    const initialLookup = await request({ path: `/api/registrations/${regId}`, method: 'GET' });
    assert(initialLookup.status === 200, 'Registration retrieved');
    assert(initialLookup.json.registration.paymentStatus === 'PENDING', 'Initial payment status is PENDING');

    // Test 5: Scanner lookup blocks check-in for PENDING registration
    const scanBlocked = await request(
      { path: '/api/scanner/lookup', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { code: regId }
    );
    assert(scanBlocked.status === 200, 'Scanner successfully located registration');
    assert(scanBlocked.json.participant.canCheckIn === false, 'canCheckIn is false for unpaid registration');
    assert(scanBlocked.json.participant.statusText === 'PAYMENT NOT SUBMITTED', 'Scanner indicates payment not submitted');

    // Test 6: Check-in endpoint rejects unpaid registration
    const checkinBlocked = await request(
      { path: '/api/scanner/check-in', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { registrationId: regId }
    );
    assert(checkinBlocked.status === 400, 'Scanner check-in rejected unpaid participant (HTTP 400)');
    assert(checkinBlocked.json.error.includes('PAYMENT NOT VERIFIED'), 'Error message states PAYMENT NOT VERIFIED');

    // Test 6b: Email OTP Verification Step
    const { get: dbGet, run: dbRun } = require('../server/db');
    const { hashOtp } = require('../server/services/email');
    const regRecord = await dbGet(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    const knownOtp = '654321';
    const testHash = hashOtp(knownOtp, regRecord.email_otp_salt);
    await dbRun(`UPDATE registrations SET email_otp_hash = ? WHERE registration_id = ?`, [testHash, regId]);

    const verifyOtpRes = await request(
      { path: '/api/email/verify-otp', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { registrationId: regId, otp: knownOtp }
    );
    assert(verifyOtpRes.status === 200 && verifyOtpRes.json.emailVerified === true, 'Email successfully verified via 6-digit OTP');

    // Test 7: Submit UPI Payment Proof (UTR + Screenshot)
    const dummyImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const testUtr = 'UPI' + Date.now();

    const formData = createMultipartFormData(
      {
        registrationId: regId,
        transactionId: testUtr
      },
      {
        name: 'screenshot',
        filename: 'payment_screenshot.png',
        contentType: 'image/png',
        data: dummyImageBuffer
      }
    );

    const submitProofRes = await request(
      { path: '/api/payments/submit-proof', method: 'POST' },
      formData.payload,
      formData.headers
    );

    assert(submitProofRes.status === 200, 'Payment proof submitted successfully (HTTP 200)');
    assert(submitProofRes.json.paymentStatus === 'PENDING_VERIFICATION', 'Status transitioned to PENDING_VERIFICATION');
    assert(submitProofRes.json.transactionId === testUtr, 'UTR recorded correctly');
    assert(submitProofRes.json.screenshotUrl && submitProofRes.json.screenshotUrl.startsWith('/uploads/screenshots/'), 'Screenshot saved to persistent storage');

    // Test 8: Duplicate UTR reuse prevention
    const reg2Res = await request(
      { path: '/api/registrations', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      {
        fullName: 'Sneha Patel',
        phone: '99' + randomSuffix + '8877',
        email: `sneha.${randomSuffix}@example.com`,
        city: 'Mumbai',
        category: 'Standup Comedy',
        terms: true
      }
    );
    const reg2Id = reg2Res.json.registrationId;
    await dbRun(`UPDATE registrations SET email_verified = 1 WHERE registration_id = ?`, [reg2Id]);

    const dupFormData = createMultipartFormData(
      {
        registrationId: reg2Id,
        transactionId: testUtr
      },
      {
        name: 'screenshot',
        filename: 'duplicate_test.png',
        contentType: 'image/png',
        data: dummyImageBuffer
      }
    );

    const dupSubmitRes = await request(
      { path: '/api/payments/submit-proof', method: 'POST' },
      dupFormData.payload,
      dupFormData.headers
    );
    assert(dupSubmitRes.status === 409, 'Duplicate UTR reuse blocked across registrations (HTTP 409 Conflict)');

    // Test 9: Admin overview reports awaiting verification
    const adminSecret = process.env.ADMIN_SECRET || 'offstage_admin_secret_placeholder';
    const adminOverviewRes = await request({
      path: '/api/admin/overview',
      method: 'GET',
      headers: { 'x-admin-secret': adminSecret }
    });
    assert(adminOverviewRes.status === 200, 'Admin overview loads with valid admin key');
    assert(adminOverviewRes.json.stats.awaitingVerification >= 1, 'Awaiting verification count reflects pending submission');

    // Test 10: Admin pending payments queue contains submission
    const pendingQueueRes = await request({
      path: '/api/admin/pending-payments',
      method: 'GET',
      headers: { 'x-admin-secret': adminSecret }
    });
    assert(pendingQueueRes.status === 200, 'Admin pending payments queue retrieved');
    const queueItem = pendingQueueRes.json.queue.find((q) => q.registration_id === regId);
    assert(queueItem !== undefined, 'Target registration found in pending verification queue');
    assert(queueItem.transaction_id === testUtr, 'UTR in admin queue matches submission');

    // Test 11: Admin approves payment (VERIFY PAYMENT)
    const verifyPaymentRes = await request(
      {
        path: '/api/admin/verify-payment',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
      },
      { registrationId: regId, adminName: 'Chief Organizer' }
    );
    assert(verifyPaymentRes.status === 200, 'Admin successfully verified payment (HTTP 200)');
    assert(verifyPaymentRes.json.paymentStatus === 'PAID', 'Payment status is now PAID');

    // Test 12: Registration lookup confirms PAID status
    const verifiedLookup = await request({ path: `/api/registrations/${regId}`, method: 'GET' });
    assert(verifiedLookup.json.registration.paymentStatus === 'PAID', 'Registration record is now confirmed PAID in database');

    // Test 13: Privacy-protected status lookup with Reg ID + Phone
    const statusLookupRes = await request(
      { path: '/api/registrations/status-lookup', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { registrationId: regId, phone: testPhone }
    );
    assert(statusLookupRes.status === 200, 'Status lookup succeeds with ID and Phone');
    assert(statusLookupRes.json.registration.statusLabel === 'PAYMENT CONFIRMED', 'Status label returns PAYMENT CONFIRMED');

    // Test 14: Scanner lookup now allows entry
    const scanAllowed = await request(
      { path: '/api/scanner/lookup', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { code: regId }
    );
    assert(scanAllowed.status === 200, 'Scanner lookup succeeds');
    assert(scanAllowed.json.participant.canCheckIn === true, 'Participant is now eligible to check in');
    assert(scanAllowed.json.participant.statusText === 'READY FOR ENTRY', 'Status is READY FOR ENTRY');

    // Test 15: Venue check-in succeeds
    const checkinSuccess = await request(
      { path: '/api/scanner/check-in', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { registrationId: regId }
    );
    assert(checkinSuccess.status === 200, 'Venue check-in successfully recorded (HTTP 200)');
    assert(checkinSuccess.json.success === true, 'Check-in confirmed');

    // Test 16: Duplicate check-in blocked
    const duplicateCheckin = await request(
      { path: '/api/scanner/check-in', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { registrationId: regId }
    );
    assert(duplicateCheckin.status === 409, 'Duplicate check-in blocked with HTTP 409 Conflict');
    assert(duplicateCheckin.json.error.includes('ALREADY CHECKED IN'), 'Shows ALREADY CHECKED IN error');

    // Test 17: Certificate generation unlocked after PAID + CHECKED IN
    const certVerifyRes = await request(
      { path: '/api/certificate/verify', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      { registrationId: regId }
    );
    assert(certVerifyRes.status === 200, 'Certificate verification succeeds for participant after payment + attendance');
    assert(certVerifyRes.json.verifiedName === 'Aarav Sharma', 'Certificate verified name matches participant');

    // Test 18: Admin Rejection flow on second registration
    const reg2Proof = createMultipartFormData(
      { registrationId: reg2Id, transactionId: 'FAKE_UTR_9999' },
      { name: 'screenshot', filename: 'fake.png', contentType: 'image/png', data: dummyImageBuffer }
    );
    await request({ path: '/api/payments/submit-proof', method: 'POST' }, reg2Proof.payload, reg2Proof.headers);

    const rejectRes = await request(
      {
        path: '/api/admin/reject-payment',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
      },
      { registrationId: reg2Id, reason: 'UTR could not be matched with bank statement', adminName: 'Organizer' }
    );
    assert(rejectRes.status === 200, 'Admin can reject invalid payment with custom reason');
    assert(rejectRes.json.paymentStatus === 'REJECTED', 'Status marked as REJECTED');

    const reg2Lookup = await request({ path: `/api/registrations/${reg2Id}`, method: 'GET' });
    assert(reg2Lookup.json.registration.rejectionReason === 'UTR could not be matched with bank statement', 'Rejection reason saved in record');

    // Test 19: Security - Admin endpoints reject unauthenticated requests
    const unauthAdmin = await request({ path: '/api/admin/pending-payments', method: 'GET' });
    assert(unauthAdmin.status === 401, 'Admin endpoint strictly rejects unauthenticated requests (HTTP 401)');

    // Test 20: Admin CSV Export contains full manual payment audit trail
    const csvExport = await request({
      path: `/api/admin/export-csv?secret=${adminSecret}`,
      method: 'GET'
    });
    assert(csvExport.status === 200, 'CSV export generated');
    assert(csvExport.body.includes('UPI Transaction ID / UTR'), 'CSV includes UTR column header');
    assert(csvExport.body.includes(testUtr), 'CSV contains submitted participant UTR');

    console.log(`\n=============================================`);
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log(`=============================================`);

    return failed === 0;

  } catch (err) {
    console.error('Test suite error:', err);
    return false;
  }
}

if (require.main === module) {
  runTests().then(success => process.exit(success ? 0 : 1));
}

module.exports = runTests;
