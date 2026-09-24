const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
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

// ─── Event Winners System ─────────────────────────────────────────────────────
const WINNER_REGISTRATIONS = {
  'OC-OM-2440F923': {
    isWinner: true,
    position: 'WINNER',
    achievement: 'Winner — First Place',
    certificateTitle: 'CERTIFICATE OF EXCELLENCE',
    badgeText: '★ EVENT WINNER ★',
    citation: 'for securing 1st Place as the Event Winner with an exceptional and captivating performance in'
  }
};

function getWinnerInfo(record) {
  if (!record) return null;
  const regId = String(record.registration_id || '').trim().toUpperCase();
  if (WINNER_REGISTRATIONS[regId]) {
    return WINNER_REGISTRATIONS[regId];
  }
  const cleanName = normalizeName(record.full_name);
  if (cleanName === 'suhavani kaur' || cleanName.includes('suhavani')) {
    return WINNER_REGISTRATIONS['OC-OM-2440F923'];
  }
  return null;
}

async function generateQr(url) {
  try {
    return await QRCode.toDataURL(url, {
      margin: 1,
      width: 280,
      color: {
        dark: '#1c1712',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.warn('Failed to generate certificate QR code:', err.message);
    return null;
  }
}

// Verification handler for POST and GET
async function handleVerify(req, res) {
  try {
    const body = req.method === 'GET' ? req.query : req.body;
    const { name, phone } = body;
    const registrationId = body.registrationId || body.regId || body.id;

    const host = req.get('host') || 'offstagecreators.com';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const baseUrl = `${protocol}://${host}`;

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

        // Dispatch certificate email if function exists
        const emailService = require('../services/email');
        if (typeof emailService.sendCertificateAvailableEmail === 'function') {
          try {
            await emailService.sendCertificateAvailableEmail({
              to: record.email,
              registration: record
            });
          } catch (err) {
            console.warn('Failed to dispatch certificate email:', err.message);
          }
        }

        const verificationUrl = `${baseUrl}/certificate?regId=${encodeURIComponent(record.registration_id)}`;
        const qrCode = await generateQr(verificationUrl);
        const winnerInfo = getWinnerInfo(record);

        return res.json({
          success: true,
          verifiedName: record.full_name,
          registrationId: record.registration_id,
          certificateId: record.registration_id,
          event: config.EVENT.title,
          category: record.category || 'Performer',
          performanceTitle: record.performance_title || null,
          city: record.city || null,
          date: config.EVENT.date,
          verificationUrl,
          qrCode,
          isWinner: Boolean(winnerInfo),
          position: winnerInfo ? winnerInfo.position : 'Participant',
          achievement: winnerInfo ? winnerInfo.achievement : null,
          certificateTitle: winnerInfo ? winnerInfo.certificateTitle : 'CERTIFICATE OF PARTICIPATION',
          badgeText: winnerInfo ? winnerInfo.badgeText : null,
          citation: winnerInfo ? winnerInfo.citation : null
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

    // 1. Check active registrations database first
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

      const verificationUrl = `${baseUrl}/certificate?regId=${encodeURIComponent(match.registration_id)}`;
      const qrCode = await generateQr(verificationUrl);
      const winnerInfo = getWinnerInfo(match);

      return res.json({
        success: true,
        verifiedName: match.full_name,
        registrationId: match.registration_id,
        certificateId: match.registration_id,
        event: config.EVENT.title,
        category: match.category || 'Performer',
        performanceTitle: match.performance_title || null,
        city: match.city || null,
        date: config.EVENT.date,
        verificationUrl,
        qrCode,
        isWinner: Boolean(winnerInfo),
        position: winnerInfo ? winnerInfo.position : 'Participant',
        achievement: winnerInfo ? winnerInfo.achievement : null,
        certificateTitle: winnerInfo ? winnerInfo.certificateTitle : 'CERTIFICATE OF PARTICIPATION',
        badgeText: winnerInfo ? winnerInfo.badgeText : null,
        citation: winnerInfo ? winnerInfo.citation : null
      });
    }

    // 2. Check legacy certificates hash (preserves previous participants from certificate.html)
    const combinedHash = sha256(cleanName + '|' + cleanPhone);
    const legacy = await get(
      `SELECT * FROM legacy_certificates WHERE hash = ?`,
      [combinedHash]
    );

    if (legacy) {
      const legacyCertId = `OC-LEGACY-${combinedHash.slice(0, 8).toUpperCase()}`;
      const verificationUrl = `${baseUrl}/certificate?id=${legacyCertId}`;
      const qrCode = await generateQr(verificationUrl);

      return res.json({
        success: true,
        verifiedName: name.trim(),
        registrationId: legacyCertId,
        certificateId: legacyCertId,
        event: legacy.event_name,
        category: 'Performer',
        date: config.EVENT.date,
        isLegacy: true,
        verificationUrl,
        qrCode,
        isWinner: false,
        certificateTitle: 'CERTIFICATE OF PARTICIPATION'
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
}

// POST and GET /api/certificate/verify
router.post('/verify', handleVerify);
router.get('/verify', handleVerify);

module.exports = router;
