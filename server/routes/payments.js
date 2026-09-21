const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { run, get } = require('../db');
const config = require('../config');

// On Vercel (read-only filesystem), store screenshots as base64 data URIs in the DB.
// Locally, save to disk and store a URL path.
const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);

let upload;

if (isVercel) {
  // Vercel: buffer in memory, convert to base64 data URI
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (allowed.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPG, PNG, and WebP images are allowed.'));
      }
    }
  });
} else {
  // Local: save to disk
  const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'screenshots');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

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
      if (allowed.includes(file.mimetype.toLowerCase())) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPG, PNG, and WebP images are allowed.'));
      }
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

// POST /api/payments/submit-proof
router.post('/submit-proof', upload.single('screenshot'), async (req, res) => {
  try {
    const { registrationId, transactionId } = req.body;

    if (!registrationId || !registrationId.trim()) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const cleanRegId = registrationId.trim().toUpperCase();

    if (!transactionId || !transactionId.trim() || transactionId.trim().length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid UPI Transaction ID / UTR (minimum 6 digits).'
      });
    }

    const cleanUtr = transactionId.trim().toUpperCase();

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Payment screenshot is required. Please upload your payment confirmation image.'
      });
    }

    // 1. Verify registration exists
    const reg = await get(
      `SELECT * FROM registrations WHERE registration_id = ?`,
      [cleanRegId]
    );

    if (!reg) {
      return res.status(404).json({ success: false, error: 'Registration record not found.' });
    }

    if (reg.payment_status === 'PAID') {
      return res.status(400).json({
        success: false,
        error: 'This registration has already been verified and paid.'
      });
    }

    // 2. Duplicate UTR check across all registrations
    const duplicateUtr = await get(
      `SELECT * FROM registrations WHERE transaction_id = ? AND registration_id != ?`,
      [cleanUtr, cleanRegId]
    );

    if (duplicateUtr) {
      return res.status(409).json({
        success: false,
        error: 'This UPI Transaction ID / UTR has already been submitted for another registration. If this is an error, please contact the organizers.'
      });
    }

    // 3. Determine screenshot storage
    let screenshotUrl;
    if (isVercel) {
      // Store as base64 data URI directly in DB (Vercel has no persistent writable filesystem)
      const mimeType = req.file.mimetype || 'image/jpeg';
      const b64 = req.file.buffer.toString('base64');
      screenshotUrl = `data:${mimeType};base64,${b64}`;
    } else {
      // Disk storage — file is already written, build URL path
      screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    }

    const now = new Date().toISOString();

    // 4. Update registration record
    await run(
      `UPDATE registrations SET
        payment_status = 'PENDING_VERIFICATION',
        transaction_id = ?,
        payment_screenshot_url = ?,
        payment_submitted_at = ?,
        rejection_reason = NULL,
        updated_at = ?
      WHERE registration_id = ?`,
      [cleanUtr, screenshotUrl, now, now, cleanRegId]
    );

    const updatedReg = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [cleanRegId]);
    const {
      sendPaymentProofReceivedEmail,
      sendAdminNotificationEmail
    } = require('../services/email');

    // Send confirmation to participant
    try {
      await sendPaymentProofReceivedEmail({
        to: updatedReg.email,
        registration: updatedReg
      });
    } catch (err) {
      console.error('Failed to dispatch payment proof email:', err);
    }

    // Send notification alert to admin
    try {
      await sendAdminNotificationEmail({
        registration: updatedReg
      });
    } catch (err) {
      console.error('Failed to dispatch admin payment alert:', err);
    }

    return res.json({
      success: true,
      message: 'Payment proof submitted successfully. Your payment is now under manual verification.',
      registrationId: cleanRegId,
      transactionId: cleanUtr,
      paymentStatus: 'PENDING_VERIFICATION',
      submittedAt: now
    });

  } catch (err) {
    console.error('Error in /api/payments/submit-proof:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Server error processing payment proof.'
    });
  }
});

// Multer error handler (file type / size violations)
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'Screenshot too large. Maximum file size is 5 MB.' });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message || 'File upload error.' });
  }
  next();
});

module.exports = router;
