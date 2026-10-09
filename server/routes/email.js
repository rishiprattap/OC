/**
 * Offstage Creators — Email & Preference Routes
 * Handles unsubscribe preferences, status checks, and legacy endpoint redirects.
 */
const express = require('express');
const router = express.Router();
const { run, get } = require('../db');
const config = require('../config');

// ─── GET /api/email/unsubscribe ───────────────────────────────────────────────
router.get('/unsubscribe', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  const token = String(req.query.token || '').trim();

  // Return a clean, responsive HTML page allowing the recipient to confirm
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Preferences — Offstage Creators</title>
  <style>
    body { margin: 0; background: #0d0c0a; color: #eee4d5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; box-sizing: border-box; }
    .card { background: #141210; border: 1px solid #2a231c; border-radius: 12px; padding: 36px 32px; max-width: 480px; width: 100%; text-align: center; }
    .brand { font-size: 11px; font-weight: 800; letter-spacing: 0.2em; color: #e4ad57; text-transform: uppercase; margin-bottom: 8px; }
    h1 { font-size: 22px; margin: 0 0 16px; color: #f7eee1; }
    p { font-size: 14px; line-height: 1.6; color: #aaa194; margin: 0 0 20px; }
    .email-chip { display: inline-block; background: #1c1814; border: 1px solid #2e261f; color: #e4ad57; font-family: monospace; padding: 6px 14px; border-radius: 6px; margin-bottom: 24px; }
    button { background: #e26947; color: #fff; border: none; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 28px; border-radius: 6px; cursor: pointer; transition: opacity 0.2s; }
    button:hover { opacity: 0.9; }
    .home-link { display: inline-block; margin-top: 24px; color: #8e8477; font-size: 12px; text-decoration: none; }
    .home-link:hover { color: #e4ad57; }
    #msg { margin-top: 18px; font-size: 13px; display: none; }
    .success { color: #6edb8c; }
    .error { color: #ff9e85; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Offstage Creators</div>
    <h1>Email Preferences</h1>
    <p>You can unsubscribe from optional event announcements and updates. Crucial transactional emails (such as OTP verification and entry passes) will still be delivered if you register.</p>
    ${email ? `<div class="email-chip">${email}</div>` : ''}
    <form id="unsubForm">
      <input type="hidden" id="emailInput" value="${email}">
      <input type="hidden" id="tokenInput" value="${token}">
      <button type="submit" id="submitBtn">Unsubscribe From Optional Updates</button>
    </form>
    <div id="msg"></div>
    <a href="${config.APP_URL}" class="home-link">← Return to Offstage Creators</a>
  </div>
  <script>
    document.getElementById('unsubForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const msg = document.getElementById('msg');
      btn.disabled = true;
      btn.textContent = 'Processing…';
      try {
        const res = await fetch('/api/email/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('emailInput').value,
            token: document.getElementById('tokenInput').value
          })
        });
        const data = await res.json();
        if (data.success) {
          btn.style.display = 'none';
          msg.textContent = '✓ You have been unsubscribed from optional announcements.';
          msg.className = 'success';
          msg.style.display = 'block';
        } else {
          btn.disabled = false;
          btn.textContent = 'Unsubscribe';
          msg.textContent = data.error || 'Failed to update preferences.';
          msg.className = 'error';
          msg.style.display = 'block';
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Unsubscribe';
        msg.textContent = 'Network error. Please try again.';
        msg.className = 'error';
        msg.style.display = 'block';
      }
    });
  </script>
</body>
</html>`);
});

// ─── POST /api/email/unsubscribe ──────────────────────────────────────────────
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, reason } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();

    await run(
      `INSERT INTO unsubscribed_emails (email, reason, created_at)
       VALUES (?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason`,
      [cleanEmail, reason || 'User requested unsubscribe via footer link', now]
    );

    return res.json({
      success: true,
      message: `${cleanEmail} has been unsubscribed from optional event updates.`,
      email: cleanEmail
    });
  } catch (err) {
    console.error('[Email / Unsubscribe] Error:', err);
    return res.status(500).json({ success: false, error: 'Server error processing unsubscribe request.' });
  }
});

// ─── POST /api/email/resubscribe ──────────────────────────────────────────────
router.post('/resubscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    await run(`DELETE FROM unsubscribed_emails WHERE email = ?`, [cleanEmail]);

    return res.json({
      success: true,
      message: `${cleanEmail} is resubscribed to event communications.`,
      email: cleanEmail
    });
  } catch (err) {
    console.error('[Email / Resubscribe] Error:', err);
    return res.status(500).json({ success: false, error: 'Server error processing resubscribe request.' });
  }
});

// ─── Legacy Redirects ─────────────────────────────────────────────────────────
router.all(['/verify-otp', '/resend-otp', '/send-otp'], (req, res) => {
  return res.status(410).json({
    success: false,
    error: 'This endpoint has moved. Please use /api/otp/send and /api/otp/verify.',
    movedTo: {
      send: '/api/otp/send',
      verify: '/api/otp/verify'
    }
  });
});

module.exports = router;
