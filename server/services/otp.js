/**
 * Offstage Creators — OTP Service
 * Handles generation, keyed HMAC hashing, storage, verification,
 * rate limiting, and short-lived verification token issuance.
 * All OTPs are cryptographically secure and stored as keyed HMAC-SHA256 hashes.
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
 * Keyed HMAC-SHA256 hash using OTP_SECRET + per-session salt.
 */
function hashOTP(otp, salt) {
  const secret = config.OTP_SECRET || config.SESSION_SECRET || 'oc_otp_secure_hmac_secret';
  return crypto.createHmac('sha256', secret).update(`${otp}:${salt}`).digest('hex');
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

/**
 * Generate a signed, tamper-proof, short-lived registration authorization token.
 */
function generateVerificationToken(registrationId, email) {
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes validity
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${registrationId}:${email.toLowerCase()}:${expiresAt}:${nonce}`;
  const secret = config.OTP_SECRET || config.SESSION_SECRET || 'oc_otp_secure_hmac_secret';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Validate a verification authorization token.
 */
function verifyVerificationToken(token, email, registrationId) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'MISSING_TOKEN', message: 'Verification authorization token is required.' };
  }
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 5) {
      return { valid: false, reason: 'MALFORMED_TOKEN', message: 'Invalid verification token format.' };
    }
    const [tRegId, tEmail, tExpires, tNonce, tSig] = parts;
    const expiresAt = parseInt(tExpires, 10);

    if (Date.now() > expiresAt) {
      return { valid: false, reason: 'EXPIRED_TOKEN', message: 'Verification authorization has expired. Please verify your email again.' };
    }

    if (email && tEmail.toLowerCase() !== email.toLowerCase().trim()) {
      return { valid: false, reason: 'EMAIL_MISMATCH', message: 'Token does not match the provided email.' };
    }

    if (registrationId && tRegId.toUpperCase() !== registrationId.toUpperCase().trim()) {
      return { valid: false, reason: 'REG_ID_MISMATCH', message: 'Token does not match this registration ID.' };
    }

    const payload = `${tRegId}:${tEmail}:${tExpires}:${tNonce}`;
    const secret = config.OTP_SECRET || config.SESSION_SECRET || 'oc_otp_secure_hmac_secret';
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (tSig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(tSig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
      return { valid: false, reason: 'INVALID_SIGNATURE', message: 'Invalid authorization token signature.' };
    }

    return { valid: true, registrationId: tRegId, email: tEmail, expiresAt };
  } catch (err) {
    return { valid: false, reason: 'TOKEN_PARSE_ERROR', message: 'Failed to verify authorization token.' };
  }
}

// ─── Storage & Verification ───────────────────────────────────────────────────

/**
 * Create a new OTP session for a registration.
 * Replaces any existing unverified OTP session for this email.
 */
async function storeOTP(email, registrationId, otp) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanRegId = registrationId.trim().toUpperCase();
  const salt = generateSalt();
  const hash = hashOTP(otp, salt);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  // Invalidate any existing OTP session for this email
  await run(`DELETE FROM otp_sessions WHERE email = ?`, [cleanEmail]);

  await run(
    `INSERT INTO otp_sessions (email, registration_id, otp_hash, otp_salt, expires_at, attempts, last_sent_at, verified, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)`,
    [cleanEmail, cleanRegId, hash, salt, expiresAt, now.toISOString(), now.toISOString()]
  );

  return { expiresAt, expiryMinutes: config.OTP_EXPIRY_MINUTES };
}

/**
 * Check if we can send another OTP to this email (resend cooldown).
 */
async function canResend(email) {
  const cleanEmail = email.trim().toLowerCase();
  const session = await get(
    `SELECT last_sent_at FROM otp_sessions WHERE email = ? AND verified = 0 ORDER BY created_at DESC LIMIT 1`,
    [cleanEmail]
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
 * Verify an OTP entered by the user and issue an authorization token.
 */
async function verifyOTP(email, inputOtp) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = String(inputOtp || '').trim().replace(/\s/g, '');

  if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
    return { success: false, reason: 'INVALID_FORMAT', message: 'Please enter a valid 6-digit verification code.' };
  }

  const session = await get(
    `SELECT * FROM otp_sessions WHERE email = ? AND verified = 0 ORDER BY created_at DESC LIMIT 1`,
    [cleanEmail]
  );

  if (!session) {
    return { success: false, reason: 'NO_SESSION', message: 'No active verification code found for this email. Please request a new code.' };
  }

  // Check expiry
  if (new Date() > new Date(session.expires_at)) {
    await run(`DELETE FROM otp_sessions WHERE id = ?`, [session.id]);
    return { success: false, reason: 'EXPIRED', message: 'Your verification code has expired (5-minute limit). Please request a new code.' };
  }

  // Check attempt limit
  if (session.attempts >= config.OTP_MAX_ATTEMPTS) {
    await run(`DELETE FROM otp_sessions WHERE id = ?`, [session.id]);
    return {
      success: false,
      reason: 'TOO_MANY_ATTEMPTS',
      message: 'Too many incorrect attempts. For security, this code has been invalidated. Please request a new code.'
    };
  }

  // Increment attempts counter
  const currentAttempts = (session.attempts || 0) + 1;
  await run(`UPDATE otp_sessions SET attempts = ? WHERE id = ?`, [currentAttempts, session.id]);

  // Verify hash
  const isValid = verifyOTPHash(cleanOtp, session.otp_salt, session.otp_hash);

  if (!isValid) {
    const attemptsLeft = config.OTP_MAX_ATTEMPTS - currentAttempts;
    if (attemptsLeft <= 0) {
      await run(`DELETE FROM otp_sessions WHERE id = ?`, [session.id]);
      return {
        success: false,
        reason: 'TOO_MANY_ATTEMPTS',
        message: 'Incorrect code. Maximum verification attempts reached. Please request a new code.'
      };
    }
    return {
      success: false,
      reason: 'INVALID_OTP',
      message: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`
    };
  }

  // Generate short-lived authorization token
  const token = generateVerificationToken(session.registration_id, cleanEmail);
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Mark as verified and store token
  await run(
    `UPDATE otp_sessions SET verified = 1, verification_token = ?, token_expires_at = ? WHERE id = ?`,
    [token, tokenExpiresAt, session.id]
  );

  return {
    success: true,
    registrationId: session.registration_id,
    verificationToken: token,
    reason: 'OK',
    message: 'Email verified successfully.'
  };
}

/**
 * Invalidate/consume a verification token once used.
 */
async function consumeVerificationToken(token) {
  if (!token) return;
  try {
    await run(`DELETE FROM otp_sessions WHERE verification_token = ?`, [token]);
  } catch (_) {}
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
  generateVerificationToken,
  verifyVerificationToken,
  consumeVerificationToken,
  getSessionStatus
};
