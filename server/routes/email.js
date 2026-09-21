const express = require('express');
const router = express.Router();
const { run, get } = require('../db');
const {
  generateOtp,
  generateSalt,
  hashOtp,
  verifyOtpHash,
  sendEmailVerificationEmail,
  sendRegistrationReceivedEmail
} = require('../services/email');

// POST /api/email/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { registrationId, otp } = req.body;

    if (!registrationId || typeof registrationId !== 'string') {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const cleanRegId = registrationId.trim().toUpperCase();
    const cleanOtp = String(otp || '').trim().replace(/\D/g, '');

    if (!cleanOtp || cleanOtp.length !== 6) {
      return res.status(400).json({
        success: false,
        error: 'Please enter the valid 6-digit verification code sent to your email.'
      });
    }

    const reg = await get(
      `SELECT * FROM registrations WHERE registration_id = ?`,
      [cleanRegId]
    );

    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration record not found.' });
    }

    if (reg.email_verified) {
      return res.json({
        success: true,
        message: 'Email address is already verified.',
        registrationId: cleanRegId,
        emailVerified: true
      });
    }

    // Check attempts limit (max 5)
    const attempts = reg.email_verification_attempts || 0;
    if (attempts >= 5) {
      return res.status(429).json({
        success: false,
        error: 'Too many failed attempts. For your security, please click "Resend Code" to generate a new verification code.'
      });
    }

    // Check expiration (10 minutes)
    const now = new Date();
    if (!reg.email_otp_expires_at || new Date(reg.email_otp_expires_at) < now) {
      return res.status(400).json({
        success: false,
        error: 'This verification code has expired (10-minute limit). Please request a new code.'
      });
    }

    // Verify hash
    const isValid = verifyOtpHash(cleanOtp, reg.email_otp_salt, reg.email_otp_hash);

    if (!isValid) {
      const newAttempts = attempts + 1;
      await run(
        `UPDATE registrations SET email_verification_attempts = ? WHERE registration_id = ?`,
        [newAttempts, cleanRegId]
      );

      const remaining = Math.max(0, 5 - newAttempts);
      return res.status(400).json({
        success: false,
        error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      });
    }

    // On Success: Mark verified and clear OTP credentials
    const verifiedTimestamp = now.toISOString();
    await run(
      `UPDATE registrations SET
        email_verified = 1,
        email_verified_at = ?,
        email_otp_hash = NULL,
        email_otp_salt = NULL,
        email_otp_expires_at = NULL,
        email_verification_attempts = 0,
        updated_at = ?
      WHERE registration_id = ?`,
      [verifiedTimestamp, verifiedTimestamp, cleanRegId]
    );

    // Send Registration Received email with UPI payment instructions
    const updatedRecord = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [cleanRegId]);
    sendRegistrationReceivedEmail({
      to: updatedRecord.email,
      registration: updatedRecord
    }).catch(err => console.error('Failed to dispatch registration received email:', err));

    return res.json({
      success: true,
      message: 'Email verified successfully! You may now proceed to UPI payment.',
      registrationId: cleanRegId,
      emailVerified: true
    });

  } catch (err) {
    console.error('Error in /api/email/verify-otp:', err);
    return res.status(500).json({ success: false, error: 'Server error during email verification.' });
  }
});

// POST /api/email/resend-otp
router.post('/resend-otp', async (req, res) => {
  try {
    const { registrationId } = req.body;

    if (!registrationId || typeof registrationId !== 'string') {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const cleanRegId = registrationId.trim().toUpperCase();
    const reg = await get(
      `SELECT * FROM registrations WHERE registration_id = ?`,
      [cleanRegId]
    );

    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration record not found.' });
    }

    if (reg.email_verified) {
      return res.json({
        success: true,
        message: 'Your email address is already verified.',
        emailVerified: true
      });
    }

    // Rate-limiting: minimum 60 seconds between resends
    const now = new Date();
    if (reg.email_last_sent_at) {
      const elapsedMs = now.getTime() - new Date(reg.email_last_sent_at).getTime();
      if (elapsedMs < 60 * 1000) {
        const remainingSec = Math.ceil((60 * 1000 - elapsedMs) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${remainingSec} second${remainingSec === 1 ? '' : 's'} before requesting another code.`
        });
      }
    }

    // Generate new secure OTP
    const newOtp = generateOtp();
    const newSalt = generateSalt();
    const newHash = hashOtp(newOtp, newSalt);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const sentAt = now.toISOString();

    await run(
      `UPDATE registrations SET
        email_otp_hash = ?,
        email_otp_salt = ?,
        email_otp_expires_at = ?,
        email_verification_attempts = 0,
        email_last_sent_at = ?,
        updated_at = ?
      WHERE registration_id = ?`,
      [newHash, newSalt, expiresAt, sentAt, sentAt, cleanRegId]
    );

    // Send email with new OTP
    await sendEmailVerificationEmail({
      to: reg.email,
      name: reg.full_name,
      otp: newOtp,
      registrationId: cleanRegId
    });

    return res.json({
      success: true,
      message: `A new 6-digit verification code has been sent to ${reg.email}.`
    });

  } catch (err) {
    console.error('Error in /api/email/resend-otp:', err);
    return res.status(500).json({ success: false, error: 'Failed to resend verification email.' });
  }
});

module.exports = router;
