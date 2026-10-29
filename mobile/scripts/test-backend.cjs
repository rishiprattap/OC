/* Isolated public API contract test. Never connects to production or sends email. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const fixture = fs.mkdtempSync(path.join(root, 'mobile/.test-runtime-'));
fs.cpSync(path.join(root, 'server'), path.join(fixture, 'server'), { recursive: true });
fs.mkdirSync(path.join(fixture, 'data'));
const event = {
  id: 1,
  slug: 'mobile-test',
  title: 'Mobile Contract Test',
  name: 'Mobile Contract Test',
  status: 'registration_open',
  is_active: 1,
  is_published: 1,
  reg_enabled: 1,
  event_date: '2030-01-01',
  start_time: '19:00',
  venue_name: 'Test venue',
  fee: 100,
  is_paid: 1,
  registration_provider: 'internal',
  allowed_categories: '["Poetry"]',
  certificate_enabled: 1,
};
fs.writeFileSync(
  path.join(fixture, 'data/local_store.json'),
  JSON.stringify({
    events: [
      event,
      { ...event, id: 2, slug: 'mobile-other', is_active: 0 },
      { ...event, id: 3, slug: 'mobile-hidden', is_published: 0 },
    ],
    registrations: [
      {
        id: 1,
        registration_id: 'OC-CERT-TEST',
        event_id: 'mobile-test',
        full_name: 'Certificate Tester',
        email: 'certificate@example.test',
        phone: '9000000002',
        city: 'Test City',
        category: 'Poetry',
        reg_status: 'APPROVED',
        payment_status: 'PAID',
        checked_in: 1,
        certificate_eligible: 1,
        otp_verified: 1,
        amount: 100,
      },
    ],
    settings: { registration_status: 'OPEN' },
    users: [],
    passwordResets: [],
    otpSessions: [],
    gallery: [
      {
        id: 1,
        event_id: 'mobile-test',
        image_url: '/assets/logo.png',
        caption: 'Test photo',
        is_published: 1,
      },
    ],
    legacyCertificates: [],
    promoCodes: [
      {
        id: 1,
        code: 'MOBILE25',
        is_active: 1,
        discount_type: 'percentage',
        discount_value: 25,
        eligible_events: 'ALL',
        per_user_limit: 10,
      },
    ],
  }),
);
for (const key of Object.keys(process.env))
  if (/^(POSTGRES|DATABASE|RESEND|MAIL_|SMTP|VERCEL|NOW_REGION)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  NODE_ENV: 'test',
  SESSION_SECRET: 'local-fixture-only-session-secret',
  OTP_SECRET: 'local-fixture-only-otp-secret',
  APP_URL: 'http://localhost',
  ADMIN_PASSWORD: '',
});
const requireFixture = createRequire(path.join(fixture, 'index.cjs'));
const email = requireFixture('./server/services/email');
const sent = [];
for (const key of Object.keys(email))
  if (key.startsWith('send'))
    email[key] = async (payload) => {
      sent.push({ type: key, ...payload });
      return { success: true };
    };
const app = requireFixture('./server/index');
let cookie = '';
let passed = 0;
const server = app.listen(0, '127.0.0.1', async () => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function call(route, method = 'GET', body, authenticated = true) {
    const multipart = body instanceof FormData;
    const response = await fetch(origin + route, {
      method,
      headers: {
        ...(authenticated && cookie ? { Cookie: cookie } : {}),
        ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
    const setCookie = response.headers.get('set-cookie');
    if (authenticated && setCookie) cookie = setCookie.split(';')[0];
    const data = await response.json();
    return { status: response.status, data };
  }
  function check(name, fn) {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  }
  try {
    const events = await call('/api/events');
    check('app publication filter excludes hidden events', () => {
      assert.equal(events.status, 200);
      const visible = events.data.events.filter(
        (e) => e.isPublished && e.slug.startsWith('mobile-'),
      );
      assert.equal(visible.length, 2);
      assert.ok(!visible.some((e) => e.slug === 'mobile-hidden'));
    });
    const gallery = await call('/api/gallery?eventId=mobile-test');
    check('event gallery contract', () =>
      assert.equal(gallery.data.images[0].eventId, 'mobile-test'),
    );
    const anonymous = await call('/api/user/profile');
    check('profile requires session', () => assert.equal(anonymous.status, 401));
    const profile = {
      name: 'Mobile Tester',
      email: 'mobile@example.test',
      phone: '9000000001',
      age: 25,
      city: 'Test City',
      instagram: '@mobile_test',
      password: 'Fixture-Password-123!',
    };
    const signup = await call('/api/auth/register', 'POST', profile);
    check('account creation requests OTP', () =>
      assert.equal(signup.data.requiresVerification, true),
    );
    const otp = sent.findLast((m) => m.type === 'sendAccountVerificationEmail').otp;
    const verified = await call('/api/auth/verify-email', 'POST', { email: profile.email, otp });
    check('email verification creates user session', () => {
      assert.equal(verified.status, 200);
      assert.match(cookie, /^oc.sid=/);
    });
    const me = await call('/api/auth/me');
    check('persistent session can retrieve same user', () =>
      assert.equal(me.data.user.email, profile.email),
    );
    const edit = await call('/api/user/profile', 'PUT', { ...profile, city: 'Updated City' });
    check('profile updates', () => assert.equal(edit.data.user.city, 'Updated City'));
    const promo = await call('/api/registrations/validate-promo', 'POST', {
      code: 'MOBILE25',
      eventSlug: 'mobile-test',
      email: profile.email,
    });
    check('server-calculated promo fee', () => assert.equal(promo.data.finalFee, 75));
    const invalidPromo = await call('/api/registrations/validate-promo', 'POST', {
      code: 'NO-SUCH-CODE',
      eventSlug: 'mobile-test',
    });
    check('invalid promo rejected', () => assert.equal(invalidPromo.status, 400));
    const registration = await call('/api/registrations', 'POST', {
      fullName: profile.name,
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      age: profile.age,
      category: 'Poetry',
      performanceTitle: 'Native test',
      eventId: 'mobile-test',
      terms: true,
      promoCode: 'MOBILE25',
    });
    check('registration uses verified website account and authoritative fee', () => {
      assert.equal(registration.status, 201);
      assert.equal(registration.data.skipOtp, true);
      assert.equal(registration.data.finalFee, 75);
    });
    const id = registration.data.registrationId;
    const ticket = await call('/api/registrations/' + id);
    check('unpaid registration is not a valid pass', () => {
      assert.equal(ticket.data.registration.isValidPass, false);
      assert.equal(ticket.data.registration.eventId, 'mobile-test');
    });
    const free = await call('/api/payments/confirm-free', 'POST', { registrationId: id });
    check('paid event cannot bypass payment as free', () => assert.equal(free.status, 400));
    const proof = new FormData();
    proof.append('registrationId', id);
    proof.append('transactionId', 'TEST-UTR-123456');
    proof.append(
      'screenshot',
      new Blob(
        [
          Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4GQAAAAASUVORK5CYII=',
            'base64',
          ),
        ],
        { type: 'image/png' },
      ),
      'proof.png',
    );
    const submitted = await call('/api/payments/submit-proof', 'POST', proof);
    check('multipart payment proof accepted', () => assert.equal(submitted.status, 200));
    const pending = await call('/api/registrations/' + id);
    check('submitted proof stays pending, never fake approval', () => {
      assert.equal(pending.data.registration.paymentStatus, 'SUBMITTED');
      assert.equal(pending.data.registration.isValidPass, false);
    });
    const history = await call('/api/user/registrations');
    check('website history includes mobile registration', () =>
      assert.ok(history.data.registrations.some((r) => r.registrationId === id)),
    );
    const unavailable = await call('/api/certificate/verify', 'POST', {
      registrationId: id,
      eventId: 'mobile-test',
    });
    check('pending certificate unavailable', () => assert.equal(unavailable.status, 403));
    const wrongEvent = await call('/api/certificate/verify', 'POST', {
      registrationId: 'OC-CERT-TEST',
      eventId: 'mobile-other',
    });
    check('wrong-event certificate rejected', () => assert.equal(wrongEvent.status, 400));
    const certificate = await call('/api/certificate/verify', 'POST', {
      registrationId: 'OC-CERT-TEST',
      eventId: 'mobile-test',
    });
    check('eligible certificate belongs to correct participant', () => {
      assert.equal(certificate.status, 200);
      assert.equal(certificate.data.registrationId, 'OC-CERT-TEST');
      assert.equal(certificate.data.verifiedName, 'Certificate Tester');
    });
    const svg = await fetch(origin + '/api/certificate/download/OC-CERT-TEST?eventId=mobile-test');
    check('certificate download is server-generated SVG', () => {
      assert.equal(svg.status, 200);
      assert.match(svg.headers.get('content-type'), /image\/svg/);
    });
    const guest = await call(
      '/api/registrations',
      'POST',
      {
        fullName: 'Guest Tester',
        email: 'guest@example.test',
        phone: '9000000003',
        city: 'Test City',
        category: 'Poetry',
        performanceTitle: 'Guest poem',
        eventId: 'mobile-other',
        terms: true,
      },
      false,
    );
    check('guest registration requires email verification', () => {
      assert.equal(guest.status, 201);
      assert.equal(guest.data.registration.status, 'PENDING_VERIFICATION');
    });
    const guestId = guest.data.registrationId;
    const beforeOtp = await call(
      '/api/payments/submit-proof',
      'POST',
      { registrationId: guestId },
      false,
    );
    check('payment cannot bypass email OTP', () => assert.equal(beforeOtp.status, 403));
    const guestOtp = sent.findLast(
      (m) => m.type === 'sendOTPEmail' && m.email === 'guest@example.test',
    ).otp;
    const guestVerified = await call(
      '/api/otp/verify',
      'POST',
      { registrationId: guestId, email: 'guest@example.test', otp: guestOtp },
      false,
    );
    check('guest OTP verifies correct registration', () => {
      assert.equal(guestVerified.status, 200);
      assert.equal(guestVerified.data.status, 'VERIFIED');
    });
    await call('/api/auth/forgot-password', 'POST', { email: profile.email });
    const reset = new URL(sent.findLast((m) => m.type === 'sendPasswordResetEmail').resetLink);
    const resetResult = await call('/api/auth/reset-password', 'POST', {
      email: profile.email,
      token: reset.searchParams.get('token'),
      newPassword: 'Changed-Password-456!',
    });
    check('password recovery token completes reset', () => assert.equal(resetResult.status, 200));
    await call('/api/auth/logout', 'POST');
    const afterLogout = await call('/api/user/profile');
    check('logout invalidates session access', () => assert.equal(afterLogout.status, 401));
    const login = await call('/api/auth/login', 'POST', {
      email: profile.email,
      password: 'Changed-Password-456!',
    });
    check('existing account login uses changed password', () =>
      assert.equal(login.data.user.email, profile.email),
    );
    console.log(`\n${passed} public backend checks passed. Isolated synthetic fixture only.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
