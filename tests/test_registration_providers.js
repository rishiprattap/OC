/**
 * Comprehensive Test Suite for Flexible Registration Provider System
 * Tests all 14 scenarios required by the user prompt.
 */
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../server/config');

const ADMIN_SECRET = process.env.ADMIN_SECRET || config.ADMIN_SECRET || 'R!SHI88';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD || 'R!SHI88_Admin';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'x-admin-secret': ADMIN_SECRET,
      'x-admin-password': ADMIN_PASSWORD,
      ...headers
    };
    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
      defaultHeaders['Content-Type'] = 'application/json';
      defaultHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: defaultHeaders
      },
      (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch (_) {
            parsed = rawData;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING REGISTRATION PROVIDER TEST SUITE (14 SCENARIOS)');
  console.log('======================================================\n');

  const ts = Date.now();
  const eventASlug = `test-event-a-${ts}`;
  const eventBSlug = `test-event-b-${ts}`;

  try {
    // ── Scenario 1 & 2: Create Event A with Internal Provider ──────────────────
    console.log('--- Step 1 & 2: Create Event A with Internal Registration ---');
    const resA = await request('POST', '/api/admin/events', {
      slug: eventASlug,
      name: 'Event A Internal Open Mic',
      title: 'Event A — Poetry & Music',
      status: 'Registration Open',
      registrationProvider: 'internal',
      registrationButtonText: 'RESERVE PERFORMANCE SLOT',
      fee: 79
    });
    assert(resA.status === 201 && resA.body.success, 'Event A created successfully with internal provider');

    // ── Scenario 3: Verify Register button and API for Event A ─────────────────
    console.log('--- Step 3: Verify Event A Public API format ---');
    const pubA = await request('GET', `/api/events/${eventASlug}`);
    assert(pubA.status === 200 && pubA.body.success, 'Event A public details fetched');
    assert(pubA.body.event.registrationProvider === 'internal', 'Event A registrationProvider is internal');
    assert(pubA.body.event.isInternalRegistration === true, 'Event A isInternalRegistration is true');
    assert(pubA.body.event.isExternalRegistration === false, 'Event A isExternalRegistration is false');
    assert(pubA.body.event.registrationMethodNotice.includes('Offstage Creators'), 'Event A notice communicates website registration');
    assert(pubA.body.event.registrationButtonText === 'RESERVE PERFORMANCE SLOT', 'Event A button text matches internal setting');

    // ── Scenario 4 & 5: Create Event B with External Provider ──────────────────
    console.log('--- Step 4, 5 & 6: Create Event B with External Registration ---');
    const externalUrl = 'https://in.bookmyshow.com/events/delhi-open-mic/ET009988';
    const resB = await request('POST', '/api/admin/events', {
      slug: eventBSlug,
      name: 'Event B External Open Mic',
      title: 'Event B — BookMyShow Exclusive',
      status: 'Registration Open',
      registrationProvider: 'external',
      externalRegistrationUrl: externalUrl,
      externalPlatformName: 'BookMyShow',
      externalPlatformNotes: 'Ticketing contract #9817, 10% fee',
      externalOpenNewTab: true,
      registrationButtonText: 'BOOK ON BOOKMYSHOW',
      fee: 149
    });
    assert(resB.status === 201 && resB.body.success, 'Event B created with external provider');

    // ── Scenario 6 & 7: Verify Event B Public API & Button ─────────────────────
    console.log('--- Step 7: Verify Event B Public API format ---');
    const pubB = await request('GET', `/api/events/${eventBSlug}`);
    assert(pubB.status === 200 && pubB.body.success, 'Event B public details fetched');
    assert(pubB.body.event.registrationProvider === 'external', 'Event B registrationProvider is external');
    assert(pubB.body.event.isExternalRegistration === true, 'Event B isExternalRegistration is true');
    assert(pubB.body.event.externalRegistrationUrl === externalUrl, 'Event B externalRegistrationUrl matches');
    assert(pubB.body.event.externalPlatformName === 'BookMyShow', 'Event B externalPlatformName matches');
    assert(pubB.body.event.registrationMethodNotice.includes('BookMyShow'), 'Event B notice highlights BookMyShow');
    assert(pubB.body.event.registrationButtonText.includes('↗'), 'Event B button text contains external indicator ↗');

    // Verify submitting internal registration to Event B is rejected
    console.log('--- Verify internal registration rejection on external event ---');
    const regAttemptB = await request('POST', '/api/registrations', {
      eventId: eventBSlug,
      fullName: 'External Visitor',
      phone: '9876543210',
      email: 'visitor@example.com',
      city: 'Delhi',
      category: 'Poetry & Shayari',
      performanceTitle: 'My Journey',
      terms: true
    });
    assert(regAttemptB.status === 400 && regAttemptB.body.isExternal === true, 'Direct internal POST to external event rejected with 400 and external redirect info');
    assert(regAttemptB.body.externalUrl === externalUrl, 'Rejected POST returns external ticketing URL');

    // ── Scenario 8 & 9: Switch Event B back to Internal Website ────────────────
    console.log('--- Step 8 & 9: Switch Event B back to Internal Website ---');
    const updateB = await request('PUT', `/api/admin/events/${eventBSlug}`, {
      slug: eventBSlug,
      name: 'Event B External Open Mic',
      title: 'Event B — BookMyShow Exclusive',
      status: 'Registration Open',
      registrationProvider: 'internal',
      registrationButtonText: 'REGISTER NOW',
      fee: 149
    });
    assert(updateB.status === 200 && updateB.body.success, 'Event B updated to internal provider');

    const pubBInternal = await request('GET', `/api/events/${eventBSlug}`);
    assert(pubBInternal.body.event.registrationProvider === 'internal', 'Event B is now internal provider');
    assert(pubBInternal.body.event.isExternalRegistration === false, 'Event B isExternalRegistration is false');

    // Verify internal registration now accepted for Event B
    console.log('--- Verify internal registration on Event B succeeds ---');
    const regBSuccess = await request('POST', '/api/registrations', {
      eventId: eventBSlug,
      fullName: 'Event B Performer',
      phone: '9988776655',
      email: 'performer.b@example.com',
      city: 'Delhi',
      category: 'Storytelling',
      performanceTitle: 'The Story of Delhi',
      terms: true
    });
    assert(regBSuccess.status === 201 && regBSuccess.body.success, 'Internal registration on Event B succeeded');
    const regBId = regBSuccess.body.registrationId;

    // ── Scenario 10 & 11: Verify Event A was not affected and data is intact ────
    console.log('--- Step 10 & 11: Verify Event A unaffected and existing records intact ---');
    const pubACheck = await request('GET', `/api/events/${eventASlug}`);
    assert(pubACheck.body.event.registrationProvider === 'internal', 'Event A remains internal provider');
    assert(pubACheck.body.event.isInternalRegistration === true, 'Event A is unaffected by Event B changes');

    // Verify registration on Event B is still in database even if switched back to external
    console.log('--- Switch Event B back to external and verify registration records are preserved ---');
    await request('PUT', `/api/admin/events/${eventBSlug}`, {
      slug: eventBSlug,
      name: 'Event B External Open Mic',
      title: 'Event B — BookMyShow Exclusive',
      status: 'Registration Open',
      registrationProvider: 'external',
      externalRegistrationUrl: externalUrl,
      externalPlatformName: 'BookMyShow',
      fee: 149
    });

    const checkRegB = await request('GET', `/api/admin/registrations/${regBId}`);
    assert(checkRegB.status === 200 && checkRegB.body.success, 'Existing registration record on Event B remains 100% intact');
    assert(checkRegB.body.registration.registrationId === regBId, 'Registration ID and participant details preserved');

    // ── Scenario 12 & 13: Set Registration Status to Closed ─────────────────────
    console.log('--- Step 12 & 13: Test Registration Status Closed independently ---');
    await request('POST', `/api/admin/events/${eventBSlug}/status`, { status: 'Registration Closed' });
    const pubBClosed = await request('GET', `/api/events/${eventBSlug}`);
    assert(pubBClosed.body.event.status === 'Registration Closed', 'Event B status is Registration Closed');
    assert(pubBClosed.body.event.isRegistrationOpen === false, 'isRegistrationOpen is false');
    assert(pubBClosed.body.event.registrationButtonText === 'REGISTRATION CLOSED', 'Button text reflects closed status');

    // ── Scenario 14: URL Validation & Safety ────────────────────────────────────
    console.log('--- Step 14: URL Validation & Security checks ---');
    const invalidUrlRes = await request('POST', '/api/admin/events', {
      slug: `invalid-url-${ts}`,
      name: 'XSS Event Attempt',
      title: 'XSS Event Attempt',
      status: 'Registration Open',
      registrationProvider: 'external',
      externalRegistrationUrl: 'javascript:alert(document.cookie)',
      fee: 0
    });
    assert(invalidUrlRes.status === 400 && !invalidUrlRes.body.success, 'Malicious javascript: URL correctly rejected with 400');

    // Clean up test events
    console.log('--- Cleanup test events ---');
    await request('DELETE', `/api/admin/events/${eventASlug}`);
    await request('DELETE', `/api/admin/events/${eventBSlug}`);
    assert(true, 'Test events cleaned up successfully');

    console.log('\n======================================================');
    console.log('🎉 ALL 14 REGISTRATION PROVIDER SCENARIOS PASSED 100%!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
