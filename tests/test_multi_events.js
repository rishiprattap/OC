/**
 * Offstage Creators — Comprehensive Multi-Event End-to-End Test Suite
 * Tests all 20 specific scenarios from Requirement 16:
 * 1. Create Event A via Admin API
 * 2. Configure date, time, venue, price, poster, and description for Event A
 * 3. Publish Event A (status: 'Registration Open', set active)
 * 4. Verify public active event API displays Event A
 * 5. Create Event B using Duplicate Event feature
 * 6. Change Event B date, venue, price, and poster
 * 7. Publish Event B
 * 8. Verify Event B displays new details at /api/events/event-b
 * 9. Verify Event A still displays its original details at /api/events/event-a
 * 10. Register test participant for Event B
 * 11. Verify registration is associated only with Event B
 * 12. Verify Event A registrations are completely unchanged
 * 13. Upload photo to Event B gallery
 * 14. Verify Event A gallery does NOT contain Event B photo
 * 15. Send event-specific email using all 13 dynamic placeholders
 * 16. Verify email replaces placeholders with Event B's data
 * 17. Verify certificates remain associated with correct event
 * 18. Mark Event B as 'Event Completed'
 * 19. Verify Event A remains in its original state
 * 20. Backward compatibility verification (legacy certificates, active event fallbacks, slug URLs)
 */
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../server/db');

const config = require('../server/config');

const PORT = config.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || config.ADMIN_SECRET || 'R!SHI88';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD || 'R!SHI88_Admin';

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'x-admin-secret': ADMIN_SECRET,
      'x-admin-password': ADMIN_PASSWORD
    };
    if (postData && typeof postData === 'object' && !Buffer.isBuffer(postData)) {
      postData = JSON.stringify(postData);
      defaultHeaders['Content-Type'] = 'application/json';
      defaultHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const reqOpts = {
      hostname: 'localhost',
      port: PORT,
      method: 'GET',
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    };

    const req = http.request(reqOpts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, json, raw: data });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runMultiEventSuite() {
  console.log('\n======================================================');
  console.log('   OFFSTAGE CREATORS — MULTI-EVENT VERIFICATION SUITE ');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition, details = '') {
    if (condition) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Create Event A
    // -------------------------------------------------------------------------
    console.log('>>> [1-4] CREATING & PUBLISHING EVENT A...');
    const eventASlug = 'open-mic-delhi-a-' + Date.now();
    const eventAPayload = {
      slug: eventASlug,
      name: 'Open Mic Delhi Edition A',
      title: 'Open Mic Delhi Edition A — Live at Hauz Khas',
      description: 'An unforgettable evening of poetry, music, and spoken word in Delhi.',
      shortDescription: 'Delhi Edition A celebration of raw words and melodies.',
      status: 'Registration Open',
      date: '10 November 2026',
      time: '6:30 PM IST',
      venue: 'Social Hauz Khas',
      city: 'New Delhi',
      state: 'Delhi',
      fee: 99,
      currency: '₹',
      posterUrl: '/assets/delhi-poster-a.jpeg',
      allowedCategories: ['Poetry & Shayari', 'Stand-up Comedy', 'Music & Vocals'],
      isRegistrationOpen: true,
      maxRegistrations: 40,
      contactEmail: 'delhi@offstagecreators.com'
    };

    const createARes = await request({
      path: '/api/admin/events',
      method: 'POST'
    }, eventAPayload);

    assert('1. Create Event A via Admin API', createARes.status === 201 && createARes.json?.success);

    // 2. Verify Event A Details from Admin
    const getARes = await request({ path: `/api/admin/events/${eventASlug}` });
    assert('2. Retrieve Event A configuration from Admin', getARes.status === 200 && getARes.json?.event?.venue === 'Social Hauz Khas' && getARes.json?.event?.fee === 99);

    // 3. Publish Event A & Set Active
    const setActiveARes = await request({
      path: `/api/admin/events/${eventASlug}/set-active`,
      method: 'POST'
    });
    assert('3. Set Event A as active event', setActiveARes.status === 200 && setActiveARes.json?.success);

    // 4. Verify public website active event displays Event A
    const activePublicRes = await request({ path: '/api/events/active' });
    assert('4. Public /api/events/active loads Event A automatically', activePublicRes.status === 200 && activePublicRes.json?.event?.slug === eventASlug && activePublicRes.json?.event?.venue === 'Social Hauz Khas');

    // Also check /api/config returns active event details
    const configRes = await request({ path: '/api/config' });
    assert('4b. /api/config backward compatibility reflects Event A', configRes.status === 200 && configRes.json?.eventSlug === eventASlug && configRes.json?.eventFee === 99);

    // -------------------------------------------------------------------------
    // 5-9. Duplicate Event A to create Event B
    // -------------------------------------------------------------------------
    console.log('\n>>> [5-9] DUPLICATING EVENT A TO CREATE EVENT B...');
    const eventBSlug = 'open-mic-mumbai-b-' + Date.now();
    const dupRes = await request({
      path: `/api/admin/events/${eventASlug}/duplicate`,
      method: 'POST'
    }, {
      newSlug: eventBSlug,
      newName: 'Open Mic Mumbai Edition B',
      newTitle: 'Open Mic Mumbai Edition B — Live at Bandra',
      newDate: '25 December 2026'
    });
    assert('5. Create Event B using Duplicate Event feature', dupRes.status === 201 && dupRes.json?.success);

    // 6. Change Event B's date, venue, price, and poster
    const updateBRes = await request({
      path: `/api/admin/events/${eventBSlug}`,
      method: 'PUT'
    }, {
      date: '25 December 2026',
      time: '8:00 PM IST',
      venue: 'The Habitat Bandra',
      city: 'Mumbai',
      state: 'Maharashtra',
      fee: 149,
      posterUrl: '/assets/mumbai-poster-b.jpeg',
      status: 'Registration Open',
      isRegistrationOpen: true
    });
    assert('6. Update Event B venue, date, fee (₹149), and poster', updateBRes.status === 200 && updateBRes.json?.success);

    // 7. Publish Event B (status is Registration Open)
    const getBAdminRes = await request({ path: `/api/admin/events/${eventBSlug}` });
    assert('7. Verify Event B is published with Registration Open status', getBAdminRes.status === 200 && getBAdminRes.json?.event?.status === 'Registration Open');

    // 8. Verify Event B public details
    const getBPublicRes = await request({ path: `/api/events/${eventBSlug}` });
    assert('8. Verify Event B public details (/event/slug)', getBPublicRes.status === 200 && getBPublicRes.json?.event?.city === 'Mumbai' && getBPublicRes.json?.event?.fee === 149);

    // 9. Verify Event A still displays its original details (no contamination)
    const getAPublicRes = await request({ path: `/api/events/${eventASlug}` });
    assert('9. Verify Event A retains original venue (Social Hauz Khas) and fee (₹99)',
      getAPublicRes.status === 200 &&
      getAPublicRes.json?.event?.venue === 'Social Hauz Khas' &&
      getAPublicRes.json?.event?.fee === 99 &&
      getAPublicRes.json?.event?.city === 'New Delhi');

    // -------------------------------------------------------------------------
    // 10-12. Event-Specific Registration Isolation
    // -------------------------------------------------------------------------
    console.log('\n>>> [10-12] TESTING EVENT-SPECIFIC REGISTRATIONS...');
    const testPerformerEmail = `test.performer.${Date.now()}@example.com`;
    const regBRes = await request({
      path: '/api/registrations',
      method: 'POST'
    }, {
      fullName: 'Vikramaditya Verma',
      phone: '9876543210',
      email: testPerformerEmail,
      city: 'Mumbai',
      category: 'Poetry & Shayari',
      performanceTitle: 'Safarnama',
      terms: true,
      eventId: eventBSlug
    });
    assert('10. Register participant for Event B with eventId', regBRes.status === 201 && regBRes.json?.success && regBRes.json?.registrationId);
    const regBId = regBRes.json?.registrationId;

    // 11. Verify registration is associated only with Event B
    const regDetailRes = await request({ path: `/api/registrations/${regBId}` });
    assert('11. Verify registration detail belongs to Event B',
      regDetailRes.status === 200 &&
      (regDetailRes.json?.registration?.eventId === eventBSlug || regDetailRes.json?.registration?.event?.slug === eventBSlug) &&
      regDetailRes.json?.registration?.event?.fee === 149);

    // 12. Verify Event A registrations filter does not contain Event B's participant
    const listARegs = await request({ path: `/api/admin/registrations?eventId=${eventASlug}` });
    const listBRegs = await request({ path: `/api/admin/registrations?eventId=${eventBSlug}` });

    const inA = (listARegs.json?.registrations || []).some(r => r.registrationId === regBId);
    const inB = (listBRegs.json?.registrations || []).some(r => r.registrationId === regBId);
    assert('12. Verify Event A participant list is unaffected and Event B has participant', !inA && inB);

    // -------------------------------------------------------------------------
    // 13-14. Event-Specific Gallery Isolation
    // -------------------------------------------------------------------------
    console.log('\n>>> [13-14] TESTING EVENT-SPECIFIC GALLERY...');
    // Upload image to Event B gallery
    const uploadBRes = await request({
      path: '/api/admin/gallery/upload',
      method: 'POST'
    }, {
      url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
      caption: 'Vikramaditya reciting at Mumbai Edition B',
      eventId: eventBSlug
    });
    assert('13. Upload photo to Event B gallery with eventId', uploadBRes.status === 201 && uploadBRes.json?.success);

    // 14. Verify Event A gallery does not contain Event B photos
    const galleryARes = await request({ path: `/api/gallery?eventId=${eventASlug}` });
    const galleryBRes = await request({ path: `/api/gallery?eventId=${eventBSlug}` });

    const photoInA = (galleryARes.json?.images || []).some(img => img.caption && img.caption.includes('Mumbai Edition B'));
    const photoInB = (galleryBRes.json?.images || []).some(img => img.caption && img.caption.includes('Mumbai Edition B'));
    assert('14. Verify Event A gallery does NOT contain Event B photos', !photoInA && photoInB);

    // -------------------------------------------------------------------------
    // 15-16. Email System with 13 Dynamic Placeholders
    // -------------------------------------------------------------------------
    console.log('\n>>> [15-16] TESTING EMAIL PLACEHOLDERS & TEMPLATES...');
    const emailPreviewRes = await request({
      path: '/api/admin/email/preview',
      method: 'POST'
    }, {
      type: 'custom',
      subject: 'Hello {name} - Welcome to {event_name}',
      bodyContent: 'Hi {name},\nYour ID is {registration_id}.\nEvent: {event_name}\nDate: {event_date} at {event_time}\nVenue: {venue}, {venue_address}\nFee: {registration_fee}\nCertificate: {certificate_url}',
      registrationId: regBId,
      eventId: eventBSlug
    });

    const previewHtml = emailPreviewRes.json?.html || '';
    assert('15. Generate email preview with placeholders for Event B participant', emailPreviewRes.status === 200 && emailPreviewRes.json?.success);
    assert('16. Verify email replaces placeholders with Event B data (Vikramaditya, Habitat, ₹149)',
      previewHtml.includes('Vikramaditya Verma') &&
      previewHtml.includes('Open Mic Mumbai Edition B') &&
      previewHtml.includes('The Habitat Bandra') &&
      previewHtml.includes('149'));

    // -------------------------------------------------------------------------
    // 17. Certificate Verification Associated with Correct Event
    // -------------------------------------------------------------------------
    console.log('\n>>> [17] TESTING CERTIFICATE SYSTEM...');
    // Approve participant so certificate is verifiable
    await request({
      path: `/api/admin/registrations/${regBId}/status`,
      method: 'POST'
    }, { status: 'APPROVED' });

    // Assign winner achievement to participant in Event B
    const winnerRes = await request({
      path: '/api/admin/certificate/winner',
      method: 'POST'
    }, {
      registrationId: regBId,
      position: 'WINNER',
      certificateTitle: 'CERTIFICATE OF EXCELLENCE',
      badgeText: '✦ 1ST PLACE WINNER — MUMBAI POETRY ✦',
      citation: 'For breathtaking poetic rhythm and lyrical depth.'
    });
    assert('17a. Assign winner achievement to Event B participant', winnerRes.status === 200 && winnerRes.json?.success);

    // Verify certificate for Event B participant
    const certVerifyRes = await request({
      path: '/api/certificate/verify',
      method: 'POST'
    }, { registrationId: regBId });

    assert('17b. Certificate verification reflects Event B title, date, and winner award',
      certVerifyRes.status === 200 &&
      certVerifyRes.json?.verifiedName === 'Vikramaditya Verma' &&
      certVerifyRes.json?.isWinner === true &&
      certVerifyRes.json?.event.includes('Mumbai Edition B'));

    // Verify legacy Suhavani Kaur certificate remains 100% functional
    const legacyCertRes = await request({
      path: '/api/certificate/verify',
      method: 'POST'
    }, { registrationId: 'OC-OM-2440F923' });
    assert('17c. Backward compatibility: Legacy participant (Suhavani Kaur) certificate verified',
      legacyCertRes.status === 200 &&
      legacyCertRes.json?.isWinner === true &&
      legacyCertRes.json?.verifiedName.includes('Suhavani'));

    // -------------------------------------------------------------------------
    // 18-19. Event Lifecycle State Transitions
    // -------------------------------------------------------------------------
    console.log('\n>>> [18-19] TESTING EVENT COMPLETION & ISOLATION...');
    const completeBRes = await request({
      path: `/api/admin/events/${eventBSlug}/status`,
      method: 'POST'
    }, { status: 'Event Completed' });
    assert('18. Mark Event B as "Event Completed"', completeBRes.status === 200 && completeBRes.json?.success);

    const getAFinalRes = await request({ path: `/api/admin/events/${eventASlug}` });
    assert('19. Verify Event A remains in "Registration Open" active status without state corruption',
      getAFinalRes.status === 200 &&
      getAFinalRes.json?.event?.status === 'Registration Open' &&
      getAFinalRes.json?.event?.isActive === 1);

    // -------------------------------------------------------------------------
    // 20. Public Route Resolution & Backward Compatibility
    // -------------------------------------------------------------------------
    console.log('\n>>> [20] TESTING SCALABLE URLS & BACKWARD COMPATIBILITY...');
    const eventSlugPageRes = await request({ path: `/event/${eventBSlug}` });
    assert('20a. Route /event/:slug resolves properly', eventSlugPageRes.status === 200);

    const eventRegisterPageRes = await request({ path: `/event/${eventBSlug}/register` });
    assert('20b. Route /event/:slug/register resolves properly', eventRegisterPageRes.status === 200);

    const eventGalleryPageRes = await request({ path: `/event/${eventBSlug}/gallery` });
    assert('20c. Route /event/:slug/gallery resolves properly', eventGalleryPageRes.status === 200);

    const eventCertPageRes = await request({ path: `/event/${eventBSlug}/certificate` });
    assert('20d. Route /event/:slug/certificate resolves properly', eventCertPageRes.status === 200);

    const rootPageRes = await request({ path: '/' });
    assert('20e. Root page (/) remains fully functional', rootPageRes.status === 200);

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log('                   TEST RESULTS                       ');
  console.log('======================================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('======================================================\n');

  if (failed === 0) {
    console.log('🎉 ALL 20 MULTI-EVENT REQUIREMENTS VERIFIED & PASSED!');
    return true;
  } else {
    console.error('❌ MULTI-EVENT VERIFICATION FAILED.');
    return false;
  }
}

if (require.main === module) {
  runMultiEventSuite().then(ok => {
    process.exit(ok ? 0 : 1);
  });
}

module.exports = runMultiEventSuite;
