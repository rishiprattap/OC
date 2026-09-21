const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { run, get } = require('../db');
const config = require('../config');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'screenshots');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const regId = (req.body.registrationId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `proof-${regId}-${Date.now()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowed.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, and WebP images are allowed.'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: fileFilter
});

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

    if (!reg.email_verified) {
      return res.status(403).json({
        success: false,
        error: 'Email verification required. Please verify your email with the 6-digit OTP before submitting payment proof.'
      });
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

    const screenshotUrl = `/uploads/screenshots/${req.file.filename}`;
    const now = new Date().toISOString();

    // 3. Update registration record
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
    sendPaymentProofReceivedEmail({
      to: updatedReg.email,
      registration: updatedReg
    }).catch(err => console.error('Failed to dispatch payment proof email:', err));

    // Send notification alert to admin
    sendAdminNotificationEmail({
      registration: updatedReg
    }).catch(err => console.error('Failed to dispatch admin payment alert:', err));

    return res.json({
      success: true,
      message: 'Payment proof submitted successfully. Your payment is now under manual verification.',
      registrationId: cleanRegId,
      transactionId: cleanUtr,
      screenshotUrl: screenshotUrl,
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

module.exports = router;
