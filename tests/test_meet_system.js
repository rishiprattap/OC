const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { run, get, all } = require('../server/db');
const emailService = require('../server/services/email');

const adminSecret = process.env.ADMIN_SECRET || 'offstage_admin_secret_placeholder';

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runMeetTests() {
  console.log('=== STARTING GOOGLE MEET SESSION & EMAIL DISPATCH TESTS ===\n');
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
    // Test 1: Security — Unauthenticated requests to /api/admin/meet/* are rejected
    const unauthRes = await request({ path: '/api/admin/meet/overview', method: 'GET' });
    assert(unauthRes.status === 401, 'Unauthenticated access to Meet API is rejected with HTTP 401');

    // Test 2: Overview stats accessible with valid admin key
    const overviewRes = await request({
      path: '/api/admin/meet/overview',
      method: 'GET',
      headers: { 'x-admin-secret': adminSecret }
    });
    assert(overviewRes.status === 200 && overviewRes.json.success === true, 'Admin overview returns HTTP 200 with valid key');
    assert('totalSessions' in overviewRes.json.stats, 'Overview stats include totalSessions');

    // Test 3: Safe Variable Interpolation
    const testTemplate = 'Hello {{name}}, join session {{session_title}} for {{event_name}} at {{time}} on {{date}}. Link: {{meet_link}}. Reg: {{registration_id}}';
    const sampleVars = {
      name: 'Rishi <Test>',
      session_title: 'Briefing & Soundcheck',
      event_name: 'Online Open Mic 2026',
      time: '7:30 PM IST',
      date: '23 September 2026',
      meet_link: 'https://meet.google.com/abc-defg-hij',
      registration_id: 'OC-OM-TEST1234'
    };
    const interpolated = emailService.interpolateVariables(testTemplate, sampleVars);
    assert(interpolated.includes('Hello Rishi &lt;Test&gt;'), 'Variables safely interpolated with HTML escaping');
    assert(interpolated.includes('OC-OM-TEST1234'), 'Registration ID variable populated');
    assert(interpolated.includes('https://meet.google.com/abc-defg-hij'), 'Meet link variable populated');

    // Test 4: Live Email Preview Renderer
    const previewRes = await request({
      path: '/api/admin/meet/render-preview',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
    }, {
      session: {
        event_name: 'Online Open Mic 2026',
        title: 'Performer Briefing',
        date: '23 September 2026',
        time: '7:30 PM IST',
        meet_url: 'https://meet.google.com/oc-openmic-live',
        message: 'Please keep mic muted until called.'
      },
      participant: {
        full_name: 'Muskaan Performer',
        registration_id: 'OC-OM-DEMO01'
      }
    });
    assert(previewRes.status === 200 && previewRes.json.success === true, 'Live Email preview returns HTTP 200');
    assert(previewRes.json.html.includes('JOIN GOOGLE MEET →'), 'Rendered email contains Join Meet CTA button');
    assert(previewRes.json.html.includes('https://meet.google.com/oc-openmic-live'), 'Rendered email contains Meet link URL');
    assert(previewRes.json.html.includes('Muskaan Performer'), 'Rendered email contains participant name');

    // Test 5: Validation — Meet URL validation rejects malicious/invalid URLs
    const invalidUrlRes = await request({
      path: '/api/admin/meet/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
    }, {
      eventId: 'online-open-mic-2026',
      sessionTitle: 'Open Mic Briefing',
      date: '23 September',
      time: '7:30 PM IST',
      meetUrl: 'javascript:alert(1)',
      targetMode: 'ALL_PAID'
    });
    assert(invalidUrlRes.status === 400, 'Invalid Meet URL rejected with HTTP 400');
    assert(invalidUrlRes.json.error.includes('Valid Google Meet URL required'), 'Rejection error explains Meet URL requirement');

    // Test 6: Validation — Missing required fields
    const missingFieldRes = await request({
      path: '/api/admin/meet/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
    }, {
      eventId: 'online-open-mic-2026',
      sessionTitle: '',
      meetUrl: 'https://meet.google.com/abc-defg-hij'
    });
    assert(missingFieldRes.status === 400, 'Missing fields rejected with HTTP 400');

    // Test 7: Send Test Email endpoint
    const testEmailRes = await request({
      path: '/api/admin/meet/send-test',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
    }, {
      testEmail: 'rishiarc01@gmail.com',
      session: {
        event_name: 'Online Open Mic 2026',
        title: 'Soundcheck & Orientation',
        date: '23 September 2026',
        time: '7:30 PM IST',
        meet_url: 'https://meet.google.com/oc-soundcheck',
        message: 'Hello {{name}}! Welcome to the briefing. Your ID is {{registration_id}}.'
      }
    });
    assert(testEmailRes.status === 200 && testEmailRes.json.success === true, 'Test email dispatch returns HTTP 200');
    assert(testEmailRes.json.message.includes('Test email sent successfully'), 'Test email success message returned');

    // Test 8: Recipient selection query for ALL_PAID
    const eligibleRes = await request({
      path: '/api/admin/meet/eligible-recipients?eventId=online-open-mic-2026&mode=ALL_PAID',
      method: 'GET',
      headers: { 'x-admin-secret': adminSecret }
    });
    assert(eligibleRes.status === 200, 'Eligible recipients endpoint returns HTTP 200');
    assert(Array.isArray(eligibleRes.json.recipients), 'Eligible recipients is an array');

    // Test 9: Create a verified test participant to test real dispatch
    const testRegId = 'OC-OM-MEETTEST1';
    const testEmail = 'rishiarc01@gmail.com';
    await run(`
      INSERT OR REPLACE INTO registrations (
        registration_id, event_id, full_name, email, phone, city,
        category, payment_status, email_verified, created_at, updated_at
      ) VALUES (
        ?, 'online-open-mic-2026', 'Test Artist', ?, '9999900001', 'Delhi',
        'Poetry & Shayari', 'PAID', 1, datetime('now'), datetime('now')
      )
    `, [testRegId, testEmail]);

    // Test 10: Dispatch Live Meet Email to Selected Participant
    const sendBatchRes = await request({
      path: '/api/admin/meet/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
    }, {
      eventId: 'online-open-mic-2026',
      sessionTitle: 'Open Mic Briefing Live Test',
      date: '23 September',
      time: '7:30 PM IST',
      meetUrl: 'https://meet.google.com/tst-live-meet',
      message: 'Hello {{name}}, join our briefing using the button below. See you there!',
      targetMode: 'SELECTED',
      selectedRegistrationIds: [testRegId]
    });

    assert(sendBatchRes.status === 200, 'Batch send returns HTTP 200');
    assert(sendBatchRes.json.total === 1, 'Total recipients is 1');
    assert(sendBatchRes.json.sent === 1, 'Emails sent count is 1');
    assert(sendBatchRes.json.failed === 0, 'Emails failed count is 0');
    const sessionId = sendBatchRes.json.sessionId;
    assert(sessionId !== undefined, 'Meet session ID was generated');

    // Test 11: Verify database recorded session and delivery log
    const sessionRow = await get(`SELECT * FROM meet_sessions WHERE id = ?`, [sessionId]);
    assert(sessionRow !== undefined, 'Session stored in meet_sessions table');
    assert(sessionRow.title === 'Open Mic Briefing Live Test', 'Session title saved correctly');
    assert(sessionRow.meet_url === 'https://meet.google.com/tst-live-meet', 'Meet URL saved correctly');

    const logRow = await get(`SELECT * FROM meet_email_logs WHERE meet_session_id = ? AND registration_id = ?`, [sessionId, testRegId]);
    assert(logRow !== undefined, 'Delivery log stored in meet_email_logs table');
    assert(logRow.status === 'SENT', 'Delivery status is SENT');
    assert(logRow.recipient_email === testEmail, 'Delivery log recorded correct recipient email');

    // Test 12: Duplicate Prevention / "Not Yet Sent" Filter
    const notSentRes = await request({
      path: `/api/admin/meet/eligible-recipients?eventId=online-open-mic-2026&mode=NOT_SENT&sessionId=${sessionId}`,
      method: 'GET',
      headers: { 'x-admin-secret': adminSecret }
    });
    assert(notSentRes.status === 200, 'Not-sent query returns HTTP 200');
    const stillEligible = notSentRes.json.recipients.some(r => r.registration_id === testRegId);
    assert(!stillEligible, 'Participant who already received link is excluded under "NOT_SENT" mode');

    // Test 13: Session details API
    const detailsRes = await request({
      path: `/api/admin/meet/sessions/${sessionId}`,
      method: 'GET',
      headers: { 'x-admin-secret': adminSecret }
    });
    assert(detailsRes.status === 200 && detailsRes.json.success === true, 'Session details endpoint returns HTTP 200');
    assert(detailsRes.json.session.id === sessionId, 'Session ID matches');
    assert(detailsRes.json.logs.length >= 1, 'Session returns delivery audit logs');

    // Test 14: Failed retry endpoint functionality
    // Insert a simulated failed log entry
    await run(`
      INSERT INTO meet_email_logs (
        meet_session_id, registration_id, recipient_email, recipient_name, status, error_message, sent_at
      ) VALUES (?, 'OC-OM-FAILTEST', 'rishiarc01@gmail.com', 'Simulated Failed User', 'FAILED', 'Temporary SMTP Error', datetime('now'))
    `, [sessionId]);

    const retryRes = await request({
      path: '/api/admin/meet/retry-failed',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret }
    }, { sessionId });

    assert(retryRes.status === 200 && retryRes.json.success === true, 'Retry failed endpoint returns HTTP 200');
    assert(retryRes.json.retried >= 1, 'Retry endpoint picked up failed recipient');

    // Clean up test registrations and logs
    await run(`DELETE FROM registrations WHERE email LIKE '%@example.com' OR registration_id = ?`, [testRegId]);
    await run(`DELETE FROM meet_sessions WHERE id = ?`, [sessionId]);
    await run(`DELETE FROM meet_email_logs WHERE meet_session_id = ?`, [sessionId]);

    console.log(`\n======================================================`);
    console.log(`MEET TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log(`======================================================\n`);

    return failed === 0;

  } catch (err) {
    console.error('Meet test runner crashed:', err);
    return false;
  }
}

if (require.main === module) {
  runMeetTests().then(success => process.exit(success ? 0 : 1));
}

module.exports = runMeetTests;
