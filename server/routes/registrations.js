/**
 * Offstage Creators — Registrations Routes
 * POST /api/registrations         — Create a new registration (returns registration ID, triggers OTP send)
 * GET  /api/registrations/:id     — Get registration by ID (public, no sensitive data)
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const { run, get, getSetting, getActiveEvent, getEventBySlug } = require('../db');
const config = require('../config');
const otpService = require('../services/otp');
const emailService = require('../services/email');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRegistrationId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  const letters = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `OC-OM-${num}${letters}`;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── POST /api/registrations ─────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const {
      fullName, phone, email, city, category,
      instagram, performanceTitle, performanceDescription, terms,
      eventId: requestedEventId, eventSlug
    } = req.body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter a valid full name (minimum 2 characters).' });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Please provide a valid 10-digit phone/WhatsApp number.' });
    }

    if (!email || !validateEmail(email.trim())) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (!city || city.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter your city.' });
    }

    if (!category || typeof category !== 'string' || category.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please select a performance category.' });
    }

    if (!performanceTitle || performanceTitle.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter a title for your performance.' });
    }

    if (!terms) {
      return res.status(400).json({ success: false, error: 'You must agree to the event guidelines and terms.' });
    }

    // ── Determine Target Event ────────────────────────────────────────────────
    let targetEvent = null;
    const targetSlug = requestedEventId || eventSlug;
    if (targetSlug) {
      targetEvent = await getEventBySlug(targetSlug);
    }
    if (!targetEvent) {
      targetEvent = await getActiveEvent();
    }

    const eventId = targetEvent ? targetEvent.slug : (config.EVENT.id || 'online-open-mic-2026');
    const eventAmount = targetEvent && targetEvent.fee !== undefined ? Number(targetEvent.fee) : (config.OPEN_MIC_FEE_INR || 79);

    // ── Check if registration is open for this event ─────────────────────────
    const globalRegSetting = await getSetting('registration_status', 'OPEN');
    if (targetEvent) {
      if (!targetEvent.reg_enabled || ['registration_closed', 'event_completed', 'archived', 'draft'].includes(targetEvent.status)) {
        if (targetEvent.status === 'event_completed') {
          return res.status(403).json({ success: false, error: 'This event has concluded. Registrations are closed.' });
        }
        if (targetEvent.status === 'draft') {
          return res.status(403).json({ success: false, error: 'This event is in draft mode and not yet accepting registrations.' });
        }
        return res.status(403).json({ success: false, error: 'Registration is currently closed for this event.' });
      }

      // Check max capacity
      if (targetEvent.max_registrations > 0) {
        const countRow = await get(
          `SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND reg_status NOT IN ('REJECTED', 'REVOKED', 'CANCELLED')`,
          [eventId]
        );
        if (countRow && countRow.c >= targetEvent.max_registrations) {
          return res.status(403).json({ success: false, error: 'Registration capacity has been reached for this event.' });
        }
      }
    } else if (globalRegSetting === 'CLOSED') {
      return res.status(403).json({ success: false, error: 'Registration is currently closed.' });
    }

    const cleanFullName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCity = city.trim();
    const cleanCategory = category.trim();
    const cleanInstagram = (instagram || '').trim().replace(/^@/, '');
    const cleanTitle = performanceTitle.trim();
    const cleanDesc = (performanceDescription || '').trim();
    const now = new Date().toISOString();

    // ── Duplicate check ───────────────────────────────────────────────────────
    // Block if already APPROVED or VERIFIED for this email and this event
    const existing = await get(
      `SELECT * FROM registrations WHERE event_id = ? AND email = ? AND reg_status IN ('APPROVED', 'VERIFIED') ORDER BY id DESC LIMIT 1`,
      [eventId, cleanEmail]
    );

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A verified registration already exists for ${cleanEmail} for this event.`,
        registrationId: existing.registration_id,
        status: existing.reg_status
      });
    }

    // ── Reuse or create ───────────────────────────────────────────────────────
    let regId;
    const pending = await get(
      `SELECT * FROM registrations WHERE event_id = ? AND email = ? AND reg_status = 'PENDING_VERIFICATION' ORDER BY id DESC LIMIT 1`,
      [eventId, cleanEmail]
    );

    if (pending) {
      regId = pending.registration_id;
      await run(
        `UPDATE registrations SET
           full_name = ?, phone = ?, city = ?, category = ?,
           instagram = ?, performance_title = ?, performance_description = ?,
           amount = ?, updated_at = ?
         WHERE id = ?`,
        [cleanFullName, cleanPhone, cleanCity, cleanCategory,
         cleanInstagram, cleanTitle, cleanDesc, eventAmount, now, pending.id]
      );
    } else {
      regId = generateRegistrationId();
      await run(
        `INSERT INTO registrations (
           registration_id, event_id, full_name, phone, email, city,
           category, instagram, performance_title, performance_description,
           amount, otp_verified, reg_status, checked_in, certificate_eligible,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'PENDING_VERIFICATION', 0, 0, ?, ?)`,
        [regId, eventId, cleanFullName, cleanPhone, cleanEmail, cleanCity,
         cleanCategory, cleanInstagram, cleanTitle, cleanDesc, eventAmount, now, now]
      );
    }

    // ── Send OTP ──────────────────────────────────────────────────────────────
    try {
      const otp = otpService.generateOTP();
      const { expiresAt } = await otpService.storeOTP(cleanEmail, regId, otp);

      await emailService.sendOTPEmail({
        registrationId: regId,
        email: cleanEmail,
        name: cleanFullName,
        otp,
        expiryMinutes: config.OTP_EXPIRY_MINUTES,
        eventTitle: targetEvent?.title || config.EVENT.title
      });

      return res.status(201).json({
        success: true,
        message: `Registration created. A verification code has been sent to ${cleanEmail}.`,
        registrationId: regId,
        email: cleanEmail,
        eventId,
        amount: eventAmount,
        expiresAt,
        expiryMinutes: config.OTP_EXPIRY_MINUTES
      });

    } catch (emailErr) {
      console.error('[Registration] OTP email failed:', emailErr.message);
      return res.status(201).json({
        success: true,
        otpEmailFailed: true,
        message: 'Registration created but we could not send the verification email. Please use "Resend OTP" on the next screen.',
        registrationId: regId,
        email: cleanEmail,
        eventId,
        amount: eventAmount,
        expiryMinutes: config.OTP_EXPIRY_MINUTES
      });
    }

  } catch (err) {
    console.error('[Registration] Error in POST /api/registrations:', err);
    return res.status(500).json({ success: false, error: 'Server error while creating registration.' });
  }
});

// ─── GET /api/registrations/:id ──────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const regId = (req.params.id || '').trim().toUpperCase();

    if (!regId) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const record = await get(
      `SELECT * FROM registrations WHERE registration_id = ?`,
      [regId]
    );

    if (!record) {
      return res.status(404).json({ success: false, error: 'Registration not found.' });
    }

    // Map reg_status to user-friendly label
    const statusLabels = {
      PENDING_VERIFICATION: 'Pending Email Verification',
      VERIFIED: 'Registered — Pending Approval',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      REVOKED: 'Revoked/Cancelled',
      CANCELLED: 'Revoked/Cancelled'
    };

    const isRevoked = ['REVOKED', 'CANCELLED'].includes(record.reg_status);
    const isApproved = record.reg_status === 'APPROVED';

    let qrCode = null;
    if (!isRevoked && record.reg_status !== 'REJECTED') {
      try {
        qrCode = await QRCode.toDataURL(record.registration_id, {
          width: 240,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' }
        });
      } catch (qrErr) {
        console.warn('[Registration] Could not generate QR code:', qrErr.message);
      }
    }

    // Dynamic event data resolution
    let eventInfo = {
      id: config.EVENT.id,
      title: config.EVENT.title,
      name: config.EVENT.title,
      date: config.EVENT.date,
      time: config.EVENT.time,
      venue: 'Online (Google Meet)',
      venueAddress: '',
      city: 'Online'
    };

    if (record.event_id) {
      const evt = await getEventBySlug(record.event_id);
      if (evt) {
        eventInfo = {
          id: evt.slug,
          slug: evt.slug,
          name: evt.name,
          title: evt.title,
          date: evt.event_date || config.EVENT.date,
          time: evt.start_time ? (evt.end_time ? `${evt.start_time} – ${evt.end_time}` : evt.start_time) : config.EVENT.time,
          venue: evt.venue_name || 'Online (Google Meet)',
          venueAddress: evt.venue_address || '',
          city: evt.city || '',
          mapsUrl: evt.maps_url || '',
          fee: Number(evt.fee !== undefined ? evt.fee : (config.OPEN_MIC_FEE_INR || 79))
        };
      }
    }

    return res.json({
      success: true,
      registration: {
        registrationId: record.registration_id,
        eventId: record.event_id,
        serialNumber: record.serial_number || record.id,
        fullName: record.full_name,
        email: record.email,
        category: record.category,
        performanceTitle: record.performance_title,
        city: record.city,
        instagram: record.instagram,
        status: record.reg_status || 'PENDING_VERIFICATION',
        statusLabel: statusLabels[record.reg_status] || 'Unknown',
        isValidPass: isApproved,
        isRevoked,
        otpVerified: Boolean(record.otp_verified),
        checkedIn: Boolean(record.checked_in),
        certificateEligible: Boolean(record.certificate_eligible),
        position: record.position || 'Participant',
        achievement: record.achievement || null,
        certificateTitle: record.certificate_title || 'CERTIFICATE OF PARTICIPATION',
        badgeText: record.badge_text || null,
        citation: record.citation || null,
        approvedAt: record.approved_at,
        rejectedAt: record.rejected_at,
        rejectedReason: record.rejected_reason || record.admin_notes,
        adminNotes: record.admin_notes || record.rejected_reason,
        transactionId: record.transaction_id,
        paymentSubmittedAt: record.payment_submitted_at,
        createdAt: record.created_at,
        qrCode,
        event: eventInfo
      }
    });

  } catch (err) {
    console.error('[Registration] Error in GET /api/registrations/:id:', err);
    return res.status(500).json({ success: false, error: 'Server error while fetching registration.' });
  }
});

module.exports = router;
