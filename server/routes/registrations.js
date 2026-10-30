const queryColumns = require('../services/queryColumns');
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
const { normalizeInstagramHandle, validatePromoCode, calculateDiscount, normalizePromoCode } = require('../services/promo');

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
      eventId: requestedEventId, eventSlug, age,
      promoCode, promo_code
    } = req.body;

    // Check if user is authenticated via session
    const sessionUserId = req.session ? req.session.userId : null;
    let loggedInUser = null;
    if (sessionUserId) {
      loggedInUser = await get(`SELECT * FROM users WHERE id = ?`, [sessionUserId]);
    }

    if (loggedInUser && loggedInUser.is_blocked === 1) {
      if (req.session) {
        req.session.userId = null;
        req.session.userEmail = null;
        req.session.userName = null;
      }
      return res.status(403).json({
        success: false,
        isBlocked: true,
        blockReason: loggedInUser.block_reason || null,
        error: `Your account has been blocked and cannot register for events: ${loggedInUser.block_reason || 'Please contact support@offstagecreators.in for assistance.'}`
      });
    }

    const effectiveName = (loggedInUser ? (fullName || loggedInUser.name) : fullName) || '';
    const effectivePhone = (loggedInUser ? (phone || loggedInUser.phone) : phone) || '';
    const effectiveEmail = (loggedInUser ? (email || loggedInUser.email) : email) || '';
    const effectiveCity = (loggedInUser ? (city || loggedInUser.city) : city) || '';
    const effectiveAge = loggedInUser ? (loggedInUser.age || (age ? parseInt(age, 10) : null)) : (age ? parseInt(age, 10) : null);
    const targetUserId = loggedInUser ? loggedInUser.id : null;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!effectiveName || typeof effectiveName !== 'string' || effectiveName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter a valid full name (minimum 2 characters).' });
    }

    const cleanPhone = normalizePhone(effectivePhone);
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Please provide a valid 10-digit phone/WhatsApp number.' });
    }

    const cleanEmail = String(effectiveEmail || '').trim().toLowerCase();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    // Block if email is associated with a blocked user account
    const userByEmail = await get(`SELECT id, is_blocked, block_reason FROM users WHERE email = ?`, [cleanEmail]);
    if (userByEmail && userByEmail.is_blocked === 1) {
      if (req.session) {
        req.session.userId = null;
        req.session.userEmail = null;
        req.session.userName = null;
      }
      return res.status(403).json({
        success: false,
        isBlocked: true,
        blockReason: userByEmail.block_reason || null,
        error: `This email address is associated with a blocked account: ${userByEmail.block_reason || 'Please contact support@offstagecreators.in for assistance.'}`
      });
    }

    const cleanCity = String(effectiveCity || 'New Delhi').trim();
    if (city !== undefined && (!cleanCity || cleanCity.length < 2)) {
      return res.status(400).json({ success: false, error: 'Please enter your city.' });
    }

    if (!category || typeof category !== 'string' || category.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please select a performance category.' });
    }

    if (!performanceTitle || performanceTitle.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter a title for your performance.' });
    }

    if (terms !== undefined && !terms) {
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
      const regProvider = targetEvent.registration_provider || 'internal';
      if (regProvider === 'disabled') {
        return res.status(403).json({ success: false, error: 'Registration is currently disabled for this event.' });
      }
      if (regProvider === 'external') {
        return res.status(400).json({
          success: false,
          isExternal: true,
          externalUrl: targetEvent.external_registration_url || '',
          platformName: targetEvent.external_platform_name || 'External Platform',
          error: `Registrations for this event are handled via ${targetEvent.external_platform_name || 'an external platform'}. Please use the official link: ${targetEvent.external_registration_url || ''}`
        });
      }

      const normStatus = String(targetEvent.status || '').toLowerCase().replace(/[\s_-]+/g, '');
      const isStatusOpen = normStatus === 'registrationopen' || normStatus === 'open';
      const isStatusClosed = ['registrationclosed', 'eventcompleted', 'archived', 'draft'].includes(normStatus);

      if ((!isStatusOpen && !targetEvent.reg_enabled) || isStatusClosed) {
        if (normStatus === 'eventcompleted') {
          return res.status(403).json({ success: false, error: 'This event has concluded. Registrations are closed.' });
        }
        if (normStatus === 'draft') {
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

    const incomingPromo = (promoCode || promo_code || '').trim();

    // ── Instagram Handle Normalization ─────────────────────────────────────────
    const rawInstagram = instagram !== undefined ? instagram : (loggedInUser ? loggedInUser.instagram : '');
    const cleanInstagram = normalizeInstagramHandle(rawInstagram);
    if (loggedInUser && !loggedInUser.instagram && cleanInstagram) {
      await run(`UPDATE users SET instagram = ? WHERE id = ?`, [cleanInstagram, loggedInUser.id]).catch(() => {});
    }

    // ── Validate Promo Code & Calculate Fee ───────────────────────────────────
    let promoValidation = null;
    let originalFee = eventAmount;
    let discountAmount = 0;
    let finalFee = eventAmount;
    let appliedPromo = null;

    if (incomingPromo) {
      promoValidation = await validatePromoCode({
        code: incomingPromo,
        eventSlug: eventId,
        email: cleanEmail,
        userId: targetUserId,
        currentRegId: null
      });

      if (!promoValidation.valid) {
        return res.status(400).json({ success: false, error: promoValidation.error });
      }

      appliedPromo = promoValidation.promo;
      const discountCalc = calculateDiscount(appliedPromo, originalFee);
      originalFee = discountCalc.originalFee;
      discountAmount = discountCalc.discountAmount;
      finalFee = discountCalc.finalFee;
    }

    const appliedPromoCode = appliedPromo ? appliedPromo.code : null;
    const appliedPromoId = appliedPromo ? appliedPromo.id : null;
    const appliedReferrer = appliedPromo ? (appliedPromo.assigned_person || null) : null;

    const cleanFullName = effectiveName.trim();
    const cleanCategory = category.trim();
    const cleanTitle = performanceTitle.trim();
    const cleanDesc = (performanceDescription || '').trim();
    const now = new Date().toISOString();

    // ── Duplicate check ───────────────────────────────────────────────────────
    // Block if already APPROVED or VERIFIED for this email/user and this event
    const existing = await get(
      `SELECT ${queryColumns.registration} FROM registrations WHERE event_id = ? AND (email = ? ${targetUserId ? 'OR user_id = ?' : ''}) AND reg_status IN ('APPROVED', 'VERIFIED') ORDER BY id DESC LIMIT 1`,
      targetUserId ? [eventId, cleanEmail, targetUserId] : [eventId, cleanEmail]
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

    if (loggedInUser) {
      // Returning user flow: already authenticated with verified account
      const requestedRegId = (req.body.registrationId || '').trim().toUpperCase();
      let pendingOrExisting = null;
      if (requestedRegId) {
        pendingOrExisting = await get(
          `SELECT ${queryColumns.registration} FROM registrations WHERE registration_id = ? AND (user_id = ? OR email = ?)`,
          [requestedRegId, targetUserId, cleanEmail]
        );
      }

      const isFree = finalFee === 0;
      const finalRegStatus = isFree ? 'APPROVED' : 'VERIFIED';
      const finalPaymentStatus = isFree ? 'PAID' : 'PENDING';
      const finalPaymentVerifiedBy = isFree ? 'PROMO_FREE' : null;
      const finalApprovedAt = isFree ? now : null;
      const finalApprovedBy = isFree ? 'AUTO_PROMO_FREE' : null;

      if (pendingOrExisting && pendingOrExisting.reg_status !== 'APPROVED' && !pendingOrExisting.transaction_id) {
        regId = pendingOrExisting.registration_id;
        await run(
          `UPDATE registrations SET
             full_name = ?, phone = ?, city = ?, category = ?,
             instagram = ?, performance_title = ?, performance_description = ?,
             amount = ?, original_fee = ?, discount_amount = ?, final_fee = ?,
             promo_code = ?, promo_code_id = ?, referrer_name = ?,
             user_id = ?, age = ?, otp_verified = 1,
             reg_status = ?, payment_status = ?, payment_verified_by = ?,
             approved_at = ?, approved_by = ?, updated_at = ?
           WHERE id = ?`,
          [
            cleanFullName, cleanPhone, cleanCity, cleanCategory,
            cleanInstagram, cleanTitle, cleanDesc,
            finalFee, originalFee, discountAmount, finalFee,
            appliedPromoCode, appliedPromoId, appliedReferrer,
            targetUserId, effectiveAge,
            finalRegStatus, finalPaymentStatus, finalPaymentVerifiedBy,
            finalApprovedAt, finalApprovedBy, now,
            pendingOrExisting.id
          ]
        );
      } else {
        regId = generateRegistrationId();
        await run(
          `INSERT INTO registrations (
             registration_id, event_id, full_name, phone, email, city,
             category, instagram, performance_title, performance_description,
             amount, original_fee, discount_amount, final_fee,
             promo_code, promo_code_id, referrer_name,
             otp_verified, reg_status, payment_status, payment_verified_by,
             approved_at, approved_by, checked_in, certificate_eligible,
             user_id, age, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            regId, eventId, cleanFullName, cleanPhone, cleanEmail, cleanCity,
            cleanCategory, cleanInstagram, cleanTitle, cleanDesc,
            finalFee, originalFee, discountAmount, finalFee,
            appliedPromoCode, appliedPromoId, appliedReferrer,
            1, finalRegStatus, finalPaymentStatus, finalPaymentVerifiedBy,
            finalApprovedAt, finalApprovedBy, 0, 0,
            targetUserId, effectiveAge, now, now
          ]
        );
      }

      if (isFree) {
        try {
          await emailService.sendApprovalEmail({
            registrationId: regId,
            email: cleanEmail,
            name: cleanFullName,
            event: {
              title: targetEvent?.title || config.EVENT.title,
              date: targetEvent?.event_date || config.EVENT.date,
              time: targetEvent?.start_time ? (targetEvent?.end_time ? `${targetEvent.start_time} – ${targetEvent.end_time}` : targetEvent.start_time) : config.EVENT.time,
              venue: targetEvent?.venue_name || 'Online (Google Meet)',
              meetLink: targetEvent?.meet_link || ''
            }
          });
          await run(`UPDATE registrations SET approval_email_sent_at = ? WHERE registration_id = ?`, [now, regId]).catch(() => {});
        } catch (e) {
          console.warn('[Registration] Could not send free approval email:', e.message);
        }
      }

      const verificationToken = otpService.generateVerificationToken(regId, cleanEmail);

      return res.status(201).json({
        success: true,
        skipOtp: true,
        isFree,
        message: isFree
          ? `Registration confirmed and approved for ${targetEvent?.title || 'event'}! (Free pass applied)`
          : `Registration created for ${targetEvent?.title || 'event'}. Please complete payment.`,
        registrationId: regId,
        email: cleanEmail,
        eventId,
        amount: finalFee,
        originalFee,
        discountAmount,
        finalFee,
        promoCode: appliedPromoCode,
        referrerName: appliedReferrer,
        verificationToken,
        status: finalRegStatus,
        registration: {
          registrationId: regId,
          eventId,
          fullName: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          amount: finalFee,
          originalFee,
          discountAmount,
          finalFee,
          promoCode: appliedPromoCode,
          referrerName: appliedReferrer,
          status: finalRegStatus
        }
      });
    }

    // Guest / New unauthenticated user flow: requires Email OTP verification
    const pending = await get(
      `SELECT ${queryColumns.registration} FROM registrations WHERE event_id = ? AND email = ? AND reg_status = 'PENDING_VERIFICATION' ORDER BY id DESC LIMIT 1`,
      [eventId, cleanEmail]
    );

    if (pending) {
      regId = pending.registration_id;
      await run(
        `UPDATE registrations SET
           full_name = ?, phone = ?, city = ?, category = ?,
           instagram = ?, performance_title = ?, performance_description = ?,
           amount = ?, original_fee = ?, discount_amount = ?, final_fee = ?,
           promo_code = ?, promo_code_id = ?, referrer_name = ?,
           age = ?, updated_at = ?
         WHERE id = ?`,
        [cleanFullName, cleanPhone, cleanCity, cleanCategory,
         cleanInstagram, cleanTitle, cleanDesc,
         finalFee, originalFee, discountAmount, finalFee,
         appliedPromoCode, appliedPromoId, appliedReferrer,
         effectiveAge, now, pending.id]
      );
    } else {
      regId = generateRegistrationId();
      await run(
        `INSERT INTO registrations (
           registration_id, event_id, full_name, phone, email, city,
           category, instagram, performance_title, performance_description,
           amount, original_fee, discount_amount, final_fee,
           promo_code, promo_code_id, referrer_name,
           otp_verified, reg_status, checked_in, certificate_eligible,
           age, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [regId, eventId, cleanFullName, cleanPhone, cleanEmail, cleanCity,
         cleanCategory, cleanInstagram, cleanTitle, cleanDesc,
         finalFee, originalFee, discountAmount, finalFee,
         appliedPromoCode, appliedPromoId, appliedReferrer,
         0, 'PENDING_VERIFICATION', 0, 0, effectiveAge, now, now]
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
        amount: finalFee,
        originalFee,
        discountAmount,
        finalFee,
        isFree: finalFee === 0,
        promoCode: appliedPromoCode,
        referrerName: appliedReferrer,
        expiresAt,
        expiryMinutes: config.OTP_EXPIRY_MINUTES,
        registration: {
          registrationId: regId,
          eventId,
          fullName: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          amount: finalFee,
          originalFee,
          discountAmount,
          finalFee,
          promoCode: appliedPromoCode,
          referrerName: appliedReferrer,
          status: 'PENDING_VERIFICATION'
        }
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
        amount: finalFee,
        originalFee,
        discountAmount,
        finalFee,
        isFree: finalFee === 0,
        promoCode: appliedPromoCode,
        referrerName: appliedReferrer,
        expiryMinutes: config.OTP_EXPIRY_MINUTES,
        registration: {
          registrationId: regId,
          eventId,
          fullName: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          amount: finalFee,
          originalFee,
          discountAmount,
          finalFee,
          promoCode: appliedPromoCode,
          referrerName: appliedReferrer,
          status: 'PENDING_VERIFICATION'
        }
      });
    }

  } catch (err) {
    console.error('[Registration] Error in POST /api/registrations:', err);
    return res.status(500).json({ success: false, error: 'Server error while creating registration.' });
  }
});

// ─── POST /api/registrations/validate-promo ──────────────────────────────────

router.post('/validate-promo', async (req, res) => {
  try {
    const rawCode = String(req.body.code || req.body.promoCode || '').trim();
    if (!rawCode) {
      return res.status(400).json({ success: false, valid: false, error: 'Please enter a promo code.' });
    }

    const eventSlug = (req.body.eventSlug || req.body.eventId || '').trim();
    let targetEvent = null;
    if (eventSlug) {
      targetEvent = await getEventBySlug(eventSlug);
    }
    if (!targetEvent) {
      targetEvent = await getActiveEvent();
    }

    const eventAmount = targetEvent && targetEvent.fee !== undefined ? Number(targetEvent.fee) : (config.OPEN_MIC_FEE_INR || 79);
    const email = (req.body.email || (req.session && req.session.userEmail) || '').trim().toLowerCase();
    const userId = (req.session && req.session.userId) || null;

    const validation = await validatePromoCode({
      code: rawCode,
      eventSlug: eventSlug || (targetEvent ? targetEvent.slug : null),
      email,
      userId
    });

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: validation.error
      });
    }

    const promo = validation.promo;
    const calc = calculateDiscount(promo, eventAmount);

    let message = 'Promo code applied!';
    if (promo.discount_type === 'none' || promo.discount_type === 'referral_only') {
      message = promo.assigned_person 
        ? `Referral code for ${promo.assigned_person} applied!` 
        : 'Referral code applied!';
    } else if (calc.isFree || calc.finalFee === 0) {
      message = '100% discount applied! Your registration is free.';
    } else if (promo.discount_type === 'percentage') {
      message = `${promo.discount_value}% discount applied! You save ₹${calc.discountAmount}.`;
    } else if (promo.discount_type === 'fixed') {
      message = `₹${calc.discountAmount} discount applied!`;
    }

    return res.json({
      success: true,
      valid: true,
      code: promo.code,
      assignedPerson: promo.assigned_person || null,
      referrerName: promo.assigned_person || null,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      originalFee: calc.originalFee,
      discountAmount: calc.discountAmount,
      finalFee: calc.finalFee,
      isFree: calc.finalFee === 0,
      calculation: calc,
      promo: {
        code: promo.code,
        assignedPerson: promo.assigned_person || null,
        referrerName: promo.assigned_person || null,
        discountType: promo.discount_type,
        discountValue: promo.discount_value
      },
      message
    });

  } catch (err) {
    console.error('[Registration] Error validating promo:', err);
    return res.status(500).json({ success: false, valid: false, error: 'Failed to validate promo code.' });
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
      `SELECT ${queryColumns.registration} FROM registrations WHERE registration_id = ?`,
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
        promoCode: record.promo_code || null,
        referrerName: record.referrer_name || null,
        originalFee: record.original_fee !== undefined && record.original_fee !== null ? Number(record.original_fee) : Number(record.amount ?? 79),
        discountAmount: record.discount_amount !== undefined && record.discount_amount !== null ? Number(record.discount_amount) : 0,
        finalFee: record.final_fee !== undefined && record.final_fee !== null ? Number(record.final_fee) : Number(record.amount ?? 79),
        isFree: Number(record.final_fee !== undefined && record.final_fee !== null ? record.final_fee : record.amount) === 0,
        paymentStatus: record.payment_status || (record.reg_status === 'APPROVED' ? 'PAID' : 'PENDING'),
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
