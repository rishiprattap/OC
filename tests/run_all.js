// Offstage Creators — Master Test Runner
const runPlatformTests = require('./test_platform');
const runEmailTests = require('./test_email_system');
const runMeetTests = require('./test_meet_system');

async function runMasterSuite() {
  console.log('\n======================================================');
  console.log('   OFFSTAGE CREATORS — MASTER PRODUCTION TEST SUITE   ');
  console.log('======================================================\n');

  const startTime = Date.now();
  let allPassed = true;

  console.log('>>> [1/3] EXECUTING PLATFORM & REGISTRATION TESTS...');
  const platformOk = await runPlatformTests();
  if (!platformOk) allPassed = false;

  console.log('\n>>> [2/3] EXECUTING GMAIL SMTP & EMAIL SYSTEM TESTS...');
  const emailOk = await runEmailTests();
  if (!emailOk) allPassed = false;

  console.log('\n>>> [3/3] EXECUTING GOOGLE MEET BROADCAST & RETRY TESTS...');
  const meetOk = await runMeetTests();
  if (!meetOk) allPassed = false;

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n======================================================');
  console.log('                   FINAL TEST SUMMARY                 ');
  console.log('======================================================');
  console.log(`Platform & Payment Flow : ${platformOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Email Service & OTP     : ${emailOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Google Meet System      : ${meetOk ? 'PASSED ✓' : 'FAILED ✗'}`);
  console.log(`Total Execution Time    : ${duration}s`);
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
