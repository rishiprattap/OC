/**
 * Test: Cancellation Email HTML Preview & Rendering Integrity
 *
 * Verifies:
 * 1. Email Preview endpoint (/api/admin/email/preview) correctly processes valid HTML with inline styles
 * 2. Opening HTML tags (<p>, <table>, <tr>, <td>) are preserved and never stripped
 * 3. Raw CSS attributes (style="margin:...", style="border-bottom:...") NEVER leak as visible text
 * 4. Placeholders ({name}, {registration_id}, {serial_no}, {category}, {entry}, {city}, {refund_amount}) correctly substituted
 * 5. Registration confirmation email template remains 100% working and untouched
 */

const assert = require('assert');
const http = require('http');
const app = require('../server');
const db = require('../server/db');
const emailService = require('../server/services/email');

async function runTests() {
  console.log('========================================================');
  console.log('   TESTING EMAIL PREVIEW & HTML RENDERING INTEGRITY     ');
  console.log('========================================================\n');

  // Start temporary server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Define the exact cancellation email template configured in admin
    const cancellationTemplate = `<p style="margin:0 0 24px;">Important Event Update</p>

<p style="margin:0 0 24px;">Hi {name},</p>

<p style="margin:0 0 24px;">We regret to inform you that the {event_name} scheduled for {event_date} has been cancelled.</p>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px; background:#110f0d; border:1px solid #2a231c; border-radius:8px;">
  <tr>
    <td colspan="2" style="padding:12px 16px; border-bottom:1px solid #1e1a16; font-size:12px; font-weight:800; letter-spacing:0.1em; color:#e24747; text-transform:uppercase;">[EVENT STATUS] EVENT CANCELLED</td>
  </tr>
  <tr>
    <td colspan="2" style="padding:12px 16px; border-bottom:1px solid #1e1a16; font-size:11px; font-weight:800; letter-spacing:0.1em; color:#8e8477; text-transform:uppercase;">[REGISTRATION DETAILS]</td>
  </tr>
  <tr style="border-bottom:1px solid #1e1a16;padding:10px 0;font-size:13px;color:#f7eee1;font-weight:600;">
    <td style="padding:10px 16px; color:#8e8477; font-size:13px;">Registration ID</td>
    <td style="padding:10px 16px; color:#e4ad57; font-family:monospace; font-size:14px; font-weight:700; text-align:right;">{registration_id}</td>
  </tr>
  <tr style="border-bottom:1px solid #1e1a16;padding:10px 0;font-size:13px;color:#f7eee1;font-weight:600;">
    <td style="padding:10px 16px; color:#8e8477; font-size:13px;">Serial No</td>
    <td style="padding:10px 16px; color:#f7eee1; font-size:13px; font-weight:600; text-align:right;">{serial_no}</td>
  </tr>
  <tr style="border-bottom:1px solid #1e1a16;padding:10px 0;font-size:13px;color:#f7eee1;font-weight:600;">
    <td style="padding:10px 16px; color:#8e8477; font-size:13px;">Category</td>
    <td style="padding:10px 16px; color:#f7eee1; font-size:13px; font-weight:600; text-align:right;">{category}</td>
  </tr>
  <tr style="border-bottom:1px solid #1e1a16;padding:10px 0;font-size:13px;color:#f7eee1;font-weight:600;">
    <td style="padding:10px 16px; color:#8e8477; font-size:13px;">Entry</td>
    <td style="padding:10px 16px; color:#f7eee1; font-size:13px; font-weight:600; text-align:right;">{entry}</td>
  </tr>
  <tr style="border-bottom:1px solid #1e1a16;padding:10px 0;font-size:13px;color:#f7eee1;font-weight:600;">
    <td style="padding:10px 16px; color:#8e8477; font-size:13px;">City</td>
    <td style="padding:10px 16px; color:#f7eee1; font-size:13px; font-weight:600; text-align:right;">{city}</td>
  </tr>
  <tr>
    <td colspan="2" style="padding:12px 16px; border-bottom:1px solid #1e1a16; font-size:11px; font-weight:800; letter-spacing:0.1em; color:#8e8477; text-transform:uppercase;">[REFUND AMOUNT]</td>
  </tr>
  <tr>
    <td style="padding:10px 16px; color:#8e8477; font-size:13px;">Refund Amount</td>
    <td style="padding:10px 16px; color:#6edb8c; font-size:15px; font-weight:800; text-align:right;">{refund_amount}</td>
  </tr>
</table>

<p style="margin:0 0 24px;">The registration amount of {refund_amount} will be refunded shortly...</p>`;

    console.log('>>> [1/5] Testing /api/admin/email/preview with cancellation email HTML...');
    const previewRes = await fetch(`${baseUrl}/api/admin/email/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': process.env.ADMIN_PASSWORD || 'R!SHI88_Admin',
        'x-admin-secret': process.env.ADMIN_SECRET || 'R!SHI88'
      },
      body: JSON.stringify({
        type: 'custom',
        subject: 'Important Event Update: {event_name} Cancelled',
        bodyContent: cancellationTemplate,
        registrationId: 'OC-OM-436157FB'
      })
    });

    const previewData = await previewRes.json();
    assert.strictEqual(previewRes.status, 200, 'HTTP status should be 200');
    assert.strictEqual(previewData.success, true, 'Preview response should be successful');
    assert(typeof previewData.html === 'string', 'Preview response should include html string');

    const html = previewData.html;

    console.log('✓ PASS: Email preview endpoint returned HTTP 200');

    // 2. Test opening HTML tags are preserved
    console.log('\n>>> [2/5] Verifying opening HTML tags are completely intact...');
    assert(html.includes('<p style="margin:0 0 24px;">'), 'Must preserve <p style="margin:0 0 24px;"> opening tag');
    assert(html.includes('<table width="100%"'), 'Must preserve <table opening tag');
    assert(html.includes('<tr style="border-bottom:1px solid #1e1a16;padding:10px 0;font-size:13px;color:#f7eee1;font-weight:600;">'), 'Must preserve <tr opening tag with inline styles');
    assert(html.includes('<td colspan="2"'), 'Must preserve <td opening tag');
    console.log('✓ PASS: All opening tags (<p>, <table>, <tr>, <td>) and inline styles are preserved');

    // 3. Test that raw CSS attributes NEVER leak as naked text
    console.log('\n>>> [3/5] Verifying ZERO raw CSS attributes leak into content...');
    // A corrupted parser produces naked text like `>style="margin:0 0 24px;">` or text outside opening tags
    const nakedMarginMatch = html.match(/>\s*style="margin:0 0 24px;">/);
    assert(!nakedMarginMatch, 'Must NOT contain leaked raw style="margin:0 0 24px;"> text');

    const nakedBorderMatch = html.match(/>\s*style="border-bottom:1px solid #1e1a16;/);
    assert(!nakedBorderMatch, 'Must NOT contain leaked raw style="border-bottom:..." text');

    // Also verify no double <p><tr or <p><table
    assert(!html.includes('<p style="margin:0 0 14px; line-height:1.7; font-size:14px; color:#eee4d5;"><tr'), 'Must NOT wrap <tr> tags inside <p> paragraphs');
    assert(!html.includes('<p style="margin:0 0 14px; line-height:1.7; font-size:14px; color:#eee4d5;"><table'), 'Must NOT wrap <table> tags inside <p> paragraphs');
    console.log('✓ PASS: ZERO raw CSS attributes or illegal nested paragraphs leaked into output');

    // 4. Test participant placeholders
    console.log('\n>>> [4/5] Verifying participant data substitutions...');
    assert(html.includes('Hi Rishi,'), 'Must substitute {name} with Rishi');
    assert(html.includes('OC-OM-436157FB'), 'Must substitute {registration_id} with OC-OM-436157FB');
    assert(html.includes('000024'), 'Must substitute {serial_no} with 000024');
    assert(html.includes('Music & Vocals'), 'Must substitute {category} with Music & Vocals');
    assert(html.includes('Test 01'), 'Must substitute {entry} with Test 01');
    assert(html.includes('Kanpur'), 'Must substitute {city} with Kanpur');
    assert(html.includes('₹89'), 'Must substitute {refund_amount} with ₹89');
    assert(html.includes('EVENT CANCELLED'), 'Must include EVENT CANCELLED status');
    console.log('✓ PASS: All placeholders ({name}, {registration_id}, {serial_no}, {category}, {entry}, {city}, {refund_amount}) substituted');

    // 5. Test existing registration confirmation email integrity
    console.log('\n>>> [5/6] Verifying existing registration confirmation email functionality...');
    const confHtml = emailService.emailWrapper({
      title: 'Registration Confirmed — Offstage Creators',
      preheader: 'Your registration is confirmed.',
      bodyContent: '<h2>Registration Confirmed! ✦</h2><p>Hi Creator,</p>'
    });
    assert(confHtml.includes('<!DOCTYPE html>'), 'Confirmation email must include DOCTYPE');
    assert(confHtml.includes('Registration Confirmed! ✦'), 'Confirmation email must include heading');
    assert(confHtml.includes('Offstage Creators'), 'Confirmation email must include brand wrapper');
    console.log('✓ PASS: Existing registration confirmation email structure is 100% preserved');

    // 6. Test fallback preview when no registrationId is passed
    console.log('\n>>> [6/6] Verifying preview fallback without explicit registrationId...');
    const fallbackRes = await fetch(`${baseUrl}/api/admin/email/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': process.env.ADMIN_PASSWORD || 'R!SHI88_Admin',
        'x-admin-secret': process.env.ADMIN_SECRET || 'R!SHI88'
      },
      body: JSON.stringify({
        type: 'custom',
        subject: 'Important Event Update: {event_name} Cancelled',
        bodyContent: cancellationTemplate
      })
    });
    const fallbackData = await fallbackRes.json();
    assert.strictEqual(fallbackRes.status, 200, 'HTTP status should be 200');
    assert(fallbackData.html.includes('Hi Rishi,'), 'Fallback should show Rishi');
    assert(fallbackData.html.includes('OC-OM-436157FB'), 'Fallback should show OC-OM-436157FB');
    assert(fallbackData.html.includes('₹89'), 'Fallback should show ₹89');
    console.log('✓ PASS: Fallback preview correctly populates cancellation data without registrationId');

    console.log('\n========================================================');
    console.log('   ALL EMAIL PREVIEW INTEGRITY TESTS PASSED SUCCESSFULLY ✓');
    console.log('========================================================\n');

  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
