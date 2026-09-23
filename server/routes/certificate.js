const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { get, all } = require('../db');
const config = require('../config');

function normalizeName(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(str) {
  return String(str || '').replace(/\D/g, '');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// POST /api/certificate/verify
router.post('/verify', async (req, res) => {
  try {
    const { name, phone, registrationId } = req.body;

    // Check if looking up directly by registrationId
    if (registrationId && typeof registrationId === 'string' && registrationId.trim()) {
      const cleanRegId = registrationId.trim().toUpperCase();
      const record = await get(
        `SELECT * FROM registrations WHERE registration_id = ?`,
        [cleanRegId]
      );

      if (record) {
        if (['REVOKED', 'CANCELLED'].includes(record.reg_status) || record.payment_status === 'REVOKED') {
          return res.status(403).json({
            success: false,
            error: 'Registration has been revoked/cancelled. Certificate cannot be issued.'
          });
        }

        if (record.reg_status !== 'APPROVED' && record.payment_status !== 'PAID') {
          return res.status(403).json({
            success: false,
            error: 'Registration payment is not yet verified. Only confirmed participants can receive certificates.'
          });
        }

        if (!record.checked_in && !record.certificate_eligible) {
          return res.status(403).json({
            success: false,
            error: 'Participation certificate is issued after attending and checking in to the event.'
          });
        }

        // Dispatch certificate email if not sent recently
        const { sendCertificateAvailableEmail } = require('../services/email');
        try {
          await sendCertificateAvailableEmail({
            to: record.email,
            registration: record
          });
        } catch (err) {
          console.error('Failed to dispatch certificate email:', err);
        }

        return res.json({
          success: true,
          verifiedName: record.full_name,
          registrationId: record.registration_id,
          event: config.EVENT.title,
          category: record.category,
          date: config.EVENT.date
        });
      }
    }

    // Name + Phone verification
    const cleanName = normalizeName(name);
    const cleanPhone = normalizePhone(phone);

    if (cleanName.length < 2 || cleanPhone.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Please enter your full registered name and a valid phone number.'
      });
    }

    // 1. Check legacy certificates hash (preserves previous participants from certificate.html)
    const combinedHash = sha256(cleanName + '|' + cleanPhone);
    const legacy = await get(
      `SELECT * FROM legacy_certificates WHERE hash = ?`,
      [combinedHash]
    );

    if (legacy) {
      return res.json({
        success: true,
        verifiedName: name.trim(),
        event: legacy.event_name,
        isLegacy: true
      });
    }

    // 2. Check active registrations database
    const matchingRecords = await all(
      `SELECT * FROM registrations WHERE phone = ?`,
      [cleanPhone]
    );

    if (matchingRecords && matchingRecords.length > 0) {
      const match = matchingRecords.find(r => {
        const rName = normalizeName(r.full_name);
        return rName === cleanName || rName.includes(cleanName) || cleanName.includes(rName);
      }) || matchingRecords[0];

      if (['REVOKED', 'CANCELLED'].includes(match.reg_status) || match.payment_status === 'REVOKED') {
        return res.status(403).json({
          success: false,
          error: 'Registration has been revoked/cancelled. Certificate cannot be issued.'
        });
      }

      if (match.reg_status !== 'APPROVED' && match.payment_status !== 'PAID') {
        return res.status(403).json({
          success: false,
          error: 'Registration payment is not yet verified. Only confirmed participants can receive certificates.'
        });
      }

      if (!match.checked_in && !match.certificate_eligible) {
        return res.status(403).json({
          success: false,
          error: 'Participation certificate is issued after event attendance and check-in.'
        });
      }

      return res.json({
        success: true,
        verifiedName: match.full_name,
        registrationId: match.registration_id,
        event: config.EVENT.title,
        category: match.category,
        date: config.EVENT.date
      });
    }

    return res.status(404).json({
      success: false,
      error: '✕ We could not find a matching registered participant. Please check the name and WhatsApp number used during registration.'
    });

  } catch (err) {
    console.error('Error in /api/certificate/verify:', err);
    return res.status(500).json({ success: false, error: 'Certificate verification failed.' });
  }
});

module.exports = router;
