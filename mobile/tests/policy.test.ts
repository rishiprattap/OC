import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  assertPublicRoute,
  validateBaseUrl,
  canShowTicket,
  canRegister,
  eventGroup,
  assertCertificateIdentity,
  registrationEventId,
} from '../src/services/policy';

test('legacy registrations retain the event identity resolved by the server', () => {
  assert.equal(registrationEventId({ eventId: null, event: { id: 'legacy-event' } }), 'legacy-event');
  assert.equal(registrationEventId({ eventId: 'event-a', event: { slug: 'event-b' } }), 'event-a');
  assert.throws(() => registrationEventId({ eventId: null }));
});

test('patched image parser supports Metro file paths and byte buffers', () => {
  const require = createRequire(import.meta.url);
  const metroRequire = createRequire(require.resolve('metro/package.json'));
  const size = metroRequire('image-size');
  const logo = decodeURIComponent(new URL('../assets/logo.png', import.meta.url).pathname).replace(
    /^\/(\w:)/,
    '$1',
  );
  const fromBuffer = size(readFileSync(logo));
  const fromPath = size(logo);
  assert.ok(fromBuffer.width > 0 && fromBuffer.height > 0);
  assert.deepEqual(fromPath, fromBuffer);
});

test('only the explicit public method/path combinations can be called', () => {
  for (const path of [
    '/api/admin',
    '/api/admin/login',
    '/api/scanner',
    '/api/gallery/upload',
    '/api/events/all',
    '/api/events/../admin',
    'https://evil.test/api/events',
    '/api/user/registrations?userId=2',
  ])
    assert.throws(() => assertPublicRoute(path, 'GET'));
  assert.throws(() => assertPublicRoute('/api/events', 'POST'));
  assert.doesNotThrow(() => assertPublicRoute('/api/payments/submit-proof', 'POST'));
  assert.doesNotThrow(() => assertPublicRoute('/api/user/profile', 'PUT'));
  assert.doesNotThrow(() =>
    assertPublicRoute('/api/certificate/download/OC-123?eventId=stage-2026', 'GET'),
  );
});
test('production origins require HTTPS and cannot embed credentials or routes', () => {
  assert.equal(validateBaseUrl('https://offstagecreators.in'), 'https://offstagecreators.in');
  for (const url of [
    'http://offstagecreators.in',
    'https://user:pass@example.com',
    'https://example.com/api',
    'https://example.com?secret=x',
  ])
    assert.throws(() => validateBaseUrl(url));
  assert.equal(validateBaseUrl('http://10.0.2.2:3000', true), 'http://10.0.2.2:3000');
  assert.throws(() => validateBaseUrl('http://10.0.2.2:3000', false));
});
test('pending, rejected, revoked and submitted registrations are never entry tickets', () => {
  for (const status of [
    'VERIFIED',
    'PENDING_VERIFICATION',
    'REJECTED',
    'REVOKED',
    'CANCELLED',
    'SUBMITTED',
  ])
    assert.equal(canShowTicket({ status, isValidPass: true }), false);
  assert.equal(canShowTicket({ status: 'APPROVED', isValidPass: false }), false);
  assert.equal(canShowTicket({ status: 'APPROVED', isValidPass: true }), true);
});
test('registration respects publication, server availability and provider', () => {
  assert.equal(
    canRegister({ registrationOpen: true, isPublished: true, registrationProvider: 'external' }),
    true,
  );
  assert.equal(
    canRegister({ registrationOpen: true, isPublished: false, registrationProvider: 'internal' }),
    false,
  );
  assert.equal(
    canRegister({ registrationOpen: false, isPublished: true, registrationProvider: 'internal' }),
    false,
  );
  assert.equal(
    canRegister({ registrationOpen: true, isPublished: true, registrationProvider: 'disabled' }),
    false,
  );
});
test('event states and certificate identity remain event-specific', () => {
  assert.equal(eventGroup({ status: 'event_completed' }), 'Past');
  assert.equal(eventGroup({ status: 'ongoing' }), 'Ongoing');
  assert.equal(eventGroup({ status: 'registration_open' }), 'Upcoming');
  assert.throws(() => assertCertificateIdentity({ registrationId: 'OTHER' }, 'OC-1', 'event-a'));
  assert.throws(() =>
    assertCertificateIdentity({ registrationId: 'OC-1', eventId: 'event-b' }, 'OC-1', 'event-a'),
  );
  assert.doesNotThrow(() =>
    assertCertificateIdentity({ registrationId: 'OC-1', eventId: 'event-a' }, 'OC-1', 'event-a'),
  );
});
