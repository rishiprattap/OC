const express = require('express');
const router = express.Router();

// Email OTP verification is deprecated and removed from active flow.
// Returning graceful responses for legacy or cached browser clients.
router.all(['/verify-otp', '/resend-otp'], (req, res) => {
  return res.json({
    success: true,
    emailVerified: true,
    message: 'Email OTP verification is no longer required. Registration and payments proceed directly.'
  });
});

module.exports = router;
