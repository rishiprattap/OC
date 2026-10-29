// Deliberately closed public surface: new endpoints need an explicit review.
const routes: Record<string, RegExp[]> = {
  GET: [
    /^\/api\/events$/,
    /^\/api\/events\/(?!all$)[a-zA-Z0-9_-]+$/,
    /^\/api\/gallery\?eventId=[a-zA-Z0-9_%.-]+$/,
    /^\/api\/auth\/me$/,
    /^\/api\/user\/(profile|registrations)$/,
    /^\/api\/registrations\/[a-zA-Z0-9_-]+$/,
    /^\/api\/certificate\/download\/[a-zA-Z0-9_-]+\?eventId=[a-zA-Z0-9_%.-]+$/,
  ],
  POST: [
    /^\/api\/auth\/(login|register|verify-email|resend-verification|forgot-password|reset-password|logout)$/,
    /^\/api\/registrations(?:\/validate-promo)?$/,
    /^\/api\/otp\/(send|verify)$/,
    /^\/api\/payments\/(submit-proof|confirm-free)$/,
    /^\/api\/certificate\/verify$/,
  ],
  PUT: [/^\/api\/user\/profile$/],
};
export function assertPublicRoute(path: string, method: string) {
  if (!routes[method]?.some((rule) => rule.test(path)))
    throw new Error('This operation is not available in the public app.');
}
export function validateBaseUrl(value: string, development = false) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(development && local && url.protocol === 'http:'))
    throw new Error('The app requires HTTPS.');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Use an API origin without a path or credentials.');
  return url.origin;
}
export function eventGroup(event: { status: string; isCompleted?: boolean }) {
  const status = event.status.toLowerCase().replace(/[\s_-]/g, '');
  if (event.isCompleted || ['completed', 'eventcompleted', 'archived'].includes(status))
    return 'Past';
  if (['ongoing', 'live', 'eventongoing'].includes(status)) return 'Ongoing';
  return 'Upcoming';
}
export function canRegister(event: {
  registrationOpen: boolean;
  registrationProvider: string;
  isPublished: boolean;
}) {
  return event.isPublished && event.registrationOpen && event.registrationProvider !== 'disabled';
}
export function canShowTicket(reg: { status: string; isValidPass?: boolean }) {
  return reg.status === 'APPROVED' && reg.isValidPass === true;
}
export function assertCertificateIdentity(
  cert: { registrationId: string; eventId?: string },
  id: string,
  eventId: string,
) {
  if (cert.registrationId !== id || (cert.eventId && cert.eventId !== eventId))
    throw new Error('Certificate identity did not match this registration.');
}
export function registrationEventId(reg: {
  eventId?: string | null;
  event?: { slug?: string; id?: string };
}) {
  const eventId = reg.eventId || reg.event?.slug || reg.event?.id;
  if (!eventId) throw new Error('The server did not identify this registration’s event. Please contact support.');
  return eventId;
}
