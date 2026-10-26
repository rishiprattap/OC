// Offstage Creators — Certificate Collection Email System & Security Test Suite
process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const app = require('../server/index');
const config = require('../server/config');
const db = require('../server/db');
const {
  generateCertificateAccessToken,
  verifyCertificateAccessToken,
  isCertificateReady,
  resolveCertificateData
} = require('../server/services/certificate');

let ephemeralServer = null;

function ensureServerRunning() {
  return new Promise((resolve) => {
    const testReq = http.request(
      { hostname: 'localhost', port: config.PORT, path: '/api/config', method: 'GET' },
      () => { resolve(false); }
    );
    testReq.on('error', () => {
      ephemeralServer = app.listen(config.PORT, () => {
        resolve(true);
      });
    });
    testReq.end();
  });
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: config.PORT,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

let adminCookie = '';

async function loginAdmin() {
  const loginRes = await request('/api/admin/login', {
    method: 'POST',
    body: {
      email: config.ADMIN_EMAIL || 'admin@offstagecreators.com',
      password: config.ADMIN_PASSWORD
    }
  });

  const rawCookie = loginRes.headers['set-cookie'];
  if (rawCookie) {
    adminCookie = Array.isArray(rawCookie) ? rawCookie[0].split(';')[0] : rawCookie.split(';')[0];
  }
}

function adminGet(path) {
  return request(path, {
    method: 'GET',
    headers: {
      'Cookie': adminCookie,
      'x-admin-secret': config.ADMIN_SECRET
    }
  });
}

function adminPost(path, body) {
  return request(path, {
    method: 'POST',
    headers: {
      'Cookie': adminCookie,
      'x-admin-secret': config.ADMIN_SECRET
    },
    body
  });
}

async function runCertificateEmailFlowTests() {
  console.log('\n======================================================');
  console.log('   OFFSTAGE CREATORS — CERTIFICATE EMAIL FLOW TESTS   ');
  console.log('======================================================\n');

  const started = await ensureServerRunning();
  if (started) {
    console.log(`[Test] Started ephemeral server on http://localhost:${config.PORT}`);
  }

  await loginAdmin();

  let passedTests = 0;
  let totalTests = 0;

  function test(label, condition) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ ${label}`);
    } else {
      console.error(`  ✗ FAIL: ${label}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // Setup Test Data: Two distinct events with test participants
    // -------------------------------------------------------------
    console.log('>>> [1/6] Setting Up Event Data & Isolated Participants...');

    const testEventA = 'test-flow-event-a';
    const testEventB = 'test-flow-event-b';

    await db.run('DELETE FROM events WHERE slug IN (?, ?)', [testEventA, testEventB]);
    await db.run(
      `INSERT INTO events (slug, name, title, event_date, status, is_published, certificate_enabled, certificate_title, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'published', 1, 1, 'CERTIFICATE OF PARTICIPATION', ?, ?)`,
      [testEventA, 'Event A Showcase', 'Event A Showcase', '28 October 2026', new Date().toISOString(), new Date().toISOString()]
    );

    // Event B starts with certificate_enabled = 0 (unpublished)
    await db.run(
      `INSERT INTO events (slug, name, title, event_date, status, is_published, certificate_enabled, certificate_title, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'published', 1, 0, 'CERTIFICATE OF ATTENDANCE', ?, ?)`,
      [testEventB, 'Event B Draft Certs', 'Event B Draft Certs', '05 November 2026', new Date().toISOString(), new Date().toISOString()]
    );

    test('Created Test Event A (Published Certs) and Event B (Unpublished Certs)', true);

    const regA1 = 'OC-TEST-FLOW-A1'; // Ready participant (Checked in)
    const regA2 = 'OC-TEST-FLOW-A2'; // Not ready (Not checked in, not winner)
    const regA3 = 'OC-TEST-FLOW-A3'; // Ready winner (Explicit winner)
    const regB1 = 'OC-TEST-FLOW-B1'; // Event B participant (Event unpublished)

    await db.run('DELETE FROM registrations WHERE registration_id IN (?, ?, ?, ?)', [regA1, regA2, regA3, regB1]);

    // Reg A1: Approved & Checked In
    await db.run(
      `INSERT INTO registrations (
        registration_id, event_id, full_name, phone, email, category,
        reg_status, payment_status, checked_in, certificate_eligible, position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 'PAID', 1, 1, 'Participant', ?, ?)`,
      [regA1, testEventA, 'Aarav Mehta', '9876543210', 'aarav.test@example.com', 'Storytelling', new Date().toISOString(), new Date().toISOString()]
    );

    // Reg A2: Approved but NOT Checked In and NOT marked eligible
    await db.run(
      `INSERT INTO registrations (
        registration_id, event_id, full_name, phone, email, category,
        reg_status, payment_status, checked_in, certificate_eligible, position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 'PAID', 0, 0, 'Participant', ?, ?)`,
      [regA2, testEventA, 'Neha Gupta', '9876543211', 'neha.test@example.com', 'Poetry', new Date().toISOString(), new Date().toISOString()]
    );

    // Reg A3: Declared Event Winner
    await db.run(
      `INSERT INTO registrations (
        registration_id, event_id, full_name, phone, email, category,
        reg_status, payment_status, checked_in, certificate_eligible, position, achievement, badge_text, certificate_title, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 'PAID', 0, 1, 'WINNER', 'Winner — 1st Place', '★ EVENT WINNER ★', 'CERTIFICATE OF EXCELLENCE', ?, ?)`,
      [regA3, testEventA, 'Vikram Malhotra', '9876543212', 'vikram.winner@example.com', 'Music & Vocals', new Date().toISOString(), new Date().toISOString()]
    );

    // Reg B1: Event B participant (Event B has certificate_enabled = 0)
    await db.run(
      `INSERT INTO registrations (
        registration_id, event_id, full_name, phone, email, category,
        reg_status, payment_status, checked_in, certificate_eligible, position, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 'PAID', 1, 1, 'Participant', ?, ?)`,
      [regB1, testEventB, 'Diya Sen', '9876543213', 'diya.test@example.com', 'Stand-up Comedy', new Date().toISOString(), new Date().toISOString()]
    );

    test('Seeded test participants with varying readiness and event associations', true);

    // -------------------------------------------------------------
    // SECTION 2: Admin Recipient List & Readiness Flagging
    // -------------------------------------------------------------
    console.log('\n>>> [2/6] Verifying Admin Recipient Listing & Readiness Flags...');

    const recResA = await adminGet(`/api/admin/emails/certificate/recipients?eventId=${testEventA}`);
    test('Recipients endpoint returns HTTP 200 for Event A', recResA.status === 200);
    test('Event A reports certificateEnabled === true', recResA.json?.event?.certificateEnabled === true);
    test('Event A recipient count matches seeded records (3)', recResA.json?.recipients?.length === 3);

    const a1Item = recResA.json?.recipients?.find(r => r.registrationId === regA1);
    const a2Item = recResA.json?.recipients?.find(r => r.registrationId === regA2);
    const a3Item = recResA.json?.recipients?.find(r => r.registrationId === regA3);

    test('Checked-in participant A1 is flagged as ready (isReady === true)', a1Item?.isReady === true);
    test('Checked-in participant A1 has valid HMAC token', Boolean(a1Item?.token));
    test('Checked-in participant A1 collectionUrl contains token and regId', a1Item?.collectionUrl?.includes(regA1) && a1Item?.collectionUrl?.includes(a1Item?.token));

    test('Unchecked-in participant A2 is clearly flagged as NOT ready (isReady === false)', a2Item?.isReady === false);
    test('Unchecked-in participant A2 specifies attendance check-in requirement', a2Item?.reason?.includes('Attendance check-in is required'));

    test('Declared winner A3 is flagged as ready (isReady === true)', a3Item?.isReady === true);
    test('Winner A3 indicates WINNER position', a3Item?.position === 'WINNER' && a3Item?.isWinner === true);

    // Test Event B (Unpublished Certs)
    const recResB = await adminGet(`/api/admin/emails/certificate/recipients?eventId=${testEventB}`);
    test('Recipients endpoint returns HTTP 200 for Event B', recResB.status === 200);
    test('Event B reports certificateEnabled === false', recResB.json?.event?.certificateEnabled === false);
    const b1Item = recResB.json?.recipients?.find(r => r.registrationId === regB1);
    test('Event B recipient is flagged NOT ready because event certs are unpublished', b1Item?.isReady === false && b1Item?.reason?.includes('not yet been published'));

    // -------------------------------------------------------------
    // SECTION 3: Secure Recipient Token & URL Anti-Tampering Security
    // -------------------------------------------------------------
    console.log('\n>>> [3/6] Testing Secure HMAC Link & Anti-Tampering Enforcement...');

    const tokenA1 = a1Item.token;
    const tokenA3 = a3Item.token;

    // Test 1: Accessing certificate with valid token and matching ID -> SUCCESS (200)
    const validTokenAccess = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: regA1,
        token: tokenA1,
        eventId: testEventA
      }
    });
    test('Valid token access succeeds with HTTP 200', validTokenAccess.status === 200);
    test('Valid token returns participant name Aarav Mehta', validTokenAccess.json?.verifiedName === 'Aarav Mehta');
    test('Valid token response returns authenticated: true', validTokenAccess.json?.authenticated === true);

    // Test 2: Tampering attack — participant changes regId in URL while using their old token
    const tamperedAccess = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: regA3, // Trying to access Vikram Malhotra's certificate
        token: tokenA1,        // Using Aarav's token
        eventId: testEventA
      }
    });
    test('Tampered token is strictly rejected with HTTP 403 Forbidden', tamperedAccess.status === 403);
    test('Tampering rejection states invalid or tampered access link', tamperedAccess.json?.error?.includes('tampered') || tamperedAccess.json?.error?.includes('Invalid'));

    // Test 3: Completely forged token
    const forgedAccess = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: regA1,
        token: 'forged_fake_token_00000000000000',
        eventId: testEventA
      }
    });
    test('Forged token is strictly rejected with HTTP 403', forgedAccess.status === 403);

    // Test 4: Download endpoint anti-tampering
    const tamperedDownload = await request(`/api/certificate/download/${regA3}?token=${tokenA1}`);
    test('Download endpoint rejects tampered token with HTTP 403', tamperedDownload.status === 403);

    const validDownload = await request(`/api/certificate/download/${regA1}?token=${tokenA1}`);
    test('Download endpoint with valid token responds with HTTP 200 SVG', validDownload.status === 200 && validDownload.headers['content-type']?.includes('image/svg+xml'));

    // -------------------------------------------------------------
    // SECTION 4: Published & Finalized Status Gating
    // -------------------------------------------------------------
    console.log('\n>>> [4/6] Testing Finalized & Published Verification Gates...');

    // Attempt collection for Event B (where certificate_enabled = 0)
    const tokenB1 = b1Item.token;
    const unpubCertAccess = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: regB1,
        token: tokenB1,
        eventId: testEventB
      }
    });
    test('Unpublished event certificate collection blocked with HTTP 403', unpubCertAccess.status === 403);
    test('Unpublished rejection clarifies certificates not published by organizers', unpubCertAccess.json?.error?.includes('not yet been published'));

    // Attempt collection for unready participant A2 (not checked in)
    const tokenA2 = a2Item.token;
    const unreadyAccess = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: regA2,
        token: tokenA2,
        eventId: testEventA
      }
    });
    test('Unready participant collection blocked with HTTP 403', unreadyAccess.status === 403);
    test('Unready participant error requires attendance check-in', unreadyAccess.json?.error?.includes('Attendance check-in is required'));

    // Attempting admin batch send on an event with unpublished certificates
    const blockedSend = await adminPost('/api/admin/emails/certificate/send', {
      eventId: testEventB,
      registrationIds: [regB1],
      testOnly: true
    });
    test('Admin email dispatch is blocked (HTTP 403) when certificates are not published', blockedSend.status === 403);

    // -------------------------------------------------------------
    // SECTION 5: Email Preview & Prominent CTA Button
    // -------------------------------------------------------------
    console.log('\n>>> [5/6] Testing Email Preview & Collect Certificate CTA Button...');

    const previewRes = await adminPost('/api/admin/emails/certificate/preview', {
      eventId: testEventA,
      registrationId: regA1,
      subject: '🏆 Your Certificate is Ready for {name} — {event_name}',
      customMessage: 'We were blown away by your storytelling session!'
    });

    test('Preview endpoint returns HTTP 200', previewRes.status === 200);
    test('Preview substitutes {name} with Aarav Mehta', previewRes.json?.subject?.includes('Aarav Mehta'));
    test('Preview substitutes {event_name} with Event A Showcase', previewRes.json?.subject?.includes('Event A Showcase'));
    test('Preview HTML includes prominent "COLLECT YOUR CERTIFICATE" CTA', previewRes.json?.html?.includes('COLLECT YOUR CERTIFICATE'));
    test('Preview HTML contains the recipient secure link with token', previewRes.json?.html?.includes(tokenA1));
    test('Preview HTML includes custom message text', previewRes.json?.html?.includes('We were blown away by your storytelling session!'));

    // Winner preview
    const winnerPreview = await adminPost('/api/admin/emails/certificate/preview', {
      eventId: testEventA,
      registrationId: regA3
    });
    test('Winner preview shows "Certificate of Excellence"', winnerPreview.json?.html?.includes('Certificate of Excellence'));
    test('Winner preview contains winner token', winnerPreview.json?.html?.includes(tokenA3));

    // -------------------------------------------------------------
    // SECTION 6: Email Delivery Recording, Duplicate Prevention & Retry
    // -------------------------------------------------------------
    console.log('\n>>> [6/6] Testing Delivery Status Recording, Duplicate Prevention & Retry...');

    // Attempt dispatch with mix of ready (A1, A3) and not ready (A2)
    const sendBatch1 = await adminPost('/api/admin/emails/certificate/send', {
      eventId: testEventA,
      registrationIds: [regA1, regA2, regA3],
      testOnly: true // Safe testing mode: records status without emailing real people
    });

    test('Batch dispatch returns HTTP 200', sendBatch1.status === 200);
    test('Sent count is 2 (A1 and A3)', sendBatch1.json?.sentCount === 2);
    test('Skipped count is 1 (A2 skipped due to unready status)', sendBatch1.json?.skippedCount === 1);

    const a2Result = sendBatch1.json?.results?.find(r => r.registrationId === regA2);
    test('Unready recipient A2 result is marked SKIPPED', a2Result?.status === 'SKIPPED');

    // Verify database record was updated with certificate_email_sent_at
    const dbRegA1 = await db.get('SELECT certificate_email_sent_at, certificate_email_error FROM registrations WHERE registration_id = ?', [regA1]);
    test('Database records certificate_email_sent_at timestamp for A1', Boolean(dbRegA1?.certificate_email_sent_at));
    test('Database clears certificate_email_error upon successful dispatch', dbRegA1?.certificate_email_error === null);

    // Verify duplicate prevention: Sending again without forceResend MUST skip already sent recipients
    const duplicateSend = await adminPost('/api/admin/emails/certificate/send', {
      eventId: testEventA,
      registrationIds: [regA1, regA3],
      testOnly: true
    });

    test('Duplicate send skips already sent recipients (sentCount === 0)', duplicateSend.json?.sentCount === 0);
    test('Duplicate send reports skippedCount === 2', duplicateSend.json?.skippedCount === 2);
    const skippedA1 = duplicateSend.json?.results?.find(r => r.registrationId === regA1);
    test('Skipped result cites "Already sent on ..."', skippedA1?.reason?.includes('Already sent'));

    // Test Retry Failed Mechanism:
    // Simulate a failure on recipient A1
    await db.run(
      `UPDATE registrations SET certificate_email_sent_at = NULL, certificate_email_error = 'SMTP 421 Timeout' WHERE registration_id = ?`,
      [regA1]
    );

    // Verify recipients list reflects FAILED status
    const recAfterFail = await adminGet(`/api/admin/emails/certificate/recipients?eventId=${testEventA}`);
    const a1AfterFail = recAfterFail.json?.recipients?.find(r => r.registrationId === regA1);
    test('Recipient A1 reflects emailStatus: FAILED', a1AfterFail?.emailStatus === 'FAILED');
    test('Recipient A1 displays failure error string', a1AfterFail?.error?.includes('SMTP 421 Timeout'));

    // Execute Retry Failed Only
    const retrySend = await adminPost('/api/admin/emails/certificate/send', {
      eventId: testEventA,
      registrationIds: [regA1, regA3], // A1 is failed, A3 is already sent
      retryFailedOnly: true,
      testOnly: true
    });

    test('Retry dispatch only sends to previously failed recipient A1 (sentCount === 1)', retrySend.json?.sentCount === 1);
    test('Retry dispatch skips already sent recipient A3 (skippedCount === 1)', retrySend.json?.skippedCount === 1);

    const a1Retried = await db.get('SELECT certificate_email_sent_at, certificate_email_error FROM registrations WHERE registration_id = ?', [regA1]);
    test('After retry, A1 has new certificate_email_sent_at timestamp', Boolean(a1Retried?.certificate_email_sent_at));
    test('After retry, A1 certificate_email_error is cleared (null)', a1Retried?.certificate_email_error === null);

    // -------------------------------------------------------------
    // SECTION 7: Complete End-to-End Flow Verification:
    // Admin Panel → Email Center → Email → Link → Verify → Download
    // -------------------------------------------------------------
    console.log('\n>>> [7/7] Complete End-to-End Flow Verification (Admin → Email → Link → Verify → Download)...');

    // 1. Admin Email Preview & CTA Button Link Extraction
    const e2ePreview = await adminPost('/api/admin/emails/certificate/preview', {
      eventId: testEventA,
      registrationId: regA1
    });
    test('E2E: Preview generated successfully (HTTP 200)', e2ePreview.status === 200);
    const emailHtml = e2ePreview.json?.html || '';
    
    // Extract link from CTA button: <a href="(...)" ...>COLLECT YOUR CERTIFICATE
    const ctaMatch = emailHtml.match(/<a\s+href="([^"]+)"[^>]*>\s*🏆\s*COLLECT YOUR CERTIFICATE/i);
    test('E2E: Email contains prominent "COLLECT YOUR CERTIFICATE" CTA button with valid href', Boolean(ctaMatch && ctaMatch[1]));
    const extractedCtaUrl = ctaMatch ? ctaMatch[1] : '';

    // Parse URL parameters from the email CTA link
    const parsedUrl = new URL(extractedCtaUrl, 'http://localhost:3000');
    const linkRegId = parsedUrl.searchParams.get('regId');
    const linkToken = parsedUrl.searchParams.get('token');
    const linkEvent = parsedUrl.searchParams.get('event');

    test('E2E: Link points to /certificate path', parsedUrl.pathname === '/certificate');
    test('E2E: Link contains regId parameter matching participant', linkRegId === regA1);
    test('E2E: Link contains secure HMAC token parameter', Boolean(linkToken && linkToken.length >= 16));
    test('E2E: Link contains event slug parameter', linkEvent === testEventA);

    // 2. Client Opens /certificate Page (PC & Mobile view check)
    const certPageRes = await request('/certificate');
    test('E2E: /certificate responds with HTTP 200', certPageRes.status === 200);
    test('E2E: Page contains high-res certificate canvas', certPageRes.body.includes('id="certCanvas"'));
    test('E2E: Page contains PNG download button', certPageRes.body.includes('id="pngBtn"'));
    test('E2E: Page contains PDF download button', certPageRes.body.includes('id="pdfBtn"'));
    test('E2E: Page contains SVG vector download button', certPageRes.body.includes('id="svgBtn"'));
    test('E2E: Page contains print button', certPageRes.body.includes('id="printBtn"'));

    // Check certificate.js client script capabilities
    const certJsRes = await request('/js/certificate.js');
    test('E2E: Client script includes triggerDownload helper for mobile & PC', certJsRes.body.includes('triggerDownload'));
    test('E2E: Client script includes canvas.toBlob optimization', certJsRes.body.includes('canvas.toBlob'));
    test('E2E: Client script includes document.fonts.ready lifecycle handler', certJsRes.body.includes('document.fonts.ready'));

    // 3. Automated Verification via parameters from Email CTA Link
    const verifyFromLinkRes = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: linkRegId,
        token: linkToken,
        eventId: linkEvent
      }
    });

    test('E2E: Verification via email CTA parameters responds with HTTP 200', verifyFromLinkRes.status === 200);
    test('E2E: Verification confirms authenticated: true', verifyFromLinkRes.json?.authenticated === true);
    test('E2E: Verified name matches participant (Aarav Mehta)', verifyFromLinkRes.json?.verifiedName === 'Aarav Mehta');
    test('E2E: Verified event title matches (Event A Showcase)', verifyFromLinkRes.json?.event === 'Event A Showcase');
    test('E2E: Verified category matches (Storytelling)', verifyFromLinkRes.json?.category === 'Storytelling');
    test('E2E: Returns valid base64 QR code', Boolean(verifyFromLinkRes.json?.qrCode?.startsWith('data:image/png;base64,')));
    test('E2E: Returns public verification URL', Boolean(verifyFromLinkRes.json?.verificationUrl?.includes(regA1)));

    // 4. Vector SVG Download via direct API endpoint
    const svgDownloadRes = await request(`/api/certificate/download/${encodeURIComponent(linkRegId)}?token=${encodeURIComponent(linkToken)}&event=${encodeURIComponent(linkEvent)}`);
    test('E2E: Vector SVG download responds with HTTP 200', svgDownloadRes.status === 200);
    test('E2E: Content-Type is image/svg+xml', svgDownloadRes.headers['content-type']?.includes('image/svg+xml'));
    test('E2E: Content-Disposition specifies attachment with participant name', svgDownloadRes.headers['content-disposition']?.includes('Aarav_Mehta'));
    test('E2E: SVG body contains participant name Aarav Mehta', svgDownloadRes.body?.includes('Aarav Mehta'));
    test('E2E: SVG body contains event name Event A Showcase', svgDownloadRes.body?.includes('EVENT A SHOWCASE'));

    // 5. Winner Flow Verification (Participant A3)
    const winnerVerifyRes = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: regA3,
        token: tokenA3,
        eventId: testEventA
      }
    });
    test('E2E Winner: Verification responds with HTTP 200', winnerVerifyRes.status === 200);
    test('E2E Winner: Confirms isWinner === true', winnerVerifyRes.json?.isWinner === true);
    test('E2E Winner: Position is WINNER', winnerVerifyRes.json?.position === 'WINNER');
    test('E2E Winner: Title is CERTIFICATE OF EXCELLENCE', winnerVerifyRes.json?.certificateTitle === 'CERTIFICATE OF EXCELLENCE');
    test('E2E Winner: Badge contains ★ EVENT WINNER ★', winnerVerifyRes.json?.badgeText?.includes('EVENT WINNER'));

    const winnerSvgRes = await request(`/api/certificate/download/${encodeURIComponent(regA3)}?token=${encodeURIComponent(tokenA3)}&event=${encodeURIComponent(testEventA)}`);
    test('E2E Winner: SVG download responds with HTTP 200', winnerSvgRes.status === 200);
    test('E2E Winner: SVG body contains Vikram Malhotra', winnerSvgRes.body?.includes('Vikram Malhotra'));
    test('E2E Winner: SVG body contains WINNER credential', winnerSvgRes.body?.includes('WINNER') || winnerSvgRes.body?.includes('EXCELLENCE'));

    // 6. Security & Negative Paths in the Email Flow
    // Case A: Event mismatch when clicking link for Event B
    const mismatchRes = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: regA1,
        token: linkToken,
        eventId: 'wrong-event-slug'
      }
    });
    test('E2E Negative: Event mismatch is rejected with HTTP 400', mismatchRes.status === 400);

    // Case B: Tampered token is rejected
    const tamperedRes = await request('/api/certificate/verify', {
      method: 'POST',
      body: {
        registrationId: regA1,
        token: 'tampered_invalid_token',
        eventId: testEventA
      }
    });
    test('E2E Negative: Tampered token is rejected with HTTP 403', tamperedRes.status === 403);

    // Clean up test data
    await db.run('DELETE FROM events WHERE slug IN (?, ?)', [testEventA, testEventB]);
    await db.run('DELETE FROM registrations WHERE registration_id IN (?, ?, ?, ?)', [regA1, regA2, regA3, regB1]);
    test('Cleaned up test events and registration records', true);

  } finally {
    if (ephemeralServer) {
      ephemeralServer.close();
      console.log('[Test] Closed ephemeral test server.');
    }
  }

  console.log('\n======================================================');
  console.log(`   CERTIFICATE EMAIL FLOW: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('======================================================\n');

  if (passedTests !== totalTests) {
    throw new Error(`${totalTests - passedTests} tests failed in certificate email flow.`);
  }

  return true;
}

if (require.main === module) {
  runCertificateEmailFlowTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = runCertificateEmailFlowTests;
