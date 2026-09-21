/**
 * Offstage Creators — OTP Service
 * Handles generation, hashing, storage, verification, and rate limiting of OTPs.
 * All OTPs are cryptographically secure and stored as salted SHA-256 hashes.
 */
const crypto = require('crypto');
const config = require('../config');
const { run, get } = require('../db');

// ─── Crypto Helpers ───────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Generate a random salt for OTP hashing.
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash an OTP with a given salt using SHA-256.
 */
function hashOTP(otp, salt) {
  return crypto.createHash('sha256').update(`${otp}:${salt}`).digest('hex');
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
function verifyOTPHash(inputOtp, salt, expectedHash) {
  if (!inputOtp || !salt || !expectedHash) return false;
  const computed = hashOTP(inputOtp, salt);
  if (computed.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expectedHash, 'hex'));
}

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * Create a new OTP session for a registration.
 * Replaces any existing OTP session for this email.
 */
async function storeOTP(email, registrationId, otp) {
  const salt = generateSalt();
  const hash = hashOTP(otp, salt);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Delete any existing OTP session for this email
  await run(`DELETE FROM otp_sessions WHERE email = ?`, [email.toLowerCase()]);

  await run(
    `INSERT INTO otp_sessions (email, registration_id, otp_hash, otp_salt, expires_at, attempts, last_sent_at, verified, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)`,
    [email.toLowerCase(), registrationId, hash, salt, expiresAt, now.toISOString(), now.toISOString()]
  );

  return { expiresAt };
}

/**
 * Check if we can send another OTP to this email (rate limit: 1 per cooldown period).
 * Returns { allowed: bool, secondsRemaining: number }
 */
async function canResend(email) {
  const session = await get(
    `SELECT last_sent_at FROM otp_sessions WHERE email = ? AND verified = 0`,
    [email.toLowerCase()]
  );

  if (!session) return { allowed: true, secondsRemaining: 0 };

  const lastSent = new Date(session.last_sent_at).getTime();
  const cooldownMs = config.OTP_RESEND_COOLDOWN_SECONDS * 1000;
  const elapsed = Date.now() - lastSent;

  if (elapsed < cooldownMs) {
    const secondsRemaining = Math.ceil((cooldownMs - elapsed) / 1000);
    return { allowed: false, secondsRemaining };
  }

  return { allowed: true, secondsRemaining: 0 };
}

/**
 * Verify an OTP entered by the user.
 * Returns { success: bool, reason: string }
 */
async function verifyOTP(email, inputOtp) {
  const session = await get(
    `SELECT * FROM otp_sessions WHERE email = ? AND verified = 0 ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase()]
  );

  if (!session) {
    return { success: false, reason: 'NO_SESSION', message: 'No OTP found for this email. Please request a new OTP.' };
  }

  // Check expiry
  if (new Date() > new Date(session.expires_at)) {
    await run(`DELETE FROM otp_sessions WHERE id = ?`, [session.id]);
    return { success: false, reason: 'EXPIRED', message: 'Your OTP has expired. Please request a new one.' };
  }

  // Check attempt limit
  if (session.attempts >= config.OTP_MAX_ATTEMPTS) {
    await run(`DELETE FROM otp_sessions WHERE id = ?`, [session.id]);
    return {
      success: false,
      reason: 'TOO_MANY_ATTEMPTS',
      message: 'Too many incorrect attempts. Please request a new OTP.'
    };
  }

  // Increment attempts
  await run(`UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = ?`, [session.id]);

  // Verify hash
  const isValid = verifyOTPHash(inputOtp, session.otp_salt, session.otp_hash);

  if (!isValid) {
    const attemptsLeft = config.OTP_MAX_ATTEMPTS - session.attempts - 1;
    return {
      success: false,
      reason: 'INVALID_OTP',
      message: attemptsLeft > 0
        ? `Incorrect OTP. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`
        : 'Incorrect OTP. You have used all attempts. Please request a new OTP.'
    };
  }

  // Mark as verified and clean up
  await run(`UPDATE otp_sessions SET verified = 1 WHERE id = ?`, [session.id]);

  return {
    success: true,
    registrationId: session.registration_id,
    reason: 'OK',
    message: 'OTP verified successfully.'
  };
}

/**
 * Check if an OTP session exists and is still valid for a given email.
 */
async function getSessionStatus(email) {
  const session = await get(
    `SELECT * FROM otp_sessions WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase()]
  );

  if (!session) return null;

  return {
    exists: true,
    verified: Boolean(session.verified),
    expired: new Date() > new Date(session.expires_at),
    attemptsUsed: session.attempts,
    attemptsMax: config.OTP_MAX_ATTEMPTS,
    expiresAt: session.expires_at,
    registrationId: session.registration_id
  };
}

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  canResend,
  getSessionStatus
};
