const queryColumns = require('../services/queryColumns');
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { get, all, getEventBySlug } = require('../db');
const config = require('../config');
const {
  resolveCertificateData,
  isRecordWinner,
  generateCertificateSvg,
  generateCertificateAccessToken,
  verifyCertificateAccessToken,
  isCertificateReady
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
    const token = (body.token || req.query.token || '').trim();
    const targetEventId = body.eventId || body.event;

    const host = req.get('host') || 'offstagecreators.in';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;

    // Helper to format certificate response
    async function buildCertResponse(record, isTokenAuthenticated = false) {
      // Dynamic Event Resolution
      let evt = null;
      if (record.event_id) {
        evt = await getEventBySlug(record.event_id);
      }
      if (!evt && targetEventId) {
        evt = await getEventBySlug(targetEventId);
      }
      if (!evt) {
        evt = await getEventBySlug(config.EVENT.id);
      }

      // Check readiness and publication status
      const readiness = isCertificateReady(record, evt);
      if (!readiness.isReady) {
        return {
          status: 403,
          data: {
            success: false,
            error: readiness.reason || 'This certificate has not yet been finalized or published by the organizers.'
          }
        };
      }

      const certData = await resolveCertificateData(record, evt, baseUrl);
      return {
        status: 200,
        data: {
          success: true,
          authenticated: isTokenAuthenticated,
          ...certData
        }
      };
    }

    // 1. Secure token-based access (from Collect Your Certificate email)
    if (token) {
      if (!registrationId || typeof registrationId !== 'string' || !registrationId.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Registration ID is required with access token.'
        });
      }
      const cleanRegId = registrationId.trim().toUpperCase();
      const record = await get(
        `SELECT ${queryColumns.registration} FROM registrations WHERE upper(registration_id) = ?`,
        [cleanRegId]
      );
      if (!record) {
        return res.status(404).json({ success: false, error: 'Registration not found.' });
      }

      // Event scoping check if eventId is specified
      if (targetEventId && record.event_id && record.event_id.toLowerCase() !== targetEventId.toLowerCase()) {
        const registeredEvt = await getEventBySlug(record.event_id);
        const evName = registeredEvt ? (registeredEvt.title || registeredEvt.name) : record.event_id;
        return res.status(400).json({
          success: false,
          error: `Registration ID "${cleanRegId}" is registered for "${evName}", not this event. Please verify on the main certificate page or the correct event page.`
        });
      }

      // Verify HMAC token against registrationId and event
      const tokenValid = verifyCertificateAccessToken(token, record, record.event_id) ||
                         verifyCertificateAccessToken(token, record, targetEventId) ||
                         verifyCertificateAccessToken(token, record, config.EVENT.id);
      if (!tokenValid) {
        return res.status(403).json({
          success: false,
          error: 'Invalid or tampered certificate access link. You cannot access this certificate by modifying the ID.'
        });
      }

      const resp = await buildCertResponse(record, true);
      return res.status(resp.status).json(resp.data);
    }

    // 2. Direct lookup by registrationId
    if (registrationId && typeof registrationId === 'string' && registrationId.trim()) {
      const cleanRegId = registrationId.trim().toUpperCase();
      const record = await get(
        `SELECT ${queryColumns.registration} FROM registrations WHERE upper(registration_id) = ?`,
        [cleanRegId]
      );

      if (record) {
        // Event scoping check: If user requested verification for a specific event
        if (targetEventId && record.event_id && record.event_id.toLowerCase() !== targetEventId.toLowerCase()) {
          const registeredEvt = await getEventBySlug(record.event_id);
          const evName = registeredEvt ? (registeredEvt.title || registeredEvt.name) : record.event_id;
          return res.status(400).json({
            success: false,
            error: `Registration ID "${cleanRegId}" is registered for "${evName}", not this event. Please verify on the main certificate page or the correct event page.`
          });
        }

        // If phone is provided, verify match
        if (phone && normalizePhone(phone).length >= 8) {
          const cleanInputPhone = normalizePhone(phone);
          const cleanRecordPhone = normalizePhone(record.phone);
          if (!cleanRecordPhone.endsWith(cleanInputPhone) && !cleanInputPhone.endsWith(cleanRecordPhone)) {
            return res.status(403).json({
              success: false,
              error: 'The phone number does not match this Registration ID.'
            });
          }
        }
        const resp = await buildCertResponse(record, false);
        return res.status(resp.status).json(resp.data);
      } else {
        // Registration ID was supplied but no record exists
        return res.status(404).json({
          success: false,
          error: `No certificate found for Registration ID "${cleanRegId}". Please verify your Registration ID from your confirmation email or ticket and try again.`
        });
      }
    }

    // 3. Name + Phone verification
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
      `SELECT ${queryColumns.registration} FROM registrations WHERE phone = ?`,
      [cleanPhone]
    );

    // Optional event filter if passed in query/body (strictly scopes verification to selected event)
    if (targetEventId && matchingRecords) {
      const filteredByEvent = matchingRecords.filter(r => r.event_id === targetEventId);
      if (filteredByEvent.length > 0) matchingRecords = filteredByEvent;
    }

    if (matchingRecords && matchingRecords.length > 0) {
      const match = matchingRecords.find(r => {
        const rName = normalizeName(r.full_name);
        return rName === cleanName || rName.includes(cleanName) || cleanName.includes(rName);
      }) || matchingRecords[0];

      const resp = await buildCertResponse(match, false);
      return res.status(resp.status).json(resp.data);
    }

    // 4. Check legacy certificates hash (preserves previous participants from certificate.html)
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
    const regId = (req.params.id || req.query.id || req.query.regId || '').trim().toUpperCase();
    if (!regId) return res.status(400).json({ success: false, error: 'Registration ID required.' });

    const record = await get(`SELECT ${queryColumns.registration} FROM registrations WHERE upper(registration_id) = ?`, [regId]);
    if (!record) return res.status(404).json({ success: false, error: 'Registration not found.' });

    const targetEventId = req.query.eventId || req.query.event;
    let evt = null;
    if (record.event_id) {
      evt = await getEventBySlug(record.event_id);
    }
    if (!evt && targetEventId) {
      evt = await getEventBySlug(targetEventId);
    }
    if (!evt) {
      evt = await getEventBySlug(config.EVENT.id);
    }

    // Verify token if supplied
    const token = (req.query.token || '').trim();
    if (token) {
      const tokenValid = verifyCertificateAccessToken(token, record, record.event_id) ||
                         verifyCertificateAccessToken(token, record, targetEventId) ||
                         verifyCertificateAccessToken(token, record, evt ? evt.slug : config.EVENT.id);
      if (!tokenValid) {
        return res.status(403).json({
          success: false,
          error: 'Invalid or tampered certificate download link.'
        });
      }
    }

    // Verify readiness
    const readiness = isCertificateReady(record, evt);
    if (!readiness.isReady) {
      return res.status(403).json({
        success: false,
        error: readiness.reason || 'Certificate is not published or ready for download.'
      });
    }

    const host = req.get('host') || 'offstagecreators.in';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;

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
