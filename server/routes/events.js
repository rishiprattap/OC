const queryColumns = require('../services/queryColumns');
/**
 * Offstage Creators — Events Public Routes
 * Provides dynamic event configuration to the website without code changes.
 */
const express = require('express');
const router = express.Router();
const { getActiveEvent, getEventBySlug, listEvents, all, get } = require('../db');

// Ensure no-cache on all public dynamic events endpoints so updates reflect immediately
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

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
  const isClosedStatus = normalizedStatus === 'registrationclosed' || normalizedStatus === 'eventcompleted' || normalizedStatus === 'archived';
  const isRegistrationOpen = isOpenStatus && !isClosedStatus;

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

  const isBroken = (u) => !u || typeof u !== 'string' || u.trim() === '' || u.includes('/assets/poster.jpeg');
  const rawPoster = isBroken(evt.poster_url || evt.posterUrl) ? null : String(evt.poster_url || evt.posterUrl).trim();
  const rawBanner = isBroken(evt.banner_url || evt.bannerUrl) ? null : String(evt.banner_url || evt.bannerUrl).trim();
  const defaultAsset = (evt.slug === 'delhi-adhure-musafir-2026') ? '/assets/adhure-musafir-poster.png' : '/assets/event-poster.png';

  const banner = rawBanner || rawPoster || defaultAsset;
  const poster = rawPoster || rawBanner || defaultAsset;

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
    paymentQrUrl: evt.qr_asset_path || '/assets/payment-qr.jpeg',
    qrAssetPath: evt.qr_asset_path || '/assets/payment-qr.jpeg',
    receiptTemplateUrl: evt.receipt_template_url || '',
    upi: {
      upiId: evt.upi_id || 'rishiprattap@fam',
      payeeName: evt.payee_name || 'Rishi Pratap',
      qrAssetPath: evt.qr_asset_path || '/assets/payment-qr.jpeg',
      amount: Number(evt.fee || 79)
    },
    posterUrl: poster,
    bannerUrl: banner,
    poster_url: poster,
    banner_url: banner,
    banner,
    poster,
    image: banner,
    coverImage: banner,
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
    registrationEnabled: Boolean(isOpenStatus || evt.reg_enabled),
    registrationOpen: isRegistrationOpen && registrationProvider !== 'disabled',
    isRegistrationOpen: isRegistrationOpen && registrationProvider !== 'disabled',
    registrationStatus: (isRegistrationOpen && registrationProvider !== 'disabled') ? 'OPEN' : 'CLOSED',
    registrationButtonText,
    maxRegistrations: Number(evt.max_registrations || 0),
    confirmationMessage: evt.confirmation_message || '',
    allowedCategories,
    contactEmail: evt.contact_email || 'support@offstagecreators.in',
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
    const active = await getActiveEvent(true);
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

// GET /api/events/all — Return all public events
router.get('/all', async (req, res) => {
  try {
    const events = await listEvents({});
    return res.json({
      success: true,
      count: events.length,
      events: events.map(formatEventPublic)
    });
  } catch (err) {
    console.error('[Events] Error in GET /api/events/all:', err);
    return res.status(500).json({ success: false, error: 'Server error while listing all events.' });
  }
});

// Serve published artwork individually; only allow fixed column names.
router.get('/:slug/media/:field', async (req, res) => {
  const field = req.params.field;
  if (!queryColumns.eventMedia.includes(field)) return res.sendStatus(404);
  try {
    const row = await get(`SELECT ${field} AS media FROM events WHERE id::text = ? AND is_published = 1`, [req.params.slug]);
    const match = String(row?.media || '').match(/^data:(image\/(?:jpeg|jpg|png|webp|gif)|application\/pdf);base64,([a-zA-Z0-9+/=\s]+)$/);
    if (!match) return res.sendStatus(404);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.removeHeader('Pragma'); res.removeHeader('Expires');
    return res.type(match[1]).send(Buffer.from(match[2], 'base64'));
  } catch (_) { return res.sendStatus(503); }
});

// GET /api/events/:slug — Get single event by slug or ID
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    if (slug === 'active') {
      const active = await getActiveEvent(true);
      return res.json({ success: true, event: formatEventPublic(active) });
    }
    const evt = await getEventBySlug(slug, true);
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
  req.params.eventId = req.params.slug;
  return require('./gallery').handlePublicList(req, res);
});

module.exports = router;
module.exports.formatEventPublic = formatEventPublic;
