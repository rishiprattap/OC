/**
 * Offstage Creators — Comprehensive Promo Codes, Referrals & Instagram Handle Test Suite
 *
 * Validates:
 * 1. Instagram handle normalization (handles, full URLs, profile updates, account signup, admin display)
 * 2. Promo code creation, editing, toggling via Admin API & permission protection
 * 3. Discount calculation & server-side validation (percentage, fixed, referral-only)
 * 4. Promo code constraints: invalid, expired, deactivated, event-restricted, exhausted, per-user limits
 * 5. Negative fee prevention and zero-fee registration auto-approval
 * 6. Historical snapshot immutability upon code modification/deactivation
 * 7. Referrer revenue tracking & CSV export columns
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

function extractCookie(headers, cookieName) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return null;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) {
    const parts = c.split(';')[0].split('=');
    if (parts[0].trim() === cookieName) {
      return `${parts[0].trim()}=${parts.slice(1).join('=').trim()}`;
    }
  }
  return null;
}

async function runPromoAndInstagramTests() {
  console.log('\n======================================================');
  console.log('   STARTING PROMO CODES, REFERRALS & INSTAGRAM TESTS  ');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      failed++;
    }
  }

  const adminHeaders = {
    'x-admin-password': config.ADMIN_PASSWORD || 'test-admin-secret',
    'x-admin-secret': config.ADMIN_PASSWORD || 'test-admin-secret'
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Instagram Handle Normalization on Account Creation & Profile
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Instagram Handle Normalization ---');

    const testEmail1 = `insta_${Date.now()}_1@example.com`;
    const regRes1 = await request({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        name: 'Insta Artist One',
        email: testEmail1,
        password: 'Password123!',
        phone: '9876543210',
        age: 24,
        city: 'New Delhi',
        instagram: '@offstage_star'
      }
    });

    assert(regRes1.status === 201 && regRes1.json.success, 'Account registration with @handle succeeds');
    const dbUser1 = await get('SELECT * FROM users WHERE email = ?', [testEmail1]);
    assert(dbUser1 && dbUser1.instagram === 'offstage_star', 'Instagram @handle normalized to "offstage_star"');

    // Test with full URL
    const testEmail2 = `insta_${Date.now()}_2@example.com`;
    const regRes2 = await request({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        name: 'Insta Artist Two',
        email: testEmail2,
        password: 'Password123!',
        phone: '9876543211',
        age: 26,
        city: 'Mumbai',
        instagram: 'https://www.instagram.com/delhi_poet/?hl=en'
      }
    });

    assert(regRes2.status === 201 && regRes2.json.success, 'Account registration with full Instagram URL succeeds');
    const dbUser2 = await get('SELECT * FROM users WHERE email = ?', [testEmail2]);
    assert(dbUser2 && dbUser2.instagram === 'delhi_poet', 'Full Instagram URL normalized to "delhi_poet"');

    // Mark testEmail1 and testEmail2 verified so login can proceed
    await run('UPDATE users SET is_verified = 1 WHERE email = ?', [testEmail1]);
    await run('UPDATE users SET is_verified = 1 WHERE email = ?', [testEmail2]);

    const loginRes1 = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: testEmail1,
        password: 'Password123!'
      }
    });
    const userCookie1 = extractCookie(loginRes1.headers, 'oc.sid') || (loginRes1.headers['set-cookie'] ? (Array.isArray(loginRes1.headers['set-cookie']) ? loginRes1.headers['set-cookie'][0].split(';')[0] : loginRes1.headers['set-cookie'].split(';')[0]) : '');

    // Verify user can log in without entering Instagram handle
    const loginRes = await request({
      method: 'POST',
      path: '/api/auth/login',
      body: {
        email: testEmail2,
        password: 'Password123!'
      }
    });
    assert(loginRes.status === 200 && loginRes.json.success, 'Login with standard email and password succeeds');
    assert(loginRes.json.user.instagram === 'delhi_poet', 'User session exposes normalized Instagram handle');

    const userCookie = extractCookie(loginRes.headers, 'oc.sid') || (loginRes.headers['set-cookie'] ? (Array.isArray(loginRes.headers['set-cookie']) ? loginRes.headers['set-cookie'][0].split(';')[0] : loginRes.headers['set-cookie'].split(';')[0]) : '');

    // Edit profile with new Instagram URL
    const updateRes = await request({
      method: 'PUT',
      path: '/api/user/profile',
      headers: { Cookie: userCookie },
      body: {
        name: 'Insta Artist Two Updated',
        phone: '9876543211',
        age: 26,
        city: 'Mumbai',
        instagram: 'https://instagram.com/updated_poet/'
      }
    });
    assert(updateRes.status === 200 && updateRes.json.success, 'Profile update succeeds');
    assert(updateRes.json.user.instagram === 'updated_poet', 'Updated profile Instagram handle normalized');

    // -------------------------------------------------------------------------
    // TEST 2: Admin Access Control on Promo Code Endpoints
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Admin Access Control on Promo Codes ---');

    const unauthPromoList = await request({
      method: 'GET',
      path: '/api/admin/promo-codes'
    });
    assert(unauthPromoList.status === 401, 'Unauthorized request to /api/admin/promo-codes rejected with 401');

    const authPromoList = await request({
      method: 'GET',
      path: '/api/admin/promo-codes',
      headers: adminHeaders
    });
    assert(authPromoList.status === 200 && authPromoList.json.success, 'Admin can list promo codes');

    // -------------------------------------------------------------------------
    // TEST 3: Admin Promo Code Creation & Editing
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Admin Promo Code Creation & Editing ---');

    const promoCode1 = `TESTPCT${Date.now().toString().slice(-4)}`;
    const createPromo1 = await request({
      method: 'POST',
      path: '/api/admin/promo-codes',
      headers: adminHeaders,
      body: {
        code: promoCode1,
        referrerName: 'Host Rahul',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        eligibleEvents: [],
        perUserLimit: 2,
        maxUses: 10,
        isActive: true
      }
    });
    assert(createPromo1.status === 201 && createPromo1.json.success, 'Created percentage discount promo code');
    const createdPromoId1 = createPromo1.json.promoCode.id;

    // Fixed amount code
    const promoCodeFixed = `TESTFIX${Date.now().toString().slice(-4)}`;
    const createPromoFixed = await request({
      method: 'POST',
      path: '/api/admin/promo-codes',
      headers: adminHeaders,
      body: {
        code: promoCodeFixed,
        referrerName: 'Promoter Priya',
        discountType: 'FIXED',
        discountValue: 30,
        perUserLimit: 1,
        maxUses: 5,
        isActive: true
      }
    });
    assert(createPromoFixed.status === 201 && createPromoFixed.json.success, 'Created fixed amount promo code');

    // Referral-only code (0 discount)
    const promoCodeRefOnly = `REFONLY${Date.now().toString().slice(-4)}`;
    const createPromoRefOnly = await request({
      method: 'POST',
      path: '/api/admin/promo-codes',
      headers: adminHeaders,
      body: {
        code: promoCodeRefOnly,
        referrerName: 'Campus Ambassador Aman',
        discountType: 'NONE',
        discountValue: 0,
        isActive: true
      }
    });
    assert(createPromoRefOnly.status === 201 && createPromoRefOnly.json.success, 'Created referral-only promo code');

    // Edit promo code
    const editRes = await request({
      method: 'PUT',
      path: `/api/admin/promo-codes/${createdPromoId1}`,
      headers: adminHeaders,
      body: {
        referrerName: 'Rahul Sharma (Lead Host)',
        discountType: 'PERCENTAGE',
        discountValue: 25,
        perUserLimit: 2,
        maxUses: 10,
        isActive: true
      }
    });
    assert(editRes.status === 200 && editRes.json.success, 'Admin edited promo code successfully');
    assert(editRes.json.promoCode.discountValue === 25, 'Discount value updated to 25%');
    assert(editRes.json.promoCode.referrerName === 'Rahul Sharma (Lead Host)', 'Referrer updated');

    // -------------------------------------------------------------------------
    // TEST 4: Public Promo Validation & Server Calculation
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Public Promo Validation & Server Calculations ---');

    // Validate percentage code
    const valPct = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: promoCode1,
        eventSlug: 'online-open-mic-2026',
        email: testEmail1
      }
    });
    assert(valPct.status === 200 && valPct.json.valid, 'Validate percentage code returns valid');
    assert(valPct.json.calculation.originalFee === 79, 'Original fee correctly identified from event (79)');
    assert(valPct.json.calculation.discountAmount === 20, '25% of 79 rounded to 20 discount');
    assert(valPct.json.calculation.finalFee === 59, 'Final payable fee calculated as 59');

    // Validate referral-only code
    const valRef = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: promoCodeRefOnly,
        eventSlug: 'online-open-mic-2026',
        email: testEmail1
      }
    });
    assert(valRef.status === 200 && valRef.json.valid, 'Validate referral-only code returns valid');
    assert(valRef.json.calculation.discountAmount === 0, 'Referral-only gives 0 discount');
    assert(valRef.json.calculation.finalFee === 79, 'Final fee equals original fee');
    assert(valRef.json.promo.referrerName === 'Campus Ambassador Aman', 'Referrer name returned for referral code');

    // -------------------------------------------------------------------------
    // TEST 5: Constraints: Invalid, Expired, Deactivated, Event-Restricted, Exhausted
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Promo Code Constraints & Validation Failures ---');

    // Invalid code
    const valInvalid = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: 'NON_EXISTENT_CODE_XYZ',
        eventSlug: 'online-open-mic-2026'
      }
    });
    assert(valInvalid.status === 400 && !valInvalid.json.valid, 'Invalid promo code rejected with 400');

    // Deactivated code
    const promoDeact = `DEACT${Date.now().toString().slice(-4)}`;
    const createDeact = await request({
      method: 'POST',
      path: '/api/admin/promo-codes',
      headers: adminHeaders,
      body: {
        code: promoDeact,
        discountType: 'FIXED',
        discountValue: 10,
        isActive: false
      }
    });
    assert(createDeact.status === 201, 'Created inactive promo code');

    const valDeact = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: promoDeact,
        eventSlug: 'online-open-mic-2026'
      }
    });
    assert(valDeact.status === 400 && valDeact.json.error.includes('inactive'), 'Inactive promo code rejected');

    // Expired code
    const promoExpired = `EXP${Date.now().toString().slice(-4)}`;
    const createExp = await request({
      method: 'POST',
      path: '/api/admin/promo-codes',
      headers: adminHeaders,
      body: {
        code: promoExpired,
        discountType: 'FIXED',
        discountValue: 10,
        startDate: '2020-01-01',
        endDate: '2020-01-02',
        isActive: true
      }
    });
    assert(createExp.status === 201, 'Created expired promo code');

    const valExp = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: promoExpired,
        eventSlug: 'online-open-mic-2026'
      }
    });
    assert(valExp.status === 400 && valExp.json.error.includes('expired'), 'Expired promo code rejected');

    // Event-restricted code
    const promoEventRestricted = `EVTREST${Date.now().toString().slice(-4)}`;
    const createRestricted = await request({
      method: 'POST',
      path: '/api/admin/promo-codes',
      headers: adminHeaders,
      body: {
        code: promoEventRestricted,
        discountType: 'FIXED',
        discountValue: 10,
        eligibleEvents: ['specific-event-edition-delhi'],
        isActive: true
      }
    });
    assert(createRestricted.status === 201, 'Created event-restricted promo code');

    const valWrongEvent = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: promoEventRestricted,
        eventSlug: 'online-open-mic-2026'
      }
    });
    assert(valWrongEvent.status === 400 && valWrongEvent.json.error.includes('not valid for this event'), 'Code restricted to another event rejected');

    const valRightEvent = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: promoEventRestricted,
        eventSlug: 'specific-event-edition-delhi'
      }
    });
    assert(valRightEvent.status === 200 && valRightEvent.json.valid, 'Event-restricted code valid for eligible event');

    // -------------------------------------------------------------------------
    // TEST 6: Registration with Promo Code, Server Discount & Snapshot
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Registration with Promo Code & Server-Side Integrity ---');

    // Attempt registration trying to tamper client discount/fee
    const regResTamper = await request({
      method: 'POST',
      path: '/api/registrations',
      headers: { Cookie: userCookie },
      body: {
        eventSlug: 'online-open-mic-2026',
        fullName: 'Insta Artist Two',
        email: testEmail2,
        phone: '9876543211',
        category: 'Poetry & Shayari',
        performanceTitle: 'Ode to the Stars',
        promoCode: promoCodeFixed, // 30 discount off 79 = 49
        // Tampered amounts:
        originalFee: 10,
        discountAmount: 100,
        finalFee: 0
      }
    });

    assert(regResTamper.status === 201 && regResTamper.json.success, 'Registration created successfully');
    const createdReg = regResTamper.json.registration;
    assert(createdReg.originalFee === 79, 'Server ignored client originalFee and used server fee (79)');
    assert(createdReg.discountAmount === 30, 'Server calculated authentic promo discount (30)');
    assert(createdReg.finalFee === 49, 'Server calculated authentic final fee (49)');
    assert(createdReg.promoCode === promoCodeFixed, 'Promo code snapshot saved');
    assert(createdReg.referrerName === 'Promoter Priya', 'Referrer name snapshot saved');

    // -------------------------------------------------------------------------
    // TEST 7: Exhausted & Per-User Limit
    // -------------------------------------------------------------------------
    console.log('\n--- Test 7: Per-User and Exhaustion Limit Enforcement ---');

    // Per user limit for promoCodeFixed is 1. Simulate registration with same email using promoCodeFixed
    // First, verify the previous registration was created for testEmail2. Now testEmail2 tries to use promoCodeFixed again:
    const valPerUser = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: promoCodeFixed,
        eventSlug: 'online-open-mic-2026',
        email: testEmail2
      }
    });
    assert(valPerUser.status === 400 && valPerUser.json.error.includes('limit'), 'Per-user limit exceeded error returned');

    // Create a code with maxUses = 1
    const promoSingleUse = `SINGLE${Date.now().toString().slice(-4)}`;
    await request({
      method: 'POST',
      path: '/api/admin/promo-codes',
      headers: adminHeaders,
      body: {
        code: promoSingleUse,
        discountType: 'FIXED',
        discountValue: 15,
        maxUses: 1,
        isActive: true
      }
    });

    // Use it once
    const regResSingle = await request({
      method: 'POST',
      path: '/api/registrations',
      body: {
        eventSlug: 'online-open-mic-2026',
        fullName: 'Participant A',
        email: `single_user_${Date.now()}@example.com`,
        phone: '9988776655',
        category: 'Storytelling',
        performanceTitle: 'Story of Life',
        promoCode: promoSingleUse
      }
    });
    assert(regResSingle.status === 201, 'First use of single-use promo succeeds');

    // Try to validate or use again
    const valExhausted = await request({
      method: 'POST',
      path: '/api/registrations/validate-promo',
      body: {
        code: promoSingleUse,
        eventSlug: 'online-open-mic-2026',
        email: 'another_user@example.com'
      }
    });
    assert(valExhausted.status === 400 && valExhausted.json.error.includes('limit reached'), 'Exhausted promo code rejected');

    // -------------------------------------------------------------------------
    // TEST 8: Zero-Fee Registration Handling
    // -------------------------------------------------------------------------
    console.log('\n--- Test 8: Zero-Fee Registration Handling & Payment Bypass ---');

    const promoFree = `FREE100${Date.now().toString().slice(-4)}`;
    await request({
      method: 'POST',
      path: '/api/admin/promo-codes',
      headers: adminHeaders,
      body: {
        code: promoFree,
        referrerName: 'Special Guest Pass',
        discountType: 'PERCENTAGE',
        discountValue: 100, // 100% discount
        isActive: true
      }
    });

    // Returning user registers with 100% free promo code
    const regFreeRes = await request({
      method: 'POST',
      path: '/api/registrations',
      headers: { Cookie: userCookie1 },
      body: {
        eventSlug: 'online-open-mic-2026',
        fullName: 'Insta Artist One',
        email: testEmail1,
        phone: '9876543210',
        category: 'Music & Vocals',
        performanceTitle: 'Free Melody',
        promoCode: promoFree
      }
    });

    assert(regFreeRes.status === 201, 'Zero-fee registration submitted');
    const freeReg = regFreeRes.json.registration;
    assert(freeReg.finalFee === 0, 'Final fee is exactly 0');
    assert(freeReg.status === 'APPROVED', 'Zero-fee registration for verified returning user auto-approved');

    // Test zero-fee confirmation endpoint directly
    const confirmFreeRes = await request({
      method: 'POST',
      path: '/api/payments/confirm-free',
      body: {
        registrationId: freeReg.registrationId,
        verificationToken: regFreeRes.json.verificationToken
      }
    });
    assert(confirmFreeRes.status === 200 && confirmFreeRes.json.success, 'Confirm free endpoint succeeds');

    // -------------------------------------------------------------------------
    // TEST 9: Historical Snapshot Immutability
    // -------------------------------------------------------------------------
    console.log('\n--- Test 9: Historical Snapshot Immutability ---');

    // Now admin edits promoCodeFixed: change discount to 0 and deactivate it
    const promoFixedDb = await get('SELECT id FROM promo_codes WHERE code = ?', [promoCodeFixed]);
    if (promoFixedDb) {
      await request({
        method: 'PUT',
        path: `/api/admin/promo-codes/${promoFixedDb.id}`,
        headers: adminHeaders,
        body: {
          referrerName: 'Altered Referrer',
          discountType: 'PERCENTAGE',
          discountValue: 5,
          isActive: false
        }
      });
    }

    // Inspect the past registration `createdReg.registrationId`
    const pastRegRes = await request({
      method: 'GET',
      path: `/api/admin/registrations/${createdReg.registrationId}`,
      headers: adminHeaders
    });
    assert(pastRegRes.status === 200 && pastRegRes.json.success, 'Fetched registration detail via admin API');
    const pastReg = pastRegRes.json.registration;
    assert(pastReg.promoCode === promoCodeFixed, 'Historical promoCode preserved');
    assert(pastReg.referrerName === 'Promoter Priya', 'Historical referrerName unchanged by subsequent promo edit');
    assert(pastReg.originalFee === 79, 'Historical originalFee preserved');
    assert(pastReg.discountAmount === 30, 'Historical discountAmount preserved');
    assert(pastReg.finalFee === 49, 'Historical finalFee preserved');

    // -------------------------------------------------------------------------
    // TEST 10: Referrers Revenue Analytics & CSV Export
    // -------------------------------------------------------------------------
    console.log('\n--- Test 10: Referrers Analytics & Registration CSV Export ---');

    const referrersRes = await request({
      method: 'GET',
      path: '/api/admin/promo-codes/referrers',
      headers: adminHeaders
    });
    assert(referrersRes.status === 200 && referrersRes.json.success, 'Admin referrers analytics endpoint works');
    assert(Array.isArray(referrersRes.json.referrers), 'Returns array of referrer attribution summaries');

    // Test CSV export contains referral headers
    const csvRes = await request({
      method: 'GET',
      path: '/api/admin/registrations/export',
      headers: adminHeaders
    });
    assert(csvRes.status === 200, 'Registration CSV export returns status 200');
    assert(csvRes.raw.includes('Promo Code') && csvRes.raw.includes('Referrer'), 'CSV export contains Promo Code and Referrer columns');
    assert(csvRes.raw.includes('Original Fee (INR)') && csvRes.raw.includes('Final Fee (INR)'), 'CSV export contains fee breakdown columns');

  } catch (err) {
    console.error('Unhandled test exception:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(`   TEST RUN COMPLETE: ${passed} PASSED, ${failed} FAILED   `);
  console.log('======================================================\n');

  return failed === 0;
}

if (require.main === module) {
  const app = require('../server/index');
  const server = app.listen(config.PORT || 3000, async () => {
    try {
      const ok = await runPromoAndInstagramTests();
      server.close(() => process.exit(ok ? 0 : 1));
    } catch (e) {
      console.error(e);
      server.close(() => process.exit(1));
    }
  });
}

module.exports = runPromoAndInstagramTests;
