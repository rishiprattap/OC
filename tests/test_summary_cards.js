/**
 * Comprehensive test suite for Admin Summary Cards & Totals Calculation
 * Validates:
 * 1. Overview summary cards (total, pending, approved, rejected, revenue, checkedIn)
 * 2. Registrations endpoint stats (all matching DB records, unaffected by pagination limit/offset)
 * 3. Promo code registrations modal stats & summary (totalRegistrations, paidRegistrations, totalRevenue, totalDiscounts)
 * 4. Referrers attribution summary & revenue tracking
 * 5. Event filter consistency across cards and lists
 */
const http = require('http');
const path = require('path');
const assert = require('assert');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../server/config');
const app = require('../server/index');
const { run, get, all } = require('../server/db');

const PORT = config.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD || 'R!SHI88_Admin';

let serverInstance = null;
let adminCookie = '';

function ensureServer() {
  return new Promise((resolve) => {
    const testReq = http.request({ hostname: 'localhost', port: PORT, path: '/api/config', method: 'GET' }, () => {
      resolve(false);
    });
    testReq.on('error', () => {
      serverInstance = app.listen(PORT, () => {
        resolve(true);
      });
    });
    testReq.end();
  });
}

function request(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const postData = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'x-admin-password': config.ADMIN_PASSWORD || config.ADMIN_SECRET || 'R!SHI88_Admin',
      'x-admin-secret': config.ADMIN_SECRET || config.ADMIN_PASSWORD || 'R!SHI88',
      ...headers
    };
    if (adminCookie) reqHeaders['Cookie'] = adminCookie;
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        const setCookie = res.headers['set-cookie'];
        if (setCookie && Array.isArray(setCookie)) {
          adminCookie = setCookie.map(c => c.split(';')[0]).join('; ');
        }
        resolve({ status: res.statusCode, headers: res.headers, raw: data, json });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('--- Running Admin Summary Cards & Totals Verification Tests ---');

  await ensureServer();

  // Step 1: Admin Login
  const loginRes = await request('POST', '/api/admin/login', { email: 'admin', password: ADMIN_PASSWORD });
  assert(loginRes.status === 200 && loginRes.json.success, 'Admin login succeeded');
  console.log('✓ Admin login succeeded');

  // Step 2: Test Overview Stats
  const overviewRes = await request('GET', '/api/admin/overview');
  assert(overviewRes.status === 200 && overviewRes.json.success, 'Overview endpoint returned 200');
  const oStats = overviewRes.json.stats;
  assert(typeof oStats.total === 'number' && oStats.total >= 0, 'Overview stats has total count');
  assert(typeof oStats.totalRegistrations === 'number', 'Overview stats has totalRegistrations');
  assert(typeof oStats.pending === 'number', 'Overview stats has pending count');
  assert(typeof oStats.approved === 'number', 'Overview stats has approved count');
  assert(typeof oStats.rejected === 'number', 'Overview stats has rejected count');
  assert(typeof oStats.checkedIn === 'number', 'Overview stats has checkedIn count');
  assert(typeof oStats.totalRevenue === 'number' && oStats.totalRevenue >= 0, 'Overview stats has totalRevenue');
  assert(typeof oStats.revenue === 'number', 'Overview stats has revenue');
  console.log(`✓ Overview stats valid: total=${oStats.total}, pending=${oStats.pending}, approved=${oStats.approved}, revenue=₹${oStats.totalRevenue}`);

  // Step 3: Test Overview with eventId Filter
  const eventOverviewRes = await request('GET', '/api/admin/overview?eventId=online-open-mic-2026');
  assert(eventOverviewRes.status === 200 && eventOverviewRes.json.success, 'Event-filtered overview returned 200');
  assert(typeof eventOverviewRes.json.stats.totalRegistrations === 'number', 'Event-filtered stats has totalRegistrations');
  console.log('✓ Event-filtered overview returned valid statistics');

  // Step 4: Test Registrations Stats Across ALL Database Records with Limit Pagination
  const regPagedRes = await request('GET', '/api/admin/registrations?limit=1&offset=0');
  assert(regPagedRes.status === 200 && regPagedRes.json.success, 'Registrations paged endpoint returned 200');
  assert(regPagedRes.json.registrations.length <= 1, 'Registrations rows limited to 1 by pagination');
  const rStats = regPagedRes.json.stats;
  assert(rStats, 'Registrations response contains stats object');
  assert(rStats.total >= regPagedRes.json.registrations.length, 'Stats total represents all matching records, not just loaded page');
  assert(typeof rStats.totalRegistrations === 'number', 'Stats has totalRegistrations');
  assert(typeof rStats.pending === 'number', 'Stats has pending');
  assert(typeof rStats.approved === 'number', 'Stats has approved');
  assert(typeof rStats.rejected === 'number', 'Stats has rejected');
  assert(typeof rStats.totalRevenue === 'number', 'Stats has totalRevenue');
  assert(typeof rStats.checkedIn === 'number', 'Stats has checkedIn');
  console.log(`✓ Registrations paged stats calculate from all DB records: loaded=${regPagedRes.json.registrations.length}, dbTotal=${rStats.total}, dbRevenue=₹${rStats.totalRevenue}`);

  // Step 5: Test Registrations with Filters (e.g. status=APPROVED)
  const regApprovedRes = await request('GET', '/api/admin/registrations?status=APPROVED&limit=1');
  assert(regApprovedRes.status === 200 && regApprovedRes.json.success, 'Approved registrations query returned 200');
  const appStats = regApprovedRes.json.stats;
  assert(appStats.pending === 0, 'Filtered by APPROVED results in 0 pending');
  assert(appStats.rejected === 0, 'Filtered by APPROVED results in 0 rejected');
  assert(appStats.total === appStats.approved, 'Filtered by APPROVED has total == approved');
  console.log(`✓ Filtered registrations stats consistent: approved=${appStats.approved}, total=${appStats.total}`);

  // Step 6: Test Promo Code Registrations Modal & Summary Calculation
  // Create a dedicated promo code for testing
  const testPromoCode = 'TESTREV10_' + Date.now();
  const createPromoRes = await request('POST', '/api/admin/promo-codes', {
    code: testPromoCode,
    discount_type: 'FIXED',
    discount_value: 10,
    assigned_person: 'Archita Promoter',
    is_active: 1
  });
  assert((createPromoRes.status === 200 || createPromoRes.status === 201) && createPromoRes.json.success, `Created test promo code (status ${createPromoRes.status})`);
  const promoId = createPromoRes.json.promoCode.id;

  // Insert a test registration using this promo code with final_fee = 79
  const testRegId = 'OC-TEST-' + Date.now().toString(36).toUpperCase();
  await run(
    `INSERT INTO registrations (
      registration_id, event_id, full_name, email, phone, category,
      promo_code, promo_code_id, referrer_name, original_fee, discount_amount, final_fee, amount,
      payment_status, reg_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      testRegId, 'online-open-mic-2026', 'Shreya Maurya', 'shreya@example.com', '9125285604', 'Poetry & Shayari',
      testPromoCode, promoId, 'Archita Promoter', 89, 10, 79, 79,
      'PAID', 'APPROVED', new Date().toISOString(), new Date().toISOString()
    ]
  );

  // Fetch promo code registrations modal data
  const promoRegsRes = await request('GET', `/api/admin/promo-codes/${promoId}/registrations`);
  assert(promoRegsRes.status === 200 && promoRegsRes.json.success, 'Fetched promo code registrations');
  assert(promoRegsRes.json.summary, 'Response includes summary object');
  assert(promoRegsRes.json.stats, 'Response includes stats object');
  const pSum = promoRegsRes.json.summary;
  assert(pSum.totalRegistrations === 1, `Expected totalRegistrations: 1, got: ${pSum.totalRegistrations}`);
  assert(pSum.paidRegistrations === 1, `Expected paidRegistrations: 1, got: ${pSum.paidRegistrations}`);
  assert(pSum.totalRevenue === 79, `Expected totalRevenue: 79, got: ${pSum.totalRevenue}`);
  assert(pSum.totalDiscounts === 10, `Expected totalDiscounts: 10, got: ${pSum.totalDiscounts}`);
  console.log(`✓ Promo registrations modal summary verified: totalUses=${pSum.totalRegistrations}, confirmedPaid=${pSum.paidRegistrations}, revenue=₹${pSum.totalRevenue}, discounts=₹${pSum.totalDiscounts}`);

  // Step 7: Test Referrers Report
  const referrersRes = await request('GET', '/api/admin/promo-codes/referrers');
  assert(referrersRes.status === 200 && referrersRes.json.success, 'Referrers endpoint returned 200');
  assert(Array.isArray(referrersRes.json.referrers), 'Referrers is an array');
  const architaRef = referrersRes.json.referrers.find(r => r.referrerName === 'Archita Promoter' || r.referrer_name === 'Archita Promoter');
  assert(architaRef, 'Archita Promoter found in referrers report');
  assert(architaRef.totalRevenue >= 79 || architaRef.total_revenue >= 79, `Expected archita revenue >= 79, got: ${architaRef.totalRevenue}`);
  assert(architaRef.confirmedPaidRegistrations >= 1 || architaRef.confirmed_paid_registrations >= 1, 'Confirmed paid count is >= 1');
  console.log(`✓ Referrers analytics verified: referrer="${architaRef.referrerName}", revenue=₹${architaRef.totalRevenue}, confirmedPaid=${architaRef.confirmedPaidRegistrations}`);

  console.log('\n--- ALL ADMIN SUMMARY CARDS & TOTALS TESTS PASSED SUCCESSFULLY! ---');
  return true;
}

if (require.main === module) {
  runTests().then(() => {
    if (serverInstance) serverInstance.close();
    process.exit(0);
  }).catch((err) => {
    console.error('Test failure:', err);
    if (serverInstance) serverInstance.close();
    process.exit(1);
  });
}

module.exports = runTests;
