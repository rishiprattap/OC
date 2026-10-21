/**
 * Offstage Creators — Promo Codes & Referral Service
 * Handles promo code validation, discount calculations, usage tracking,
 * and Instagram handle normalization.
 */
const { run, get, all } = require('../db');

/**
 * Normalizes an Instagram handle or profile URL to a clean username.
 * Accepts:
 *   - '@username' -> 'username'
 *   - 'username' -> 'username'
 *   - 'https://www.instagram.com/username/' -> 'username'
 *   - 'https://instagram.com/username?igsh=...' -> 'username'
 *   - 'instagram.com/username' -> 'username'
 */
function normalizeInstagramHandle(input) {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim();
  if (!str) return '';

  // Extract from URL if applicable
  if (str.includes('instagram.com')) {
    try {
      if (!str.startsWith('http://') && !str.startsWith('https://')) {
        str = 'https://' + str;
      }
      const parsed = new URL(str);
      const segments = parsed.pathname.split('/').filter(Boolean);
      // Ignore system paths
      if (segments.length > 0 && !['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts'].includes(segments[0].toLowerCase())) {
        str = segments[0];
      }
    } catch (_) {
      const match = str.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
      if (match) str = match[1];
    }
  }

  // Strip leading @, trailing slashes, queries, hashes
  str = str.replace(/^@+/, '').replace(/[/?#].*$/, '').trim();

  // Valid Instagram usernames contain letters, numbers, periods, and underscores, max 30 chars
  const cleanMatch = str.match(/^[a-zA-Z0-9._]+/);
  return cleanMatch ? cleanMatch[0].slice(0, 30) : '';
}

/**
 * Normalizes promo code string to clean uppercase alphanumeric code.
 */
function normalizePromoCode(input) {
  if (!input || typeof input !== 'string') return '';
  return input.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

/**
 * Calculate discount based on promo code rules and original fee.
 * Guarantees discount is never negative and never exceeds originalFee.
 * Final fee is never negative.
 */
function calculateDiscount(promo, originalFee) {
  const fee = Math.max(0, Number(originalFee || 0));
  if (!promo || promo.discount_type === 'none' || promo.discount_type === 'referral_only') {
    return {
      originalFee: fee,
      discountAmount: 0,
      finalFee: fee,
      discountType: promo ? (promo.discount_type || 'none') : 'none',
      discountValue: 0
    };
  }

  let discount = 0;
  const val = Number(promo.discount_value || 0);

  if (promo.discount_type === 'percentage') {
    discount = Math.round((fee * val) / 100);
  } else if (promo.discount_type === 'fixed') {
    discount = Math.round(val);
  }

  discount = Math.max(0, Math.min(discount, fee));
  const finalFee = Math.max(0, fee - discount);

  return {
    originalFee: fee,
    discountAmount: discount,
    finalFee,
    discountType: promo.discount_type,
    discountValue: val
  };
}

/**
 * Validates promo code for an event and user/email.
 * Enforces active status, validity dates, event restrictions, total limits, and per-user limits.
 */
async function validatePromoCode({ code, eventSlug, email = null, userId = null, currentRegId = null }) {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Please enter a promo code.' };
  }
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: 'Please enter a promo code.' };
  }

  const promo = await get(`SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?)`, [cleanCode]);
  if (!promo) {
    return { valid: false, error: 'Invalid promo code.' };
  }

  if (Number(promo.is_active) !== 1) {
    return { valid: false, error: 'This promo code is currently inactive or deactivated.' };
  }

  const now = new Date();

  // Check validity dates
  if (promo.starts_at) {
    const startsAt = new Date(promo.starts_at);
    if (!isNaN(startsAt.getTime()) && now < startsAt) {
      return { valid: false, error: 'This promo code is not active yet.' };
    }
  }

  if (promo.expires_at) {
    const expiresAt = new Date(promo.expires_at);
    if (!isNaN(expiresAt.getTime()) && now > expiresAt) {
      return { valid: false, error: 'This promo code has expired.' };
    }
  }

  // Check eligible events
  if (promo.eligible_events && promo.eligible_events !== 'ALL') {
    let allowedList = [];
    try {
      allowedList = JSON.parse(promo.eligible_events);
    } catch (_) {
      allowedList = String(promo.eligible_events).split(',').map(s => s.trim().toLowerCase());
    }
    if (Array.isArray(allowedList) && allowedList.length > 0) {
      const target = String(eventSlug || '').toLowerCase();
      const match = allowedList.some(e => String(e).toLowerCase() === target || target.includes(String(e).toLowerCase()));
      if (!match) {
        return { valid: false, error: 'This promo code is not valid for this event.' };
      }
    }
  }

  // Count usages from registrations to ensure accurate real-time capacity
  const allRegs = await all(`SELECT registration_id, reg_status, payment_status, final_fee, email, user_id FROM registrations WHERE UPPER(promo_code) = UPPER(?)`, [cleanCode]);

  // Registrations that represent an active or confirmed claim
  const activeClaims = allRegs.filter(r => {
    if (['REJECTED', 'REVOKED', 'CANCELLED'].includes(r.reg_status)) return false;
    // Exclude current registration if user is retrying their own pending registration
    if (currentRegId && String(r.registration_id).toUpperCase() === String(currentRegId).toUpperCase()) return false;
    return true;
  });

  // Check total usage limit
  const totalLimit = promo.total_usage_limit !== null && promo.total_usage_limit !== undefined 
    ? Number(promo.total_usage_limit) 
    : (promo.max_uses ? Number(promo.max_uses) : 0);

  if (totalLimit > 0) {
    if (activeClaims.length >= totalLimit) {
      return { valid: false, error: 'This promo code limit reached (maximum usage limit reached).' };
    }
  }

  // Check per-user limit
  const perUserLimit = promo.per_user_limit !== null && promo.per_user_limit !== undefined 
    ? Number(promo.per_user_limit) 
    : (promo.max_uses_per_user ? Number(promo.max_uses_per_user) : 1);

  if (perUserLimit > 0 && (email || userId)) {
    const cleanEmail = email ? String(email).toLowerCase().trim() : null;
    const numUserId = userId ? Number(userId) : null;

    const userClaims = activeClaims.filter(r => {
      if (numUserId && Number(r.user_id) === numUserId) return true;
      if (cleanEmail && r.email && r.email.toLowerCase() === cleanEmail) return true;
      return false;
    });

    if (userClaims.length >= perUserLimit) {
      return { valid: false, error: 'You have reached the maximum allowed uses for this promo code (limit reached).' };
    }
  }

  return {
    valid: true,
    promo
  };
}

module.exports = {
  normalizeInstagramHandle,
  normalizePromoCode,
  calculateDiscount,
  validatePromoCode
};
