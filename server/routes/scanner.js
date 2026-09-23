const express = require('express');
const router = express.Router();
const { run, get } = require('../db');
const config = require('../config');

// Helper to mask phone numbers for staff display
function maskPhone(phone) {
  if (!phone || phone.length < 6) return phone;
  return phone.slice(0, 2) + '••••••' + phone.slice(-2);
}

// Clean and parse scanned QR string
function parseCode(code) {
  if (!code || typeof code !== 'string') return '';
  let str = code.trim();
  try {
    if (str.includes('?id=')) {
      const parts = str.split('?id=');
      if (parts[1]) str = parts[1].split('&')[0];
    } else if (str.includes('/ticket/')) {
      const parts = str.split('/ticket/');
      if (parts[1]) str = parts[1].split(/[/?#]/)[0];
    }
  } catch (e) {}
  return decodeURIComponent(str).trim().toUpperCase();
}

// POST /api/scanner/lookup
router.post('/lookup', async (req, res) => {
  try {
    const { code } = req.body;
    const query = parseCode(code);

    if (!query) {
      return res.status(400).json({ success: false, error: 'Please scan or enter a registration code.' });
    }

    // Lookup by registration_id or phone
    const cleanPhone = query.replace(/\D/g, '');
    let record = await get(
      `SELECT * FROM registrations WHERE registration_id = ?`,
      [query]
    );

    if (!record && cleanPhone.length >= 10) {
      record = await get(
        `SELECT * FROM registrations WHERE phone = ? ORDER BY id DESC LIMIT 1`,
        [cleanPhone]
      );
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'No registration found for this QR code or identifier.',
        scannedCode: query
      });
    }

    const isRevoked = ['REVOKED', 'CANCELLED'].includes(record.reg_status) || record.payment_status === 'REVOKED';
    const isPaid = (record.payment_status === 'PAID' || record.reg_status === 'APPROVED') && !isRevoked;
    const isCheckedIn = Boolean(record.checked_in);

    let statusText = 'READY FOR ENTRY';
    let canCheckIn = false;

    if (isRevoked) {
      statusText = 'REGISTRATION REVOKED — ENTRY DENIED';
      canCheckIn = false;
    } else if (record.payment_status === 'PENDING' && record.reg_status !== 'APPROVED') {
      statusText = 'PAYMENT NOT SUBMITTED';
    } else if (record.payment_status === 'PENDING_VERIFICATION' && record.reg_status !== 'APPROVED') {
      statusText = 'PAYMENT UNDER VERIFICATION';
    } else if (record.payment_status === 'REJECTED' || record.reg_status === 'REJECTED') {
      statusText = 'PAYMENT REJECTED';
    } else if (isPaid) {
      if (isCheckedIn) {
        statusText = 'ALREADY CHECKED IN';
      } else {
        statusText = 'READY FOR ENTRY';
        canCheckIn = true;
      }
    }

    return res.json({
      success: true,
      participant: {
        registrationId: record.registration_id,
        fullName: record.full_name,
        phoneMasked: maskPhone(record.phone),
        category: record.category,
        performanceTitle: record.performance_title,
        city: record.city,
        status: record.reg_status || record.payment_status,
        paymentStatus: record.payment_status,
        isRevoked,
        transactionId: record.transaction_id,
        amount: record.amount,
        checkedIn: isCheckedIn,
        checkinAt: record.checkin_at,
        canCheckIn,
        statusText,
        event: {
          title: config.EVENT.title,
          date: config.EVENT.date,
          time: config.EVENT.time
        }
      }
    });

  } catch (err) {
    console.error('Error in /api/scanner/lookup:', err);
    return res.status(500).json({ success: false, error: 'Scanner lookup failed.' });
  }
});

// POST /api/scanner/check-in
router.post('/check-in', async (req, res) => {
  try {
    const { registrationId, pin } = req.body;

    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID required.' });
    }

    // Optional PIN verification if configured
    if (config.ADMIN_SECRET && pin && pin !== config.ADMIN_SECRET) {
      return res.status(401).json({ success: false, error: 'Invalid staff PIN.' });
    }

    const record = await get(
      `SELECT * FROM registrations WHERE registration_id = ?`,
      [registrationId.trim().toUpperCase()]
    );

    if (!record) {
      return res.status(404).json({ success: false, error: 'Registration record not found.' });
    }

    if (['REVOKED', 'CANCELLED'].includes(record.reg_status) || record.payment_status === 'REVOKED') {
      return res.status(403).json({
        success: false,
        error: `REGISTRATION REVOKED / CANCELLED. Entry is strictly denied.`
      });
    }

    if (record.reg_status !== 'APPROVED' && record.payment_status !== 'PAID') {
      return res.status(400).json({
        success: false,
        error: `PAYMENT NOT VERIFIED (Status: ${record.reg_status || record.payment_status}). Cannot check in.`
      });
    }

    if (record.checked_in) {
      return res.status(409).json({
        success: false,
        error: `ALREADY CHECKED IN at ${record.checkin_at || 'earlier session'}`,
        checkinAt: record.checkin_at
      });
    }

    const now = new Date().toISOString();

    // Check-in sets checked_in = 1 and certificate_eligible = 1
    await run(
      `UPDATE registrations SET checked_in = 1, checkin_at = ?, certificate_eligible = 1, updated_at = ? WHERE registration_id = ?`,
      [now, now, record.registration_id]
    );

    // Dispatch check-in email (idempotent, only sent once upon initial check-in)
    const { sendCheckinEmail } = require('../services/email');
    try {
      await sendCheckinEmail({
        to: record.email,
        registration: { ...record, checkin_at: now }
      });
    } catch (err) {
      console.error('Failed to dispatch check-in email:', err);
    }

    return res.json({
      success: true,
      message: 'Check-in confirmed successfully!',
      participantName: record.full_name,
      registrationId: record.registration_id,
      checkinAt: now
    });

  } catch (err) {
    console.error('Error in /api/scanner/check-in:', err);
    return res.status(500).json({ success: false, error: 'Check-in failed due to server error.' });
  }
});

module.exports = router;
