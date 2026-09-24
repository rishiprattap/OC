/**
 * Offstage Creators — Events Public Routes
 * Provides dynamic event configuration to the website without code changes.
 */
const express = require('express');
const router = express.Router();
const { getActiveEvent, getEventBySlug, listEvents, all } = require('../db');

function formatEventPublic(evt) {
  if (!evt) return null;
  let allowedCategories = [];
  try {
    allowedCategories = typeof evt.allowed_categories === 'string'
      ? JSON.parse(evt.allowed_categories)
      : (evt.allowed_categories || []);
  } catch (_) {
    allowedCategories = ['Poetry & Spoken Word', 'Storytelling & Monologue', 'Stand-up Comedy', 'Music & Vocals'];
  }

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

  const normalizedStatus = String(evt.status || '').toLowerCase().replace(/[\s_-]+/g, '');
  const isOpenStatus = normalizedStatus === 'registrationopen' || normalizedStatus === 'open';
  const isComingSoon = normalizedStatus === 'comingsoon' || normalizedStatus === 'draft';
  const isRegistrationOpen = Boolean(evt.reg_enabled && isOpenStatus);

  const provider = String(evt.registration_provider || 'internal').toLowerCase();
  const registrationProvider = ['internal', 'external', 'disabled'].includes(provider) ? provider : 'internal';
  const externalRegistrationUrl = String(evt.external_registration_url || '').trim();
  const externalPlatformName = String(evt.external_platform_name || '').trim();
  const externalPlatformNotes = String(evt.external_platform_notes || '').trim();
  const externalOpenNewTab = evt.external_open_new_tab !== 0 && evt.external_open_new_tab !== false;

  let registrationButtonText = evt.reg_button_text || 'REGISTER NOW';
  if (!isRegistrationOpen || registrationProvider === 'disabled') {
    registrationButtonText = isComingSoon ? 'REGISTRATION OPENS SOON' : 'REGISTRATION CLOSED';
  } else if (registrationProvider === 'external') {
    const baseBtn = (evt.reg_button_text || 'REGISTER NOW').trim();
    registrationButtonText = baseBtn.includes('↗') ? baseBtn : `${baseBtn} ↗`;
  }

  const registrationMethodNotice = registrationProvider === 'external'
    ? `Tickets / Registration available on ${externalPlatformName || 'External Platform'}`
    : (registrationProvider === 'disabled'
      ? 'Registration is currently disabled'
      : 'Register directly with Offstage Creators');

  return {
    id: evt.id,
    slug: evt.slug,
    eventId: evt.slug,
    name: evt.name,
    title: evt.title,
    subtitle: evt.subtitle || '',
    description: evt.description || '',
    shortDescription: evt.short_description || '',
    eventType: evt.event_type || 'ONLINE',
    status: evt.status,
    isActive: Boolean(evt.is_active),
    isPublished: Boolean(evt.is_published),
    date: evt.event_date || '',
    eventDate: evt.event_date || '',
    startTime: evt.start_time || '',
    endTime: evt.end_time || '',
    time: evt.start_time ? (evt.end_time ? `${evt.start_time} – ${evt.end_time}` : evt.start_time) : '',
    timezone: evt.timezone || 'IST (GMT+5:30)',
    regOpenDate: evt.reg_open_date || '',
    regCloseDate: evt.reg_close_date || '',
    venue: evt.venue_name || '',
    venueName: evt.venue_name || '',
    venueAddress: evt.venue_address || '',
    city: evt.city || '',
    state: evt.state || '',
    mapsUrl: evt.maps_url || '',
    venueImageUrl: evt.venue_image_url || '',
    isPaid: Boolean(evt.is_paid),
    fee: Number(evt.fee || 79),
    amount: Number(evt.fee || 79),
    currency: evt.currency || 'INR',
    pricingTiers,
    earlyBirdFee: evt.early_bird_fee ? Number(evt.early_bird_fee) : null,
    upi: {
      upiId: evt.upi_id || 'preetiyadav15071985@okaxis',
      payeeName: evt.payee_name || 'Preeti Yadav / Offstage Creators',
      qrAssetPath: evt.qr_asset_path || '/assets/payment-qr.jpeg',
      amount: Number(evt.fee || 79)
    },
    paymentInstructions: evt.payment_instructions || 'Pay via UPI using any payment app. Enter UTR and upload screenshot.',
    posterUrl: (evt.poster_url && evt.poster_url !== '/assets/poster.jpeg') ? evt.poster_url : ((evt.slug === 'delhi-adhure-musafir-2026') ? '/assets/adhure-musafir-poster.png' : '/assets/event-poster.png'),
    bannerUrl: (evt.banner_url && evt.banner_url !== '/assets/poster.jpeg') ? evt.banner_url : ((evt.poster_url && evt.poster_url !== '/assets/poster.jpeg') ? evt.poster_url : '/assets/event-poster.png'),
    logoUrl: evt.logo_url || '/assets/logo.png',
    promoVideoUrl: evt.promo_video_url || '',
    registrationProvider,
    isExternalRegistration: registrationProvider === 'external',
    isInternalRegistration: registrationProvider === 'internal',
    isRegistrationDisabled: registrationProvider === 'disabled',
    externalRegistrationUrl,
    externalPlatformName,
    externalPlatformNotes,
    externalOpenNewTab,
    registrationMethodNotice,
    registrationEnabled: Boolean(evt.reg_enabled),
    registrationOpen: isRegistrationOpen && registrationProvider !== 'disabled',
    isRegistrationOpen: isRegistrationOpen && registrationProvider !== 'disabled',
    registrationStatus: (isRegistrationOpen && registrationProvider !== 'disabled') ? 'OPEN' : 'CLOSED',
    registrationButtonText,
    maxRegistrations: Number(evt.max_registrations || 0),
    confirmationMessage: evt.confirmation_message || '',
    allowedCategories,
    contactEmail: evt.contact_email || 'offstagecreators77@gmail.com',
    contactPhone: evt.contact_phone || '',
    socialLinks: {
      instagram: evt.instagram_url || 'https://www.instagram.com/offstagecreators/',
      youtube: evt.youtube_url || '',
      whatsapp: evt.whatsapp_url || '',
      meetLink: evt.meet_link || '',
      ...otherLinks
    },
    otherLinks,
    certificateEnabled: Boolean(evt.certificate_enabled),
    certificateTitle: evt.certificate_title || 'CERTIFICATE OF PARTICIPATION',
    isCompleted: normalizedStatus === 'eventcompleted' || normalizedStatus === 'completed',
    createdAt: evt.created_at,
    updatedAt: evt.updated_at
  };
}

// GET /api/events/active — Returns the currently active event
router.get('/active', async (req, res) => {
  try {
    const active = await getActiveEvent();
    if (!active) {
      return res.status(404).json({ success: false, error: 'No active event configured.' });
    }
    return res.json({
      success: true,
      event: formatEventPublic(active)
    });
  } catch (err) {
    console.error('[Events] Error in GET /api/events/active:', err);
    return res.status(500).json({ success: false, error: 'Server error while fetching active event.' });
  }
});

// GET /api/events — List all public published events
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { isPublished: true };
    if (status) filter.status = status;
    const events = await listEvents(filter);
    return res.json({
      success: true,
      count: events.length,
      events: events.map(formatEventPublic)
    });
  } catch (err) {
    console.error('[Events] Error in GET /api/events:', err);
    return res.status(500).json({ success: false, error: 'Server error while listing events.' });
  }
});

// GET /api/events/:slug — Get single event by slug or ID
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    if (slug === 'active') {
      const active = await getActiveEvent();
      return res.json({ success: true, event: formatEventPublic(active) });
    }
    const evt = await getEventBySlug(slug);
    if (!evt) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    return res.json({
      success: true,
      event: formatEventPublic(evt)
    });
  } catch (err) {
    console.error(`[Events] Error in GET /api/events/${req.params.slug}:`, err);
    return res.status(500).json({ success: false, error: 'Server error while fetching event.' });
  }
});

// GET /api/events/:slug/gallery — Get gallery images for a specific event
router.get('/:slug/gallery', async (req, res) => {
  try {
    const { slug } = req.params;
    const evt = await getEventBySlug(slug);
    const eventId = evt ? evt.slug : slug;

    const rows = await all(
      `SELECT * FROM gallery_images WHERE is_published = 1 AND (event_id = ? OR (event_id IS NULL AND ? = 'online-open-mic-2026')) ORDER BY display_order ASC, id DESC`,
      [eventId, eventId]
    );

    const images = (rows || []).map(r => ({
      id: r.id,
      imageUrl: r.image_url,
      caption: r.caption || '',
      displayOrder: r.display_order,
      eventId: r.event_id || eventId,
      createdAt: r.created_at
    }));

    return res.json({
      success: true,
      eventId,
      count: images.length,
      images
    });
  } catch (err) {
    console.error(`[Events] Error in GET /api/events/${req.params.slug}/gallery:`, err);
    return res.status(500).json({ success: false, error: 'Server error while fetching event gallery.' });
  }
});

module.exports = router;
module.exports.formatEventPublic = formatEventPublic;
