/**
 * Offstage Creators — OTP Routes
 * POST /api/otp/send   — Generate and email an OTP for registration verification
 * POST /api/otp/verify — Validate OTP, issue authorization token, and send confirmation email
 */
const express = require('express');
const router = express.Router();
const { get, run, getEventBySlug, getActiveEvent } = require('../db');
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

    // If already verified and active, don't re-send
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
        error: `Please wait ${secondsRemaining} seconds before requesting another verification code.`,
        secondsRemaining
      });
    }

    // Fetch associated event for email branding
    let targetEvent = null;
    if (reg.event_id) {
      targetEvent = await getEventBySlug(reg.event_id);
    }
    if (!targetEvent) {
      targetEvent = await getActiveEvent();
    }
    const eventTitle = targetEvent?.title || targetEvent?.name || config.EVENT.title;

    // Generate and store OTP (keyed HMAC hash, 5-minute expiry)
    const otp = otpService.generateOTP();
    const { expiresAt, expiryMinutes } = await otpService.storeOTP(cleanEmail, cleanRegId, otp);

    // Send OTP email (using verify@offstagecreators.in)
    try {
      await emailService.sendOTPEmail({
        registrationId: cleanRegId,
        email: cleanEmail,
        name: reg.full_name,
        otp,
        expiryMinutes,
        eventTitle
      });
    } catch (emailErr) {
      console.error('[OTP] Notice sending OTP email:', emailErr.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email. Please check your email address and try again.'
      });
    }

    return res.json({
      success: true,
      message: `Verification code sent to ${cleanEmail}. Check your inbox (and spam folder).`,
      expiresAt,
      expiryMinutes
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
      return res.status(400).json({ success: false, error: 'Verification code is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanRegId = registrationId.trim().toUpperCase();
    const cleanOTP = otp.trim().replace(/\s/g, '');

    // Validate the OTP against keyed HMAC hash
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

    // Fetch updated registration with actual event details for confirmation email
    const reg = await get(
      `SELECT * FROM registrations WHERE registration_id = ?`,
      [cleanRegId]
    );

    let confirmationEmailSent = false;
    if (reg) {
      let regEvent = null;
      if (reg.event_id) {
        regEvent = await getEventBySlug(reg.event_id);
      }
      if (!regEvent) {
        regEvent = await getActiveEvent();
      }

      // Avoid duplicate confirmation emails if already recorded
      if (!reg.registration_email_sent_at) {
        try {
          await emailService.sendRegistrationConfirmationEmail({
            registrationId: cleanRegId,
            email: cleanEmail,
            name: reg.full_name,
            category: reg.category,
            performanceTitle: reg.performance_title,
            event: {
              title: regEvent?.title || regEvent?.name || config.EVENT.title,
              date: regEvent?.event_date || config.EVENT.date,
              time: regEvent?.start_time ? (regEvent?.end_time ? `${regEvent.start_time} – ${regEvent.end_time}` : regEvent.start_time) : config.EVENT.time,
              venue: regEvent?.venue_name || 'Online (Google Meet)'
            }
          });
          await run(
            `UPDATE registrations SET registration_email_sent_at = ? WHERE registration_id = ?`,
            [new Date().toISOString(), cleanRegId]
          );
          confirmationEmailSent = true;
        } catch (err) {
          console.error('[OTP] Failed to send confirmation email:', err.message);
          await run(
            `UPDATE registrations SET last_email_error = ? WHERE registration_id = ?`,
            [err.message, cleanRegId]
          ).catch(() => {});
        }
      } else {
        confirmationEmailSent = true;
      }
    }

    return res.json({
      success: true,
      message: 'Email verified successfully. Your registration is confirmed!',
      registrationId: cleanRegId,
      verificationToken: result.verificationToken,
      status: 'VERIFIED',
      emailSent: confirmationEmailSent
    });

  } catch (err) {
    console.error('[OTP] Error in POST /api/otp/verify:', err);
    return res.status(500).json({ success: false, error: 'Server error while verifying OTP.' });
  }
});

module.exports = router;
