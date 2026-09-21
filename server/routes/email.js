/**
 * Offstage Creators — Email Routes
 * OTP functionality has moved to /api/otp/*
 * This file redirects legacy OTP paths for any cached clients.
 */
const express = require('express');
const router = express.Router();

// Redirect legacy OTP paths to new routes
router.all(['/verify-otp', '/resend-otp', '/send-otp'], (req, res) => {
  return res.status(410).json({
    success: false,
    error: 'This endpoint has moved. Please use /api/otp/send and /api/otp/verify.',
    movedTo: {
      send: '/api/otp/send',
      verify: '/api/otp/verify'
    }
  });
});

module.exports = router;
