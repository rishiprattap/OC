const queryColumns = require('../services/queryColumns');
/**
 * Offstage Creators — Payments Routes
 * POST /api/payments/submit-proof — Submit UPI payment proof (UTR + screenshot)
 * GET  /api/payments/info         — Get UPI payment info
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { run, get, getEventBySlug, getActiveEvent } = require('../db');
const config = require('../config');
const otpService = require('../services/otp');
const emailService = require('../services/email');

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);

let upload;

if (isVercel) {
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (allowed.includes(file.mimetype.toLowerCase())) cb(null, true);
      else cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed.'));
    }
  });
} else {
  const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'screenshots');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const regId = (req.body.registrationId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `proof-${regId}-${Date.now()}${ext}`);
    }
  });

  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (allowed.includes(file.mimetype.toLowerCase())) cb(null, true);
      else cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed.'));
    }
  });
}

// GET /api/payments/info
router.get('/info', (req, res) => {
  res.json({
    success: true,
    upiId: config.UPI.upiId,
    payeeName: config.UPI.payeeName,
    qrAssetPath: config.UPI.qrAssetPath,
    amount: config.UPI.amount,
    event: config.EVENT
  });
});

// POST /api/payments/confirm-free (for 100% discounted or zero-fee registrations)
router.post('/confirm-free', async (req, res) => {
  try {
    const { registrationId } = req.body;
    if (!registrationId?.trim()) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const cleanRegId = registrationId.trim().toUpperCase();
    const reg = await get(`SELECT ${queryColumns.registration} FROM registrations WHERE registration_id = ?`, [cleanRegId]);
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found.' });

    if (reg.otp_verified !== 1 || reg.reg_status === 'PENDING_VERIFICATION') {
      return res.status(403).json({
        success: false,
        error: 'Email verification is required before confirming registration.'
      });
    }

    const effectiveFee = Number(reg.final_fee !== null && reg.final_fee !== undefined ? reg.final_fee : reg.amount);
    if (effectiveFee > 0) {
      return res.status(400).json({
        success: false,
        error: `This registration requires a payment of ₹${effectiveFee}. Please submit payment proof.`
      });
    }

    if (reg.reg_status === 'APPROVED') {
      return res.json({
        success: true,
        message: 'This registration is already approved.',
        registrationId: cleanRegId,
        status: 'APPROVED',
        isFree: true
      });
    }

    const now = new Date().toISOString();
    await run(
      `UPDATE registrations SET
         reg_status = 'APPROVED',
         payment_status = 'PAID',
         payment_verified_by = 'PROMO_FREE',
         approved_at = ?,
         approved_by = 'AUTO_PROMO_FREE',
         updated_at = ?
       WHERE registration_id = ?`,
      [now, now, cleanRegId]
    );

    // Send approval email
    try {
      let regEvent = null;
      if (reg.event_id) regEvent = await getEventBySlug(reg.event_id);
      if (!regEvent) regEvent = await getActiveEvent();

      await emailService.sendApprovalEmail({
        registrationId: cleanRegId,
        email: reg.email,
        name: reg.full_name,
        event: {
          title: regEvent?.title || regEvent?.name || config.EVENT.title,
          date: regEvent?.event_date || config.EVENT.date,
          time: regEvent?.start_time ? (regEvent?.end_time ? `${regEvent.start_time} – ${regEvent.end_time}` : regEvent.start_time) : config.EVENT.time,
          venue: regEvent?.venue_name || 'Online (Google Meet)',
          meetLink: regEvent?.meet_link || ''
        }
      });
      await run(`UPDATE registrations SET approval_email_sent_at = ? WHERE registration_id = ?`, [now, cleanRegId]).catch(() => {});
    } catch (e) {
      console.warn('[Payments] Could not send free approval email:', e.message);
    }

    return res.json({
      success: true,
      message: 'Free registration confirmed and approved!',
      registrationId: cleanRegId,
      status: 'APPROVED',
      isFree: true
    });

  } catch (err) {
    console.error('[Payments] Error in confirm-free:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error.' });
  }
});

// POST /api/payments/submit-proof
router.post('/submit-proof', upload.single('screenshot'), async (req, res) => {
  try {
    const { registrationId, transactionId } = req.body;

    if (!registrationId?.trim()) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const cleanRegId = registrationId.trim().toUpperCase();

    const reg = await get(`SELECT ${queryColumns.registration} FROM registrations WHERE registration_id = ?`, [cleanRegId]);
    if (!reg) return res.status(404).json({ success: false, error: 'Registration not found.' });

    // Enforce email verification — direct API calls cannot bypass OTP verification
    if (reg.otp_verified !== 1 || reg.reg_status === 'PENDING_VERIFICATION') {
      return res.status(403).json({
        success: false,
        error: 'Email verification is required before submitting payment proof. Please complete OTP verification first.'
      });
    }

    const effectiveFee = Number(reg.final_fee !== null && reg.final_fee !== undefined ? reg.final_fee : reg.amount);
    if (effectiveFee === 0) {
      // Auto confirm free registration
      const now = new Date().toISOString();
      await run(
        `UPDATE registrations SET
           reg_status = 'APPROVED',
           payment_status = 'PAID',
           payment_verified_by = 'PROMO_FREE',
           approved_at = ?,
           approved_by = 'AUTO_PROMO_FREE',
           updated_at = ?
         WHERE registration_id = ?`,
        [now, now, cleanRegId]
      );
      return res.json({
        success: true,
        message: 'Registration is free and has been automatically approved!',
        registrationId: cleanRegId,
        status: 'APPROVED',
        isFree: true
      });
    }

    if (!transactionId?.trim() || transactionId.trim().length < 6) {
      return res.status(400).json({ success: false, error: 'Please enter a valid UPI Transaction ID / UTR (minimum 6 digits).' });
    }

    const cleanUtr = transactionId.trim().toUpperCase();

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Payment screenshot is required.' });
    }

    // Verify authorization token if provided
    const clientToken = req.headers['x-verification-token'] || req.body.verificationToken;
    if (clientToken) {
      const tokenResult = otpService.verifyVerificationToken(clientToken, reg.email, cleanRegId);
      if (!tokenResult.valid) {
        return res.status(403).json({ success: false, error: tokenResult.message });
      }
      await otpService.consumeVerificationToken(clientToken);
    }

    if (reg.reg_status === 'APPROVED') {
      return res.status(400).json({ success: false, error: 'This registration is already approved.' });
    }

    // Duplicate UTR check
    const duplicateUtr = await get(
      `SELECT registration_id FROM registrations WHERE transaction_id = ? AND registration_id != ?`,
      [cleanUtr, cleanRegId]
    );
    if (duplicateUtr) {
      return res.status(409).json({ success: false, error: 'This Transaction ID has already been used for another registration.' });
    }

    let screenshotUrl;
    if (isVercel) {
      const mimeType = req.file.mimetype || 'image/jpeg';
      screenshotUrl = `data:${mimeType};base64,${req.file.buffer.toString('base64')}`;
    } else {
      screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    }

    const now = new Date().toISOString();

    await run(
      `UPDATE registrations SET
         transaction_id = ?, payment_screenshot_url = ?, payment_submitted_at = ?,
         payment_status = 'SUBMITTED',
         updated_at = ?
       WHERE registration_id = ?`,
      [cleanUtr, screenshotUrl, now, now, cleanRegId]
    );

    return res.json({
      success: true,
      message: 'Payment proof submitted. The organizers will review and approve your registration.',
      registrationId: cleanRegId,
      transactionId: cleanUtr,
      submittedAt: now
    });

  } catch (err) {
    console.error('[Payments] Error in submit-proof:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error.' });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'Screenshot too large. Maximum 5 MB.' });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message || 'File upload error.' });
  }
  next();
});

module.exports = router;
