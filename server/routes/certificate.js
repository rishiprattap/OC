const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { get, all, getEventBySlug } = require('../db');
const config = require('../config');
const {
  resolveCertificateData,
  isRecordWinner,
  generateCertificateSvg
} = require('../services/certificate');

function normalizeName(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(str) {
  return String(str || '').replace(/\D/g, '');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
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
    // Prevent client/proxy caching so regenerating a certificate always reflects latest options
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const body = req.method === 'GET' ? req.query : req.body;
    const { name, phone } = body;
    const registrationId = body.registrationId || body.regId || body.id;

    const host = req.get('host') || 'offstagecreators.in';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
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

      const isWinner = isRecordWinner(record);
      if (!record.checked_in && !record.certificate_eligible && !isWinner) {
        return {
          status: 403,
          data: { success: false, error: 'Participation certificate is issued after attending and checking in to the event.' }
        };
      }

      // Dynamic Event Resolution
      let evt = null;
      if (record.event_id) {
        evt = await getEventBySlug(record.event_id);
      }
      if (!evt) {
        evt = await getEventBySlug(config.EVENT.id);
      }

      const certData = await resolveCertificateData(record, evt, baseUrl);
      return {
        status: 200,
        data: {
          success: true,
          ...certData
        }
      };
    }

    // 1. Check if looking up directly by registrationId
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

    // 2. Name + Phone verification
    const cleanName = normalizeName(name);
    const cleanPhone = normalizePhone(phone);

    if (cleanName.length < 2 || cleanPhone.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Please enter your full registered name and a valid phone number.'
      });
    }

    // Check registrations database
    let matchingRecords = await all(
      `SELECT * FROM registrations WHERE phone = ?`,
      [cleanPhone]
    );

    // Optional event filter if passed in query/body (strictly scopes verification to selected event)
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

    // 3. Check legacy certificates hash (preserves previous participants from certificate.html)
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
        position: 'Participant',
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

// Direct Certificate SVG / Download Endpoint
async function handleDownload(req, res) {
  try {
    const regId = (req.params.id || req.query.id || '').trim().toUpperCase();
    if (!regId) return res.status(400).json({ success: false, error: 'Registration ID required.' });

    const record = await get(`SELECT * FROM registrations WHERE registration_id = ?`, [regId]);
    if (!record) return res.status(404).json({ success: false, error: 'Registration not found.' });

    const host = req.get('host') || 'offstagecreators.in';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;

    let evt = null;
    if (record.event_id) {
      evt = await getEventBySlug(record.event_id);
    }
    if (!evt) {
      evt = await getEventBySlug(config.EVENT.id);
    }

    const certData = await resolveCertificateData(record, evt, baseUrl);
    const svg = generateCertificateSvg(certData);

    const cleanName = (certData.verifiedName || 'Participant').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `Offstage-Creators-Certificate-${certData.registrationId}-${cleanName}.svg`;

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(svg);
  } catch (err) {
    console.error('[Certificate] Download error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate certificate file.' });
  }
}

// POST and GET /api/certificate/verify
router.post('/verify', handleVerify);
router.get('/verify', handleVerify);

// GET /api/certificate/download/:id
router.get('/download/:id', handleDownload);
router.get('/svg/:id', handleDownload);

module.exports = router;
