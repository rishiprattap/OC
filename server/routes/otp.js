/**
 * Offstage Creators — OTP Routes
 * POST /api/otp/send   — Generate and email an OTP for registration verification
 * POST /api/otp/verify — Validate OTP and mark registration as verified
 */
const express = require('express');
const router = express.Router();
const { get, run } = require('../db');
const otpService = require('../services/otp');
const emailService = require('../services/email');
const config = require('../config');

// ─── POST /api/otp/send ───────────────────────────────────────────────────────

router.post('/send', async (req, res) => {
  try {
    const { email, registrationId } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }
    if (!registrationId || typeof registrationId !== 'string') {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanRegId = registrationId.trim().toUpperCase();

    // Look up the registration
    const reg = await get(
      `SELECT * FROM registrations WHERE registration_id = ? AND email = ?`,
      [cleanRegId, cleanEmail]
    );

    if (!reg) {
      return res.status(404).json({
        success: false,
        error: 'No registration found for this email and Registration ID combination.'
      });
    }

    // If already fully verified, don't re-send
    if (reg.otp_verified === 1 && reg.reg_status !== 'PENDING_VERIFICATION') {
      return res.status(409).json({
        success: false,
        error: 'This email is already verified.',
        alreadyVerified: true
      });
    }

    // Check resend cooldown
    const { allowed, secondsRemaining } = await otpService.canResend(cleanEmail);
    if (!allowed) {
      return res.status(429).json({
        success: false,
        error: `Please wait ${secondsRemaining} seconds before requesting another OTP.`,
        secondsRemaining
      });
    }

    // Generate and store OTP
    const otp = otpService.generateOTP();
    const { expiresAt } = await otpService.storeOTP(cleanEmail, cleanRegId, otp);

    // Send OTP email
    try {
      await emailService.sendOTPEmail({
        registrationId: cleanRegId,
        email: cleanEmail,
        name: reg.full_name,
        otp,
        expiryMinutes: config.OTP_EXPIRY_MINUTES
      });
    } catch (emailErr) {
      console.error('[OTP] Failed to send OTP email:', emailErr.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email. Please check your email address and try again.'
      });
    }

    return res.json({
      success: true,
      message: `Verification code sent to ${cleanEmail}. Check your inbox (and spam folder).`,
      expiresAt,
      expiryMinutes: config.OTP_EXPIRY_MINUTES
    });

  } catch (err) {
    console.error('[OTP] Error in POST /api/otp/send:', err);
    return res.status(500).json({ success: false, error: 'Server error while sending OTP.' });
  }
});

// ─── POST /api/otp/verify ─────────────────────────────────────────────────────

router.post('/verify', async (req, res) => {
  try {
    const { email, registrationId, otp } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }
    if (!registrationId || typeof registrationId !== 'string') {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }
    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({ success: false, error: 'OTP is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanRegId = registrationId.trim().toUpperCase();
    const cleanOTP = otp.trim().replace(/\s/g, '');

    // Validate the OTP
    const result = await otpService.verifyOTP(cleanEmail, cleanOTP);

    if (!result.success) {
      const statusCode = result.reason === 'TOO_MANY_ATTEMPTS' ? 429
        : result.reason === 'EXPIRED' ? 410
        : 400;
      return res.status(statusCode).json({
        success: false,
        error: result.message,
        reason: result.reason
      });
    }

    // OTP verified — update registration status
    const now = new Date().toISOString();
    await run(
      `UPDATE registrations
       SET otp_verified = 1,
           otp_verified_at = ?,
           reg_status = 'VERIFIED',
           updated_at = ?
       WHERE registration_id = ?`,
      [now, now, cleanRegId]
    );

    // Fetch updated registration for confirmation email
    const reg = await get(
      `SELECT * FROM registrations WHERE registration_id = ?`,
      [cleanRegId]
    );

    // Send registration confirmation email (non-blocking)
    if (reg) {
      emailService.sendRegistrationConfirmationEmail({
        registrationId: cleanRegId,
        email: cleanEmail,
        name: reg.full_name,
        category: reg.category,
        performanceTitle: reg.performance_title,
        event: config.EVENT
      }).then(() => {
        run(
          `UPDATE registrations SET registration_email_sent_at = ? WHERE registration_id = ?`,
          [new Date().toISOString(), cleanRegId]
        ).catch(() => {});
      }).catch((err) => {
        console.error('[OTP] Failed to send confirmation email:', err.message);
        run(
          `UPDATE registrations SET last_email_error = ? WHERE registration_id = ?`,
          [err.message, cleanRegId]
        ).catch(() => {});
      });
    }

    return res.json({
      success: true,
      message: 'Email verified successfully. Your registration is confirmed!',
      registrationId: cleanRegId,
      status: 'VERIFIED'
    });

  } catch (err) {
    console.error('[OTP] Error in POST /api/otp/verify:', err);
    return res.status(500).json({ success: false, error: 'Server error while verifying OTP.' });
  }
});

module.exports = router;
