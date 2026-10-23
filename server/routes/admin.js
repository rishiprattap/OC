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
const { run, get, all, getSetting, setSetting, getEventBySlug, getActiveEvent } = require('../db');
const config = require('../config');
const emailService = require('../services/email');
const { normalizePromoCode } = require('../services/promo');
const { generateCsv, generateXlsxBuffer } = require('../services/export');

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

    const configuredAdminEmail = (config.ADMIN_EMAIL || 'admin@offstagecreators.com').trim().toLowerCase();
    const adminPassword = (config.ADMIN_PASSWORD || '').trim();
    const adminSecret = (config.ADMIN_SECRET || '').trim();

    if (!adminPassword && !adminSecret) {
      return res.status(500).json({ success: false, error: 'Admin credentials not configured on server.' });
    }

    const inputEmail = String(email || '').trim().toLowerCase();
    const inputPassword = String(password || '').trim();

    // Accept primary configured email, brand .in domain, username 'admin', or configured mail sender
    const validEmails = [
      configuredAdminEmail,
      'admin@offstagecreators.in',
      'admin@offstagecreators.com',
      'admin',
      String(config.EMAIL?.from || '').toLowerCase().replace(/.*<([^>]+)>.*/, '$1').trim()
    ].filter(Boolean);

    const emailMatch = validEmails.includes(inputEmail);

    // Support bcrypt hash, direct password, and ADMIN_SECRET
    let passwordMatch = false;
    if (adminPassword && adminPassword.startsWith('$2')) {
      passwordMatch = (await bcrypt.compare(inputPassword, adminPassword)) ||
                      (adminSecret && inputPassword === adminSecret);
    } else {
      passwordMatch = (adminPassword && inputPassword === adminPassword) ||
                      (adminSecret && inputPassword === adminSecret);
    }

    if (!emailMatch || !passwordMatch) {
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Create server-side session
    req.session.adminAuthenticated = true;
    req.session.adminEmail = configuredAdminEmail;
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
    const eventId = (req.query.eventId || req.query.event || '').trim();
    let whereClause = '';
    const params = [];
    if (eventId && eventId !== 'ALL') {
      whereClause = ' WHERE event_id = ?';
      params.push(eventId);
    }

    const andEvent = eventId && eventId !== 'ALL' ? ' AND event_id = ?' : '';
    const eventParam = eventId && eventId !== 'ALL' ? [eventId] : [];

    const [total, pendingVerif, verified, approved, rejected, revoked, checkedIn, certEligible] = await Promise.all([
      get(`SELECT COUNT(*) as c FROM registrations${whereClause}`, params),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'PENDING_VERIFICATION'${andEvent}`, eventParam),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'VERIFIED'${andEvent}`, eventParam),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'APPROVED'${andEvent}`, eventParam),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status = 'REJECTED'${andEvent}`, eventParam),
      get(`SELECT COUNT(*) as c FROM registrations WHERE reg_status IN ('REVOKED', 'CANCELLED')${andEvent}`, eventParam),
      get(`SELECT COUNT(*) as c FROM registrations WHERE checked_in = 1 AND reg_status = 'APPROVED'${andEvent}`, eventParam),
      get(`SELECT COUNT(*) as c FROM registrations WHERE certificate_eligible = 1 AND reg_status = 'APPROVED'${andEvent}`, eventParam)
    ]);

    return res.json({
      success: true,
      eventId: eventId || 'ALL',
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
    const { status, search, eventId, category, checkedIn, limit = 100, offset = 0 } = req.query;

    let sql = `SELECT * FROM registrations WHERE 1=1`;
    const params = [];

    if (eventId && eventId !== 'ALL') {
      sql += ` AND event_id = ?`;
      params.push(eventId);
    }

    if (status && status !== 'ALL') {
      sql += ` AND reg_status = ?`;
      params.push(status);
    }

    if (category && category !== 'ALL') {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (checkedIn !== undefined && checkedIn !== '' && checkedIn !== 'ALL') {
      sql += ` AND checked_in = ?`;
      params.push(checkedIn === '1' || checkedIn === 'true' ? 1 : 0);
    }

    if (search && search.trim()) {
      const trimmed = search.trim();
      const q = `%${trimmed}%`;
      const num = parseInt(trimmed.replace(/^0+/, ''), 10);
      if (!isNaN(num) && num > 0) {
        sql += ` AND (full_name LIKE ? OR email LIKE ? OR registration_id LIKE ? OR phone LIKE ? OR transaction_id LIKE ? OR promo_code LIKE ? OR referrer_name LIKE ? OR id = ?)`;
        params.push(q, q, q, q, q, q, q, num);
      } else {
        sql += ` AND (full_name LIKE ? OR email LIKE ? OR registration_id LIKE ? OR phone LIKE ? OR transaction_id LIKE ? OR promo_code LIKE ? OR referrer_name LIKE ?)`;
        params.push(q, q, q, q, q, q, q);
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
        eventId: r.event_id || 'online-open-mic-2026',
        serialNumber: r.serial_number || r.id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        city: r.city,
        category: r.category,
        performanceTitle: r.performance_title,
        instagram: r.instagram,
        promoCode: r.promo_code || null,
        referrerName: r.referrer_name || null,
        originalFee: r.original_fee !== undefined && r.original_fee !== null ? Number(r.original_fee) : null,
        discountAmount: r.discount_amount !== undefined && r.discount_amount !== null ? Number(r.discount_amount) : 0,
        finalFee: r.final_fee !== undefined && r.final_fee !== null ? Number(r.final_fee) : null,
        paymentStatus: r.payment_status || (r.reg_status === 'APPROVED' ? 'PAID' : 'PENDING'),
        status: r.reg_status || 'PENDING_VERIFICATION',
        otpVerified: Boolean(r.otp_verified),
        otpVerifiedAt: r.otp_verified_at,
        checkedIn: Boolean(r.checked_in),
        checkinAt: r.checkin_at,
        certificateEligible: Boolean(r.certificate_eligible),
        position: r.position || 'Participant',
        achievement: r.achievement || null,
        badgeText: r.badge_text || null,
        citation: r.citation || null,
        certificateTitle: r.certificate_title || 'CERTIFICATE OF PARTICIPATION',
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

// ─── GET /api/admin/registrations/export & /registrations/export.xlsx (DOWNLOAD PARTICIPANTS WITH FILTERS) ──

router.get(['/registrations/export', '/registrations/export.xlsx'], async (req, res) => {
  try {
    const { status, search, eventId, category, checkedIn } = req.query;
    const format = (req.query.format || (req.path.endsWith('.xlsx') ? 'xlsx' : 'csv')).toLowerCase();
    const isXlsx = format === 'xlsx';

    let sql = `SELECT * FROM registrations WHERE 1=1`;
    const params = [];

    if (eventId && eventId !== 'ALL') {
      sql += ` AND event_id = ?`;
      params.push(eventId);
    }

    if (status && status !== 'ALL') {
      sql += ` AND reg_status = ?`;
      params.push(status);
    }

    if (category && category !== 'ALL') {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (checkedIn !== undefined && checkedIn !== '' && checkedIn !== 'ALL') {
      sql += ` AND checked_in = ?`;
      params.push(checkedIn === '1' || checkedIn === 'true' ? 1 : 0);
    }

    if (search && search.trim()) {
      const trimmed = search.trim();
      const q = `%${trimmed}%`;
      const num = parseInt(trimmed.replace(/^0+/, ''), 10);
      if (!isNaN(num) && num > 0) {
        sql += ` AND (full_name LIKE ? OR email LIKE ? OR registration_id LIKE ? OR phone LIKE ? OR transaction_id LIKE ? OR promo_code LIKE ? OR referrer_name LIKE ? OR id = ?)`;
        params.push(q, q, q, q, q, q, q, num);
      } else {
        sql += ` AND (full_name LIKE ? OR email LIKE ? OR registration_id LIKE ? OR phone LIKE ? OR transaction_id LIKE ? OR promo_code LIKE ? OR referrer_name LIKE ?)`;
        params.push(q, q, q, q, q, q, q);
      }
    }

    sql += ` ORDER BY id ASC`;
    const rows = await all(sql, params);

    // Fetch event metadata to map slug to readable event name
    const eventMap = {};
    try {
      const allEvents = await all(`SELECT slug, name, title FROM events`);
      if (Array.isArray(allEvents)) {
        allEvents.forEach(e => {
          eventMap[e.slug] = e.name || e.title || e.slug;
        });
      }
    } catch (_) {}

    const host = req.get('host') || 'offstagecreators.in';
    const protocol = req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;

    const dateStr = new Date().toISOString().slice(0, 10);
    const eventPart = (eventId && eventId !== 'ALL') ? eventId.replace(/[^a-zA-Z0-9_-]/g, '') : 'all-events';
    const statusPart = (status && status !== 'ALL') ? status.toLowerCase() : 'all-statuses';

    if (isXlsx) {
      const filename = `participants_${eventPart}_${statusPart}_${dateStr}.xlsx`;
      const xlsxBuffer = await generateXlsxBuffer(rows, eventMap, baseUrl);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(xlsxBuffer);
    } else {
      const filename = `participants_${eventPart}_${statusPart}_${dateStr}.csv`;
      const csvOutput = generateCsv(rows, eventMap, baseUrl);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvOutput);
    }

  } catch (err) {
    console.error('[Admin] Export registrations error:', err);
    return res.status(500).json({ success: false, error: 'Failed to export registrations.' });
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
        promoCode: record.promo_code || null,
        referrerName: record.referrer_name || null,
        originalFee: record.original_fee !== undefined && record.original_fee !== null ? Number(record.original_fee) : null,
        discountAmount: record.discount_amount !== undefined && record.discount_amount !== null ? Number(record.discount_amount) : 0,
        finalFee: record.final_fee !== undefined && record.final_fee !== null ? Number(record.final_fee) : null,
        paymentStatus: record.payment_status || (record.reg_status === 'APPROVED' ? 'PAID' : 'PENDING'),
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

// ─── GET /api/admin/registrations/:id/screenshot ─────────────────────────────

router.get('/registrations/:id/screenshot', async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const record = await get(`SELECT payment_screenshot_url FROM registrations WHERE registration_id = ?`, [regId]);

    if (!record || !record.payment_screenshot_url) {
      return res.status(404).send('No payment screenshot found.');
    }

    const url = record.payment_screenshot_url;
    if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    } else if (url.startsWith('/uploads/') || url.startsWith('http')) {
      return res.redirect(url);
    }

    return res.status(404).send('Screenshot format not supported.');
  } catch (err) {
    console.error('[Admin] View screenshot error:', err);
    return res.status(500).send('Failed to retrieve screenshot.');
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
       SET reg_status = 'APPROVED', payment_status = 'PAID', payment_verified_at = ?, payment_verified_by = ?, approved_at = ?, approved_by = ?, updated_at = ?
       WHERE registration_id = ?`,
      [now, approvedBy, now, approvedBy, now, regId]
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
        event: await (async () => {
          if (reg.event_id) {
            const evt = await getEventBySlug(reg.event_id);
            if (evt) return {
              title: evt.title || evt.name,
              date: evt.event_date || config.EVENT.date,
              time: evt.start_time ? (evt.end_time ? `${evt.start_time} – ${evt.end_time}` : evt.start_time) : config.EVENT.time,
              venue: evt.venue_name || 'Online (Google Meet)'
            };
          }
          return config.EVENT;
        })()
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

// ─── POST /api/admin/registrations/:id/status ──────────────────────────────────
router.post(['/registrations/:id/status', '/registrations/status/:id'], async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'Status is required.' });

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found.' });

    const now = new Date().toISOString();
    const isApproved = status.toUpperCase() === 'APPROVED';
    await run(
      `UPDATE registrations SET
         reg_status = ?,
         approved_at = ?,
         certificate_eligible = ?,
         updated_at = ?
       WHERE registration_id = ?`,
      [status.toUpperCase(), isApproved ? now : reg.approved_at, isApproved ? 1 : reg.certificate_eligible, now, regId]
    );

    return res.json({ success: true, message: `Status updated to ${status}.`, status: status.toUpperCase() });
  } catch (err) {
    console.error('[Admin] Registration status error:', err);
    return res.status(500).json({ success: false, error: 'Server error updating registration status.' });
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

// POST /api/admin/certificate/winner — Assign Winner / Special Achievement
router.post('/certificate/winner', async (req, res) => {
  try {
    const { registrationId, position, achievement, badgeText, citation, certificateTitle } = req.body;
    if (!registrationId) return res.status(400).json({ success: false, error: 'Registration ID required.' });
    const regId = registrationId.trim().toUpperCase();
    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found.' });

    const now = new Date().toISOString();
    await run(
      `UPDATE registrations SET
        position = ?,
        achievement = ?,
        badge_text = ?,
        citation = ?,
        certificate_title = ?,
        certificate_eligible = 1,
        updated_at = ?
      WHERE registration_id = ?`,
      [
        position || 'WINNER',
        achievement || 'Winner — First Place',
        badgeText || '★ EVENT WINNER ★',
        citation || '',
        certificateTitle || 'CERTIFICATE OF EXCELLENCE',
        now,
        regId
      ]
    );

    return res.json({
      success: true,
      message: `Updated achievement for ${reg.full_name}.`,
      position: position || 'WINNER',
      achievement: achievement || 'Winner — First Place'
    });
  } catch (err) {
    console.error('[Admin] Winner assign error:', err);
    return res.status(500).json({ success: false, error: 'Failed to assign winner.' });
  }
});

// ─── POST /api/admin/certificate/:id ─────────────────────────────────────────

router.post('/certificate/:id', async (req, res) => {
  try {
    const regId = req.params.id.trim().toUpperCase();
    const { eligible, position, achievement, badgeText, citation, certificateTitle } = req.body;

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found.' });

    const now = new Date().toISOString();
    const isEligible = eligible !== undefined ? (eligible ? 1 : 0) : reg.certificate_eligible;

    await run(
      `UPDATE registrations SET
        certificate_eligible = ?,
        position = COALESCE(?, position),
        achievement = COALESCE(?, achievement),
        badge_text = COALESCE(?, badge_text),
        citation = COALESCE(?, citation),
        certificate_title = COALESCE(?, certificate_title),
        updated_at = ?
      WHERE registration_id = ?`,
      [
        isEligible,
        position !== undefined ? position : null,
        achievement !== undefined ? achievement : null,
        badgeText !== undefined ? badgeText : null,
        citation !== undefined ? citation : null,
        certificateTitle !== undefined ? certificateTitle : null,
        now,
        regId
      ]
    );

    return res.json({
      success: true,
      certificateEligible: Boolean(isEligible),
      position: position !== undefined ? position : reg.position,
      achievement: achievement !== undefined ? achievement : reg.achievement
    });

  } catch (err) {
    console.error('[Admin] Certificate error:', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ─── Email Helpers & Placeholders (Requirement 9) ─────────────────────────────

function replacePlaceholders(templateText, reg = {}, event = null) {
  if (!templateText) return '';
  const name = reg.full_name || reg.fullName || 'Participant';
  const regId = reg.registration_id || reg.registrationId || '';
  const rawId = reg.id || '';
  const serialNo = reg.serial_number ? String(reg.serial_number).padStart(6, '0') : (rawId ? String(rawId).padStart(6, '0') : '');
  const category = reg.category || '';
  const entry = reg.performance_title || reg.performanceTitle || reg.category || '';
  const city = reg.city || '';

  // Event placeholders (Requirement 9)
  const eventName = event ? (event.name || event.title) : config.EVENT.title;
  const eventDate = event ? (event.event_date || event.date) : config.EVENT.date;
  const eventTime = event ? (event.start_time ? (event.end_time ? `${event.start_time} – ${event.end_time}` : event.start_time) : event.time) : config.EVENT.time;
  const venue = event ? (event.venue_name || event.venue) : 'Online (Google Meet)';
  const venueAddress = event ? (event.venue_address || venue) : 'Online (Google Meet)';
  const registrationFee = (reg.amount !== undefined && reg.amount !== null) ? `₹${reg.amount}` : (event && event.fee !== undefined ? `₹${event.fee}` : `₹${config.OPEN_MIC_FEE_INR || 79}`);
  const certificateUrl = `${config.APP_URL}/certificate${regId ? `?regId=${encodeURIComponent(regId)}` : ''}`;

  let out = templateText
    .replace(/\{name\}/gi, name)
    .replace(/\{registration_id\}/gi, regId)
    .replace(/\{serial_no\}/gi, serialNo)
    .replace(/\{serial_number\}/gi, serialNo)
    .replace(/\{category\}/gi, category)
    .replace(/\{entry\}/gi, entry)
    .replace(/\{city\}/gi, city)
    .replace(/\{event_name\}/gi, eventName)
    .replace(/\{event_date\}/gi, eventDate)
    .replace(/\{event_time\}/gi, eventTime)
    .replace(/\{venue\}/gi, venue)
    .replace(/\{venue_address\}/gi, venueAddress)
    .replace(/\{registration_fee\}/gi, registrationFee)
    .replace(/\{refund_amount\}/gi, registrationFee)
    .replace(/\{amount\}/gi, registrationFee)
    .replace(/\{fee\}/gi, registrationFee)
    .replace(/\{certificate_url\}/gi, certificateUrl);

  if (!regId && !/<\/?[a-z]/i.test(templateText)) {
    out = out.replace(/^[ \t]*Registration ID:[ \t]*\n?/gim, '');
  }
  if (!category && !/<\/?[a-z]/i.test(templateText)) {
    out = out.replace(/^[ \t]*Performance Category:[ \t]*\n?/gim, '');
  }

  return out;
}

function isHtmlContent(content) {
  if (!content || typeof content !== 'string') return false;
  const trimmed = content.trim();
  return /<\/?[a-z][\s\S]*>/i.test(trimmed);
}

function isFullHtmlDocument(content) {
  if (!content || typeof content !== 'string') return false;
  const trimmed = content.trim();
  return /^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

function prepareEmailBody(content) {
  if (!content || !content.trim()) return '';
  const trimmed = content.trim();
  // If the content is already HTML, NEVER run it through markdown conversion or regex tag modifications
  if (isHtmlContent(trimmed)) {
    return trimmed;
  }
  return formatRichEmailContent(trimmed);
}

function buildFullEmailHtml({ title, preheader, bodyContent }) {
  const trimmed = (bodyContent || '').trim();
  // If the body is already a complete HTML document, avoid double wrapping
  if (isFullHtmlDocument(trimmed)) {
    return trimmed;
  }
  return emailService.emailWrapper({
    title,
    preheader,
    bodyContent: prepareEmailBody(trimmed)
  });
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
    if (/^<([a-z0-9]+)[\s>]/i.test(block)) {
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
        ${prepareEmailBody(additionalMessage)}
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
    const { type, subject, bodyContent, meetData, registrationId, manualEmail, eventId } = req.body;
    let reg = null;
    if (registrationId) {
      reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    }
    const targetEventId = eventId || (reg ? reg.event_id : null);
    const eventObj = targetEventId ? await getEventBySlug(targetEventId) : await getActiveEvent();

    if (!reg) {
      reg = await get(`SELECT * FROM registrations WHERE registration_id = 'OC-OM-436157FB'`);
    }

    if (!reg) {
      reg = {
        full_name: 'Rishi',
        registration_id: 'OC-OM-436157FB',
        id: 24,
        serial_number: 24,
        category: 'Music & Vocals',
        performance_title: 'Test 01',
        city: 'Kanpur',
        amount: 89,
        email: manualEmail || 'creator@example.com',
        event_id: eventObj ? eventObj.slug : 'online-open-mic-2026'
      };
    }

    let finalSubject = subject || '';
    let fullHtml = '';

    if (type === 'meet') {
      finalSubject = replacePlaceholders(subject || `Google Meet Invitation: ${meetData?.meetingTitle || eventObj?.title || 'Online Open Mic'}`, reg, eventObj);
      const rawId = reg.id || '';
      const serialNo = reg.serial_number ? String(reg.serial_number).padStart(6, '0') : (rawId ? String(rawId).padStart(6, '0') : '');
      const substitutedInstructions = replacePlaceholders(meetData?.additionalMessage || meetData?.customHtml || '', reg, eventObj);
      const renderedBodyHtml = generateMeetHtml({
        meetingTitle: meetData?.meetingTitle || eventObj?.title,
        meetLink: meetData?.meetLink || eventObj?.meet_link,
        date: meetData?.date || eventObj?.event_date,
        startTime: meetData?.startTime || eventObj?.start_time,
        endTime: meetData?.endTime || eventObj?.end_time,
        timeZone: meetData?.timeZone || eventObj?.timezone,
        additionalMessage: substitutedInstructions,
        name: reg.full_name,
        regId: reg.registration_id,
        serialNo,
        category: reg.category
      });
      fullHtml = buildFullEmailHtml({
        title: finalSubject,
        preheader: finalSubject,
        bodyContent: renderedBodyHtml
      });
    } else {
      finalSubject = replacePlaceholders(subject || `Message regarding ${eventObj?.title || 'Offstage Creators'}`, reg, eventObj);
      const substitutedBody = replacePlaceholders(bodyContent || '', reg, eventObj);
      fullHtml = buildFullEmailHtml({
        title: finalSubject,
        preheader: finalSubject,
        bodyContent: substitutedBody
      });
    }

    return res.json({ success: true, subject: finalSubject, html: fullHtml });
  } catch (err) {
    console.error('[Admin] Email preview error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate preview.' });
  }
});

router.post('/email/custom-send', async (req, res) => {
  try {
    const { registrationIds = [], manualEmails = [], subject, bodyContent, eventId } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Subject is required.' });
    }
    if (!bodyContent || !bodyContent.trim()) {
      return res.status(400).json({ success: false, error: 'Email body content is required.' });
    }
    if (registrationIds.length === 0 && manualEmails.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one recipient.' });
    }

    const defaultEvent = eventId ? await getEventBySlug(eventId) : await getActiveEvent();
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

        const regEvent = reg.event_id ? await getEventBySlug(reg.event_id) : defaultEvent;
        const substitutedSubject = replacePlaceholders(subject, reg, regEvent);
        const substitutedBody = replacePlaceholders(bodyContent, reg, regEvent);

        const html = buildFullEmailHtml({
          title: substitutedSubject,
          preheader: substitutedSubject,
          bodyContent: substitutedBody
        });

        await emailService.sendEmail({
          registrationId: reg.registration_id,
          to: reg.email,
          subject: substitutedSubject,
          html,
          emailCategory: 'EVENTS',
          emailType: 'EVENT_ANNOUNCEMENT',
          isOptionalAnnouncement: true
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
        const substitutedSubject = replacePlaceholders(subject, dummyReg, defaultEvent);
        const substitutedBody = replacePlaceholders(bodyContent, dummyReg, defaultEvent);

        const html = buildFullEmailHtml({
          title: substitutedSubject,
          preheader: substitutedSubject,
          bodyContent: substitutedBody
        });

        await emailService.sendEmail({
          registrationId: null,
          to: trimmed,
          subject: substitutedSubject,
          html,
          emailCategory: 'EVENTS',
          emailType: 'EVENT_ANNOUNCEMENT',
          isOptionalAnnouncement: true
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
      customSubject,
      eventId
    } = req.body;

    if (!meetLink || !meetLink.trim()) {
      return res.status(400).json({ success: false, error: 'Google Meet link is required.' });
    }
    if (registrationIds.length === 0 && manualEmails.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one recipient.' });
    }

    const defaultEvent = eventId ? await getEventBySlug(eventId) : await getActiveEvent();
    const baseSubject = customSubject || `Google Meet Invitation: ${meetingTitle || defaultEvent?.title || 'Online Open Mic'}`;
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

        const regEvent = reg.event_id ? await getEventBySlug(reg.event_id) : defaultEvent;
        const rawId = reg.id || '';
        const serialNo = rawId ? String(rawId).padStart(6, '0') : '';
        const substitutedSubject = replacePlaceholders(baseSubject, reg, regEvent);
        const substitutedInstructions = replacePlaceholders(additionalMessage || customHtml || '', reg, regEvent);

        const bodyContent = generateMeetHtml({
          meetingTitle: meetingTitle || regEvent?.title,
          meetLink,
          date: date || regEvent?.event_date,
          startTime: startTime || regEvent?.start_time,
          endTime: endTime || regEvent?.end_time,
          timeZone: timeZone || regEvent?.timezone,
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
          emailCategory: 'EVENTS',
          emailType: 'MEET_INVITE',
          isOptionalAnnouncement: false
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
        const substitutedSubject = replacePlaceholders(baseSubject, dummyReg, defaultEvent);
        const substitutedInstructions = replacePlaceholders(additionalMessage || customHtml || '', dummyReg, defaultEvent);

        const bodyContent = generateMeetHtml({
          meetingTitle: meetingTitle || defaultEvent?.title,
          meetLink,
          date: date || defaultEvent?.event_date,
          startTime: startTime || defaultEvent?.start_time,
          endTime: endTime || defaultEvent?.end_time,
          timeZone: timeZone || defaultEvent?.timezone,
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
          emailCategory: 'EVENTS',
          emailType: 'MEET_INVITE',
          isOptionalAnnouncement: false
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

// ─── GET /api/admin/email/domain-status ────────────────────────────────────────
router.get('/email/domain-status', async (req, res) => {
  try {
    const status = await emailService.checkDomainStatus();
    return res.json({ success: true, ...status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/admin/email/campaign ───────────────────────────────────────────
router.post('/email/campaign', async (req, res) => {
  try {
    const { eventId, recipientGroup = 'APPROVED', subject, bodyContent, previewOnly = false, isPromotional = true } = req.body;

    if (!subject?.trim() || !bodyContent?.trim()) {
      return res.status(400).json({ success: false, error: 'Subject and body content are required.' });
    }

    const event = eventId ? await getEventBySlug(eventId) : await getActiveEvent();
    const eventSlug = event?.slug || 'online-open-mic-2026';

    let sql = `SELECT * FROM registrations WHERE event_id = ?`;
    const params = [eventSlug];
    if (recipientGroup === 'APPROVED') {
      sql += ` AND reg_status = 'APPROVED'`;
    } else if (recipientGroup === 'VERIFIED') {
      sql += ` AND reg_status IN ('APPROVED', 'VERIFIED')`;
    } else if (recipientGroup === 'CHECKED_IN') {
      sql += ` AND checked_in = 1`;
    }

    const recipients = await all(sql, params);

    // If previewOnly, render sample and recipient count
    if (previewOnly) {
      const sample = recipients[0] || {
        full_name: 'Sample Performer',
        email: 'creator@example.com',
        registration_id: 'OC-SAMPLE-001',
        category: 'Poetry'
      };
      const subSubject = replacePlaceholders(subject, sample, event);
      const subBody = replacePlaceholders(bodyContent, sample, event);
      const html = buildFullEmailHtml({
        title: subSubject,
        preheader: subSubject,
        bodyContent: subBody
      });
      return res.json({
        success: true,
        preview: true,
        recipientCount: recipients.length,
        subject: subSubject,
        html
      });
    }

    // Protection against duplicate campaigns (within 60s)
    const recentCampaign = await get(
      `SELECT * FROM email_campaigns WHERE event_id = ? AND subject = ? AND created_at > ? LIMIT 1`,
      [eventSlug, subject.trim(), new Date(Date.now() - 60000).toISOString()]
    );
    if (recentCampaign) {
      return res.status(429).json({
        success: false,
        error: 'A duplicate campaign was recently sent. Please wait at least 60 seconds before sending another.'
      });
    }

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const reg of recipients) {
      try {
        const subSubject = replacePlaceholders(subject, reg, event);
        const subBody = replacePlaceholders(bodyContent, reg, event);
        const html = buildFullEmailHtml({
          title: subSubject,
          preheader: subSubject,
          bodyContent: subBody
        });

        const sendRes = await emailService.sendEmail({
          registrationId: reg.registration_id,
          to: reg.email,
          subject: subSubject,
          html,
          emailCategory: 'EVENTS',
          emailType: 'EVENT_CAMPAIGN',
          isOptionalAnnouncement: Boolean(isPromotional)
        });

        if (sendRes.skipped) {
          skippedCount++;
          results.push({ recipient: reg.email, status: 'SKIPPED_OPTED_OUT' });
        } else {
          sentCount++;
          results.push({ recipient: reg.email, registrationId: reg.registration_id, status: 'SENT' });
        }
      } catch (sendErr) {
        failedCount++;
        results.push({ recipient: reg.email, registrationId: reg.registration_id, status: 'FAILED', error: sendErr.message });
      }
    }

    // Record campaign in audit log
    await run(
      `INSERT INTO email_campaigns (event_id, campaign_type, subject, recipient_count, sent_count, failed_count, status, created_at)
       VALUES (?, 'ANNOUNCEMENT', ?, ?, ?, ?, 'COMPLETED', ?)`,
      [eventSlug, subject.trim(), recipients.length, sentCount, failedCount, new Date().toISOString()]
    );

    return res.json({
      success: true,
      message: `Campaign complete: ${sentCount} sent, ${skippedCount} opted-out/skipped, ${failedCount} failed.`,
      recipientCount: recipients.length,
      sentCount,
      skippedCount,
      failedCount,
      results
    });

  } catch (err) {
    console.error('[Admin] Campaign send error:', err);
    return res.status(500).json({ success: false, error: 'Server error while sending campaign.' });
  }
});

// ─── User Management Endpoints ────────────────────────────────────────────────

function sanitizeAdminUser(u, registrationCount = 0) {
  if (!u) return null;
  const isBlockedBool = Number(u.is_blocked) === 1;
  const isVerifiedBool = Number(u.is_verified) === 1;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    age: u.age,
    city: u.city,
    is_verified: isVerifiedBool ? 1 : 0,
    is_blocked: isBlockedBool ? 1 : 0,
    isVerified: isVerifiedBool,
    isBlocked: isBlockedBool,
    block_reason: u.block_reason || null,
    blockReason: u.block_reason || null,
    blocked_at: u.blocked_at || null,
    blockedAt: u.blocked_at || null,
    blocked_by: u.blocked_by || null,
    blockedBy: u.blocked_by || null,
    unblocked_at: u.unblocked_at || null,
    unblockedAt: u.unblocked_at || null,
    unblocked_by: u.unblocked_by || null,
    unblockedBy: u.unblocked_by || null,
    created_at: u.created_at,
    createdAt: u.created_at,
    updated_at: u.updated_at,
    updatedAt: u.updated_at,
    instagram: u.instagram || null,
    registrationCount: Number(registrationCount || 0)
  };
}

// GET /api/admin/users — List & Search Users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { search = '', status = 'ALL' } = req.query;
    const cleanSearch = String(search || '').trim();
    const cleanStatus = String(status || 'ALL').toUpperCase();

    let query = `SELECT * FROM users`;
    let params = [];
    let whereClauses = [];

    if (cleanSearch) {
      whereClauses.push(`(name ILIKE ? OR email ILIKE ? OR phone ILIKE ? OR city ILIKE ?)`);
      const term = `%${cleanSearch}%`;
      params.push(term, term, term, term);
    }

    if (cleanStatus === 'BLOCKED') {
      whereClauses.push(`is_blocked = 1`);
    } else if (cleanStatus === 'ACTIVE') {
      whereClauses.push(`(is_blocked = 0 OR is_blocked IS NULL)`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
    }

    query += ` ORDER BY id DESC`;

    const users = await all(query.replace(/ILIKE/g, 'LIKE'), params);

    // Fetch registration counts for each user
    const usersWithCounts = await Promise.all(users.map(async (u) => {
      const regCountRow = await get(
        `SELECT COUNT(*) as count FROM registrations WHERE user_id = ? OR email = ?`,
        [u.id, u.email]
      );
      const count = regCountRow ? (regCountRow.count || regCountRow['count(*)'] || 0) : 0;
      return sanitizeAdminUser(u, count);
    }));

    return res.json({
      success: true,
      users: usersWithCounts,
      total: usersWithCounts.length
    });

  } catch (err) {
    console.error('[Admin] Error retrieving users:', err);
    return res.status(500).json({ success: false, error: 'Server error retrieving users.' });
  }
});

// GET /api/admin/users/:id — User Profile & History Details
router.get('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Fetch all registrations associated with user
    const registrations = await all(
      `SELECT * FROM registrations WHERE user_id = ? OR email = ? ORDER BY id DESC`,
      [user.id, user.email]
    );

    const enrichedRegs = await Promise.all(registrations.map(async (r) => {
      let eventTitle = 'Online Open Mic';
      if (r.event_id) {
        try {
          const evt = await getEventBySlug(r.event_id);
          if (evt) eventTitle = evt.title || evt.name || eventTitle;
        } catch (_) {}
      }
      return {
        id: r.id,
        registrationId: r.registration_id,
        eventId: r.event_id,
        eventTitle,
        category: r.category,
        performanceTitle: r.performance_title,
        amount: r.amount,
        regStatus: r.reg_status,
        paymentStatus: r.payment_status || (r.reg_status === 'APPROVED' ? 'PAID' : (r.transaction_id ? 'SUBMITTED' : 'PENDING')),
        transactionId: r.transaction_id || null,
        paymentScreenshotUrl: r.payment_screenshot_url || null,
        checkedIn: Boolean(r.checked_in),
        certificateEligible: Boolean(r.certificate_eligible),
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    }));

    return res.json({
      success: true,
      user: sanitizeAdminUser(user, enrichedRegs.length),
      registrations: enrichedRegs
    });

  } catch (err) {
    console.error('[Admin] Error retrieving user details:', err);
    return res.status(500).json({ success: false, error: 'Server error retrieving user details.' });
  }
});

// POST /api/admin/users/:id/block — Block User
router.post('/users/:id/block', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { reason = '' } = req.body;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const currentAdminEmail = (req.session && req.session.adminEmail) || config.ADMIN_EMAIL || 'admin@offstagecreators.com';

    // Prevent admins from accidentally blocking their own account
    if (
      user.email.toLowerCase() === currentAdminEmail.toLowerCase() ||
      user.email.toLowerCase() === (config.ADMIN_EMAIL || '').toLowerCase()
    ) {
      return res.status(400).json({ success: false, error: 'You cannot block your own admin account.' });
    }

    const now = new Date().toISOString();
    const cleanReason = String(reason || '').trim() || 'Suspended by administrator';

    await run(
      `UPDATE users SET
         is_blocked = 1,
         block_reason = ?,
         blocked_at = ?,
         blocked_by = ?,
         updated_at = ?
       WHERE id = ?`,
      [cleanReason, now, currentAdminEmail, now, userId]
    );

    const updatedUser = await get(`SELECT * FROM users WHERE id = ?`, [userId]);

    return res.json({
      success: true,
      message: `User ${user.name} has been blocked successfully.`,
      user: sanitizeAdminUser(updatedUser)
    });

  } catch (err) {
    console.error('[Admin] Error blocking user:', err);
    return res.status(500).json({ success: false, error: 'Server error while blocking user.' });
  }
});

// POST /api/admin/users/:id/unblock — Unblock User
router.post('/users/:id/unblock', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID.' });
    }

    const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const currentAdminEmail = (req.session && req.session.adminEmail) || config.ADMIN_EMAIL || 'admin@offstagecreators.com';
    const now = new Date().toISOString();

    await run(
      `UPDATE users SET
         is_blocked = 0,
         block_reason = NULL,
         unblocked_at = ?,
         unblocked_by = ?,
         updated_at = ?
       WHERE id = ?`,
      [now, currentAdminEmail, now, userId]
    );

    const updatedUser = await get(`SELECT * FROM users WHERE id = ?`, [userId]);

    return res.json({
      success: true,
      message: `User ${user.name} has been unblocked successfully.`,
      user: sanitizeAdminUser(updatedUser)
    });
  } catch (err) {
    console.error('[Admin] Error unblocking user:', err);
    return res.status(500).json({ success: false, error: 'Server error while unblocking user.' });
  }
});

// ─── PROMO CODES & REFERRAL MANAGEMENT ────────────────────────────────────────

// Helper to format a promo code row with stats
function formatPromoCode(p, stats = {}) {
  if (!p) return null;
  let events = [];
  if (p.eligible_events) {
    if (Array.isArray(p.eligible_events)) {
      events = p.eligible_events;
    } else if (typeof p.eligible_events === 'string') {
      try {
        events = JSON.parse(p.eligible_events);
        if (!Array.isArray(events)) events = [events];
      } catch (_) {
        events = [p.eligible_events];
      }
    }
  }

  const isActive = Number(p.is_active !== undefined ? p.is_active : 1) === 1;
  const assigned = (p.assigned_person || p.assigned_to || '').trim() || null;
  const totalLimit = p.total_usage_limit !== null && p.total_usage_limit !== undefined 
    ? Number(p.total_usage_limit) 
    : (p.max_uses !== null && p.max_uses !== undefined && Number(p.max_uses) > 0 ? Number(p.max_uses) : null);
  const perUserLimit = p.per_user_limit !== null && p.per_user_limit !== undefined 
    ? Number(p.per_user_limit) 
    : (p.max_uses_per_user !== null && p.max_uses_per_user !== undefined ? Number(p.max_uses_per_user) : 1);

  return {
    id: p.id,
    code: p.code,
    assigned_person: assigned,
    assignedPerson: assigned,
    assigned_to: assigned,
    assignedTo: assigned,
    referrerName: assigned,
    discount_type: p.discount_type || 'percentage',
    discountType: p.discount_type || 'percentage',
    discount_value: Number(p.discount_value || 0),
    discountValue: Number(p.discount_value || 0),
    eligible_events: events,
    eligibleEvents: events,
    starts_at: p.starts_at || null,
    startsAt: p.starts_at || null,
    startDate: p.starts_at || null,
    expires_at: p.expires_at || null,
    expiresAt: p.expires_at || null,
    endDate: p.expires_at || null,
    total_usage_limit: totalLimit,
    totalUsageLimit: totalLimit,
    max_uses: totalLimit,
    maxUses: totalLimit,
    per_user_limit: perUserLimit,
    perUserLimit: perUserLimit,
    max_uses_per_user: perUserLimit,
    maxUsesPerUser: perUserLimit,
    is_active: isActive ? 1 : 0,
    isActive,
    notes: p.notes || null,
    created_at: p.created_at,
    createdAt: p.created_at,
    updated_at: p.updated_at,
    updatedAt: p.updated_at,
    usage_count: stats.usage_count || 0,
    usageCount: stats.usage_count || 0,
    paid_count: stats.paid_count || 0,
    paidCount: stats.paid_count || 0,
    total_revenue: stats.total_revenue || 0,
    totalRevenue: stats.total_revenue || 0,
    total_discount: stats.total_discount || 0,
    totalDiscount: stats.total_discount || 0
  };
}

// ─── GET /api/admin/promo-codes ───────────────────────────────────────────────
router.get('/promo-codes', async (req, res) => {
  try {
    const codes = await all(`SELECT * FROM promo_codes ORDER BY created_at DESC`);
    const registrations = await all(`SELECT id, promo_code, promo_code_id, reg_status, payment_status, original_fee, discount_amount, final_fee, amount FROM registrations WHERE promo_code IS NOT NULL OR promo_code_id IS NOT NULL`);

    const statsMap = {};
    for (const r of registrations) {
      const codeKey = (r.promo_code || '').toUpperCase().trim();
      const codeId = r.promo_code_id;
      const isPaid = r.payment_status === 'PAID' || r.reg_status === 'APPROVED';
      const finFee = Number(r.final_fee !== null && r.final_fee !== undefined ? r.final_fee : (r.amount ?? 0));
      const discAmt = Number(r.discount_amount || 0);

      const keys = [];
      if (codeKey) keys.push(`code:${codeKey}`);
      if (codeId) keys.push(`id:${codeId}`);

      for (const k of keys) {
        if (!statsMap[k]) {
          statsMap[k] = { usage_count: 0, paid_count: 0, total_revenue: 0, total_discount: 0 };
        }
        statsMap[k].usage_count += 1;
        if (isPaid) {
          statsMap[k].paid_count += 1;
          statsMap[k].total_revenue += finFee;
          statsMap[k].total_discount += discAmt;
        }
      }
    }

    const result = codes.map(p => {
      const stats = statsMap[`id:${p.id}`] || statsMap[`code:${p.code.toUpperCase()}`] || {};
      return formatPromoCode(p, stats);
    });

    return res.json({ success: true, promoCodes: result });
  } catch (err) {
    console.error('[Admin] Error listing promo codes:', err);
    return res.status(500).json({ success: false, error: 'Failed to load promo codes.' });
  }
});

// ─── GET /api/admin/promo-codes/referrers (MUST be before /:id) ───────────────
router.get('/promo-codes/referrers', async (req, res) => {
  try {
    const codes = await all(`SELECT * FROM promo_codes`);
    const registrations = await all(`SELECT id, promo_code, promo_code_id, referrer_name, reg_status, payment_status, original_fee, discount_amount, final_fee, amount, created_at FROM registrations WHERE promo_code IS NOT NULL OR referrer_name IS NOT NULL`);

    // Map promo code string to assigned person
    const codeToReferrer = {};
    for (const c of codes) {
      const ref = (c.assigned_person || c.assigned_to || '').trim();
      if (c.code && ref) {
        codeToReferrer[c.code.toUpperCase().trim()] = ref;
      }
    }

    const referrersMap = {};

    // First seed with all referrers known from promo_codes
    for (const c of codes) {
      const ref = (c.assigned_person || c.assigned_to || '').trim();
      if (ref) {
        if (!referrersMap[ref]) {
          referrersMap[ref] = {
            referrer_name: ref,
            codes: new Set(),
            total_registrations: 0,
            confirmed_paid_registrations: 0,
            total_revenue: 0,
            total_discount_given: 0,
            last_registration_at: null
          };
        }
        referrersMap[ref].codes.add(c.code.toUpperCase());
      }
    }

    // Now aggregate from registrations
    for (const r of registrations) {
      const cUpper = (r.promo_code || '').toUpperCase().trim();
      const refName = (r.referrer_name || codeToReferrer[cUpper] || '').trim();
      if (!refName) continue;

      if (!referrersMap[refName]) {
        referrersMap[refName] = {
          referrer_name: refName,
          codes: new Set(),
          total_registrations: 0,
          confirmed_paid_registrations: 0,
          total_revenue: 0,
          total_discount_given: 0,
          last_registration_at: null
        };
      }

      if (cUpper) referrersMap[refName].codes.add(cUpper);
      referrersMap[refName].total_registrations += 1;

      const isPaid = r.payment_status === 'PAID' || r.reg_status === 'APPROVED';
      const finFee = Number(r.final_fee !== null && r.final_fee !== undefined ? r.final_fee : (r.amount ?? 0));
      const discAmt = Number(r.discount_amount || 0);

      if (isPaid) {
        referrersMap[refName].confirmed_paid_registrations += 1;
        referrersMap[refName].total_revenue += finFee;
        referrersMap[refName].total_discount_given += discAmt;
      }

      if (r.created_at) {
        if (!referrersMap[refName].last_registration_at || new Date(r.created_at) > new Date(referrersMap[refName].last_registration_at)) {
          referrersMap[refName].last_registration_at = r.created_at;
        }
      }
    }

    const list = Object.values(referrersMap).map(item => ({
      referrer_name: item.referrer_name,
      codes: Array.from(item.codes),
      total_registrations: item.total_registrations,
      confirmed_paid_registrations: item.confirmed_paid_registrations,
      total_revenue: item.total_revenue,
      total_discount_given: item.total_discount_given,
      last_registration_at: item.last_registration_at
    })).sort((a, b) => {
      if (b.confirmed_paid_registrations !== a.confirmed_paid_registrations) {
        return b.confirmed_paid_registrations - a.confirmed_paid_registrations;
      }
      return b.total_revenue - a.total_revenue;
    });

    return res.json({ success: true, referrers: list });
  } catch (err) {
    console.error('[Admin] Error getting referrers report:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate referrers report.' });
  }
});

// Alias for convenience
router.get('/promo-codes/analytics/referrers', (req, res) => {
  res.redirect(307, '/api/admin/promo-codes/referrers');
});

// ─── POST /api/admin/promo-codes ─────────────────────────────────────────────
router.post('/promo-codes', async (req, res) => {
  try {
    const rawCode = String(req.body.code || '').trim();
    const code = normalizePromoCode(rawCode);

    if (!code || code.length < 2 || code.length > 30) {
      return res.status(400).json({ success: false, error: 'Promo code must be 2-30 alphanumeric characters.' });
    }

    const existing = await get(`SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?)`, [code]);
    if (existing) {
      return res.status(409).json({ success: false, error: `Promo code "${code}" already exists.` });
    }

    const discountType = (req.body.discount_type || req.body.discountType || 'percentage').toLowerCase();
    if (!['percentage', 'fixed', 'none', 'referral_only'].includes(discountType)) {
      return res.status(400).json({ success: false, error: 'Invalid discount type. Allowed: percentage, fixed, none' });
    }

    const normalizedDiscountType = discountType === 'referral_only' ? 'none' : discountType;
    let discountValue = Number(req.body.discount_value !== undefined ? req.body.discount_value : (req.body.discountValue ?? 0));
    if (isNaN(discountValue) || discountValue < 0) {
      return res.status(400).json({ success: false, error: 'Discount value must be a non-negative number.' });
    }
    if (normalizedDiscountType === 'percentage' && discountValue > 100) {
      return res.status(400).json({ success: false, error: 'Percentage discount cannot exceed 100%.' });
    }
    if (normalizedDiscountType === 'none') {
      discountValue = 0;
    }

    const assignedPerson = (req.body.referrerName || req.body.referrer_name || req.body.assignedPerson || req.body.assigned_person || '').trim() || null;

    let eligibleEvents = null;
    const rawEvents = req.body.eligible_events || req.body.eligibleEvents;
    if (rawEvents) {
      if (Array.isArray(rawEvents)) {
        eligibleEvents = JSON.stringify(rawEvents.filter(Boolean));
      } else if (typeof rawEvents === 'string' && rawEvents.trim()) {
        try {
          const parsed = JSON.parse(rawEvents);
          eligibleEvents = Array.isArray(parsed) ? JSON.stringify(parsed) : JSON.stringify([rawEvents.trim()]);
        } catch (_) {
          eligibleEvents = JSON.stringify([rawEvents.trim()]);
        }
      }
    }

    const startsAt = req.body.starts_at || req.body.startsAt || req.body.startDate || null;
    const expiresAt = req.body.expires_at || req.body.expiresAt || req.body.endDate || null;

    const rawMaxUses = req.body.total_usage_limit !== undefined ? req.body.total_usage_limit : (req.body.totalUsageLimit !== undefined ? req.body.totalUsageLimit : req.body.maxUses);
    const totalUsageLimit = rawMaxUses !== undefined && rawMaxUses !== null && rawMaxUses !== ''
      ? Math.max(0, parseInt(rawMaxUses, 10))
      : null;

    const rawPerUser = req.body.per_user_limit !== undefined ? req.body.per_user_limit : (req.body.perUserLimit !== undefined ? req.body.perUserLimit : req.body.maxUsesPerUser);
    const perUserLimit = rawPerUser !== undefined && rawPerUser !== null && rawPerUser !== ''
      ? Math.max(1, parseInt(rawPerUser, 10))
      : 1;

    let isActive = 1;
    if (req.body.is_active !== undefined) {
      isActive = req.body.is_active ? 1 : 0;
    } else if (req.body.isActive !== undefined) {
      isActive = req.body.isActive ? 1 : 0;
    }
    const notes = (req.body.notes || '').trim() || null;
    const now = new Date().toISOString();

    const insertResult = await run(
      `INSERT INTO promo_codes (
        code, assigned_person, assigned_to, discount_type, discount_value, eligible_events,
        starts_at, expires_at, total_usage_limit, max_uses, per_user_limit, max_uses_per_user,
        is_active, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code, assignedPerson, assignedPerson || '', normalizedDiscountType, discountValue, eligibleEvents,
        startsAt, expiresAt, totalUsageLimit, totalUsageLimit || 0, perUserLimit, perUserLimit,
        isActive, notes, now, now
      ]
    );

    const newId = insertResult?.lastID;
    let created = await get(`SELECT * FROM promo_codes WHERE ${newId ? 'id = ?' : 'UPPER(code) = UPPER(?)'}`, [newId || code]);
    if (!created && newId) {
      created = await get(`SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?)`, [code]);
    }
    if (!created) {
      created = {
        id: newId || 0,
        code,
        assigned_person: assignedPerson,
        assigned_to: assignedPerson,
        discount_type: normalizedDiscountType,
        discount_value: discountValue,
        eligible_events: eligibleEvents,
        starts_at: startsAt,
        expires_at: expiresAt,
        total_usage_limit: totalUsageLimit,
        max_uses: totalUsageLimit,
        per_user_limit: perUserLimit,
        max_uses_per_user: perUserLimit,
        is_active: isActive,
        notes,
        created_at: now,
        updated_at: now
      };
    }

    return res.status(201).json({
      success: true,
      message: `Promo code "${code}" created successfully.`,
      promoCode: formatPromoCode(created)
    });

  } catch (err) {
    console.error('[Admin] Error creating promo code:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error while creating promo code.' });
  }
});

// ─── PUT /api/admin/promo-codes/:id ──────────────────────────────────────────
router.put('/promo-codes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid promo code ID.' });
    }

    const existing = await get(`SELECT * FROM promo_codes WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Promo code not found.' });
    }

    let code = existing.code;
    if (req.body.code) {
      code = normalizePromoCode(req.body.code);
      if (!code || code.length < 2 || code.length > 30) {
        return res.status(400).json({ success: false, error: 'Promo code must be 2-30 alphanumeric characters.' });
      }
      if (code !== existing.code) {
        const dup = await get(`SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?) AND id != ?`, [code, id]);
        if (dup) {
          return res.status(409).json({ success: false, error: `Promo code "${code}" already exists.` });
        }
      }
    }

    let discountType = existing.discount_type;
    if (req.body.discount_type || req.body.discountType) {
      discountType = (req.body.discount_type || req.body.discountType).toLowerCase();
      if (!['percentage', 'fixed', 'none', 'referral_only'].includes(discountType)) {
        return res.status(400).json({ success: false, error: 'Invalid discount type.' });
      }
      if (discountType === 'referral_only') discountType = 'none';
    }

    let discountValue = existing.discount_value;
    if (req.body.discount_value !== undefined || req.body.discountValue !== undefined) {
      discountValue = Number(req.body.discount_value !== undefined ? req.body.discount_value : req.body.discountValue);
      if (isNaN(discountValue) || discountValue < 0) {
        return res.status(400).json({ success: false, error: 'Discount value must be a non-negative number.' });
      }
      if (discountType === 'percentage' && discountValue > 100) {
        return res.status(400).json({ success: false, error: 'Percentage discount cannot exceed 100%.' });
      }
      if (discountType === 'none') {
        discountValue = 0;
      }
    }

    const existingAssigned = (existing.assigned_person || existing.assigned_to || '').trim() || null;
    const assignedPerson = req.body.referrerName !== undefined 
      ? (String(req.body.referrerName || '').trim() || null)
      : (req.body.referrer_name !== undefined
        ? (String(req.body.referrer_name || '').trim() || null)
        : (req.body.assignedPerson !== undefined 
          ? (String(req.body.assignedPerson || '').trim() || null) 
          : (req.body.assigned_person !== undefined
            ? (String(req.body.assigned_person || '').trim() || null)
            : existingAssigned)));

    let eligibleEvents = existing.eligible_events;
    if (req.body.eligible_events !== undefined || req.body.eligibleEvents !== undefined) {
      const rawEvents = req.body.eligible_events !== undefined ? req.body.eligible_events : req.body.eligibleEvents;
      if (!rawEvents || (Array.isArray(rawEvents) && rawEvents.length === 0)) {
        eligibleEvents = null;
      } else if (Array.isArray(rawEvents)) {
        eligibleEvents = JSON.stringify(rawEvents.filter(Boolean));
      } else if (typeof rawEvents === 'string' && rawEvents.trim()) {
        try {
          const parsed = JSON.parse(rawEvents);
          eligibleEvents = Array.isArray(parsed) ? JSON.stringify(parsed) : JSON.stringify([rawEvents.trim()]);
        } catch (_) {
          eligibleEvents = JSON.stringify([rawEvents.trim()]);
        }
      }
    }

    const startsAt = req.body.starts_at !== undefined 
      ? req.body.starts_at 
      : (req.body.startsAt !== undefined 
        ? req.body.startsAt 
        : (req.body.startDate !== undefined ? req.body.startDate : existing.starts_at));

    const expiresAt = req.body.expires_at !== undefined 
      ? req.body.expires_at 
      : (req.body.expiresAt !== undefined 
        ? req.body.expiresAt 
        : (req.body.endDate !== undefined ? req.body.endDate : existing.expires_at));

    let totalUsageLimit = existing.total_usage_limit !== undefined && existing.total_usage_limit !== null
      ? existing.total_usage_limit
      : (existing.max_uses ? existing.max_uses : null);
    if (req.body.total_usage_limit !== undefined || req.body.totalUsageLimit !== undefined || req.body.maxUses !== undefined) {
      const rawLimit = req.body.total_usage_limit !== undefined 
        ? req.body.total_usage_limit 
        : (req.body.totalUsageLimit !== undefined ? req.body.totalUsageLimit : req.body.maxUses);
      totalUsageLimit = (rawLimit !== null && rawLimit !== '') ? Math.max(0, parseInt(rawLimit, 10)) : null;
    }

    let perUserLimit = existing.per_user_limit !== undefined && existing.per_user_limit !== null
      ? existing.per_user_limit
      : (existing.max_uses_per_user ? existing.max_uses_per_user : 1);
    if (req.body.per_user_limit !== undefined || req.body.perUserLimit !== undefined || req.body.maxUsesPerUser !== undefined) {
      const rawPerUser = req.body.per_user_limit !== undefined 
        ? req.body.per_user_limit 
        : (req.body.perUserLimit !== undefined ? req.body.perUserLimit : req.body.maxUsesPerUser);
      perUserLimit = (rawPerUser !== null && rawPerUser !== '') ? Math.max(1, parseInt(rawPerUser, 10)) : 1;
    }

    let isActive = existing.is_active;
    if (req.body.is_active !== undefined) {
      isActive = req.body.is_active ? 1 : 0;
    } else if (req.body.isActive !== undefined) {
      isActive = req.body.isActive ? 1 : 0;
    }

    const notes = req.body.notes !== undefined ? (String(req.body.notes || '').trim() || null) : existing.notes;
    const now = new Date().toISOString();

    await run(
      `UPDATE promo_codes SET
        code = ?,
        assigned_person = ?,
        assigned_to = ?,
        discount_type = ?,
        discount_value = ?,
        eligible_events = ?,
        starts_at = ?,
        expires_at = ?,
        total_usage_limit = ?,
        max_uses = ?,
        per_user_limit = ?,
        max_uses_per_user = ?,
        is_active = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        code, assignedPerson, assignedPerson || '', discountType, discountValue, eligibleEvents,
        startsAt, expiresAt, totalUsageLimit, totalUsageLimit || 0, perUserLimit, perUserLimit,
        isActive, notes, now, id
      ]
    );

    let updated = await get(`SELECT * FROM promo_codes WHERE id = ?`, [id]);
    if (!updated) {
      updated = await get(`SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?)`, [code]);
    }

    return res.json({
      success: true,
      message: `Promo code "${code}" updated successfully.`,
      promoCode: formatPromoCode(updated)
    });

  } catch (err) {
    console.error('[Admin] Error updating promo code:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error while updating promo code.' });
  }
});

// ─── PATCH /api/admin/promo-codes/:id/toggle ──────────────────────────────────
router.patch('/promo-codes/:id/toggle', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, error: 'Invalid promo code ID.' });
    }

    const existing = await get(`SELECT * FROM promo_codes WHERE id = ?`, [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Promo code not found.' });
    }

    let newStatus = Number(existing.is_active) === 1 ? 0 : 1;
    if (req.body.is_active !== undefined) {
      newStatus = req.body.is_active ? 1 : 0;
    }

    const now = new Date().toISOString();
    await run(`UPDATE promo_codes SET is_active = ?, updated_at = ? WHERE id = ?`, [newStatus, now, id]);

    return res.json({
      success: true,
      message: `Promo code "${existing.code}" is now ${newStatus === 1 ? 'active' : 'inactive'}.`,
      is_active: newStatus
    });

  } catch (err) {
    console.error('[Admin] Error toggling promo code:', err);
    return res.status(500).json({ success: false, error: 'Server error while toggling promo code.' });
  }
});

// ─── GET /api/admin/promo-codes/:id/registrations ─────────────────────────────
router.get('/promo-codes/:id/registrations', async (req, res) => {
  try {
    const idParam = req.params.id.trim();
    let promo = null;
    if (/^\d+$/.test(idParam)) {
      promo = await get(`SELECT * FROM promo_codes WHERE id = ?`, [parseInt(idParam, 10)]);
    }
    if (!promo) {
      promo = await get(`SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?)`, [idParam]);
    }

    if (!promo) {
      return res.status(404).json({ success: false, error: 'Promo code not found.' });
    }

    const rows = await all(
      `SELECT * FROM registrations WHERE promo_code_id = ? OR UPPER(promo_code) = UPPER(?) ORDER BY created_at DESC`,
      [promo.id, promo.code]
    );

    let paidCount = 0;
    let totalRevenue = 0;
    let totalDiscount = 0;

    const list = rows.map(r => {
      const isPaid = r.payment_status === 'PAID' || r.reg_status === 'APPROVED';
      const finFee = Number(r.final_fee !== null && r.final_fee !== undefined ? r.final_fee : (r.amount ?? 0));
      const discAmt = Number(r.discount_amount || 0);

      if (isPaid) {
        paidCount += 1;
        totalRevenue += finFee;
        totalDiscount += discAmt;
      }

      return {
        id: r.id,
        registrationId: r.registration_id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        eventId: r.event_id || 'online-open-mic-2026',
        category: r.category,
        regStatus: r.reg_status || 'PENDING_VERIFICATION',
        paymentStatus: r.payment_status || (r.reg_status === 'APPROVED' ? 'PAID' : 'PENDING'),
        originalFee: r.original_fee !== undefined && r.original_fee !== null ? Number(r.original_fee) : Number(r.amount ?? 79),
        discountAmount: discAmt,
        finalFee: finFee,
        createdAt: r.created_at
      };
    });

    return res.json({
      success: true,
      promoCode: formatPromoCode(promo, {
        usage_count: rows.length,
        paid_count: paidCount,
        total_revenue: totalRevenue,
        total_discount: totalDiscount
      }),
      stats: {
        totalRegistrations: rows.length,
        paidRegistrations: paidCount,
        totalRevenue,
        totalDiscount
      },
      registrations: list
    });

  } catch (err) {
    console.error('[Admin] Error fetching promo code registrations:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch promo code registrations.' });
  }
});

module.exports = router;
