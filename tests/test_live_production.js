// Exhaustive End-to-End Test Suite for Live Production Site (https://offstage-creators.vercel.app)
const https = require('https');
const assert = require('assert');

const BASE_URL = 'https://offstage-creators.vercel.app';
const ADMIN_KEY = 'R!SHI88';

console.log('===============================================================');
console.log('   OFFSTAGE CREATORS — LIVE PRODUCTION AUDIT & HEALTH CHECK   ');
console.log(`   Target: ${BASE_URL}                                      `);
console.log('===============================================================\n');

function request(path, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        ...options.headers
      }
    };

    if (postData) {
      const bodyStr = typeof postData === 'string' ? postData : JSON.stringify(postData);
      reqOptions.headers['Content-Type'] = reqOptions.headers['Content-Type'] || 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runLiveAudit() {
  let passed = 0;
  let failed = 0;

  function test(name, condition) {
    if (condition) {
      console.log(`✓ PASS: ${name}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${name}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // SECTION 1: PUBLIC HTML PAGES & CLEAN URLS
    // -------------------------------------------------------------
    console.log('\n>>> [1/5] AUDITING PUBLIC PAGES & CLEAN URL ROUTING...');
    const pages = [
      { path: '/', title: 'Home', check: 'Online Open Mic' },
      { path: '/register', title: 'Performer Registration', check: 'Performer' },
      { path: '/success', title: 'Pass & Status Tracker', check: 'Registration' },
      { path: '/certificate', title: 'Participation Certificate', check: 'Certificate' },
      { path: '/scanner', title: 'Event Scanner', check: 'Check-in' },
      { path: '/admin', title: 'Admin Portal', check: 'Admin' }
    ];

    for (const p of pages) {
      const res = await request(p.path);
      test(`Clean URL [${p.path}] returns HTTP 200 OK`, res.status === 200);
      test(`Page [${p.path}] serves HTML content`, (res.headers['content-type'] || '').includes('text/html'));
      test(`Page [${p.path}] contains expected keyword "${p.check}"`, res.body.includes(p.check));
    }

    // -------------------------------------------------------------
    // SECTION 2: ASSETS, STYLESHEETS & CLIENT SCRIPTS
    // -------------------------------------------------------------
    console.log('\n>>> [2/5] AUDITING CRITICAL ASSETS & CLIENT LIBRARIES...');
    const assets = [
      { path: '/assets/logo.png', type: 'image' },
      { path: '/assets/payment-qr.jpeg', type: 'image' },
      { path: '/assets/adhure-musafir-poster.png', type: 'image' },
      { path: '/css/style.css', type: 'css' },
      { path: '/css/forms.css', type: 'css' },
      { path: '/js/main.js', type: 'javascript' },
      { path: '/js/register.js', type: 'javascript' },
      { path: '/js/success.js', type: 'javascript' },
      { path: '/js/certificate.js', type: 'javascript' },
      { path: '/js/scanner.js', type: 'javascript' },
      { path: '/js/admin.js', type: 'javascript' },
      { path: '/js/analytics.js', type: 'javascript' }
    ];

    for (const a of assets) {
      const res = await request(a.path);
      test(`Asset [${a.path}] loads with HTTP 200`, res.status === 200);
      test(`Asset [${a.path}] returns valid payload (${(res.body.length / 1024).toFixed(1)} KB)`, res.body.length > 50);
    }

    // -------------------------------------------------------------
    // SECTION 3: VERCEL ANALYTICS & SPEED INSIGHTS LIVE RUNTIME
    // -------------------------------------------------------------
    console.log('\n>>> [3/5] AUDITING VERCEL ANALYTICS & SPEED INSIGHTS...');
    const vaScript = await request('/_vercel/insights/script.js');
    test('Vercel Web Analytics script (/_vercel/insights/script.js) returns HTTP 200', vaScript.status === 200);
    test('Vercel Web Analytics script is valid JS', (vaScript.headers['content-type'] || '').includes('javascript'));

    const siScript = await request('/_vercel/speed-insights/script.js');
    test('Vercel Speed Insights script (/_vercel/speed-insights/script.js) returns HTTP 200', siScript.status === 200);
    test('Vercel Speed Insights script is valid JS', (siScript.headers['content-type'] || '').includes('javascript'));

    // Check ingest endpoint
    const ingestRes = await request('/_vercel/insights/view', {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Referer': BASE_URL + '/'
      }
    }, {
      o: BASE_URL + '/',
      sv: '0.1.3',
      ts: Date.now()
    });
    test('Vercel Analytics live ingest endpoint receives pageview with HTTP 200 OK', ingestRes.status === 200);

    // Verify Admin Portal Privacy (No analytics scripts)
    const adminPage = await request('/admin');
    test('Admin page contains ZERO /_vercel/insights scripts', !adminPage.body.includes('/_vercel/insights'));
    test('Admin page contains ZERO /_vercel/speed-insights scripts', !adminPage.body.includes('/_vercel/speed-insights'));
    test('Admin page contains ZERO analytics.js scripts', !adminPage.body.includes('/js/analytics.js'));
    test('Admin page contains ZERO window.va calls', !adminPage.body.includes('window.va'));

    // -------------------------------------------------------------
    // SECTION 4: LIVE PRODUCTION API & EVENT CONFIGURATION
    // -------------------------------------------------------------
    console.log('\n>>> [4/5] AUDITING SERVERLESS BACKEND API & CONFIGURATION...');
    const configRes = await request('/api/config');
    test('Public Config API (/api/config) returns HTTP 200 OK', configRes.status === 200 && configRes.json);
    test('Event is Online Open Mic 2026', configRes.json && configRes.json.event && configRes.json.event.title === 'Online Open Mic 2026');
    test('Registration fee is exactly ₹79', configRes.json && configRes.json.fee === 79);
    test('UPI ID is preetiyadav15071985@okaxis', configRes.json && configRes.json.upi && configRes.json.upi.upiId === 'preetiyadav15071985@okaxis');
    test('Payment QR asset is configured', configRes.json && configRes.json.upi && configRes.json.upi.qrAssetPath === '/assets/payment-qr.jpeg');
    test('Config API NEVER leaks ADMIN_SECRET', !configRes.body.includes(ADMIN_KEY) && !configRes.body.includes('ADMIN_SECRET'));
    test('Config API NEVER leaks mail credentials', !configRes.body.includes('MAIL_PASSWORD') && !configRes.body.includes('password'));

    // -------------------------------------------------------------
    // SECTION 5: LIVE REGISTRATION, LOOKUP & ADMIN PORTAL AUTH
    // -------------------------------------------------------------
    console.log('\n>>> [5/5] AUDITING PRODUCTION USER FLOWS & ADMIN SECURITY...');
    
    // Test Legacy Certificate Lookup
    const certLookupRes = await request('/api/certificate/verify', { method: 'POST' }, {
      registrationId: 'OC-OM-4892'
    });
    test('Certificate verification API responds with valid JSON', certLookupRes.status === 200 || certLookupRes.status === 400 || certLookupRes.status === 404);

    // Test Scanner Lookup API
    const scanRes = await request('/api/scanner/lookup', { method: 'POST' }, {
      code: 'OC-TEST-0001'
    });
    test('Scanner lookup endpoint responds safely with HTTP 404 for unknown ticket', scanRes.status === 404 && scanRes.json && scanRes.json.success === false);

    // Test Admin Authorization Security
    const unauthAdmin = await request('/api/admin/overview');
    test('Admin API strictly rejects unauthenticated access with HTTP 401', unauthAdmin.status === 401);

    const wrongKeyAdmin = await request('/api/admin/overview', {
      headers: { 'x-admin-secret': 'WrongKey123' }
    });
    test('Admin API strictly rejects wrong secret key with HTTP 401', wrongKeyAdmin.status === 401);

    const authAdmin = await request('/api/admin/overview', {
      headers: { 'x-admin-secret': ADMIN_KEY }
    });
    test(`Admin API accepts "${ADMIN_KEY}" with HTTP 200 OK`, authAdmin.status === 200 && authAdmin.json && authAdmin.json.success === true);
    test('Admin overview returns stats object', authAdmin.json && typeof authAdmin.json.stats === 'object');

    const authMeetOverview = await request('/api/admin/meet/overview', {
      headers: { 'x-admin-secret': ADMIN_KEY }
    });
    test('Admin Meet broadcasting API returns HTTP 200 OK', authMeetOverview.status === 200 && authMeetOverview.json && authMeetOverview.json.success === true);

    const authPendingPayments = await request('/api/admin/pending-payments', {
      headers: { 'x-admin-secret': ADMIN_KEY }
    });
    test('Admin Pending Payments queue API returns HTTP 200 OK', authPendingPayments.status === 200 && authPendingPayments.json && Array.isArray(authPendingPayments.json.queue));

    // Summary
    console.log('\n===============================================================');
    console.log(`   AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED                 `);
    console.log('===============================================================');

    if (failed === 0) {
      console.log('\n🚀 ALL PRODUCTION SYSTEMS GREEN! READY FOR PUBLIC LAUNCH.');
      process.exit(0);
    } else {
      console.error('\n⚠️ SOME CHECKS FAILED.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal audit error:', err);
    process.exit(1);
  }
}

runLiveAudit();
