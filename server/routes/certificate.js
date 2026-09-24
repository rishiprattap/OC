const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { get, all, getEventBySlug } = require('../db');
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

// ─── Default Winner Registrations (Backward Compatibility) ─────────────────────
const DEFAULT_WINNER_REGISTRATIONS = {
  'OC-OM-2440F923': {
    isWinner: true,
    position: 'WINNER',
    achievement: 'Winner — First Place',
    certificateTitle: 'CERTIFICATE OF EXCELLENCE',
    badgeText: '★ EVENT WINNER ★',
    citation: 'for securing 1st Place as the Event Winner with an exceptional and captivating performance in'
  }
};

function resolveWinnerInfo(record) {
  if (!record) return null;
  // 1. Check if stored directly on participant record
  if (record.achievement || record.badge_text || (record.position && record.position !== 'Participant')) {
    return {
      isWinner: Boolean(record.position === 'WINNER' || record.badge_text),
      position: record.position || 'Winner',
      achievement: record.achievement || record.position,
      certificateTitle: record.certificate_title || 'CERTIFICATE OF EXCELLENCE',
      badgeText: record.badge_text || '★ EVENT WINNER ★',
      citation: record.citation || 'for exceptional performance in'
    };
  }
  // 2. Fallback to default winners table (preserves Suhavani Kaur)
  const regId = String(record.registration_id || '').trim().toUpperCase();
  if (DEFAULT_WINNER_REGISTRATIONS[regId]) {
    return DEFAULT_WINNER_REGISTRATIONS[regId];
  }
  const cleanName = normalizeName(record.full_name);
  if (cleanName === 'suhavani kaur' || cleanName.includes('suhavani')) {
    return DEFAULT_WINNER_REGISTRATIONS['OC-OM-2440F923'];
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

    // Helper to format certificate response
    async function buildCertResponse(record) {
      if (['REVOKED', 'CANCELLED'].includes(record.reg_status) || record.payment_status === 'REVOKED') {
        return {
          status: 403,
          data: { success: false, error: 'Registration has been revoked/cancelled. Certificate cannot be issued.' }
        };
      }

      if (record.reg_status !== 'APPROVED' && record.payment_status !== 'PAID') {
        return {
          status: 403,
          data: { success: false, error: 'Registration payment is not yet verified. Only confirmed participants can receive certificates.' }
        };
      }

      const winnerInfoPreCheck = resolveWinnerInfo(record);
      if (!record.checked_in && !record.certificate_eligible && !winnerInfoPreCheck) {
        return {
          status: 403,
          data: { success: false, error: 'Participation certificate is issued after attending and checking in to the event.' }
        };
      }

      // Dynamic Event Resolution
      let eventTitle = config.EVENT.title;
      let eventDate = config.EVENT.date;
      let eventSlug = record.event_id || config.EVENT.id;

      if (record.event_id) {
        const evt = await getEventBySlug(record.event_id);
        if (evt) {
          eventTitle = evt.title || evt.name;
          eventDate = evt.event_date || config.EVENT.date;
          eventSlug = evt.slug;
        }
      }

      const verificationUrl = `${baseUrl}/certificate?regId=${encodeURIComponent(record.registration_id)}`;
      const qrCode = await generateQr(verificationUrl);
      const winnerInfo = resolveWinnerInfo(record);

      return {
        status: 200,
        data: {
          success: true,
          verifiedName: record.full_name,
          registrationId: record.registration_id,
          certificateId: record.registration_id,
          eventId: eventSlug,
          event: eventTitle,
          eventName: eventTitle,
          category: record.category || 'Performer',
          performanceTitle: record.performance_title || null,
          city: record.city || null,
          date: eventDate,
          verificationUrl,
          qrCode,
          isWinner: Boolean(winnerInfo),
          position: winnerInfo ? winnerInfo.position : (record.position || 'Participant'),
          achievement: winnerInfo ? winnerInfo.achievement : (record.achievement || null),
          certificateTitle: winnerInfo ? winnerInfo.certificateTitle : (record.certificate_title || 'CERTIFICATE OF PARTICIPATION'),
          badgeText: winnerInfo ? winnerInfo.badgeText : (record.badge_text || null),
          citation: winnerInfo ? winnerInfo.citation : (record.citation || null)
        }
      };
    }

    // Check if looking up directly by registrationId
    if (registrationId && typeof registrationId === 'string' && registrationId.trim()) {
      const cleanRegId = registrationId.trim().toUpperCase();
      const record = await get(
        `SELECT * FROM registrations WHERE registration_id = ?`,
        [cleanRegId]
      );

      if (record) {
        const resp = await buildCertResponse(record);
        return res.status(resp.status).json(resp.data);
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

    // 1. Check registrations database
    let matchingRecords = await all(
      `SELECT * FROM registrations WHERE phone = ?`,
      [cleanPhone]
    );

    // Optional event filter if passed in query/body
    const targetEventId = body.eventId || body.event;
    if (targetEventId && matchingRecords) {
      const filteredByEvent = matchingRecords.filter(r => r.event_id === targetEventId);
      if (filteredByEvent.length > 0) matchingRecords = filteredByEvent;
    }

    if (matchingRecords && matchingRecords.length > 0) {
      const match = matchingRecords.find(r => {
        const rName = normalizeName(r.full_name);
        return rName === cleanName || rName.includes(cleanName) || cleanName.includes(rName);
      }) || matchingRecords[0];

      const resp = await buildCertResponse(match);
      return res.status(resp.status).json(resp.data);
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
