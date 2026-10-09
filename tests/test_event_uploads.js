/**
 * Offstage Creators — Event Asset Upload & Management Test Suite
 * Tests file upload controls, server-side validation, storage persistence,
 * multi-image gallery staging, asset replacement/deletion, and public availability.
 */
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const config = require('../server/config');
const app = require('../server/index');

const PORT = config.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || config.ADMIN_SECRET || 'R!SHI88';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.ADMIN_PASSWORD || 'R!SHI88_Admin';

function buildMultipart(fields = {}, files = []) {
  const boundary = '----OffstageUploadBoundary' + Math.random().toString(36).substring(2);
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  for (const file of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname || 'files'}"; filename="${file.filename}"\r\nContent-Type: ${file.mimetype}\r\n\r\n`
    ));
    chunks.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    boundary,
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

function request(options, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const isBuffer = Buffer.isBuffer(data);
    const isJson = data && !isBuffer && typeof data === 'object';
    const payload = isJson ? JSON.stringify(data) : data;

    const reqHeaders = { ...headers };
    if (isJson) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    } else if (isBuffer) {
      reqHeaders['Content-Length'] = payload.length;
    }

    const reqOpts = {
      hostname: 'localhost',
      port: PORT,
      method: options.method || 'GET',
      path: options.path || '/',
      headers: reqHeaders
    };

    const req = http.request(reqOpts, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, json, raw });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runUploadTests() {
  console.log('\n========================================================');
  console.log('   OFFSTAGE CREATORS — EVENT ASSET UPLOAD TEST SUITE    ');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition, details = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc} ${details ? '— ' + details : ''}`);
      failed++;
    }
  }

  const adminHeaders = {
    'x-admin-secret': ADMIN_SECRET,
    'x-admin-password': ADMIN_PASSWORD
  };

  // 1. Security & Authorization Checks
  console.log('>>> [1/7] Testing Upload Endpoint Security & Authorization...');
  {
    const dummyImage = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');
    const mp = buildMultipart({ assetType: 'banner' }, [{ filename: 'banner.gif', mimetype: 'image/gif', content: dummyImage }]);
    
    // Unauthenticated upload
    const unauthRes = await request(
      { method: 'POST', path: '/api/admin/events/upload' },
      mp.body,
      { 'Content-Type': mp.contentType }
    );
    assert('Unauthenticated asset upload is rejected with 401 Unauthorized', unauthRes.status === 401);

    // Unauthenticated gallery deletion
    const unauthDelRes = await request(
      { method: 'DELETE', path: '/api/admin/events/some-event/gallery/999' }
    );
    assert('Unauthenticated gallery deletion is rejected with 401 Unauthorized', unauthDelRes.status === 401);
  }

  // 2. File Validation (MIME Types & Limits)
  console.log('>>> [2/7] Testing File Validation & MIME Restrictions...');
  {
    // A. Reject executable or script upload
    const exePayload = buildMultipart(
      { assetType: 'banner' },
      [{ filename: 'malware.exe', mimetype: 'application/x-msdownload', content: Buffer.from('MZ...fake_exe') }]
    );
    const exeRes = await request(
      { method: 'POST', path: '/api/admin/events/upload' },
      exePayload.body,
      { ...adminHeaders, 'Content-Type': exePayload.contentType }
    );
    assert('Reject executable file uploads with HTTP 400', exeRes.status === 400);

    // B. Reject PDF when assetType is 'banner' (PDF only allowed for receipt_template)
    const pdfInBanner = buildMultipart(
      { assetType: 'banner' },
      [{ filename: 'document.pdf', mimetype: 'application/pdf', content: Buffer.from('%PDF-1.4\n...') }]
    );
    const pdfBannerRes = await request(
      { method: 'POST', path: '/api/admin/events/upload' },
      pdfInBanner.body,
      { ...adminHeaders, 'Content-Type': pdfInBanner.contentType }
    );
    assert('Reject PDF upload when assetType is banner (images only)', pdfBannerRes.status === 400);

    // C. Accept PDF when assetType is 'receipt_template'
    const validPdf = buildMultipart(
      { assetType: 'receipt_template' },
      [{ filename: 'receipt-guide.pdf', mimetype: 'application/pdf', content: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF') }]
    );
    const pdfRes = await request(
      { method: 'POST', path: '/api/admin/events/upload' },
      validPdf.body,
      { ...adminHeaders, 'Content-Type': validPdf.contentType }
    );
    assert('Allow PDF upload when assetType is receipt_template (HTTP 200)', pdfRes.status === 200 && pdfRes.json && pdfRes.json.success === true);
    assert('Receipt template returns valid persistent asset URL', pdfRes.json && typeof pdfRes.json.file?.url === 'string' && pdfRes.json.file.url.length > 0);
  }

  // 3. Upload Event Banner and QR Code
  console.log('>>> [3/7] Uploading Banner and Payment QR Code...');
  let uploadedBannerUrl = '';
  let uploadedQrUrl = '';
  let uploadedReceiptUrl = '';
  {
    // Minimal valid 1x1 PNG
    const png1x1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d400000000049454e44ae426082', 'hex');

    // Banner upload
    const bannerMp = buildMultipart(
      { assetType: 'banner' },
      [{ filename: 'summer-vibes-banner.png', mimetype: 'image/png', content: png1x1 }]
    );
    const bannerRes = await request(
      { method: 'POST', path: '/api/admin/events/upload' },
      bannerMp.body,
      { ...adminHeaders, 'Content-Type': bannerMp.contentType }
    );
    assert('Event banner upload succeeds with HTTP 200', bannerRes.status === 200 && bannerRes.json?.success === true);
    uploadedBannerUrl = bannerRes.json?.file?.url || '';
    assert('Banner URL is generated and non-empty', uploadedBannerUrl.length > 0);

    // Payment QR upload
    const qrMp = buildMultipart(
      { assetType: 'qr' },
      [{ filename: 'custom-upi-qr.png', mimetype: 'image/png', content: png1x1 }]
    );
    const qrRes = await request(
      { method: 'POST', path: '/api/admin/events/upload' },
      qrMp.body,
      { ...adminHeaders, 'Content-Type': qrMp.contentType }
    );
    assert('Payment QR code upload succeeds with HTTP 200', qrRes.status === 200 && qrRes.json?.success === true);
    uploadedQrUrl = qrRes.json?.file?.url || '';
    assert('Payment QR URL is generated and non-empty', uploadedQrUrl.length > 0);

    // Receipt template upload
    const receiptMp = buildMultipart(
      { assetType: 'receipt_template' },
      [{ filename: 'offline-pass-instructions.pdf', mimetype: 'application/pdf', content: Buffer.from('%PDF-1.4\nreceipt instructions\n%%EOF') }]
    );
    const receiptRes = await request(
      { method: 'POST', path: '/api/admin/events/upload' },
      receiptMp.body,
      { ...adminHeaders, 'Content-Type': receiptMp.contentType }
    );
    assert('Payment receipt instructions upload succeeds with HTTP 200', receiptRes.status === 200 && receiptRes.json?.success === true);
    uploadedReceiptUrl = receiptRes.json?.file?.url || '';
  }

  // 4. Create Event With Uploaded Assets & Verify Public API
  console.log('>>> [4/7] Creating Event with Uploaded Assets & Verifying Public Availability...');
  const testSlug = 'upload-test-event-' + Date.now();
  {
    const createPayload = {
      slug: testSlug,
      name: 'Art & Sound Festival',
      title: 'Art & Sound Festival — Live Edition',
      description: 'Experience extraordinary live music, spoken word, and creative installations.',
      date: '2026-11-20',
      time: '6:30 PM IST',
      venue: 'Siri Fort Auditorium, New Delhi',
      city: 'Delhi',
      price: 249,
      totalSeats: 150,
      bannerUrl: uploadedBannerUrl,
      paymentQrUrl: uploadedQrUrl,
      receiptTemplateUrl: uploadedReceiptUrl,
      eventStatus: 'Registration Open',
      isActive: false
    };

    const createRes = await request(
      { method: 'POST', path: '/api/admin/events' },
      createPayload,
      adminHeaders
    );
    assert('Event created with uploaded assets returns HTTP 201', createRes.status === 201 && createRes.json?.success === true);

    // Verify Public Event API displays uploaded assets
    const publicRes = await request({ method: 'GET', path: `/api/events/${testSlug}` });
    assert('Public event endpoint /api/events/:slug returns HTTP 200', publicRes.status === 200);
    const pubEvt = publicRes.json?.event || {};
    assert('Public event has correct uploaded banner URL', pubEvt.bannerUrl === uploadedBannerUrl);
    assert('Public event has correct uploaded payment QR URL', pubEvt.paymentQrUrl === uploadedQrUrl);
    assert('Public event has correct uploaded receipt template URL', pubEvt.receiptTemplateUrl === uploadedReceiptUrl);
  }

  // 5. Multi-Image Event Gallery Upload & Retrieval
  console.log('>>> [5/7] Uploading Multiple Photos to Event Gallery & Listing...');
  let photo1Id = null;
  {
    const png1x1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d400000000049454e44ae426082', 'hex');
    const galleryMp = buildMultipart(
      { assetType: 'gallery' },
      [
        { filename: 'stage-performance-1.png', mimetype: 'image/png', content: png1x1 },
        { filename: 'audience-cheering-2.png', mimetype: 'image/png', content: png1x1 }
      ]
    );

    const galleryUploadRes = await request(
      { method: 'POST', path: `/api/admin/events/${testSlug}/gallery` },
      galleryMp.body,
      { ...adminHeaders, 'Content-Type': galleryMp.contentType }
    );
    assert('Upload multiple photos to event gallery returns HTTP 200', galleryUploadRes.status === 200 && galleryUploadRes.json?.success === true);
    assert('Gallery response returns uploaded images array', Array.isArray(galleryUploadRes.json?.images) && galleryUploadRes.json.images.length === 2);

    // List event gallery
    const listGalleryRes = await request(
      { method: 'GET', path: `/api/admin/events/${testSlug}/gallery` },
      null,
      adminHeaders
    );
    assert('GET /api/admin/events/:slug/gallery returns HTTP 200', listGalleryRes.status === 200);
    assert('Gallery contains at least 2 photos associated with this event', Array.isArray(listGalleryRes.json?.images) && listGalleryRes.json.images.length >= 2);
    if (listGalleryRes.json?.images?.length > 0) {
      photo1Id = listGalleryRes.json.images[0].id;
    }
  }

  // 6. Asset Replacement and Single Image Deletion
  console.log('>>> [6/7] Testing Asset Replacement & Gallery Photo Deletion...');
  {
    // A. Replace banner
    const newBannerMp = buildMultipart(
      { assetType: 'banner' },
      [{ filename: 'brand-new-banner.png', mimetype: 'image/png', content: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d400000000049454e44ae426082', 'hex') }]
    );
    const newBannerRes = await request(
      { method: 'POST', path: '/api/admin/events/upload' },
      newBannerMp.body,
      { ...adminHeaders, 'Content-Type': newBannerMp.contentType }
    );
    const replacementBannerUrl = newBannerRes.json?.file?.url;

    // Update event with replacement banner while keeping QR unchanged
    const updateRes = await request(
      { method: 'PUT', path: `/api/admin/events/${testSlug}` },
      {
        bannerUrl: replacementBannerUrl,
        paymentQrUrl: uploadedQrUrl,
        receiptTemplateUrl: uploadedReceiptUrl
      },
      adminHeaders
    );
    assert('Updating event with replaced banner returns HTTP 200', updateRes.status === 200 && updateRes.json?.success === true);

    // Verify public page has new banner and preserved QR
    const verifyRes = await request({ method: 'GET', path: `/api/events/${testSlug}` });
    const verifyEvt = verifyRes.json?.event || {};
    assert('Public event reflects replaced banner URL', verifyEvt.bannerUrl === replacementBannerUrl);
    assert('Public event preserves untouched payment QR URL', verifyEvt.paymentQrUrl === uploadedQrUrl);

    // B. Delete a photo from gallery
    if (photo1Id) {
      const delRes = await request(
        { method: 'DELETE', path: `/api/admin/events/${testSlug}/gallery/${photo1Id}` },
        null,
        adminHeaders
      );
      assert('Delete individual gallery image returns HTTP 200', delRes.status === 200 && delRes.json?.success === true);

      // Verify gallery count reduced
      const afterDelRes = await request(
        { method: 'GET', path: `/api/admin/events/${testSlug}/gallery` },
        null,
        adminHeaders
      );
      const remainingIds = (afterDelRes.json?.images || []).map(img => img.id);
      assert('Deleted gallery photo is no longer returned in event gallery', !remainingIds.includes(photo1Id));
    }
  }

  // 7. Verify Registration & Payment Integration Integrity & Cleanup
  console.log('>>> [7/7] Verifying Registration & Payment Flow Integrity & Cleaning Up...');
  {
    const configRes = await request({ method: 'GET', path: '/api/config' });
    assert('GET /api/config responds normally with event configuration', configRes.status === 200 && !!configRes.json?.event);

    // Clean up created test event
    await request(
      { method: 'DELETE', path: `/api/admin/events/${testSlug}` },
      null,
      adminHeaders
    );
  }

  console.log('\n--------------------------------------------------------');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('--------------------------------------------------------\n');

  return failed === 0;
}

// Support direct execution via `node tests/test_event_uploads.js`
if (require.main === module) {
  let serverInstance = null;
  function ensureServer() {
    return new Promise((resolve) => {
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
  }

  ensureServer().then(async (started) => {
    if (started) console.log(`[Test Runner] Started ephemeral server on http://localhost:${PORT}`);
    try {
      const ok = await runUploadTests();
      process.exit(ok ? 0 : 1);
    } catch (err) {
      console.error('Test execution failed:', err);
      process.exit(1);
    } finally {
      if (serverInstance) serverInstance.close();
    }
  });
}

module.exports = runUploadTests;
