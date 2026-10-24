// Offstage Creators — Master Test Runner
process.env.NODE_ENV = 'test';
const http = require('http');
const app = require('../server/index');
const config = require('../server/config');
const runPlatformTests = require('./test_platform');
const runEmailOtpSystemTests = require('./test_email_otp_system');
const runUploadTests = require('./test_event_uploads');
const runLogoTests = require('./test_email_logo');
const runUserAuthTests = require('./test_user_auth_and_flow');
const runAdminUserManagementTests = require('./test_admin_user_management');
const runPromoAndInstagramTests = require('./test_promo_and_instagram');
const runExportTests = require('./test_export_csv');
const runCertificateSystemTests = require('./test_certificate_system');
const runCertEmailFlowTests = require('./test_certificate_email_flow');

let serverInstance = null;

function ensureServerRunning() {
  return new Promise((resolve) => {
    const testReq = http.request({ hostname: 'localhost', port: config.PORT, path: '/api/config', method: 'GET' }, () => {
      resolve(false); // already running
    });
    testReq.on('error', () => {
      serverInstance = app.listen(config.PORT, () => {
        resolve(true); // started ephemeral server
      });
    });
    testReq.end();
  });
}

async function runMasterSuite() {
  console.log('\n======================================================');
  console.log('   OFFSTAGE CREATORS — MASTER PRODUCTION TEST SUITE   ');
  console.log('======================================================\n');

  const startTime = Date.now();
  let allPassed = true;

  const startedServer = await ensureServerRunning();
  if (startedServer) {
    console.log(`[Test Runner] Started ephemeral server on http://localhost:${config.PORT}`);
  }

  let emailOtpOk = false;
  let platformOk = false;
  let uploadsOk = false;
  let logoOk = false;
  let userAuthOk = false;
  let adminUsersOk = false;
  let analyticsOk = false;
  let promoInstagramOk = false;
  let exportOk = false;
  let certSystemOk = false;
  let certEmailFlowOk = false;

  try {
    console.log('>>> [1/11] EXECUTING EMAIL, OTP & NOTIFICATION TESTS...');
    emailOtpOk = await runEmailOtpSystemTests();
    if (!emailOtpOk) allPassed = false;

    console.log('>>> [2/11] EXECUTING PLATFORM & REGISTRATION JOURNEY TESTS...');
    platformOk = await runPlatformTests();
    if (!platformOk) allPassed = false;

    console.log('>>> [3/11] EXECUTING USER ACCOUNTS, AUTH & RETURNING FLOW TESTS...');
    userAuthOk = await runUserAuthTests();
    if (!userAuthOk) allPassed = false;

    console.log('>>> [4/11] EXECUTING ADMIN USER MANAGEMENT & BLOCK/UNBLOCK TESTS...');
    adminUsersOk = await runAdminUserManagementTests();
    if (!adminUsersOk) allPassed = false;

    console.log('>>> [5/11] EXECUTING EVENT ASSET UPLOADS & MEDIA TESTS...');
    uploadsOk = await runUploadTests();
    if (!uploadsOk) allPassed = false;

    console.log('>>> [6/11] EXECUTING BRAND LOGO & EMAIL TEMPLATE TESTS...');
    logoOk = await runLogoTests();
    if (!logoOk) allPassed = false;

    console.log('>>> [7/11] EXECUTING VERCEL ANALYTICS & SPEED INSIGHTS TESTS...');
    try {
      require('./test_analytics');
      analyticsOk = true;
    } catch (e) {
      console.error('Analytics test error:', e.message);
    }
    if (!analyticsOk) allPassed = false;

    console.log('>>> [8/11] EXECUTING PROMO CODES, REFERRALS & INSTAGRAM TESTS...');
    promoInstagramOk = await runPromoAndInstagramTests();
    if (!promoInstagramOk) allPassed = false;

    console.log('>>> [9/11] EXECUTING CSV & EXCEL (.XLSX) EXPORT TESTS...');
    exportOk = await runExportTests();
    if (!exportOk) allPassed = false;

    console.log('>>> [10/11] EXECUTING EVENT-SCOPED CERTIFICATE SYSTEM TESTS...');
    certSystemOk = await runCertificateSystemTests();
    if (!certSystemOk) allPassed = false;

    console.log('>>> [11/11] EXECUTING CERTIFICATE COLLECTION EMAIL FLOW TESTS...');
    certEmailFlowOk = await runCertEmailFlowTests();
    if (!certEmailFlowOk) allPassed = false;

  } finally {
    if (serverInstance) {
      serverInstance.close();
      console.log('[Test Runner] Ephemeral server closed.');
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n======================================================');
  console.log('                   FINAL TEST SUMMARY                 ');
  console.log('======================================================');
  console.log(`Email, OTP & Alerts    : ${emailOtpOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Platform & User Flow   : ${platformOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`User Accounts & Auth   : ${userAuthOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Admin User Management  : ${adminUsersOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Event Asset Uploads    : ${uploadsOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Email Brand Logo       : ${logoOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Analytics & Insights   : ${analyticsOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Promo Codes & Instagram: ${promoInstagramOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`CSV & Excel Export     : ${exportOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Certificate System     : ${certSystemOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Certificate Email Flow : ${certEmailFlowOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Total Execution Time   : ${duration}s`);
  console.log('======================================================\n');

  if (allPassed) {
    console.log('🎉 ALL SUITES PASSED! PRODUCTION READY.');
    process.exit(0);
  } else {
    console.error('❌ ONE OR MORE TEST SUITES FAILED.');
    process.exit(1);
  }
}

runMasterSuite().catch(err => {
  console.error('Master runner fatal error:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});
