// Comprehensive Verification Test Suite for Vercel Web Analytics & Speed Insights
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

console.log('========================================================');
console.log('   VERIFYING VERCEL ANALYTICS & SPEED INSIGHTS SETUP   ');
console.log('========================================================\n');

const publicDir = path.join(__dirname, '..', 'public');

// 1. Check HTML script inclusions
const publicPages = [
  'index.html',
  'register.html',
  'success.html',
  'certificate.html',
  'scanner.html'
];

publicPages.forEach((page) => {
  const content = fs.readFileSync(path.join(publicDir, page), 'utf8');
  assert(content.includes('/_vercel/insights/script.js'), `[${page}] must include Vercel Web Analytics script`);
  assert(content.includes('/_vercel/speed-insights/script.js'), `[${page}] must include Vercel Speed Insights script`);
  assert(content.includes('/js/analytics.js'), `[${page}] must include /js/analytics.js`);
  assert(content.includes('window.va = window.va || function ()'), `[${page}] must initialize window.va queue`);
  assert(content.includes('window.si = window.si || function ()'), `[${page}] must initialize window.si queue`);
  console.log(`✓ PASS: ${page} contains official Vercel Analytics, Speed Insights, and analytics.js`);
});

// 2. Check Admin Privacy (ZERO tracking scripts)
const adminHtml = fs.readFileSync(path.join(publicDir, 'admin.html'), 'utf8');
assert(!adminHtml.includes('/_vercel/insights/script.js'), 'admin.html MUST NOT include Vercel Insights');
assert(!adminHtml.includes('/_vercel/speed-insights/script.js'), 'admin.html MUST NOT include Speed Insights');
assert(!adminHtml.includes('/js/analytics.js'), 'admin.html MUST NOT include analytics.js');
assert(!adminHtml.includes('window.va'), 'admin.html MUST NOT include window.va');
assert(!adminHtml.includes('window.si'), 'admin.html MUST NOT include window.si');
console.log('✓ PASS: admin.html has ZERO analytics scripts (100% private)');

// 3. Test Analytics module logic & privacy filters in Node sandbox
const analyticsCode = fs.readFileSync(path.join(publicDir, 'js', 'analytics.js'), 'utf8');

// Create mock window environment
const mockEvents = [];
const mockQueue = [];
let beforeSendHook = null;
let speedInsightsBeforeSendHook = null;

const mockWindow = {
  location: {
    pathname: '/register',
    search: '?utm_source=instagram&email=test@example.com&phone=9876543210'
  },
  va: function(action, arg) {
    if (action === 'beforeSend') {
      beforeSendHook = arg;
    } else if (action === 'event') {
      mockEvents.push(arg);
    }
  },
  si: function(action, arg) {
    if (action === 'beforeSend') {
      speedInsightsBeforeSendHook = arg;
    }
  }
};

// Execute analytics in mock context
const vm = require('vm');
const context = vm.createContext({
  window: mockWindow,
  console: console,
  URL: global.URL
});
vm.runInContext(analyticsCode, context);

assert(typeof mockWindow.trackEvent === 'function', 'trackEvent function must be exposed globally');
console.log('✓ PASS: window.trackEvent is defined and exposed');

// Test beforeSend filtering for /admin
mockWindow.location.pathname = '/admin';
const adminResult = beforeSendHook({ url: 'http://localhost/admin' });
assert(adminResult === null, 'beforeSend MUST drop events when on /admin');

mockWindow.location.pathname = '/admin/meet';
const adminSubpathResult = beforeSendHook({ url: 'http://localhost/admin/meet' });
assert(adminSubpathResult === null, 'beforeSend MUST drop events on admin subpaths');

const siAdminResult = speedInsightsBeforeSendHook({ url: 'http://localhost/admin' });
assert(siAdminResult === null, 'Speed Insights beforeSend MUST drop events on /admin');
console.log('✓ PASS: beforeSend hooks actively drop /admin events for both Web Analytics & Speed Insights');

// Test query scrubbing on public pages
mockWindow.location.pathname = '/success';
const cleanResult = beforeSendHook({
  url: 'http://localhost/success?id=OC-1234&phone=9876543210&secret=mykey&page=1'
});
assert(cleanResult !== null, 'Public event should not be dropped');
assert(!cleanResult.url.includes('id='), 'Sensitive param id should be scrubbed');
assert(!cleanResult.url.includes('phone='), 'Sensitive param phone should be scrubbed');
assert(!cleanResult.url.includes('secret='), 'Sensitive param secret should be scrubbed');
assert(cleanResult.url.includes('page=1'), 'Non-sensitive param page should be preserved');
console.log('✓ PASS: URL query scrubber strips sensitive params (id, phone, secret, etc.)');

// Test payload sanitization: block personal names, phones, emails, UTRs
mockWindow.trackEvent('registration_test', {
  fullName: 'John Doe',
  phone: '9876543210',
  email: 'john@example.com',
  transactionId: 'UTR9988776655',
  utr: 'UTR9988776655',
  registrationId: 'OC-OM-1234',
  category: 'Poetry',
  format: 'png'
});

const lastEvent = mockEvents[mockEvents.length - 1];
assert(lastEvent.name === 'registration_test', 'Event name matches');
assert(lastEvent.data.category === 'Poetry', 'Safe data preserved');
assert(lastEvent.data.format === 'png', 'Safe data preserved');
assert(!lastEvent.data.fullName, 'Full name was stripped');
assert(!lastEvent.data.phone, 'Phone was stripped');
assert(!lastEvent.data.email, 'Email was stripped');
assert(!lastEvent.data.transactionId, 'transactionId was stripped');
assert(!lastEvent.data.utr, 'utr was stripped');
assert(!lastEvent.data.registrationId, 'registrationId was stripped');
console.log('✓ PASS: Sensitive data keys (names, phones, emails, UTRs, IDs) are stripped from event payloads');

// Test regex redaction for values that look like emails or phone numbers
mockWindow.trackEvent('custom_check', {
  safeLabel: 'Button A',
  unsafeEmailInValue: 'contact me at organizer@gmail.com',
  unsafePhoneInValue: 'call +919876543210 now'
});

const regexEvent = mockEvents[mockEvents.length - 1];
assert(regexEvent.data.safeLabel === 'Button A', 'Safe value kept');
assert(!regexEvent.data.unsafeEmailInValue, 'Value containing email pattern was dropped');
assert(!regexEvent.data.unsafePhoneInValue, 'Value containing phone pattern was dropped');
console.log('✓ PASS: String values matching email or phone regex patterns are sanitized');

// 4. Test Local Server Stubs via HTTP
function testEndpoint(urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port: 3000, path: urlPath }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, contentType: res.headers['content-type'], body: data });
      });
    }).on('error', reject);
  });
}

async function runAnalyticsTests() {
  try {
    const r1 = await testEndpoint('/_vercel/insights/script.js');
    assert(r1.statusCode === 200, '/_vercel/insights/script.js returned 200');
    assert(r1.contentType.includes('javascript'), 'returns javascript content type');
    console.log('✓ PASS: Local server serves /_vercel/insights/script.js stub with 200 OK');

    const r2 = await testEndpoint('/_vercel/speed-insights/script.js');
    assert(r2.statusCode === 200, '/_vercel/speed-insights/script.js returned 200');
    assert(r2.contentType.includes('javascript'), 'returns javascript content type');
    console.log('✓ PASS: Local server serves /_vercel/speed-insights/script.js stub with 200 OK');

    console.log('\n========================================================');
    console.log('   🎉 ALL ANALYTICS VERIFICATION CHECKS PASSED!   ');
    console.log('========================================================');
    return true;
  } catch (err) {
    console.error('Analytics test failure:', err);
    return false;
  }
}

if (require.main === module) {
  runAnalyticsTests().then(ok => process.exit(ok ? 0 : 1));
}

module.exports = runAnalyticsTests;
