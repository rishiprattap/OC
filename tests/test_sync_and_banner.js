/**
 * Offstage Creators — Admin & Public Sync & Banner Verification Test
 */
process.env.NODE_ENV = 'test';
const assert = require('assert');
const http = require('http');
const app = require('../server/index');
const config = require('../server/config');
const BASE_URL = `http://localhost:${config.PORT || 3000}`;
const ADMIN_SECRET = config.ADMIN_SECRET || process.env.ADMIN_SECRET || 'R!SHI88';

let serverInstance = null;

function ensureServerRunning() {
  return new Promise((resolve) => {
    const testReq = http.request({ hostname: 'localhost', port: config.PORT || 3000, path: '/api/config', method: 'GET' }, () => {
      resolve(false);
    });
    testReq.on('error', () => {
      serverInstance = app.listen(config.PORT || 3000, () => {
        resolve(true);
      });
    });
    testReq.end();
  });
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  headers['x-admin-secret'] = ADMIN_SECRET;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });
  return res;
}

async function run() {
  await ensureServerRunning();
  console.log('======================================================');
  console.log('   TESTING ADMIN & PUBLIC EVENT SYNCHRONIZATION      ');
  console.log('======================================================\n');

  // 1. Test Admin Events List & Banner Fields
  console.log('>>> [1/6] Checking Admin Events Media & Metadata...');
  const adminRes = await request('/api/admin/events');
  assert.strictEqual(adminRes.status, 200, 'Admin events should return 200');
  const cacheControl = adminRes.headers.get('cache-control') || '';
  assert.ok(cacheControl.includes('no-store'), 'Admin events endpoint must have no-store cache control');
  
  const adminData = await adminRes.json();
  assert.ok(adminData.success, 'Admin events response must be successful');
  assert.ok(Array.isArray(adminData.events) && adminData.events.length >= 2, 'Should have at least 2 events');

  for (const evt of adminData.events) {
    console.log(`  Event: ${evt.slug} | Active: ${evt.isActive} | Banner: ${evt.bannerUrl}`);
    assert.ok(evt.bannerUrl, `Event ${evt.slug} must have bannerUrl`);
    assert.ok(evt.posterUrl, `Event ${evt.slug} must have posterUrl`);
    assert.ok(!evt.bannerUrl.includes('poster.jpeg'), `Event ${evt.slug} bannerUrl must not be broken poster.jpeg`);
    assert.ok(!evt.posterUrl.includes('poster.jpeg'), `Event ${evt.slug} posterUrl must not be broken poster.jpeg`);
    assert.strictEqual(evt.banner, evt.bannerUrl, 'banner alias must equal bannerUrl');
    assert.strictEqual(evt.poster, evt.posterUrl, 'poster alias must equal posterUrl');
    assert.ok(evt.date, `Event ${evt.slug} must have date populated (not TBA)`);
    assert.ok(evt.venue, `Event ${evt.slug} must have venue populated`);
    assert.strictEqual(typeof evt.registrationCount, 'number', 'registrationCount must be a number');
  }
  console.log('  ✓ PASS: All admin events have valid banners, posters, dates, and venues\n');

  // 2. Check Public Active Event matches Admin Active Event
  console.log('>>> [2/6] Checking Source of Truth between Admin & Public Active Event...');
  const publicActiveRes = await request('/api/events/active');
  assert.strictEqual(publicActiveRes.status, 200);
  const publicActiveData = await publicActiveRes.json();
  assert.ok(publicActiveData.success && publicActiveData.event);

  const adminActiveEvt = adminData.events.find(e => e.isActive);
  assert.ok(adminActiveEvt, 'There must be an active event in Admin');
  assert.strictEqual(publicActiveData.event.slug, adminActiveEvt.slug, 'Public active event slug must match Admin active event');
  assert.strictEqual(publicActiveData.event.title, adminActiveEvt.title, 'Public active event title must match Admin');
  assert.strictEqual(publicActiveData.event.bannerUrl, adminActiveEvt.bannerUrl, 'Public active event banner must match Admin');
  console.log(`  ✓ PASS: Public site matches Admin active event: ${adminActiveEvt.slug}\n`);

  // 3. Test "Set Active" Switching
  console.log('>>> [3/6] Testing "Set Active" switching to delhi-adhure-musafir-2026...');
  const setActiveRes = await request('/api/admin/events/delhi-adhure-musafir-2026/set-active', { method: 'POST' });
  assert.strictEqual(setActiveRes.status, 200);
  const setActiveData = await setActiveRes.json();
  assert.ok(setActiveData.success);

  // Check public active event
  const newPublicActiveRes = await request('/api/events/active');
  const newPublicActiveData = await newPublicActiveRes.json();
  assert.strictEqual(newPublicActiveData.event.slug, 'delhi-adhure-musafir-2026', 'Public active event must now be delhi-adhure-musafir-2026');

  // Check public homepage SSR injection
  const homeRes = await request('/');
  const homeHtml = await homeRes.text();
  assert.ok(homeHtml.includes('delhi-adhure-musafir-2026'), 'Homepage SSR must inject delhi-adhure-musafir-2026');
  assert.ok(!homeHtml.includes('online-open-mic-2026"'), 'Homepage SSR must not have online-open-mic-2026 as active __INITIAL_EVENT__');

  // Check admin events list reflection
  const adminAfterSwitch = await (await request('/api/admin/events')).json();
  const delhiInAdmin = adminAfterSwitch.events.find(e => e.slug === 'delhi-adhure-musafir-2026');
  const onlineInAdmin = adminAfterSwitch.events.find(e => e.slug === 'online-open-mic-2026');
  assert.strictEqual(delhiInAdmin.isActive, true, 'Delhi show must be isActive: true in Admin');
  assert.strictEqual(onlineInAdmin.isActive, false, 'Online open mic must be isActive: false in Admin');
  console.log('  ✓ PASS: "Set Active" properly updated database, admin state, and public homepage\n');

  // 4. Test Editing Event Data and Verifying Immediate Reflection
  console.log('>>> [4/6] Testing Event Edit in Admin & Public Reflection...');
  const editPayload = {
    ...delhiInAdmin,
    title: 'Adhure Musafir — Live Delhi Showcase',
    fee: 249
  };
  const editRes = await request('/api/admin/events/delhi-adhure-musafir-2026', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(editPayload)
  });
  assert.strictEqual(editRes.status, 200);

  // Check public single event endpoint
  const publicDelhiRes = await request('/api/events/delhi-adhure-musafir-2026');
  const publicDelhiData = await publicDelhiRes.json();
  assert.strictEqual(publicDelhiData.event.title, 'Adhure Musafir — Live Delhi Showcase', 'Public title must reflect edit immediately');
  assert.strictEqual(publicDelhiData.event.fee, 249, 'Public fee must reflect edit immediately');

  // Revert edit
  await request('/api/admin/events/delhi-adhure-musafir-2026', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...editPayload, title: 'Adhure Musafir', fee: 199 })
  });
  console.log('  ✓ PASS: Event edits immediately reflect on public page without delay\n');

  // 5. Test Cache-Control Headers on all routes
  console.log('>>> [5/6] Verifying no-cache headers across public and admin routes...');
  const pathsToTest = ['/', '/admin', '/events', '/api/events/active', '/api/events', '/api/admin/events', '/api/config'];
  for (const p of pathsToTest) {
    const res = await request(p);
    const cc = res.headers.get('cache-control') || '';
    assert.ok(cc.includes('no-cache') || cc.includes('no-store'), `${p} must return no-cache or no-store (got: "${cc}")`);
  }
  console.log('  ✓ PASS: No-cache headers properly enforced on all dynamic routes\n');

  // 6. Switch Active Event back to online-open-mic-2026
  console.log('>>> [6/6] Switching active event back to online-open-mic-2026...');
  await request('/api/admin/events/online-open-mic-2026/set-active', { method: 'POST' });
  const restoredPublicActive = await (await request('/api/events/active')).json();
  assert.strictEqual(restoredPublicActive.event.slug, 'online-open-mic-2026');
  console.log('  ✓ PASS: Active event restored to online-open-mic-2026\n');

  console.log('======================================================');
  console.log('   🎉 ALL SYNCHRONIZATION & BANNER TESTS PASSED!      ');
  console.log('======================================================');
  if (serverInstance) serverInstance.close();
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  if (serverInstance) serverInstance.close();
  process.exit(1);
});
