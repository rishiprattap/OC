/**
 * Offstage Creators — Admin Routes
 * Session-based authentication. Secret never sent from browser after login.
 *
 * POST /api/admin/login        — Login with email + password
 * POST /api/admin/logout       — Logout / destroy session
 * GET  /api/admin/overview     — Dashboard stats
 * GET  /api/admin/registrations — List registrations (search + filter)
 * GET  /api/admin/registrations/:id — Registration detail
 * POST /api/admin/approve/:id  — Approve + send approval email
 * POST /api/admin/reject/:id   — Reject with reason
 * POST /api/admin/checkin/:id  — Check in attendee
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { run, get, all, getSetting, setSetting } = require('../db');
const config = require('../config');
const emailService = require('../services/email');

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const secretHeader = (req.headers['x-admin-secret'] || req.headers['x-admin-key'] || '').trim();
  const expectedSecret = (config.ADMIN_SECRET || '').trim();
  const passwordHeader = (req.headers['x-admin-password'] || '').trim();
  const expectedPassword = (config.ADMIN_PASSWORD || '').trim();

  const isSecretMatch = (expectedSecret && secretHeader === expectedSecret) ||
                        (expectedPassword && (secretHeader === expectedPassword || passwordHeader === expectedPassword));

  if ((req.session && req.session.adminAuthenticated) || isSecretMatch) {
    if (!req.session) req.session = {};
    if (!req.session.adminAuthenticated) {
      req.session.adminAuthenticated = true;
      req.session.adminEmail = config.ADMIN_EMAIL || 'admin@offstagecreators.com';
    }
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
}

// ─── POST /api/admin/login ────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const adminEmail = config.ADMIN_EMAIL.trim().toLowerCase();
    const adminPassword = config.ADMIN_PASSWORD;

    if (!adminPassword) {
      return res.status(500).json({ success: false, error: 'Admin credentials not configured on server.' });
    }

    const emailMatch = email.trim().toLowerCase() === adminEmail;

    // Support both plain password and bcrypt hash
    let passwordMatch = false;
    if (adminPassword.startsWith('$2')) {
      // bcrypt hash
      passwordMatch = await bcrypt.compare(password, adminPassword);
    } else {
      // Plain text comparison (for dev/initial setup)
      passwordMatch = password === adminPassword;
    }

    if (!emailMatch || !passwordMatch) {
      // Add a small delay to deter brute force
      await new Promise(r => setTimeout(r, 800));
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // Create server-side session
    req.session.adminAuthenticated = true;
    req.session.adminEmail = adminEmail;
    req.session.loginAt = new Date().toISOString();

    return res.json({ success: true, message: 'Logged in successfully.' });

  } catch (err) {
    console.error('[Admin] Login error:', err);
    return res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

// ─── POST /api/admin/logout ───────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Failed to logout.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out.' });
  });
});

// ─── GET /api/admin/session ───────────────────────────────────────────────────
// Check if session is valid (used by frontend to validate after page refresh)

router.get('/session', (req, res) => {
  if (req.session && req.session.adminAuthenticated) {
    return res.json({ success: true, authenticated: true, email: req.session.adminEmail });
  }
  return res.json({ success: true, authenticated: false });
});

// All routes below require authentication
router.use(requireAdmin);

// ─── GET /api/admin/overview ──────────────────────────────────────────────────

router.get('/overview', async (req, res) => {
  try {
    const [total, pendingVerif, verified, approved, rejected, revoked, checkedIn, certEligible] = await Promise.all([
      get(`SELECT COUNT(*) as c FROM registrations`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'PENDING_VERIFICATION'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'VERIFIED'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'APPROVED'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'REJECTED'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status IN ('REVOKED', 'CANCELLED')`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE checked_in = 1 AND reg_status = 'APPROVED'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE certificate_eligible = 1 AND reg_status = 'APPROVED'`)
    ]);

    return res.json({
      success: true,
      stats: {
        total: total?.c || 0,
        pendingVerification: pendingVerif?.c || 0,
        verified: verified?.c || 0,
        approved: approved?.c || 0,
        rejected: rejected?.c || 0,
        revoked: revoked?.c || 0,
        checkedIn: checkedIn?.c || 0,
        certEligible: certEligible?.c || 0
      }
    });
  } catch (err) {
    console.error('[Admin] Overview error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load stats.' });
  }
});

// ─── GET /api/admin/registrations ────────────────────────────────────────────

router.get('/registrations', async (req, res) => {
  try {
    const { status, search, limit = 100, offset = 0 } = req.query;

    let sql = `SELECT * FROM registrations WHERE 1=1`;
    const params = [];

    if (status && status !== 'ALL') {
      sql += ` AND reg_status = ?`;
      params.push(status);
    }

    if (search && search.trim()) {
      const trimmed = search.trim();
      const q = `%${trimmed}%`;
      const num = parseInt(trimmed.replace(/^0+/, ''), 10);
      if (!isNaN(num) && num > 0) {
        sql += ` AND (full_name LIKE ? OR email LIKE ? OR registration_id LIKE ? OR phone LIKE ? OR transaction_id LIKE ? OR id = ?)`;
        params.push(q, q, q, q, q, num);
      } else {
        sql += ` AND (full_name LIKE ? OR email LIKE ? OR registration_id LIKE ? OR phone LIKE ? OR transaction_id LIKE ?)`;
        params.push(q, q, q, q, q);
      }
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10) || 100, parseInt(offset, 10) || 0);

    const rows = await all(sql, params);

    const countSql = sql.replace(/SELECT \*/, 'SELECT COUNT(*) as c').replace(/ ORDER BY.*/, '');
    const countRow = await get(countSql.replace(/ LIMIT.*/, ''), params.slice(0, -2));

    return res.json({
      success: true,
      total: countRow?.c || rows.length,
      registrations: rows.map(r => ({
        id: r.id,
        registrationId: r.registration_id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        city: r.city,
        category: r.category,
        performanceTitle: r.performance_title,
        instagram: r.instagram,
        status: r.reg_status || 'PENDING_VERIFICATION',
        otpVerified: Boolean(r.otp_verified),
        otpVerifiedAt: r.otp_verified_at,
        checkedIn: Boolean(r.checked_in),
        checkinAt: r.checkin_at,
        approvedAt: r.approved_at,
        approvedBy: r.approved_by,
        rejectedAt: r.rejected_at,
        rejectedReason: r.rejected_reason,
        adminNotes: r.admin_notes || r.rejected_reason,
        transactionId: r.transaction_id,
        paymentScreenshotUrl: r.payment_screenshot_url,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    });

  } catch (err) {
    console.error('[Admin] List registrations error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load registrations.' });
  }
});

// ─── GET /api/admin/registrations/:id ────────────────────────────────────────

router.get('/registrations/:id', async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const record = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);

    if (!record) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    return res.json({
      success: true,
      registration: {
        id: record.id,
        registrationId: record.registration_id,
        fullName: record.full_name,
        email: record.email,
        phone: record.phone,
        city: record.city,
        category: record.category,
        performanceTitle: record.performance_title,
        performanceDescription: record.performance_description,
        instagram: record.instagram,
        amount: record.amount,
        status: record.reg_status || 'PENDING_VERIFICATION',
        otpVerified: Boolean(record.otp_verified),
        otpVerifiedAt: record.otp_verified_at,
        checkedIn: Boolean(record.checked_in),
        checkinAt: record.checkin_at,
        certificateEligible: Boolean(record.certificate_eligible),
        approvedAt: record.approved_at,
        approvedBy: record.approved_by,
        rejectedAt: record.rejected_at,
        rejectedReason: record.rejected_reason,
        adminNotes: record.admin_notes || record.rejected_reason,
        transactionId: record.transaction_id,
        paymentScreenshotUrl: record.payment_screenshot_url,
        registrationEmailSentAt: record.registration_email_sent_at,
        approvalEmailSentAt: record.approval_email_sent_at,
        lastEmailError: record.last_email_error,
        createdAt: record.created_at,
        updatedAt: record.updated_at
      }
    });

  } catch (err) {
    console.error('[Admin] Get registration error:', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ─── POST /api/admin/approve/:id ─────────────────────────────────────────────

router.post('/approve/:id', async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);

    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    if (reg.reg_status === 'APPROVED') {
      return res.status(409).json({ success: false, error: 'Registration is already approved.' });
    }

    const now = new Date().toISOString();
    const approvedBy = req.session.adminEmail || 'admin';

    // Update status
    await run(
      `UPDATE registrations
       SET reg_status = 'APPROVED', approved_at = ?, approved_by = ?, updated_at = ?
       WHERE registration_id = ?`,
      [now, approvedBy, now, regId]
    );

    // Send approval email (non-blocking)
    let emailSent = false;
    try {
      await emailService.sendApprovalEmail({
        registrationId: regId,
        email: reg.email,
        name: reg.full_name,
        category: reg.category,
        performanceTitle: reg.performance_title,
        event: config.EVENT
      });
      await run(
        `UPDATE registrations SET approval_email_sent_at = ? WHERE registration_id = ?`,
        [new Date().toISOString(), regId]
      );
      emailSent = true;
    } catch (emailErr) {
      console.error('[Admin] Approval email failed for', regId, ':', emailErr.message);
      await run(
        `UPDATE registrations SET last_email_error = ? WHERE registration_id = ?`,
        [emailErr.message, regId]
      );
    }

    return res.json({
      success: true,
      message: `Registration ${regId} approved.${emailSent ? ' Approval email sent.' : ' WARNING: approval email failed to send.'}`,
      emailSent,
      status: 'APPROVED'
    });

  } catch (err) {
    console.error('[Admin] Approve error:', err);
    return res.status(500).json({ success: false, error: 'Server error while approving.' });
  }
});

// ─── POST /api/admin/reject/:id ───────────────────────────────────────────────

router.post('/reject/:id', async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const { reason } = req.body;

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);

    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    const now = new Date().toISOString();

    await run(
      `UPDATE registrations
       SET reg_status = 'REJECTED', rejected_at = ?, rejected_reason = ?, updated_at = ?
       WHERE registration_id = ?`,
      [now, reason || 'No reason provided.', now, regId]
    );

    // Send rejection email (non-blocking)
    let emailSent = false;
    try {
      await emailService.sendRejectionEmail({
        registrationId: regId,
        email: reg.email,
        name: reg.full_name,
        reason: reason || ''
      });
      await run(
        `UPDATE registrations SET rejection_email_sent_at = ? WHERE registration_id = ?`,
        [new Date().toISOString(), regId]
      );
      emailSent = true;
    } catch (emailErr) {
      console.error('[Admin] Rejection email failed for', regId, ':', emailErr.message);
      await run(
        `UPDATE registrations SET last_email_error = ? WHERE registration_id = ?`,
        [emailErr.message, regId]
      );
    }

    return res.json({
      success: true,
      message: `Registration ${regId} rejected.${emailSent ? ' Rejection email sent.' : ''}`,
      emailSent,
      status: 'REJECTED'
    });

  } catch (err) {
    console.error('[Admin] Reject error:', err);
    return res.status(500).json({ success: false, error: 'Server error while rejecting.' });
  }
});

// ─── POST /api/admin/revoke/:id ───────────────────────────────────────────────

router.post('/revoke/:id', async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const { reason, note } = req.body || {};

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);

    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    const now = new Date().toISOString();
    const adminNote = (note || reason || 'Approval revoked after payment verification. Submitted payment proof identified as a demo/non-real transaction. Initial approval email was sent before verification.').trim();

    await run(
      `UPDATE registrations
       SET reg_status = 'REVOKED',
           payment_status = 'REVOKED',
           checked_in = 0,
           certificate_eligible = 0,
           rejected_at = ?,
           rejected_reason = ?,
           admin_notes = ?,
           updated_at = ?
       WHERE registration_id = ?`,
      [now, adminNote, adminNote, now, regId]
    );

    return res.json({
      success: true,
      message: `Registration ${regId} revoked and pass invalidated.`,
      status: 'REVOKED',
      adminNotes: adminNote
    });

  } catch (err) {
    console.error('[Admin] Revoke error:', err);
    return res.status(500).json({ success: false, error: 'Server error while revoking registration.' });
  }
});

// ─── POST /api/admin/checkin/:id ──────────────────────────────────────────────

router.post('/checkin/:id', async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);

    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    if (reg.reg_status !== 'APPROVED') {
      return res.status(400).json({ success: false, error: 'Only approved registrations can be checked in.' });
    }

    const now = new Date().toISOString();
    await run(
      `UPDATE registrations SET checked_in = 1, checkin_at = ?, updated_at = ? WHERE registration_id = ?`,
      [now, now, regId]
    );

    return res.json({ success: true, message: `${reg.full_name} checked in successfully.`, checkinAt: now });

  } catch (err) {
    console.error('[Admin] Check-in error:', err);
    return res.status(500).json({ success: false, error: 'Server error during check-in.' });
  }
});

// ─── POST /api/admin/certificate/:id ─────────────────────────────────────────

router.post('/certificate/:id', async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const { eligible } = req.body;

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found.' });

    const now = new Date().toISOString();
    await run(
      `UPDATE registrations SET certificate_eligible = ?, updated_at = ? WHERE registration_id = ?`,
      [eligible ? 1 : 0, now, regId]
    );

    return res.json({ success: true, certificateEligible: Boolean(eligible) });

  } catch (err) {
    console.error('[Admin] Certificate error:', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ─── Email Helpers & Placeholders ─────────────────────────────────────────────

function replacePlaceholders(templateText, reg = {}) {
  if (!templateText) return '';
  const name = reg.full_name || reg.fullName || 'Participant';
  const regId = reg.registration_id || reg.registrationId || '';
  const rawId = reg.id || '';
  const serialNo = rawId ? String(rawId).padStart(6, '0') : '';
  const category = reg.category || '';
  const entry = reg.performance_title || reg.performanceTitle || reg.category || '';
  const city = reg.city || '';

  let out = templateText
    .replace(/\{name\}/gi, name)
    .replace(/\{registration_id\}/gi, regId)
    .replace(/\{serial_no\}/gi, serialNo)
    .replace(/\{category\}/gi, category)
    .replace(/\{entry\}/gi, entry)
    .replace(/\{city\}/gi, city);

  if (!regId) {
    out = out.replace(/^[ \t]*Registration ID:[ \t]*\n?/gim, '');
  }
  if (!category) {
    out = out.replace(/^[ \t]*Performance Category:[ \t]*\n?/gim, '');
  }

  return out;
}

function formatRichEmailContent(rawText) {
  if (!rawText || !rawText.trim()) return '';

  let text = rawText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Convert markdown headings:
  text = text.replace(/^###[ \t]+(.+)$/gm, '<h3 style="color:#e4ad57; font-size:15px; font-weight:700; margin:20px 0 10px; letter-spacing:0.02em; text-transform:uppercase;">$1</h3>');
  text = text.replace(/^##[ \t]+(.+)$/gm, '<h2 style="color:#f7eee1; font-size:17px; font-weight:700; margin:24px 0 12px; letter-spacing:0.02em;">$1</h2>');

  // Convert bold: **text** -> <strong style="color:#f7eee1;">text</strong>
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#f7eee1;">$1</strong>');

  // Convert italic: *text* (when not a bullet list or bold)
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em style="color:#e4ad57;">$2</em>');

  // Convert bullet lists (lines starting with * or - or •)
  const lines = text.split('\n');
  const processedLines = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bulletMatch = line.match(/^[ \t]*[*•-][ \t]+(.+)$/);

    if (bulletMatch) {
      if (!inList) {
        processedLines.push('<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 16px;">');
        inList = true;
      }
      processedLines.push(`  <tr><td width="20" valign="top" style="color:#e4ad57; font-size:15px; line-height:1.6; padding-right:8px; vertical-align:top;">•</td><td style="color:#eee4d5; font-size:13px; line-height:1.6; padding-bottom:8px; vertical-align:top;">${bulletMatch[1]}</td></tr>`);
    } else {
      if (inList) {
        processedLines.push('</table>');
        inList = false;
      }
      processedLines.push(line);
    }
  }
  if (inList) {
    processedLines.push('</table>');
  }

  text = processedLines.join('\n');

  // Auto-convert URLs to clickable links if not already wrapped in <a>
  text = text.replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" style="color:#e4ad57; text-decoration:underline;">$2</a>');

  // Paragraphs
  const blocks = text.split(/\n{2,}/);
  const formattedBlocks = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(table|h2|h3|h4|div|p|ul|ol)/i.test(block)) {
      return block;
    }
    const inner = block.replace(/\n/g, '<br>');
    return `<p style="margin:0 0 14px; line-height:1.7; font-size:14px; color:#eee4d5;">${inner}</p>`;
  });

  return formattedBlocks.filter(Boolean).join('\n');
}

function generateMeetHtml({ meetingTitle, meetLink, date, startTime, endTime, timeZone, additionalMessage, name, regId, serialNo, category }) {
  const greeting = name ? `Dear ${name},` : 'Dear Creator,';
  const safeTitle = meetingTitle || 'Online Open Mic 2026 — Performer Briefing';
  const safeDate = date || 'To be announced';
  const timeStr = `${startTime || ''} – ${endTime || ''} ${timeZone ? `(${timeZone})` : ''}`.trim() || 'Scheduled Time';
  const safeLink = meetLink || '#';
  const hasReg = Boolean(regId || category);

  let formattedInstructions = '';
  if (additionalMessage && additionalMessage.trim()) {
    formattedInstructions = `
      <div style="background:#181410; border:1px solid #2a231c; border-left:3px solid #e4ad57; border-radius:8px; padding:18px 22px; margin:22px 0 20px;">
        ${formatRichEmailContent(additionalMessage)}
      </div>
    `;
  }

  return `
    <h2 style="color:#f7eee1; font-size:22px; margin:0 0 14px; font-weight:800; letter-spacing:0.02em;">Google Meet Invitation</h2>
    <p style="color:#eee4d5; font-size:15px; line-height:1.7; margin:0 0 14px;">${greeting}</p>
    <p style="color:#eee4d5; font-size:14px; line-height:1.7; margin:0 0 20px;">
      You are invited to join the upcoming <strong>Offstage Creators</strong> performer session. Please find the session schedule, joining link, and instructions below:
    </p>

    <!-- SESSION DETAILS TABLE (100% email-client compatible) -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#110f0d; border:1px solid #2a231c; border-radius:10px; margin:0 0 24px;">
      <tr>
        <td style="padding:14px 18px; border-bottom:1px solid #1e1a16;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="30%" valign="top" style="color:#8e8477; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">Session</td>
              <td width="70%" valign="top" align="right" style="color:#f7eee1; font-size:13px; font-weight:700;">${safeTitle}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px; border-bottom:1px solid #1e1a16;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="30%" valign="top" style="color:#8e8477; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">Date</td>
              <td width="70%" valign="top" align="right" style="color:#f7eee1; font-size:13px; font-weight:600;">📅 ${safeDate}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px; border-bottom:1px solid #1e1a16;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="30%" valign="top" style="color:#8e8477; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">Time</td>
              <td width="70%" valign="top" align="right" style="color:#f7eee1; font-size:13px; font-weight:600;">⏰ ${timeStr}</td>
            </tr>
          </table>
        </td>
      </tr>
      ${hasReg ? `
      <tr>
        <td style="padding:14px 18px; border-bottom:1px solid #1e1a16;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="30%" valign="top" style="color:#8e8477; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">Performer</td>
              <td width="70%" valign="top" align="right" style="color:#e4ad57; font-size:13px; font-weight:700; font-family:monospace;">
                ${regId || 'Registered Creator'} ${serialNo ? `<span style="color:#8e8477; font-family:sans-serif; font-size:11px;">(#${serialNo})</span>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
      ${category ? `
      <tr>
        <td style="padding:14px 18px; border-bottom:1px solid #1e1a16;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="30%" valign="top" style="color:#8e8477; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">Category</td>
              <td width="70%" valign="top" align="right" style="color:#f7eee1; font-size:13px; font-weight:600;">🎭 ${category}</td>
            </tr>
          </table>
        </td>
      </tr>
      ` : ''}
      ` : ''}
      <tr>
        <td style="padding:14px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="30%" valign="top" style="color:#8e8477; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">Platform</td>
              <td width="70%" valign="top" align="right" style="color:#6edb8c; font-size:13px; font-weight:700;">Google Meet</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- BIG PROMINENT GOLD CTA BUTTON -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td align="center">
          <a href="${safeLink}" target="_blank" style="background:#e4ad57; color:#0d0c0a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; text-decoration:none; padding:15px 36px; border-radius:6px; display:inline-block;">
            🎥 JOIN GOOGLE MEET →
          </a>
          <div style="margin-top:12px; font-size:12px; color:#8e8477;">
            Direct URL: <a href="${safeLink}" target="_blank" style="color:#e4ad57; text-decoration:underline;">${safeLink}</a>
          </div>
        </td>
      </tr>
    </table>

    <!-- INSTRUCTIONS / GUIDELINES -->
    ${formattedInstructions}

    <!-- FOOTER / JOINING ADVICE -->
    <div style="margin-top:24px; padding-top:16px; border-top:1px solid #1e1a16; font-size:12px; color:#8e8477; line-height:1.6;">
      <p style="margin:0 0 6px;">
        Please join <strong>5 minutes early</strong> with your camera and microphone working.
      </p>
      <p style="margin:0;">
        If you have any difficulty joining, please reach out to us on Instagram
        <a href="https://www.instagram.com/offstagecreators/" target="_blank" style="color:#e4ad57; text-decoration:none; font-weight:600;">@offstagecreators</a>.
      </p>
      <p style="margin:16px 0 0; color:#eee4d5;">
        Warm regards,<br>
        <strong style="color:#e4ad57;">Offstage Creators Team</strong>
      </p>
    </div>
  `;
}

// ─── Registration Settings ───────────────────────────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    const status = await getSetting('registration_status', 'OPEN');
    return res.json({ success: true, settings: { registration_status: status } });
  } catch (err) {
    console.error('[Admin] Get settings error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load settings.' });
  }
});

router.post('/settings/registration-status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['OPEN', 'CLOSED'].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status. Must be 'OPEN' or 'CLOSED'." });
    }
    await setSetting('registration_status', status);
    console.log(`[Admin] Registration status updated to: ${status}`);
    return res.json({ success: true, message: `Registration status updated to ${status}.`, registration_status: status });
  } catch (err) {
    console.error('[Admin] Set registration status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update registration status.' });
  }
});

// ─── Email Center Routes ──────────────────────────────────────────────────────

router.get('/email-history', async (req, res) => {
  try {
    const { limit = 100, offset = 0, search, type, status } = req.query;
    let sql = `SELECT * FROM email_logs WHERE 1=1`;
    const params = [];

    if (type && type !== 'ALL') {
      sql += ` AND email_type = ?`;
      params.push(type);
    }
    if (status && status !== 'ALL') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ` AND (recipient LIKE ? OR subject LIKE ? OR registration_id LIKE ?)`;
      params.push(q, q, q);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10) || 100, parseInt(offset, 10) || 0);

    const rows = await all(sql, params);
    return res.json({
      success: true,
      logs: rows.map(r => ({
        id: r.id,
        registrationId: r.registration_id,
        recipient: r.recipient,
        emailType: r.email_type,
        subject: r.subject,
        status: r.status,
        providerMessageId: r.provider_message_id,
        errorMessage: r.error_message,
        createdAt: r.created_at
      }))
    });
  } catch (err) {
    console.error('[Admin] Email history error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load email history.' });
  }
});

router.post('/email/preview', async (req, res) => {
  try {
    const { type, subject, bodyContent, meetData, registrationId, manualEmail } = req.body;
    let reg = null;
    if (registrationId) {
      reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    }
    if (!reg) {
      reg = {
        full_name: 'John Doe',
        registration_id: 'OC-OM-SAMPLE79',
        id: 79,
        category: 'Music / Singing',
        performance_title: 'Acoustic Melody',
        city: 'Mumbai',
        email: manualEmail || 'creator@example.com'
      };
    }

    let finalSubject = subject || '';
    let renderedBodyHtml = '';

    if (type === 'meet') {
      finalSubject = replacePlaceholders(subject || `Google Meet Invitation: ${meetData?.meetingTitle || 'Online Open Mic'}`, reg);
      const rawId = reg.id || '';
      const serialNo = rawId ? String(rawId).padStart(6, '0') : '';
      const substitutedInstructions = replacePlaceholders(meetData?.additionalMessage || meetData?.customHtml || '', reg);
      renderedBodyHtml = generateMeetHtml({
        meetingTitle: meetData?.meetingTitle,
        meetLink: meetData?.meetLink,
        date: meetData?.date,
        startTime: meetData?.startTime,
        endTime: meetData?.endTime,
        timeZone: meetData?.timeZone,
        additionalMessage: substitutedInstructions,
        name: reg.full_name,
        regId: reg.registration_id,
        serialNo,
        category: reg.category
      });
    } else {
      finalSubject = replacePlaceholders(subject || 'Message from Offstage Creators', reg);
      const substitutedBody = replacePlaceholders(bodyContent || '', reg);
      renderedBodyHtml = formatRichEmailContent(substitutedBody);
    }

    const fullHtml = emailService.emailWrapper({
      title: finalSubject,
      preheader: finalSubject,
      bodyContent: renderedBodyHtml
    });

    return res.json({ success: true, subject: finalSubject, html: fullHtml });
  } catch (err) {
    console.error('[Admin] Email preview error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate preview.' });
  }
});

router.post('/email/custom-send', async (req, res) => {
  try {
    const { registrationIds = [], manualEmails = [], subject, bodyContent } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Subject is required.' });
    }
    if (!bodyContent || !bodyContent.trim()) {
      return res.status(400).json({ success: false, error: 'Email body content is required.' });
    }
    if (registrationIds.length === 0 && manualEmails.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one recipient.' });
    }

    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    // Send to selected registrations
    for (const regId of registrationIds) {
      try {
        const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
        if (!reg) {
          results.push({ recipient: regId, status: 'FAILED', error: 'Registration not found' });
          failedCount++;
          continue;
        }

        const substitutedSubject = replacePlaceholders(subject, reg);
        const substitutedBody = replacePlaceholders(bodyContent, reg);

        const html = emailService.emailWrapper({
          title: substitutedSubject,
          preheader: substitutedSubject,
          bodyContent: formatRichEmailContent(substitutedBody)
        });

        await emailService.sendEmail({
          registrationId: reg.registration_id,
          to: reg.email,
          subject: substitutedSubject,
          html,
          emailType: 'CUSTOM_EMAIL'
        });

        results.push({ recipient: reg.email, registrationId: reg.registration_id, status: 'SENT' });
        sentCount++;
      } catch (sendErr) {
        console.error(`[Admin] Failed custom email to ${regId}:`, sendErr.message);
        results.push({ recipient: regId, status: 'FAILED', error: sendErr.message });
        failedCount++;
      }
    }

    // Send to manual emails
    for (const email of manualEmails) {
      const trimmed = email.trim();
      if (!trimmed) continue;
      try {
        const dummyReg = { full_name: 'Creator', email: trimmed, id: '', registration_id: '', category: '', performance_title: '', city: '' };
        const substitutedSubject = replacePlaceholders(subject, dummyReg);
        const substitutedBody = replacePlaceholders(bodyContent, dummyReg);

        const html = emailService.emailWrapper({
          title: substitutedSubject,
          preheader: substitutedSubject,
          bodyContent: formatRichEmailContent(substitutedBody)
        });

        await emailService.sendEmail({
          registrationId: null,
          to: trimmed,
          subject: substitutedSubject,
          html,
          emailType: 'CUSTOM_EMAIL'
        });

        results.push({ recipient: trimmed, status: 'SENT' });
        sentCount++;
      } catch (sendErr) {
        console.error(`[Admin] Failed custom email to ${trimmed}:`, sendErr.message);
        results.push({ recipient: trimmed, status: 'FAILED', error: sendErr.message });
        failedCount++;
      }
    }

    return res.json({
      success: true,
      message: `Processed: ${sentCount} sent, ${failedCount} failed.`,
      sentCount,
      failedCount,
      results
    });

  } catch (err) {
    console.error('[Admin] Custom email send error:', err);
    return res.status(500).json({ success: false, error: 'Server error while sending emails.' });
  }
});

router.post('/email/meet-send', async (req, res) => {
  try {
    const {
      registrationIds = [],
      manualEmails = [],
      meetingTitle,
      meetLink,
      date,
      startTime,
      endTime,
      timeZone,
      additionalMessage,
      customHtml,
      customSubject
    } = req.body;

    if (!meetLink || !meetLink.trim()) {
      return res.status(400).json({ success: false, error: 'Google Meet link is required.' });
    }
    if (registrationIds.length === 0 && manualEmails.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one recipient.' });
    }

    const baseSubject = customSubject || `Google Meet Invitation: ${meetingTitle || 'Online Open Mic'}`;
    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const regId of registrationIds) {
      try {
        const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
        if (!reg) {
          results.push({ recipient: regId, status: 'FAILED', error: 'Registration not found' });
          failedCount++;
          continue;
        }

        const rawId = reg.id || '';
        const serialNo = rawId ? String(rawId).padStart(6, '0') : '';
        const substitutedSubject = replacePlaceholders(baseSubject, reg);
        const substitutedInstructions = replacePlaceholders(additionalMessage || customHtml || '', reg);

        const bodyContent = generateMeetHtml({
          meetingTitle,
          meetLink,
          date,
          startTime,
          endTime,
          timeZone,
          additionalMessage: substitutedInstructions,
          name: reg.full_name,
          regId: reg.registration_id,
          serialNo,
          category: reg.category
        });

        const html = emailService.emailWrapper({
          title: substitutedSubject,
          preheader: substitutedSubject,
          bodyContent
        });

        await emailService.sendEmail({
          registrationId: reg.registration_id,
          to: reg.email,
          subject: substitutedSubject,
          html,
          emailType: 'MEET_INVITE'
        });

        results.push({ recipient: reg.email, registrationId: reg.registration_id, status: 'SENT' });
        sentCount++;
      } catch (sendErr) {
        console.error(`[Admin] Meet invitation send error to ${regId}:`, sendErr.message);
        results.push({ recipient: regId, status: 'FAILED', error: sendErr.message });
        failedCount++;
      }
    }

    for (const email of manualEmails) {
      const trimmed = email.trim();
      if (!trimmed) continue;
      try {
        const dummyReg = { full_name: 'Creator', email: trimmed, id: '', registration_id: '', category: '', performance_title: '', city: '' };
        const substitutedSubject = replacePlaceholders(baseSubject, dummyReg);
        const substitutedInstructions = replacePlaceholders(additionalMessage || customHtml || '', dummyReg);

        const bodyContent = generateMeetHtml({
          meetingTitle,
          meetLink,
          date,
          startTime,
          endTime,
          timeZone,
          additionalMessage: substitutedInstructions,
          name: 'Creator',
          regId: null,
          serialNo: null,
          category: null
        });

        const html = emailService.emailWrapper({
          title: substitutedSubject,
          preheader: substitutedSubject,
          bodyContent
        });

        await emailService.sendEmail({
          registrationId: null,
          to: trimmed,
          subject: substitutedSubject,
          html,
          emailType: 'MEET_INVITE'
        });

        results.push({ recipient: trimmed, status: 'SENT' });
        sentCount++;
      } catch (sendErr) {
        console.error(`[Admin] Meet invitation send error to ${trimmed}:`, sendErr.message);
        results.push({ recipient: trimmed, status: 'FAILED', error: sendErr.message });
        failedCount++;
      }
    }

    return res.json({
      success: true,
      message: `Meet invitations processed: ${sentCount} sent, ${failedCount} failed.`,
      sentCount,
      failedCount,
      results
    });

  } catch (err) {
    console.error('[Admin] Meet send error:', err);
    return res.status(500).json({ success: false, error: 'Server error while sending Meet invitations.' });
  }
});

module.exports = router;
