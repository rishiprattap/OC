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
const { run, get, all } = require('../db');
const config = require('../config');
const emailService = require('../services/email');

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminAuthenticated) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }
  next();
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
    const [total, pendingVerif, verified, approved, rejected, checkedIn, certEligible] = await Promise.all([
      get(`SELECT COUNT(*) as c FROM registrations`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'PENDING_VERIFICATION'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'VERIFIED'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'APPROVED'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'REJECTED'`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE checked_in = 1`),
      get(`SELECT COUNT(*) as c FROM registrations WHERE certificate_eligible = 1`)
    ]);

    return res.json({
      success: true,
      stats: {
        total: total?.c || 0,
        pendingVerification: pendingVerif?.c || 0,
        verified: verified?.c || 0,
        approved: approved?.c || 0,
        rejected: rejected?.c || 0,
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

    if (search) {
      const q = `%${search}%`;
      sql += ` AND (full_name LIKE ? OR email LIKE ? OR registration_id LIKE ? OR phone LIKE ?)`;
      params.push(q, q, q, q);
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

module.exports = router;
