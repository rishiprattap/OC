/**
 * Offstage Creators — User Profile & History Routes
 * Protected routes for viewing/editing user profile and viewing registrations & payment status.
 */
const express = require('express');
const router = express.Router();
const { run, get, all, getEventBySlug, getActiveEvent } = require('../db');
const { requireUser, sanitizeUser } = require('./auth');
const config = require('../config');

// Protect all routes in this router
router.use(requireUser);

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// ─── GET /api/user/profile ────────────────────────────────────────────────────

router.get('/profile', async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.session.userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User profile not found.' });
    }

    return res.json({
      success: true,
      user: sanitizeUser(user)
    });

  } catch (err) {
    console.error('[User] Error in GET /profile:', err);
    return res.status(500).json({ success: false, error: 'Server error retrieving profile.' });
  }
});

// ─── PUT /api/user/profile ────────────────────────────────────────────────────

router.put('/profile', async (req, res) => {
  try {
    const { name, phone, age, city } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter a valid full name (minimum 2 characters).' });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Please provide a valid 10-digit phone number.' });
    }

    const numAge = parseInt(age, 10);
    if (isNaN(numAge) || numAge < 5 || numAge > 120) {
      return res.status(400).json({ success: false, error: 'Please enter a valid age between 5 and 120.' });
    }

    if (!city || typeof city !== 'string' || city.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Please enter your city (minimum 2 characters).' });
    }

    const cleanName = name.trim();
    const cleanCity = city.trim();
    const now = new Date().toISOString();

    await run(
      `UPDATE users SET name = ?, phone = ?, age = ?, city = ?, updated_at = ? WHERE id = ?`,
      [cleanName, cleanPhone, numAge, cleanCity, now, req.session.userId]
    );

    req.session.userName = cleanName;

    const updatedUser = await get(`SELECT * FROM users WHERE id = ?`, [req.session.userId]);

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: sanitizeUser(updatedUser)
    });

  } catch (err) {
    console.error('[User] Error in PUT /profile:', err);
    return res.status(500).json({ success: false, error: 'Server error updating profile.' });
  }
});

// ─── GET /api/user/registrations ──────────────────────────────────────────────

router.get('/registrations', async (req, res) => {
  try {
    const user = await get(`SELECT * FROM users WHERE id = ?`, [req.session.userId]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Fetch user registrations (including any historical registrations matching verified email)
    const records = await all(
      `SELECT * FROM registrations WHERE (user_id = ? OR (user_id IS NULL AND email = ?)) ORDER BY id DESC`,
      [user.id, user.email]
    );

    // Enrich registrations with event information
    const enriched = await Promise.all(records.map(async (reg) => {
      let eventDetails = {
        title: config.EVENT.title,
        name: config.EVENT.title,
        date: config.EVENT.date,
        time: config.EVENT.time,
        venue: 'Online (Google Meet)',
        slug: config.EVENT.id
      };

      if (reg.event_id) {
        try {
          const evt = await getEventBySlug(reg.event_id);
          if (evt) {
            eventDetails = {
              title: evt.title || evt.name,
              name: evt.name || evt.title,
              date: evt.event_date || config.EVENT.date,
              time: evt.start_time ? (evt.end_time ? `${evt.start_time} – ${evt.end_time}` : evt.start_time) : config.EVENT.time,
              venue: evt.venue_name || 'Online (Google Meet)',
              slug: evt.slug
            };
          }
        } catch (_) {}
      }

      // Format payment status and confirmation status
      const isConfirmed = reg.reg_status === 'APPROVED' || reg.payment_status === 'PAID';
      const isRejected = reg.reg_status === 'REJECTED';
      const isPendingPayment = !reg.transaction_id && !reg.payment_screenshot_url;
      const isSubmitted = !isConfirmed && !isRejected && (reg.transaction_id || reg.payment_status === 'SUBMITTED');

      let displayStatus = 'PENDING';
      let statusLabel = 'Pending Email Verification';

      if (isConfirmed) {
        displayStatus = 'CONFIRMED';
        statusLabel = 'Confirmed & Approved';
      } else if (isRejected) {
        displayStatus = 'REJECTED';
        statusLabel = 'Registration Rejected';
      } else if (isSubmitted) {
        displayStatus = 'PAYMENT_SUBMITTED';
        statusLabel = 'Payment Submitted — Pending Verification';
      } else if (reg.otp_verified === 1 || reg.reg_status === 'VERIFIED') {
        displayStatus = 'VERIFIED';
        statusLabel = 'Email Verified — Payment Pending';
      }

      return {
        id: reg.id,
        registrationId: reg.registration_id,
        eventId: reg.event_id,
        event: eventDetails,
        fullName: reg.full_name,
        phone: reg.phone,
        email: reg.email,
        city: reg.city,
        age: reg.age || user.age,
        category: reg.category,
        instagram: reg.instagram,
        performanceTitle: reg.performance_title,
        performanceDescription: reg.performance_description,
        amount: reg.amount,
        regStatus: reg.reg_status,
        status: reg.reg_status,
        eventTitle: eventDetails.title || eventDetails.name,
        paymentStatus: reg.payment_status || (isConfirmed ? 'PAID' : (isSubmitted ? 'SUBMITTED' : 'PENDING')),
        transactionId: reg.transaction_id || null,
        paymentScreenshotUrl: reg.payment_screenshot_url || null,
        paymentSubmittedAt: reg.payment_submitted_at || null,
        paymentVerifiedAt: reg.payment_verified_at || null,
        checkedIn: Boolean(reg.checked_in),
        approvedAt: reg.approved_at || null,
        rejectedAt: reg.rejected_at || null,
        rejectedReason: reg.rejected_reason || null,
        certificateEligible: Boolean(reg.certificate_eligible),
        displayStatus,
        statusLabel,
        isConfirmed,
        passUrl: `/registration/${reg.registration_id}`,
        createdAt: reg.created_at,
        updatedAt: reg.updated_at
      };
    }));

    return res.json({
      success: true,
      registrations: enriched
    });

  } catch (err) {
    console.error('[User] Error in GET /registrations:', err);
    return res.status(500).json({ success: false, error: 'Server error retrieving registrations.' });
  }
});

module.exports = router;
