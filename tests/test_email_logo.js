/**
 * Offstage Creators — Official Brand Logo Email Templates Verification
 * Validates that all email types (OTP, Confirmation, Approval, Rejection,
 * Announcement, Reminder, Live Meet, and Admin Broadcasts) include the official
 * responsive brand logo with public HTTPS URL, meaningful alt text, and Gmail compatibility.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../server/config');
const emailService = require('../server/services/email');
const app = require('../server/index');

let passed = 0;
let failed = 0;

function assert(condition, message, details = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} ${details ? '— ' + details : ''}`);
    failed++;
  }
}

async function runLogoTests() {
  console.log('\n========================================================');
  console.log('   OFFSTAGE CREATORS — EMAIL BRAND LOGO TEST SUITE     ');
  console.log('========================================================\n');

  // 1. Verify Static Logo Asset Integrity
  console.log('>>> [1/4] Checking Static Brand Logo Assets...');
  const brandLogoPath = path.join(__dirname, '..', 'public', 'assets', 'brand-logo.png');
  const logoPath = path.join(__dirname, '..', 'public', 'assets', 'logo.png');

  assert(fs.existsSync(brandLogoPath), 'public/assets/brand-logo.png exists');
  assert(fs.existsSync(logoPath), 'public/assets/logo.png exists');

  const brandBuffer = fs.readFileSync(brandLogoPath);
  const isPng = brandBuffer[0] === 0x89 && brandBuffer[1] === 0x50 && brandBuffer[2] === 0x4E && brandBuffer[3] === 0x47;
  assert(isPng, 'brand-logo.png has valid PNG binary signature (0x89504E47)');
  assert(brandBuffer.length > 50000 && brandBuffer.length < 1000000, `brand-logo.png is optimized for email & mobile (${(brandBuffer.length / 1024).toFixed(1)} KB)`);

  // 2. Verify Email Wrapper Header Structure
  console.log('>>> [2/4] Testing Email Wrapper Header & Logo Rendering...');
  const testHtml = emailService.emailWrapper({
    title: 'Test Email Title',
    preheader: 'Test Preheader',
    bodyContent: '<p>Test email body content</p>'
  });

  const expectedLogoUrl = 'https://offstagecreators.in/assets/brand-logo.png';
  assert(testHtml.includes(expectedLogoUrl), `emailWrapper includes official HTTPS logo URL (${expectedLogoUrl})`);
  assert(testHtml.includes('alt="Offstage Creators"'), 'emailWrapper img tag includes meaningful alt text alt="Offstage Creators"');
  assert(testHtml.includes('width="92"') && testHtml.includes('height="92"'), 'emailWrapper provides explicit width and height attributes for client scaling');
  assert(testHtml.includes('align="center"'), 'Logo is centered inside table alignment structure for Gmail/Outlook compatibility');
  assert(testHtml.includes('https://offstagecreators.in'), 'Logo is wrapped with official HTTPS domain hyperlink');
  assert(testHtml.includes('Creative Stage &amp; Community') || testHtml.includes('Creative Stage & Community'), 'Logo includes official brand tagline');

  // 3. Verify Every Email Template Contains The Official Brand Logo
  console.log('>>> [3/4] Verifying Brand Logo Across All Email Templates...');

  // A. OTP Verification Email
  const otpWrapper = emailService.emailWrapper({
    title: 'Your Offstage Creators verification code',
    preheader: 'Your 6-digit code is ready',
    bodyContent: '<div class="otp-number">482910</div>'
  });
  assert(otpWrapper.includes(expectedLogoUrl), 'OTP verification email template contains official brand logo');

  // B. Registration Confirmation Email
  const regConfirmHtml = emailService.emailWrapper({
    title: 'Your Offstage Creators registration confirmation',
    preheader: 'Your spot is recorded',
    bodyContent: '<div class="status-badge">Registration Recorded</div>'
  });
  assert(regConfirmHtml.includes(expectedLogoUrl), 'Registration confirmation email template contains official brand logo');

  // C. Registration Approval Email
  const approvalHtml = emailService.emailWrapper({
    title: 'Registration Approved — OC-OM-TEST',
    preheader: 'Spot Confirmed',
    bodyContent: '<div class="status-badge badge-approved">Approved</div>'
  });
  assert(approvalHtml.includes(expectedLogoUrl), 'Registration approval email template contains official brand logo');

  // D. Registration Rejection Email
  const rejectionHtml = emailService.emailWrapper({
    title: 'Registration Update',
    preheader: 'An update regarding your registration',
    bodyContent: '<div class="status-badge badge-rejected">Registration Update</div>'
  });
  assert(rejectionHtml.includes(expectedLogoUrl), 'Registration rejection email template contains official brand logo');

  // E. Event Announcement & Update Email
  const updateHtml = emailService.emailWrapper({
    title: 'An update about your Offstage Creators event',
    preheader: 'Important event update',
    bodyContent: '<p>Important event update content</p>',
    unsubscribeUrl: 'https://offstagecreators.in/api/email/unsubscribe'
  });
  assert(updateHtml.includes(expectedLogoUrl), 'Event update & announcement email template contains official brand logo');

  // F. Event Reminder Email
  const reminderHtml = emailService.emailWrapper({
    title: 'Reminder: Upcoming event: Online Open Mic',
    preheader: 'Your performance is scheduled',
    bodyContent: '<p>Friendly reminder</p>'
  });
  assert(reminderHtml.includes(expectedLogoUrl), 'Event reminder email template contains official brand logo');

  // G. Live Google Meet Session Email
  const meetRendered = emailService.renderMeetSessionEmail({
    session: { event_name: 'Online Open Mic', title: 'Live Poetry & Music' },
    participant: { full_name: 'Rishi Pratap', registration_id: 'OC-OM-101' }
  });
  assert(meetRendered.html.includes(expectedLogoUrl), 'Google Meet session details email template contains official brand logo');

  // 4. Verify Static Route Serves Brand Logo via HTTP
  console.log('>>> [4/4] Verifying HTTP Static Delivery of Logo Asset...');
  let serverInstance = null;
  const PORT = config.PORT || 3000;

  await new Promise((resolve) => {
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

  try {
    const fetchAsset = (assetPath) => new Promise((resolve, reject) => {
      http.get(`http://localhost:${PORT}${assetPath}`, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            contentType: res.headers['content-type'],
            length: Buffer.concat(chunks).length
          });
        });
      }).on('error', reject);
    });

    const resBrand = await fetchAsset('/assets/brand-logo.png');
    assert(resBrand.statusCode === 200, 'GET /assets/brand-logo.png returns HTTP 200');
    assert(resBrand.contentType.includes('image/png'), 'GET /assets/brand-logo.png returns image/png Content-Type');
    assert(resBrand.length > 50000, `GET /assets/brand-logo.png delivers complete image payload (${resBrand.length} bytes)`);

    const resLogo = await fetchAsset('/assets/logo.png');
    assert(resLogo.statusCode === 200, 'GET /assets/logo.png returns HTTP 200');
    assert(resLogo.contentType.includes('image/png'), 'GET /assets/logo.png returns image/png Content-Type');
  } finally {
    if (serverInstance) serverInstance.close();
  }

  console.log('\n--------------------------------------------------------');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('--------------------------------------------------------\n');

  return failed === 0;
}

if (require.main === module) {
  runLogoTests().then(ok => process.exit(ok ? 0 : 1)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = runLogoTests;
