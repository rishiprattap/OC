/**
 * Offstage Creators — Admin Events Management Routes
 * Handles creating, updating, duplicating, activating, and deleting events.
 */
const express = require('express');
const router = express.Router();
const { run, get, all, getEventBySlug } = require('../db');
const config = require('../config');

// Middleware to ensure admin auth
function requireAdmin(req, res, next) {
  const secretHeader = (req.headers['x-admin-secret'] || req.headers['x-admin-key'] || '').trim();
  const expectedSecret = (config.ADMIN_SECRET || '').trim();
  const passwordHeader = (req.headers['x-admin-password'] || '').trim();
  const expectedPassword = (config.ADMIN_PASSWORD || '').trim();

  const isSecretMatch = (expectedSecret && secretHeader === expectedSecret) ||
                        (expectedPassword && (secretHeader === expectedPassword || passwordHeader === expectedPassword));

  if ((req.session && req.session.adminAuthenticated) || isSecretMatch) {
    if (!req.session) req.session = {};
    if (!req.session.adminAuthenticated) {
      req.session.adminAuthenticated = true;
      req.session.adminEmail = config.ADMIN_EMAIL || 'admin@offstagecreators.com';
    }
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Please log in as admin.' });
}

router.use(requireAdmin);

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// GET /api/admin/events — List all events with registration count & breakdown
router.get('/', async (req, res) => {
  try {
    const events = await all(`SELECT * FROM events ORDER BY is_active DESC, id DESC`);
    
    // Attach registration counts for each event
    const results = await Promise.all(events.map(async (evt) => {
      const [totalReg, pendingReg, approvedReg] = await Promise.all([
        get(`SELECT COUNT(*) as c FROM registrations WHERE event_id = ?`, [evt.slug]),
        get(`SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND reg_status = 'PENDING_VERIFICATION'`, [evt.slug]),
        get(`SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND reg_status = 'APPROVED'`, [evt.slug])
      ]);

      let allowedCategories = [];
      try {
        allowedCategories = typeof evt.allowed_categories === 'string'
          ? JSON.parse(evt.allowed_categories)
          : (evt.allowed_categories || []);
      } catch (_) {}

      return {
        id: evt.id,
        slug: evt.slug,
        name: evt.name,
        title: evt.title,
        subtitle: evt.subtitle || '',
        description: evt.description || '',
        shortDescription: evt.short_description || '',
        eventType: evt.event_type || 'ONLINE',
        status: evt.status,
        isActive: Boolean(evt.is_active),
        isPublished: Boolean(evt.is_published),
        eventDate: evt.event_date || '',
        startTime: evt.start_time || '',
        endTime: evt.end_time || '',
        timezone: evt.timezone || 'IST (GMT+5:30)',
        venueName: evt.venue_name || '',
        venueAddress: evt.venue_address || '',
        city: evt.city || '',
        state: evt.state || '',
        fee: Number(evt.fee || 79),
        currency: evt.currency || 'INR',
        upiId: evt.upi_id || 'preetiyadav15071985@okaxis',
        posterUrl: evt.poster_url || '/assets/event-poster.png',
        bannerUrl: evt.banner_url || '',
        regEnabled: Boolean(evt.reg_enabled),
        regButtonText: evt.reg_button_text || 'REGISTER AS PERFORMER',
        maxRegistrations: Number(evt.max_registrations || 0),
        allowedCategories,
        stats: {
          total: totalReg?.c || 0,
          pending: pendingReg?.c || 0,
          approved: approvedReg?.c || 0
        },
        createdAt: evt.created_at,
        updatedAt: evt.updated_at
      };
    }));

    return res.json({ success: true, count: results.length, events: results });
  } catch (err) {
    console.error('[Admin Events] List error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load events.' });
  }
});

// GET /api/admin/events/:slug — Get full event details for admin editing
router.get('/:slug', async (req, res) => {
  try {
    const evt = await getEventBySlug(req.params.slug);
    if (!evt) return res.status(404).json({ success: false, error: 'Event not found.' });

    let allowedCategories = [];
    try {
      allowedCategories = typeof evt.allowed_categories === 'string'
        ? JSON.parse(evt.allowed_categories)
        : (evt.allowed_categories || []);
    } catch (_) {}

    let pricingTiers = [];
    try {
      pricingTiers = typeof evt.pricing_tiers === 'string'
        ? JSON.parse(evt.pricing_tiers)
        : (evt.pricing_tiers || []);
    } catch (_) {}

    let otherLinks = {};
    try {
      otherLinks = typeof evt.other_links === 'string'
        ? JSON.parse(evt.other_links)
        : (evt.other_links || {});
    } catch (_) {}

    const [totalReg, approvedReg] = await Promise.all([
      get(`SELECT COUNT(*) as c FROM registrations WHERE event_id = ?`, [evt.slug]),
      get(`SELECT COUNT(*) as c FROM registrations WHERE event_id = ? AND reg_status = 'APPROVED'`, [evt.slug])
    ]);

    return res.json({
      success: true,
      event: {
        ...evt,
        venue: evt.venue_name || '',
        venueName: evt.venue_name || '',
        venueAddress: evt.venue_address || '',
        date: evt.event_date || '',
        eventDate: evt.event_date || '',
        time: evt.start_time ? (evt.end_time ? `${evt.start_time} – ${evt.end_time}` : evt.start_time) : (evt.time || ''),
        fee: Number(evt.fee !== undefined ? evt.fee : 79),
        isActive: evt.is_active === 1 ? 1 : 0,
        isPublished: Boolean(evt.is_published),
        isPaid: Boolean(evt.is_paid),
        regEnabled: Boolean(evt.reg_enabled),
        isRegistrationOpen: Boolean(evt.reg_enabled),
        certificateEnabled: Boolean(evt.certificate_enabled),
        allowedCategories,
        pricingTiers,
        otherLinks,
        stats: {
          total: totalReg?.c || 0,
          approved: approvedReg?.c || 0
        }
      }
    });
  } catch (err) {
    console.error('[Admin Events] Detail error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load event details.' });
  }
});

// POST /api/admin/events — Create a new event from admin panel
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.title) {
      return res.status(400).json({ success: false, error: 'Event name and title are required.' });
    }

    let slug = slugify(b.slug || b.name);
    if (!slug) slug = 'open-mic-' + Date.now();

    // Check slug collision
    const existing = await get(`SELECT id FROM events WHERE lower(slug) = ?`, [slug.toLowerCase()]);
    if (existing) {
      slug = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const now = new Date().toISOString();
    const categoriesJson = typeof b.allowedCategories === 'string'
      ? b.allowedCategories
      : JSON.stringify(b.allowedCategories || ['Poetry & Spoken Word', 'Storytelling & Monologue', 'Stand-up Comedy', 'Music & Vocals']);
    
    const pricingTiersJson = typeof b.pricingTiers === 'string'
      ? b.pricingTiers
      : JSON.stringify(b.pricingTiers || []);

    const otherLinksJson = typeof b.otherLinks === 'string'
      ? b.otherLinks
      : JSON.stringify(b.otherLinks || {});

    const isActive = (b.isActive || b.is_active) ? 1 : 0;
    if (isActive) {
      // Unset all other active events first
      await run(`UPDATE events SET is_active = 0`);
    }

    const venueName = (b.venueName || b.venue || '').trim();
    const venueAddress = (b.venueAddress || b.address || '').trim();
    const eventDate = (b.eventDate || b.date || '').trim();
    const startTime = (b.startTime || b.time || '').trim();
    const endTime = (b.endTime || '').trim();
    const posterUrl = (b.posterUrl || b.poster || '/assets/event-poster.png').trim();
    const fee = b.fee !== undefined ? Number(b.fee) : 79;
    const status = b.status || (isActive ? 'Registration Open' : 'Draft');
    const regEnabled = b.regEnabled !== undefined ? (b.regEnabled ? 1 : 0) : (b.isRegistrationOpen !== undefined ? (b.isRegistrationOpen ? 1 : 0) : 1);

    await run(
      `INSERT INTO events (
        slug, name, title, subtitle, description, short_description,
        event_type, status, is_active, is_published,
        event_date, start_time, end_time, timezone,
        reg_open_date, reg_close_date, venue_name, venue_address,
        city, state, maps_url, venue_image_url,
        is_paid, fee, currency, pricing_tiers, early_bird_fee,
        upi_id, payee_name, qr_asset_path, payment_instructions,
        poster_url, banner_url, logo_url, promo_video_url,
        reg_enabled, reg_button_text, max_registrations, confirmation_message,
        allowed_categories, contact_email, contact_phone,
        instagram_url, youtube_url, whatsapp_url, meet_link, other_links,
        certificate_enabled, certificate_title, certificate_bg_url,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )`,
      [
        slug, b.name.trim(), b.title.trim(), b.subtitle || '', b.description || '', b.shortDescription || '',
        b.eventType || 'ONLINE', status, isActive, b.isPublished !== undefined ? (b.isPublished ? 1 : 0) : 1,
        eventDate, startTime, endTime, b.timezone || 'IST (GMT+5:30)',
        b.regOpenDate || '', b.regCloseDate || '', venueName, venueAddress,
        b.city || '', b.state || '', b.mapsUrl || '', b.venueImageUrl || '',
        b.isPaid !== undefined ? (b.isPaid ? 1 : 0) : 1, fee, b.currency || 'INR', pricingTiersJson, b.earlyBirdFee ? Number(b.earlyBirdFee) : null,
        b.upiId || 'preetiyadav15071985@okaxis', b.payeeName || 'Preeti Yadav / Offstage Creators', b.qrAssetPath || '/assets/payment-qr.jpeg',
        b.paymentInstructions || 'Pay registration fee via UPI and upload proof.',
        posterUrl, b.bannerUrl || posterUrl, b.logoUrl || '/assets/logo.png', b.promoVideoUrl || '',
        regEnabled, b.regButtonText || 'REGISTER AS PERFORMER', Number(b.maxRegistrations || 0), b.confirmationMessage || 'Thank you for registering!',
        categoriesJson, b.contactEmail || 'offstagecreators77@gmail.com', b.contactPhone || '',
        b.instagramUrl || 'https://www.instagram.com/offstagecreators/', b.youtubeUrl || '', b.whatsappUrl || '', b.meetLink || '', otherLinksJson,
        b.certificateEnabled !== undefined ? (b.certificateEnabled ? 1 : 0) : 1, b.certificateTitle || 'CERTIFICATE OF PARTICIPATION', b.certificateBgUrl || '',
        now, now
      ]
    );

    const created = await getEventBySlug(slug);
    return res.status(201).json({
      success: true,
      message: 'Event created successfully.',
      event: created
    });

  } catch (err) {
    console.error('[Admin Events] Create error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create event.' });
  }
});

// PUT /api/admin/events/:slug — Update event configuration
router.put('/:slug', async (req, res) => {
  try {
    const existing = await getEventBySlug(req.params.slug);
    if (!existing) return res.status(404).json({ success: false, error: 'Event not found.' });

    const b = req.body;
    const now = new Date().toISOString();

    const categoriesJson = typeof b.allowedCategories === 'string'
      ? b.allowedCategories
      : (b.allowedCategories ? JSON.stringify(b.allowedCategories) : existing.allowed_categories);
    
    const pricingTiersJson = typeof b.pricingTiers === 'string'
      ? b.pricingTiers
      : (b.pricingTiers ? JSON.stringify(b.pricingTiers) : existing.pricing_tiers);

    const otherLinksJson = typeof b.otherLinks === 'string'
      ? b.otherLinks
      : (b.otherLinks ? JSON.stringify(b.otherLinks) : existing.other_links);

    const isActive = b.isActive !== undefined ? (b.isActive ? 1 : 0) : (b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active);
    if (isActive && existing.is_active !== 1) {
      await run(`UPDATE events SET is_active = 0`);
    }

    const venueName = b.venueName !== undefined ? b.venueName : (b.venue !== undefined ? b.venue : existing.venue_name);
    const venueAddress = b.venueAddress !== undefined ? b.venueAddress : (b.address !== undefined ? b.address : existing.venue_address);
    const eventDate = b.eventDate !== undefined ? b.eventDate : (b.date !== undefined ? b.date : existing.event_date);
    const startTime = b.startTime !== undefined ? b.startTime : (b.time !== undefined ? b.time : existing.start_time);
    const endTime = b.endTime !== undefined ? b.endTime : existing.end_time;
    const posterUrl = b.posterUrl !== undefined ? b.posterUrl : (b.poster !== undefined ? b.poster : existing.poster_url);
    const fee = b.fee !== undefined ? Number(b.fee) : existing.fee;
    const status = b.status !== undefined ? b.status : existing.status;
    const regEnabled = b.regEnabled !== undefined ? (b.regEnabled ? 1 : 0) : (b.isRegistrationOpen !== undefined ? (b.isRegistrationOpen ? 1 : 0) : existing.reg_enabled);

    await run(
      `UPDATE events SET
        name = ?, title = ?, subtitle = ?, description = ?, short_description = ?,
        event_type = ?, status = ?, is_active = ?, is_published = ?,
        event_date = ?, start_time = ?, end_time = ?, timezone = ?,
        reg_open_date = ?, reg_close_date = ?, venue_name = ?, venue_address = ?,
        city = ?, state = ?, maps_url = ?, venue_image_url = ?,
        is_paid = ?, fee = ?, currency = ?, pricing_tiers = ?, early_bird_fee = ?,
        upi_id = ?, payee_name = ?, qr_asset_path = ?, payment_instructions = ?,
        poster_url = ?, banner_url = ?, logo_url = ?, promo_video_url = ?,
        reg_enabled = ?, reg_button_text = ?, max_registrations = ?, confirmation_message = ?,
        allowed_categories = ?, contact_email = ?, contact_phone = ?,
        instagram_url = ?, youtube_url = ?, whatsapp_url = ?, meet_link = ?, other_links = ?,
        certificate_enabled = ?, certificate_title = ?, certificate_bg_url = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        b.name !== undefined ? b.name.trim() : existing.name,
        b.title !== undefined ? b.title.trim() : existing.title,
        b.subtitle !== undefined ? b.subtitle : existing.subtitle,
        b.description !== undefined ? b.description : existing.description,
        b.shortDescription !== undefined ? b.shortDescription : existing.short_description,
        b.eventType !== undefined ? b.eventType : existing.event_type,
        status,
        isActive,
        b.isPublished !== undefined ? (b.isPublished ? 1 : 0) : existing.is_published,
        eventDate,
        startTime,
        endTime,
        b.timezone !== undefined ? b.timezone : existing.timezone,
        b.regOpenDate !== undefined ? b.regOpenDate : existing.reg_open_date,
        b.regCloseDate !== undefined ? b.regCloseDate : existing.reg_close_date,
        venueName,
        venueAddress,
        b.city !== undefined ? b.city : existing.city,
        b.state !== undefined ? b.state : existing.state,
        b.mapsUrl !== undefined ? b.mapsUrl : existing.maps_url,
        b.venueImageUrl !== undefined ? b.venueImageUrl : existing.venue_image_url,
        b.isPaid !== undefined ? (b.isPaid ? 1 : 0) : existing.is_paid,
        fee,
        b.currency !== undefined ? b.currency : existing.currency,
        pricingTiersJson,
        b.earlyBirdFee !== undefined ? (b.earlyBirdFee ? Number(b.earlyBirdFee) : null) : existing.early_bird_fee,
        b.upiId !== undefined ? b.upiId : existing.upi_id,
        b.payeeName !== undefined ? b.payeeName : existing.payee_name,
        b.qrAssetPath !== undefined ? b.qrAssetPath : existing.qr_asset_path,
        b.paymentInstructions !== undefined ? b.paymentInstructions : existing.payment_instructions,
        posterUrl,
        b.bannerUrl !== undefined ? b.bannerUrl : existing.banner_url,
        b.logoUrl !== undefined ? b.logoUrl : existing.logo_url,
        b.promoVideoUrl !== undefined ? b.promoVideoUrl : existing.promo_video_url,
        regEnabled,
        b.regButtonText !== undefined ? b.regButtonText : existing.reg_button_text,
        b.maxRegistrations !== undefined ? Number(b.maxRegistrations) : existing.max_registrations,
        b.confirmationMessage !== undefined ? b.confirmationMessage : existing.confirmation_message,
        categoriesJson,
        b.contactEmail !== undefined ? b.contactEmail : existing.contact_email,
        b.contactPhone !== undefined ? b.contactPhone : existing.contact_phone,
        b.instagramUrl !== undefined ? b.instagramUrl : existing.instagram_url,
        b.youtubeUrl !== undefined ? b.youtubeUrl : existing.youtube_url,
        b.whatsappUrl !== undefined ? b.whatsappUrl : existing.whatsapp_url,
        b.meetLink !== undefined ? b.meetLink : existing.meet_link,
        otherLinksJson,
        b.certificateEnabled !== undefined ? (b.certificateEnabled ? 1 : 0) : existing.certificate_enabled,
        b.certificateTitle !== undefined ? b.certificateTitle : existing.certificate_title,
        b.certificateBgUrl !== undefined ? b.certificateBgUrl : existing.certificate_bg_url,
        now,
        existing.id
      ]
    );

    const updated = await getEventBySlug(existing.slug);
    return res.json({ success: true, message: 'Event updated successfully.', event: updated });
  } catch (err) {
    console.error('[Admin Events] Update error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update event.' });
  }
});

// POST /api/admin/events/:slug/duplicate — Duplicate event as template (Requirement 12)
router.post('/:slug/duplicate', async (req, res) => {
  try {
    const src = await getEventBySlug(req.params.slug);
    if (!src) return res.status(404).json({ success: false, error: 'Source event not found.' });

    const newName = (req.body.name || req.body.newName || `${src.name} (Copy)`).trim();
    const newTitle = (req.body.title || req.body.newTitle || `${src.title} (New Edition)`).trim();
    let newSlug = slugify(req.body.slug || req.body.newSlug || newName);
    if (!newSlug) newSlug = 'open-mic-' + Date.now();
    const newDate = (req.body.eventDate || req.body.newDate || req.body.date || src.event_date || '').trim();

    // Check collision
    const existing = await get(`SELECT id FROM events WHERE lower(slug) = ?`, [newSlug.toLowerCase()]);
    if (existing) {
      newSlug = `${newSlug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const now = new Date().toISOString();

    // Copies all configurable settings, but status is 'draft', is_active is 0,
    // and DOES NOT copy any registrations, payments, or certificates!
    await run(
      `INSERT INTO events (
        slug, name, title, subtitle, description, short_description,
        event_type, status, is_active, is_published,
        event_date, start_time, end_time, timezone,
        reg_open_date, reg_close_date, venue_name, venue_address,
        city, state, maps_url, venue_image_url,
        is_paid, fee, currency, pricing_tiers, early_bird_fee,
        upi_id, payee_name, qr_asset_path, payment_instructions,
        poster_url, banner_url, logo_url, promo_video_url,
        reg_enabled, reg_button_text, max_registrations, confirmation_message,
        allowed_categories, contact_email, contact_phone,
        instagram_url, youtube_url, whatsapp_url, meet_link, other_links,
        certificate_enabled, certificate_title, certificate_bg_url,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, 'draft', 0, 1,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )`,
      [
        newSlug, newName, newTitle, src.subtitle || '', src.description || '', src.short_description || '',
        src.event_type || 'ONLINE',
        newDate, src.start_time || '', src.end_time || '', src.timezone || 'IST (GMT+5:30)',
        '', '', src.venue_name || '', src.venue_address || '',
        src.city || '', src.state || '', src.maps_url || '', src.venue_image_url || '',
        src.is_paid, src.fee, src.currency, src.pricing_tiers, src.early_bird_fee,
        src.upi_id, src.payee_name, src.qr_asset_path, src.payment_instructions,
        src.poster_url, src.banner_url, src.logo_url, src.promo_video_url,
        1, src.reg_button_text || 'REGISTER AS PERFORMER', src.max_registrations || 0, src.confirmation_message || '',
        src.allowed_categories, src.contact_email, src.contact_phone,
        src.instagram_url, src.youtube_url, src.whatsapp_url, src.meet_link, src.other_links,
        src.certificate_enabled, src.certificate_title, src.certificate_bg_url,
        now, now
      ]
    );

    const duplicated = await getEventBySlug(newSlug);
    return res.status(201).json({
      success: true,
      message: `Event duplicated successfully as "${newName}". Registrations and participant records were NOT copied.`,
      event: duplicated
    });

  } catch (err) {
    console.error('[Admin Events] Duplicate error:', err);
    return res.status(500).json({ success: false, error: 'Failed to duplicate event.' });
  }
});

// POST /api/admin/events/:slug/set-active — Mark event as active for homepage
router.post('/:slug/set-active', async (req, res) => {
  try {
    const evt = await getEventBySlug(req.params.slug);
    if (!evt) return res.status(404).json({ success: false, error: 'Event not found.' });

    await run(`UPDATE events SET is_active = 0`);
    await run(`UPDATE events SET is_active = 1, updated_at = ? WHERE id = ?`, [new Date().toISOString(), evt.id]);

    return res.json({
      success: true,
      message: `"${evt.name}" is now the active event on the website.`,
      activeSlug: evt.slug
    });
  } catch (err) {
    console.error('[Admin Events] Set active error:', err);
    return res.status(500).json({ success: false, error: 'Failed to set active event.' });
  }
});

// POST /api/admin/events/:slug/status — Update status
router.post('/:slug/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required.' });
    }

    const evt = await getEventBySlug(req.params.slug);
    if (!evt) return res.status(404).json({ success: false, error: 'Event not found.' });

    await run(`UPDATE events SET status = ?, updated_at = ? WHERE id = ?`, [status, new Date().toISOString(), evt.id]);

    return res.json({ success: true, message: `Status updated to ${status}.`, status });
  } catch (err) {
    console.error('[Admin Events] Status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update event status.' });
  }
});

// DELETE /api/admin/events/:slug — Delete event with safety checks
router.post('/:slug/delete', async (req, res) => {
  try {
    const evt = await getEventBySlug(req.params.slug);
    if (!evt) return res.status(404).json({ success: false, error: 'Event not found.' });

    const { confirmName, force } = req.body;

    // Check if registrations exist
    const regCountRow = await get(`SELECT COUNT(*) as c FROM registrations WHERE event_id = ?`, [evt.slug]);
    const regCount = regCountRow?.c || 0;

    if (regCount > 0 && !force) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete event: ${regCount} participant registrations belong to this event. Archive it instead, or confirm deletion with force=true and confirmName matching the event title.`,
        hasRegistrations: true,
        regCount
      });
    }

    if (confirmName && confirmName.trim().toLowerCase() !== evt.name.trim().toLowerCase() && confirmName.trim().toLowerCase() !== evt.title.trim().toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Confirmation name does not match event name.' });
    }

    // Do NOT delete participant registrations unless explicitly asked
    if (req.body.deleteRegistrations) {
      await run(`DELETE FROM registrations WHERE event_id = ?`, [evt.slug]);
    } else if (regCount > 0) {
      // Reassign to archive tag
      await run(`UPDATE registrations SET event_id = ? WHERE event_id = ?`, [`archived-${evt.slug}`, evt.slug]);
    }

    await run(`DELETE FROM gallery_images WHERE event_id = ?`, [evt.slug]);
    await run(`DELETE FROM events WHERE id = ?`, [evt.id]);

    return res.json({
      success: true,
      message: `Event "${evt.name}" has been deleted.`
    });
  } catch (err) {
    console.error('[Admin Events] Delete error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete event.' });
  }
});

// Keep DELETE HTTP method as well
router.delete('/:slug', async (req, res) => {
  req.body = req.body || {};
  return router.handle({ ...req, method: 'POST', url: `/${req.params.slug}/delete` }, res);
});

module.exports = router;
