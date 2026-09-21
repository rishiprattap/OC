const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { run, get } = require('../db');
const config = require('../config');

// Helper to generate a unique, clean registration ID: e.g. OC-OM-4892
function generateRegistrationId() {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const randomLetters = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `OC-OM-${randomNum}${randomLetters}`;
}

// Helper to normalize phone numbers (strip non-digits)
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// POST /api/registrations
router.post('/', async (req, res) => {
  try {
    const {
      fullName,
      phone,
      email,
      city,
      category,
      instagram,
      performanceTitle,
      performanceDescription,
      terms
    } = req.body;

    // Validation
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter a valid full name.' });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Please provide a valid 10-digit phone/WhatsApp number.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (!category || typeof category !== 'string' || category.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please select a performance category.' });
    }

    if (!terms) {
      return res.status(400).json({ success: false, error: 'You must agree to the event guidelines and terms.' });
    }

    const eventId = config.EVENT.id;
    const cleanFullName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCity = (city || '').trim();
    const cleanCategory = category.trim();
    const cleanInstagram = (instagram || '').trim().replace(/^@/, '');
    const cleanTitle = (performanceTitle || '').trim();
    const cleanDesc = (performanceDescription || '').trim();

    // Check for existing PAID registration for this phone and event
    const existingPaid = await get(
      `SELECT * FROM registrations WHERE event_id = ? AND phone = ? AND payment_status = 'PAID'`,
      [eventId, cleanPhone]
    );

    if (existingPaid) {
      return res.status(409).json({
        success: false,
        error: 'A registration for this phone number already exists and is confirmed.',
        registrationId: existingPaid.registration_id
      });
    }

    // Check if there is already a pending registration created recently
    let regId;
    const pendingExisting = await get(
      `SELECT * FROM registrations WHERE event_id = ? AND phone = ? AND payment_status IN ('PENDING', 'PENDING_VERIFICATION') ORDER BY id DESC LIMIT 1`,
      [eventId, cleanPhone]
    );

    const now = new Date().toISOString();

    const {
      generateOtp,
      generateSalt,
      hashOtp,
      sendEmailVerificationEmail
    } = require('../services/email');

    // Generate secure OTP for email ownership verification
    const otp = generateOtp();
    const salt = generateSalt();
    const otpHash = hashOtp(otp, salt);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    if (pendingExisting) {
      regId = pendingExisting.registration_id;
      await run(
        `UPDATE registrations SET
          full_name = ?,
          email = ?,
          city = ?,
          category = ?,
          instagram = ?,
          performance_title = ?,
          performance_description = ?,
          email_otp_hash = ?,
          email_otp_salt = ?,
          email_otp_expires_at = ?,
          email_verification_attempts = 0,
          email_last_sent_at = NULL,
          email_status = 'PENDING',
          updated_at = ?
        WHERE id = ?`,
        [
          cleanFullName,
          cleanEmail,
          cleanCity,
          cleanCategory,
          cleanInstagram,
          cleanTitle,
          cleanDesc,
          otpHash,
          salt,
          expiresAt,
          now,
          pendingExisting.id
        ]
      );
    } else {
      regId = generateRegistrationId();
      await run(
        `INSERT INTO registrations (
          registration_id,
          event_id,
          full_name,
          phone,
          email,
          city,
          category,
          instagram,
          performance_title,
          performance_description,
          amount,
          payment_status,
          email_verified,
          email_otp_hash,
          email_otp_salt,
          email_otp_expires_at,
          email_verification_attempts,
          email_last_sent_at,
          email_status,
          checked_in,
          certificate_eligible,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 79, 'PENDING', 0, ?, ?, ?, 0, NULL, 'PENDING', 0, 0, ?, ?)`,
        [
          regId,
          eventId,
          cleanFullName,
          cleanPhone,
          cleanEmail,
          cleanCity,
          cleanCategory,
          cleanInstagram,
          cleanTitle,
          cleanDesc,
          otpHash,
          salt,
          expiresAt,
          now,
          now
        ]
      );
    }

    // Send verification email
    let emailResult = null;
    try {
      emailResult = await sendEmailVerificationEmail({
        to: cleanEmail,
        name: cleanFullName,
        otp: otp,
        registrationId: regId
      });
    } catch (err) {
      console.error('Failed to send verification email:', err);
      emailResult = { success: false, error: err.message || 'SMTP delivery failure' };
    }

    const emailSent = Boolean(emailResult && emailResult.success);

    if (emailSent) {
      await run(
        `UPDATE registrations SET
          email_last_sent_at = ?,
          email_status = 'SENT',
          email_error = NULL,
          last_email_type = 'EMAIL_VERIFICATION'
        WHERE registration_id = ?`,
        [now, regId]
      );
    } else {
      await run(
        `UPDATE registrations SET
          email_last_sent_at = NULL,
          email_status = 'FAILED',
          email_error = ?,
          last_email_type = 'EMAIL_VERIFICATION'
        WHERE registration_id = ?`,
        [emailResult?.error || 'Failed to dispatch verification email via SMTP.', regId]
      );
    }

    return res.status(201).json({
      success: true,
      emailSent: emailSent,
      emailError: emailSent ? null : (emailResult?.error || 'Failed to dispatch verification email via SMTP.'),
      message: emailSent
        ? 'Verification code sent. Please check your inbox and spam folder.'
        : "Registration was created, but we couldn't send the verification email. Please try again.",
      registrationId: regId,
      email: cleanEmail,
      needsVerification: true,
      emailVerified: false,
      amount: config.OPEN_MIC_FEE_INR,
      upi: {
        id: config.UPI.upiId,
        payee: config.UPI.payeeName,
        qr: config.UPI.qrAssetPath,
        amount: config.UPI.amount
      },
      event: {
        title: config.EVENT.title,
        date: config.EVENT.date,
        time: config.EVENT.time,
        fee: config.OPEN_MIC_FEE_INR
      }
    });

  } catch (err) {
    console.error('Error in POST /api/registrations:', err);
    return res.status(500).json({ success: false, error: 'Internal server error while processing registration.' });
  }
});

// GET /api/registrations/:id
router.get('/:id', async (req, res) => {
  try {
    const regId = req.params.id;
    const record = await get(
      `SELECT * FROM registrations WHERE registration_id = ? OR id = ?`,
      [regId, regId]
    );

    if (!record) {
      return res.status(404).json({ success: false, error: 'Registration record not found.' });
    }

    return res.json({
      success: true,
      registration: {
        registrationId: record.registration_id,
        fullName: record.full_name,
        category: record.category,
        performanceTitle: record.performance_title,
        city: record.city,
        amount: record.amount,
        paymentStatus: record.payment_status,
        transactionId: record.transaction_id,
        paymentScreenshotUrl: record.payment_screenshot_url,
        paymentSubmittedAt: record.payment_submitted_at,
        paymentVerifiedAt: record.payment_verified_at,
        rejectionReason: record.rejection_reason,
        email: record.email,
        emailVerified: Boolean(record.email_verified),
        checkedIn: Boolean(record.checked_in),
        checkinAt: record.checkin_at,
        certificateEligible: Boolean(record.certificate_eligible),
        createdAt: record.created_at,
        event: {
          title: config.EVENT.title,
          date: config.EVENT.date,
          time: config.EVENT.time,
          venue: 'Online (Google Meet / Private Room)'
        },
        upi: {
          id: config.UPI.upiId,
          qr: config.UPI.qrAssetPath,
          amount: config.UPI.amount
        }
      }
    });

  } catch (err) {
    console.error('Error in GET /api/registrations/:id:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// POST /api/registrations/status-lookup
router.post('/status-lookup', async (req, res) => {
  try {
    const { registrationId, phone } = req.body;
    const cleanId = (registrationId || '').trim().toUpperCase();
    const cleanPhone = normalizePhone(phone);

    if (!cleanId || !cleanPhone) {
      return res.status(400).json({
        success: false,
        error: 'Please provide both your Registration ID and registered 10-digit Phone Number.'
      });
    }

    const record = await get(
      `SELECT * FROM registrations WHERE registration_id = ? AND phone = ?`,
      [cleanId, cleanPhone]
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'No matching registration found for this Registration ID and Phone combination.'
      });
    }

    // Map internal status to user-friendly label
    let statusLabel = 'PAYMENT REQUIRED';
    if (record.payment_status === 'PENDING_VERIFICATION') {
      statusLabel = 'PAYMENT UNDER VERIFICATION';
    } else if (record.payment_status === 'PAID') {
      statusLabel = 'PAYMENT CONFIRMED';
    } else if (record.payment_status === 'REJECTED') {
      statusLabel = 'PAYMENT REJECTED';
    }

    return res.json({
      success: true,
      registration: {
        registrationId: record.registration_id,
        fullName: record.full_name,
        category: record.category,
        paymentStatus: record.payment_status,
        statusLabel: statusLabel,
        transactionId: record.transaction_id,
        checkedIn: Boolean(record.checked_in),
        rejectionReason: record.rejection_reason
      }
    });

  } catch (err) {
    console.error('Error in status-lookup:', err);
    return res.status(500).json({ success: false, error: 'Server error looking up status.' });
  }
});

module.exports = router;
