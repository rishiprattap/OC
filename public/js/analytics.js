/**
 * Offstage Creators — Vercel Web Analytics & Speed Insights Integration
 * Provides privacy-preserving client-side telemetry and Core Web Vitals monitoring.
 *
 * PRIVACY GUARANTEES:
 * - Strictly NO PII: names, phones, emails, UTRs, and secrets are stripped/blocked.
 * - Admin paths (/admin) and admin actions are completely excluded.
 * - Scanner and certificate actions are tracked 100% anonymously.
 */

(function () {
  'use strict';

  // Initialize Vercel Analytics and Speed Insights queues
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };

  const isCurrentPathAdmin = function () {
    try {
      const path = window.location.pathname.toLowerCase();
      return path.startsWith('/admin') || path.includes('/admin.html');
    } catch (e) {
      return false;
    }
  };

  // Configure beforeSend hook for Web Analytics to drop admin pages & scrub sensitive query params
  window.va('beforeSend', function (event) {
    if (!event) return null;
    if (isCurrentPathAdmin()) return null;

    if (event.url) {
      if (event.url.toLowerCase().includes('/admin')) return null;
      try {
        const baseOrigin = (window.location && window.location.origin) || 'http://localhost';
        const parsed = new URL(event.url, baseOrigin);
        // Strip sensitive URL parameters if any exist
        parsed.searchParams.delete('secret');
        parsed.searchParams.delete('key');
        parsed.searchParams.delete('token');
        parsed.searchParams.delete('id'); // Keep registration IDs out of query URLs
        parsed.searchParams.delete('phone');
        parsed.searchParams.delete('email');
        parsed.searchParams.delete('utr');
        const searchStr = parsed.search ? parsed.search : '';
        if (event.url.startsWith('http://') || event.url.startsWith('https://')) {
          event.url = parsed.origin + parsed.pathname + searchStr;
        } else {
          event.url = parsed.pathname + searchStr;
        }
      } catch (e) {
        // Fallback: strip query string entirely if parsing fails
        if (typeof event.url === 'string') {
          event.url = event.url.split('?')[0];
        }
      }
    }
    return event;
  });

  // Configure beforeSend hook for Speed Insights to exclude admin pages
  window.si('beforeSend', function (data) {
    if (!data) return null;
    if (isCurrentPathAdmin()) return null;
    return data;
  });

  // Blacklist of sensitive data keys that must never reach analytics
  const BLOCKED_KEYS = [
    'name', 'fullname', 'full_name', 'email', 'phone', 'mobile',
    'utr', 'transactionid', 'transaction_id', 'screenshot', 'secret',
    'admin_secret', 'registrationid', 'registration_id', 'meet_url',
    'password', 'token', 'otp', 'card', 'account'
  ];

  /**
   * Safely track custom business events without leaking sensitive data
   * @param {string} eventName Name of the custom event
   * @param {object} [eventData] Optional event metadata (sanitized)
   */
  function trackEvent(eventName, eventData) {
    if (!eventName || typeof eventName !== 'string') return;
    if (isCurrentPathAdmin()) return;

    let sanitizedData = undefined;

    if (eventData && typeof eventData === 'object') {
      sanitizedData = {};
      for (const [key, val] of Object.entries(eventData)) {
        const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
        if (BLOCKED_KEYS.includes(normalizedKey)) continue;

        if (typeof val === 'string') {
          // Reject email-like strings
          if (val.includes('@') && val.includes('.')) continue;
          // Reject 10+ digit numeric sequences (phones, UTRs, accounts) anywhere in string
          if (/\d{10,}/.test(val.replace(/[\s\-()+]/g, ''))) continue;
          // Reject URLs containing Google Meet codes
          if (val.includes('meet.google.com')) continue;
          // Whitelisted string values (e.g. category, format, source) capped at 50 chars
          sanitizedData[key] = val.slice(0, 50);
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          sanitizedData[key] = val;
        }
      }

      if (Object.keys(sanitizedData).length === 0) {
        sanitizedData = undefined;
      }
    }

    try {
      if (typeof window.va === 'function') {
        if (sanitizedData) {
          window.va('event', { name: eventName, data: sanitizedData });
        } else {
          window.va('event', { name: eventName });
        }
      }
    } catch (err) {
      // Fail silently to never impact core UX
    }
  }

  // Export globally for page scripts
  window.trackEvent = trackEvent;

})();
