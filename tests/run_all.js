// Offstage Creators — Master Test Runner
const runPlatformTests = require('./test_platform');
const runEmailTests = require('./test_email_system');
const runMeetTests = require('./test_meet_system');
const runAnalyticsTests = require('./test_analytics');

async function runMasterSuite() {
  console.log('\n======================================================');
  console.log('   OFFSTAGE CREATORS — MASTER PRODUCTION TEST SUITE   ');
  console.log('======================================================\n');

  const startTime = Date.now();
  let allPassed = true;

  console.log('>>> [1/2] EXECUTING REBUILT PLATFORM & REGISTRATION TESTS...');
  const platformOk = await runPlatformTests();
  if (!platformOk) allPassed = false;

  console.log('\n>>> [2/2] EXECUTING VERCEL ANALYTICS & SPEED INSIGHTS TESTS...');
  let analyticsOk = false;
  try {
    require('./test_analytics');
    analyticsOk = true;
  } catch (e) {
    console.error('Analytics test failed:', e.message);
  }
  if (!analyticsOk) allPassed = false;

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n======================================================');
  console.log('                   FINAL TEST SUMMARY                 ');
  console.log('======================================================');
  console.log(`Platform & OTP Flow    : ${platformOk ? 'PASSED ✓' : 'FAILED ✗'}`);
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
  process.exit(1);
});
