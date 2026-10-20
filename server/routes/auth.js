/**
 * Offstage Creators — Authentication Routes
 * Implements user account registration, email OTP verification,
 * login, logout, password recovery, and session checking.
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('../db');
const config = require('../config');
const emailService = require('../services/email');
const otpService = require('../services/otp');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    age: user.age,
    city: user.city,
    is_verified: user.is_verified,
    is_blocked: Number(user.is_blocked || 0),
    block_reason: user.block_reason || null,
    blocked_at: user.blocked_at || null,
    blocked_by: user.blocked_by || null,
    created_at: user.created_at
  };
}

function generateNumericOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashToken(token, salt) {
  const secret = config.OTP_SECRET || config.SESSION_SECRET || 'oc_otp_secure_hmac_secret';
  return crypto.createHmac('sha256', secret).update(`${token}:${salt}`).digest('hex');
}

function verifyTokenHash(token, salt, expectedHash) {
  if (!token || !salt || !expectedHash) return false;
  const computed = hashToken(token, salt);
  if (computed.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expectedHash, 'hex'));
}

// ─── Middleware ───────────────────────────────────────────────────────────────

async function requireUser(req, res, next) {
  const sessionUserId = req.session ? (req.session.userId || req.session.blockedUserId) : null;
  if (!sessionUserId) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }

  try {
    const user = await get(`SELECT id, name, email, is_blocked, block_reason FROM users WHERE id = ?`, [sessionUserId]);
    if (!user) {
      if (req.session) {
        req.session.userId = null;
        req.session.blockedUserId = null;
      }
      return res.status(401).json({ success: false, error: 'Account not found. Please log in again.' });
    }

    if (user.is_blocked === 1) {
      if (req.session) {
        req.session.isBlocked = true;
        req.session.blockedUserId = user.id;
        req.session.blockReason = user.block_reason || null;
      }
      return res.status(403).json({
        success: false,
        isBlocked: true,
        blockReason: user.block_reason || null,
        error: `Your account has been blocked: ${user.block_reason || 'Violation of community guidelines. Please contact support@offstagecreators.in for assistance.'}`
      });
    }

    if (req.session) {
      req.session.isBlocked = false;
      req.session.blockedUserId = null;
      req.session.userId = user.id;
    }
    req.user = user;
    return next();
  } catch (err) {
    console.error('[Auth] Error in requireUser middleware:', err);
    return res.status(500).json({ success: false, error: 'Internal server error verifying session.' });
  }
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, age, city, password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter a valid full name (minimum 2 characters).' });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!validateEmail(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Please provide a valid 10-digit phone number.' });
    }

    const numAge = parseInt(age, 10);
    if (isNaN(numAge) || numAge < 5 || numAge > 120) {
      return res.status(400).json({ success: false, error: 'Please enter a valid age between 5 and 120.' });
    }

    if (!city || typeof city !== 'string' || city.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter your city (minimum 2 characters).' });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const cleanName = name.trim();
    const cleanCity = city.trim();

    // Check if user with this email already exists
    const existing = await get(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
    if (existing && existing.is_blocked === 1) {
      return res.status(403).json({
        success: false,
        isBlocked: true,
        error: `This email address is associated with a blocked account: ${existing.block_reason || 'Please contact support@offstagecreators.in for assistance.'}`
      });
    }
    if (existing && existing.is_verified === 1) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists. Please log in.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = generateNumericOTP();
    const otpSalt = crypto.randomBytes(16).toString('hex');
    const otpHash = hashToken(otp, otpSalt);
    const storedToken = `${otpHash}:${otpSalt}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    if (existing && existing.is_verified === 0) {
      // Update unverified user with new details & password
      await run(
        `UPDATE users SET
           name = ?, phone = ?, age = ?, city = ?, password_hash = ?,
           verification_token = ?, verification_token_expires_at = ?, updated_at = ?
         WHERE email = ?`,
        [cleanName, cleanPhone, numAge, cleanCity, passwordHash, storedToken, expiresAt, now.toISOString(), cleanEmail]
      );
    } else {
      // Insert new unverified user
      await run(
        `INSERT INTO users (
           name, email, phone, age, city, password_hash, is_verified,
           verification_token, verification_token_expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cleanName, cleanEmail, cleanPhone, numAge, cleanCity, passwordHash, 0, storedToken, expiresAt, now.toISOString(), now.toISOString()]
      );
    }

    // Send verification email
    try {
      await emailService.sendAccountVerificationEmail({
        email: cleanEmail,
        name: cleanName,
        otp,
        expiryMinutes: 10
      });
    } catch (mailErr) {
      console.warn('[Auth] Verification email notice:', mailErr.message);
    }

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      message: `Account created! We've sent a 6-digit verification code to ${cleanEmail}. Please enter it to activate your account.`,
      email: cleanEmail
    });

  } catch (err) {
    console.error('[Auth] Error in /register:', err);
    return res.status(500).json({ success: false, error: 'Server error while creating account.' });
  }
});

// ─── POST /api/auth/verify-email ──────────────────────────────────────────────

router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanOtp = String(otp || '').trim().replace(/\D/g, '');

    if (!cleanEmail || !validateEmail(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Valid email is required.' });
    }

    if (!cleanOtp || cleanOtp.length !== 6) {
      return res.status(400).json({ success: false, error: 'Please enter the 6-digit verification code.' });
    }

    const user = await get(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    if (user.is_blocked === 1) {
      return res.status(403).json({
        success: false,
        isBlocked: true,
        blockReason: user.block_reason || null,
        error: `Your account has been blocked: ${user.block_reason || 'Please contact support@offstagecreators.in for assistance.'}`
      });
    }

    if (user.is_verified === 1) {
      // Already verified, establish session
      req.session.userId = user.id;
      req.session.userEmail = user.email;
      req.session.userName = user.name;
      return res.json({
        success: true,
        message: 'Your email is already verified. You are now logged in.',
        user: sanitizeUser(user)
      });
    }

    if (!user.verification_token || !user.verification_token_expires_at) {
      return res.status(400).json({ success: false, error: 'No active verification code found. Please request a new one.' });
    }

    if (new Date() > new Date(user.verification_token_expires_at)) {
      return res.status(410).json({ success: false, error: 'Verification code has expired. Please request a new one.' });
    }

    const [expectedHash, salt] = user.verification_token.split(':');
    const isMatch = verifyTokenHash(cleanOtp, salt, expectedHash);

    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect verification code. Please check and try again.' });
    }

    const now = new Date().toISOString();
    await run(
      `UPDATE users SET is_verified = 1, verification_token = NULL, verification_token_expires_at = NULL, updated_at = ? WHERE email = ?`,
      [now, cleanEmail]
    );

    // Backward-compatible safe historical registration link:
    // Email ownership is now verified, so we can link any historical records matching this email where user_id IS NULL
    try {
      await run(
        `UPDATE registrations SET user_id = ? WHERE email = ? AND (user_id IS NULL OR user_id = 0)`,
        [user.id, cleanEmail]
      );
    } catch (_) {}

    // Establish authenticated session
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;
    req.session.userLoginAt = now;

    const updatedUser = await get(`SELECT * FROM users WHERE id = ?`, [user.id]);

    return res.json({
      success: true,
      message: 'Email verified successfully! Welcome to Offstage Creators.',
      user: sanitizeUser(updatedUser || user)
    });

  } catch (err) {
    console.error('[Auth] Error in /verify-email:', err);
    return res.status(500).json({ success: false, error: 'Server error while verifying email.' });
  }
});

// ─── POST /api/auth/resend-verification ────────────────────────────────────────

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !validateEmail(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Valid email is required.' });
    }

    const user = await get(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'No account found with this email.' });
    }

    if (user.is_verified === 1) {
      return res.status(400).json({ success: false, error: 'Your account is already verified. Please log in.' });
    }

    const otp = generateNumericOTP();
    const otpSalt = crypto.randomBytes(16).toString('hex');
    const otpHash = hashToken(otp, otpSalt);
    const storedToken = `${otpHash}:${otpSalt}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    await run(
      `UPDATE users SET verification_token = ?, verification_token_expires_at = ?, updated_at = ? WHERE email = ?`,
      [storedToken, expiresAt, now.toISOString(), cleanEmail]
    );

    try {
      await emailService.sendAccountVerificationEmail({
        email: cleanEmail,
        name: user.name,
        otp,
        expiryMinutes: 10
      });
    } catch (mailErr) {
      console.warn('[Auth] Resend email notice:', mailErr.message);
    }

    return res.json({
      success: true,
      message: `A new verification code has been sent to ${cleanEmail}.`
    });

  } catch (err) {
    console.error('[Auth] Error in /resend-verification:', err);
    return res.status(500).json({ success: false, error: 'Server error while resending verification code.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await get(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
    if (!user) {
      // Delay to deter brute force
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    if (user.is_blocked === 1) {
      return res.status(403).json({
        success: false,
        isBlocked: true,
        blockReason: user.block_reason || null,
        error: `Your account has been blocked: ${user.block_reason || 'Violation of community guidelines. Please contact support@offstagecreators.in for assistance.'}`
      });
    }

    if (user.is_verified !== 1) {
      // User hasn't verified their email yet
      const otp = generateNumericOTP();
      const otpSalt = crypto.randomBytes(16).toString('hex');
      const otpHash = hashToken(otp, otpSalt);
      const storedToken = `${otpHash}:${otpSalt}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

      await run(
        `UPDATE users SET verification_token = ?, verification_token_expires_at = ?, updated_at = ? WHERE email = ?`,
        [storedToken, expiresAt, now.toISOString(), cleanEmail]
      );

      try {
        await emailService.sendAccountVerificationEmail({
          email: cleanEmail,
          name: user.name,
          otp,
          expiryMinutes: 10
        });
      } catch (_) {}

      return res.status(403).json({
        success: false,
        requiresVerification: true,
        email: user.email,
        error: 'Please verify your email address to log in. A new 6-digit code has been sent to your inbox.'
      });
    }

    // Set user session
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;
    req.session.userLoginAt = new Date().toISOString();

    // Link historical registrations if not already linked
    try {
      await run(
        `UPDATE registrations SET user_id = ? WHERE email = ? AND (user_id IS NULL OR user_id = 0)`,
        [user.id, cleanEmail]
      );
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      user: sanitizeUser(user)
    });

  } catch (err) {
    console.error('[Auth] Error in /login:', err);
    return res.status(500).json({ success: false, error: 'Server error during login.' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.userId = null;
    req.session.userEmail = null;
    req.session.userName = null;
    req.session.userLoginAt = null;

    // If admin is not logged in either, destroy session completely
    if (!req.session.adminAuthenticated) {
      return req.session.destroy(() => {
        res.clearCookie('oc.sid');
        return res.json({ success: true, message: 'Logged out successfully.' });
      });
    }
  }
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  try {
    const sessionUserId = req.session ? (req.session.userId || req.session.blockedUserId) : null;
    if (!sessionUserId) {
      return res.json({ success: true, authenticated: false, user: null });
    }

    const user = await get(`SELECT * FROM users WHERE id = ?`, [sessionUserId]);
    if (!user) {
      if (req.session) {
        req.session.userId = null;
        req.session.blockedUserId = null;
      }
      return res.json({ success: true, authenticated: false, user: null });
    }

    if (user.is_blocked === 1) {
      if (req.session) {
        req.session.isBlocked = true;
        req.session.blockedUserId = user.id;
        req.session.blockReason = user.block_reason || null;
      }
      return res.json({
        success: true,
        authenticated: false,
        isBlocked: true,
        blockReason: user.block_reason || null,
        user: null,
        error: `Your account has been blocked: ${user.block_reason || 'Please contact support@offstagecreators.in for assistance.'}`
      });
    }

    if (req.session) {
      req.session.isBlocked = false;
      req.session.blockedUserId = null;
      req.session.userId = user.id;
    }

    return res.json({
      success: true,
      authenticated: true,
      user: sanitizeUser(user)
    });

  } catch (err) {
    console.error('[Auth] Error in /me:', err);
    return res.status(500).json({ success: false, error: 'Server error checking session.' });
  }
});

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !validateEmail(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    const user = await get(`SELECT * FROM users WHERE email = ?`, [cleanEmail]);
    if (!user) {
      // Generic success to prevent account enumeration
      return res.json({
        success: true,
        message: 'If an account exists with that email address, password reset instructions have been sent.'
      });
    }

    if (user.is_blocked === 1) {
      return res.status(403).json({
        success: false,
        isBlocked: true,
        error: `Your account has been blocked: ${user.block_reason || 'Please contact support@offstagecreators.in for assistance.'}`
      });
    }

    // Invalidate previous reset tokens for this user
    await run(`UPDATE password_resets SET used = 1 WHERE email = ?`, [cleanEmail]);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const tokenHash = hashToken(rawToken, salt);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // 1 hour

    await run(
      `INSERT INTO password_resets (user_id, email, token_hash, token_salt, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [user.id, cleanEmail, tokenHash, salt, expiresAt, now.toISOString()]
    );

    const resetLink = `${config.APP_URL}/account?view=reset&token=${rawToken}&email=${encodeURIComponent(cleanEmail)}`;

    try {
      await emailService.sendPasswordResetEmail({
        email: cleanEmail,
        name: user.name,
        resetLink,
        expiryMinutes: 60
      });
    } catch (mailErr) {
      console.warn('[Auth] Password reset email notice:', mailErr.message);
    }

    return res.json({
      success: true,
      message: 'If an account exists with that email address, password reset instructions have been sent.'
    });

  } catch (err) {
    console.error('[Auth] Error in /forgot-password:', err);
    return res.status(500).json({ success: false, error: 'Server error processing password reset.' });
  }
});

// ─── POST /api/auth/reset-password ────────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanToken = String(token || '').trim();

    if (!cleanEmail || !cleanToken) {
      return res.status(400).json({ success: false, error: 'Email and reset token are required.' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long.' });
    }

    const resetRecord = await get(
      `SELECT * FROM password_resets WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1`,
      [cleanEmail]
    );

    if (!resetRecord) {
      return res.status(400).json({ success: false, error: 'Invalid or expired password reset link. Please request a new one.' });
    }

    if (new Date() > new Date(resetRecord.expires_at)) {
      await run(`UPDATE password_resets SET used = 1 WHERE id = ?`, [resetRecord.id]);
      return res.status(410).json({ success: false, error: 'Password reset link has expired. Please request a new one.' });
    }

    const isTokenValid = verifyTokenHash(cleanToken, resetRecord.token_salt, resetRecord.token_hash);
    if (!isTokenValid) {
      return res.status(400).json({ success: false, error: 'Invalid password reset token.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const now = new Date().toISOString();

    await run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, [newHash, now, resetRecord.user_id]);
    await run(`UPDATE password_resets SET used = 1 WHERE id = ?`, [resetRecord.id]);

    return res.json({
      success: true,
      message: 'Your password has been reset successfully! You can now log in with your new password.'
    });

  } catch (err) {
    console.error('[Auth] Error in /reset-password:', err);
    return res.status(500).json({ success: false, error: 'Server error resetting password.' });
  }
});

module.exports = {
  router,
  requireUser,
  sanitizeUser
};
