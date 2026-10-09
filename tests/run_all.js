// Offstage Creators — Master Test Runner
process.env.NODE_ENV = 'test';
const http = require('http');
const app = require('../server/index');
const config = require('../server/config');
const runPlatformTests = require('./test_platform');
const runEmailOtpSystemTests = require('./test_email_otp_system');
const runUploadTests = require('./test_event_uploads');

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
  let analyticsOk = false;

  try {
    console.log('>>> [1/4] EXECUTING EMAIL, OTP & NOTIFICATION TESTS...');
    emailOtpOk = await runEmailOtpSystemTests();
    if (!emailOtpOk) allPassed = false;

    console.log('>>> [2/4] EXECUTING PLATFORM & REGISTRATION JOURNEY TESTS...');
    platformOk = await runPlatformTests();
    if (!platformOk) allPassed = false;

    console.log('>>> [3/4] EXECUTING EVENT ASSET UPLOADS & MEDIA TESTS...');
    uploadsOk = await runUploadTests();
    if (!uploadsOk) allPassed = false;

    console.log('>>> [4/4] EXECUTING VERCEL ANALYTICS & SPEED INSIGHTS TESTS...');
    try {
      require('./test_analytics');
      analyticsOk = true;
    } catch (e) {
      console.error('Analytics test error:', e.message);
    }
    if (!analyticsOk) allPassed = false;

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
  console.log(`Event Asset Uploads    : ${uploadsOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Analytics & Insights   : ${analyticsOk ? 'PASSED ✓' : 'FAILED ✗'}`);
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
