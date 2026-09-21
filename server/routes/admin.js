const express = require('express');
const router = express.Router();
const { run, get, all } = require('../db');
const config = require('../config');

// Admin Auth Middleware
function requireAdminAuth(req, res, next) {
  const secret =
    req.headers['x-admin-secret'] ||
    req.query.secret ||
    (req.body && req.body.secret);

  if (!secret || secret !== config.ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid admin secret key.' });
  }
  next();
}

router.use(requireAdminAuth);

// GET /api/admin/overview
router.get('/overview', async (req, res) => {
  try {
    const totalRow = await get(`SELECT COUNT(*) as count FROM registrations`);
    const pendingRow = await get(`SELECT COUNT(*) as count FROM registrations WHERE payment_status = 'PENDING'`);
    const awaitingRow = await get(`SELECT COUNT(*) as count FROM registrations WHERE payment_status = 'PENDING_VERIFICATION'`);
    const paidRow = await get(`SELECT COUNT(*) as count, SUM(amount) as revenue FROM registrations WHERE payment_status = 'PAID'`);
    const rejectedRow = await get(`SELECT COUNT(*) as count FROM registrations WHERE payment_status = 'REJECTED'`);
    const checkedInRow = await get(`SELECT COUNT(*) as count FROM registrations WHERE checked_in = 1`);
    const certEligibleRow = await get(`SELECT COUNT(*) as count FROM registrations WHERE certificate_eligible = 1`);
    const verifiedEmailsRow = await get(`SELECT COUNT(*) as count FROM registrations WHERE email_verified = 1`);
    const failedEmailsRow = await get(`SELECT COUNT(*) as count FROM registrations WHERE email_status = 'FAILED'`);

    return res.json({
      success: true,
      stats: {
        totalRegistrations: totalRow ? totalRow.count : 0,
        pendingPayments: pendingRow ? pendingRow.count : 0,
        awaitingVerification: awaitingRow ? awaitingRow.count : 0,
        paidRegistrations: paidRow ? paidRow.count : 0,
        rejectedPayments: rejectedRow ? rejectedRow.count : 0,
        totalRevenue: paidRow && paidRow.revenue ? paidRow.revenue : 0,
        checkedInCount: checkedInRow ? checkedInRow.count : 0,
        certEligibleCount: certEligibleRow ? certEligibleRow.count : 0,
        verifiedEmailsCount: verifiedEmailsRow ? verifiedEmailsRow.count : 0,
        failedEmailsCount: failedEmailsRow ? failedEmailsRow.count : 0
      }
    });
  } catch (err) {
    console.error('Error in /api/admin/overview:', err);
    return res.status(500).json({ success: false, error: 'Failed to load stats.' });
  }
});

// GET /api/admin/pending-payments (Queue for payments awaiting verification)
router.get('/pending-payments', async (req, res) => {
  try {
    const pendingList = await all(
      `SELECT * FROM registrations WHERE payment_status = 'PENDING_VERIFICATION' ORDER BY payment_submitted_at ASC`
    );

    return res.json({
      success: true,
      count: pendingList.length,
      queue: pendingList
    });
  } catch (err) {
    console.error('Error in /api/admin/pending-payments:', err);
    return res.status(500).json({ success: false, error: 'Failed to load pending payments.' });
  }
});

// POST /api/admin/verify-payment
router.post('/verify-payment', async (req, res) => {
  try {
    const { registrationId, adminName } = req.body;

    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    const now = new Date().toISOString();
    const verifier = adminName || 'Admin';

    // 1. Immediately mark status as PAID in database
    await run(
      `UPDATE registrations SET
        payment_status = 'PAID',
        payment_verified_at = ?,
        payment_verified_by = ?,
        rejection_reason = NULL,
        updated_at = ?
      WHERE registration_id = ?`,
      [now, verifier, now, registrationId]
    );

    // 2. Dispatch Confirmation Emails (Failure will NOT change the PAID status)
    const updatedReg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    const { sendPaymentApprovedEmail } = require('../services/email');

    sendPaymentApprovedEmail({
      to: updatedReg.email,
      registration: updatedReg
    }).catch(err => console.error('Failed to send payment approval email:', err));

    return res.json({
      success: true,
      message: 'Payment verified successfully! Registration is now CONFIRMED.',
      registrationId,
      paymentStatus: 'PAID',
      verifiedAt: now
    });

  } catch (err) {
    console.error('Error in /api/admin/verify-payment:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify payment.' });
  }
});

// POST /api/admin/reject-payment
router.post('/reject-payment', async (req, res) => {
  try {
    const { registrationId, reason, adminName } = req.body;

    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    const now = new Date().toISOString();
    const verifier = adminName || 'Admin';
    const rejectReason = reason ? reason.trim() : 'Payment proof could not be verified.';

    await run(
      `UPDATE registrations SET
        payment_status = 'REJECTED',
        rejection_reason = ?,
        payment_verified_at = ?,
        payment_verified_by = ?,
        updated_at = ?
      WHERE registration_id = ?`,
      [rejectReason, now, verifier, now, registrationId]
    );

    // Send Rejection Email with reason
    const updatedReg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    const { sendPaymentRejectedEmail } = require('../services/email');

    sendPaymentRejectedEmail({
      to: updatedReg.email,
      registration: updatedReg,
      reason: rejectReason
    }).catch(err => console.error('Failed to send payment rejection email:', err));

    return res.json({
      success: true,
      message: 'Payment marked as REJECTED.',
      registrationId,
      paymentStatus: 'REJECTED',
      reason: rejectReason
    });

  } catch (err) {
    console.error('Error in /api/admin/reject-payment:', err);
    return res.status(500).json({ success: false, error: 'Failed to reject payment.' });
  }
});

// POST /api/admin/email/resend
router.post('/email/resend', async (req, res) => {
  try {
    const { registrationId, emailType } = req.body;

    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration record not found.' });
    }

    const emailService = require('../services/email');
    const type = emailType || (reg.payment_status === 'PAID' ? 'PAYMENT_APPROVED' : 'REGISTRATION_RECEIVED');
    let result = null;

    if (type === 'PAYMENT_APPROVED' || type === 'REGISTRATION_CONFIRMED') {
      result = await emailService.sendPaymentApprovedEmail({ to: reg.email, registration: reg });
    } else if (type === 'PAYMENT_PROOF_RECEIVED') {
      result = await emailService.sendPaymentProofReceivedEmail({ to: reg.email, registration: reg });
    } else if (type === 'PAYMENT_REJECTED') {
      result = await emailService.sendPaymentRejectedEmail({ to: reg.email, registration: reg, reason: reg.rejection_reason });
    } else if (type === 'REGISTRATION_RECEIVED') {
      result = await emailService.sendRegistrationReceivedEmail({ to: reg.email, registration: reg });
    } else if (type === 'CHECKIN_CONFIRMED') {
      result = await emailService.sendCheckinEmail({ to: reg.email, registration: reg });
    } else if (type === 'CERTIFICATE_AVAILABLE') {
      result = await emailService.sendCertificateAvailableEmail({ to: reg.email, registration: reg });
    } else if (type === 'EMAIL_VERIFICATION') {
      const otp = emailService.generateOtp();
      const salt = emailService.generateSalt();
      const hash = emailService.hashOtp(otp, salt);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await run(
        `UPDATE registrations SET email_otp_hash = ?, email_otp_salt = ?, email_otp_expires_at = ? WHERE registration_id = ?`,
        [hash, salt, expiresAt, reg.registration_id]
      );
      result = await emailService.sendEmailVerificationEmail({ to: reg.email, name: reg.full_name, otp, registrationId: reg.registration_id });
    } else {
      return res.status(400).json({ success: false, error: `Invalid email type requested: ${type}` });
    }

    return res.json({
      success: result ? result.success : false,
      message: result && result.success ? `Email (${type}) resent successfully to ${reg.email}.` : `Delivery failed: ${result?.error || 'Unknown error'}`
    });

  } catch (err) {
    console.error('Error in /api/admin/email/resend:', err);
    return res.status(500).json({ success: false, error: 'Server error resending email.' });
  }
});

// POST /api/admin/email/health-check
router.post('/email/health-check', async (req, res) => {
  try {
    const { sendTestMessage, recipient } = req.body;
    const emailService = require('../services/email');
    const health = await emailService.verifySmtpHealth();

    let testDelivery = null;
    if (health.success && sendTestMessage) {
      testDelivery = await emailService.sendTestEmail(recipient);
    }

    return res.json({
      success: health.success,
      smtp: health,
      testDelivery
    });
  } catch (err) {
    console.error('Error in /api/admin/email/health-check:', err);
    return res.status(500).json({ success: false, error: err.message || 'SMTP health check failed.' });
  }
});

// GET /api/admin/registrations
router.get('/registrations', async (req, res) => {
  try {
    const { search, payment_status, checked_in, category } = req.query;

    let query = `SELECT * FROM registrations WHERE 1=1`;
    const params = [];

    if (search && search.trim()) {
      query += ` AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ? OR registration_id LIKE ? OR transaction_id LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    if (payment_status && payment_status !== 'ALL') {
      query += ` AND payment_status = ?`;
      params.push(payment_status);
    }

    if (checked_in !== undefined && checked_in !== '' && checked_in !== 'ALL') {
      query += ` AND checked_in = ?`;
      params.push(parseInt(checked_in, 10));
    }

    if (category && category !== 'ALL') {
      query += ` AND category = ?`;
      params.push(category);
    }

    query += ` ORDER BY id DESC`;

    const records = await all(query, params);

    return res.json({
      success: true,
      count: records.length,
      registrations: records
    });

  } catch (err) {
    console.error('Error in /api/admin/registrations:', err);
    return res.status(500).json({ success: false, error: 'Failed to load registrations.' });
  }
});

// POST /api/admin/toggle-checkin
router.post('/toggle-checkin', async (req, res) => {
  try {
    const { registrationId } = req.body;
    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID required.' });
    }

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    const newCheckedIn = reg.checked_in ? 0 : 1;
    const now = new Date().toISOString();
    const checkinAt = newCheckedIn ? now : null;
    // Check-in also grants certificate eligibility
    const newCert = newCheckedIn ? 1 : reg.certificate_eligible;

    await run(
      `UPDATE registrations SET checked_in = ?, checkin_at = ?, certificate_eligible = ?, updated_at = ? WHERE registration_id = ?`,
      [newCheckedIn, checkinAt, newCert, now, registrationId]
    );

    return res.json({
      success: true,
      checkedIn: Boolean(newCheckedIn),
      checkinAt,
      certificateEligible: Boolean(newCert)
    });

  } catch (err) {
    console.error('Error in /api/admin/toggle-checkin:', err);
    return res.status(500).json({ success: false, error: 'Toggle check-in failed.' });
  }
});

// POST /api/admin/toggle-certificate
router.post('/toggle-certificate', async (req, res) => {
  try {
    const { registrationId } = req.body;
    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID required.' });
    }

    const reg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [registrationId]);
    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    const newEligible = reg.certificate_eligible ? 0 : 1;
    const now = new Date().toISOString();

    await run(
      `UPDATE registrations SET certificate_eligible = ?, updated_at = ? WHERE registration_id = ?`,
      [newEligible, now, registrationId]
    );

    return res.json({
      success: true,
      certificateEligible: Boolean(newEligible)
    });

  } catch (err) {
    console.error('Error in /api/admin/toggle-certificate:', err);
    return res.status(500).json({ success: false, error: 'Toggle certificate failed.' });
  }
});

// GET /api/admin/export-csv
router.get('/export-csv', async (req, res) => {
  try {
    const records = await all(`SELECT * FROM registrations ORDER BY id ASC`);

    const headers = [
      'Registration ID',
      'Event',
      'Full Name',
      'Phone',
      'Email',
      'City',
      'Category',
      'Instagram',
      'Performance Title',
      'Description',
      'Amount (INR)',
      'Payment Status',
      'UPI Transaction ID / UTR',
      'Screenshot URL',
      'Payment Submitted At',
      'Payment Verified At',
      'Payment Verified By',
      'Checked In',
      'Checked In At',
      'Certificate Eligible',
      'Email Verified',
      'Email Status',
      'Last Email Type',
      'Created At'
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    let csvContent = headers.map(h => `"${h}"`).join(',') + '\r\n';

    for (const r of records) {
      const row = [
        escapeCsv(r.registration_id),
        escapeCsv(r.event_id),
        escapeCsv(r.full_name),
        escapeCsv(r.phone),
        escapeCsv(r.email),
        escapeCsv(r.city),
        escapeCsv(r.category),
        escapeCsv(r.instagram),
        escapeCsv(r.performance_title),
        escapeCsv(r.performance_description),
        escapeCsv(r.amount),
        escapeCsv(r.payment_status),
        escapeCsv(r.transaction_id),
        escapeCsv(r.payment_screenshot_url),
        escapeCsv(r.payment_submitted_at),
        escapeCsv(r.payment_verified_at),
        escapeCsv(r.payment_verified_by),
        escapeCsv(r.checked_in ? 'YES' : 'NO'),
        escapeCsv(r.checkin_at),
        escapeCsv(r.certificate_eligible ? 'YES' : 'NO'),
        escapeCsv(r.email_verified ? 'VERIFIED' : 'NOT VERIFIED'),
        escapeCsv(r.email_status || 'PENDING'),
        escapeCsv(r.last_email_type || 'NONE'),
        escapeCsv(r.created_at)
      ];
      csvContent += row.join(',') + '\r\n';
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="offstage_registrations_${dateStr}.csv"`);
    return res.send(csvContent);

  } catch (err) {
    console.error('Error in /api/admin/export-csv:', err);
    return res.status(500).send('Failed to generate CSV export.');
  }
});

// GET /api/admin/email-logs
router.get('/email-logs', async (req, res) => {
  try {
    const logs = await all(
      `SELECT * FROM email_logs ORDER BY id DESC LIMIT 100`
    );
    return res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (err) {
    console.error('Error in /api/admin/email-logs:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve email logs.' });
  }
});

module.exports = router;
