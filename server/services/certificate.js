/**
 * Offstage Creators — Production Certificate Generation & Resolution Service
 * 
 * Provides:
 * 1. Event-scoped resolution of certificate metadata, winners, and settings
 * 2. High-resolution standalone vector SVG generation (1600x1131 ISO landscape)
 * 3. Bulk ZIP archive generation using archiver
 * 4. Email attachment buffers for automated & admin dispatches
 */

const crypto = require('crypto');
const QRCode = require('qrcode');
const archiver = require('archiver');
const config = require('../config');

// Backward compatibility: Legacy first-edition winner record for online-open-mic-2026 ONLY
const LEGACY_WINNER_REG_ID = 'OC-OM-2440F923';
const LEGACY_WINNER_EVENT_SLUG = 'online-open-mic-2026';

const DEFAULT_CERTIFICATE_SETTINGS = {
  certificateTitle: 'CERTIFICATE OF PARTICIPATION',
  winnerCertificateTitle: 'CERTIFICATE OF EXCELLENCE',
  issueDate: '',
  signatory1Name: 'Muskaan',
  signatory1Title: 'Co-Founder & Creative Director',
  signatory2Name: 'Shlok',
  signatory2Title: 'Co-Founder & Managing Director'
};

function normalizeText(str) {
  return String(str || '').trim();
}

/**
 * Resolves event-scoped certificate settings, falling back to defaults.
 */
function parseEventCertSettings(event) {
  if (!event) return { ...DEFAULT_CERTIFICATE_SETTINGS };
  let parsed = {};
  if (event.certificate_settings) {
    try {
      parsed = typeof event.certificate_settings === 'string'
        ? JSON.parse(event.certificate_settings)
        : event.certificate_settings;
    } catch (_) {}
  }
  const issueDate = parsed.issueDate || parsed.date || (event && event.event_date) || '';
  return {
    certificateTitle: parsed.certificateTitle || (event && event.certificate_title) || DEFAULT_CERTIFICATE_SETTINGS.certificateTitle,
    winnerCertificateTitle: parsed.winnerCertificateTitle || DEFAULT_CERTIFICATE_SETTINGS.winnerCertificateTitle,
    issueDate,
    date: issueDate,
    signatory1Name: parsed.signatory1Name || DEFAULT_CERTIFICATE_SETTINGS.signatory1Name,
    signatory1Title: parsed.signatory1Title || DEFAULT_CERTIFICATE_SETTINGS.signatory1Title,
    signatory2Name: parsed.signatory2Name || DEFAULT_CERTIFICATE_SETTINGS.signatory2Name,
    signatory2Title: parsed.signatory2Title || DEFAULT_CERTIFICATE_SETTINGS.signatory2Title
  };
}

/**
 * Determines whether a registration record represents a winner strictly in its own event context.
 * A participant winning Event A does NOT automatically win Event B.
 */
function isRecordWinner(record) {
  if (!record) return false;

  const pos = normalizeText(record.position).toUpperCase();
  const isExplicitWinner = ['WINNER', 'RUNNER UP', '1ST PLACE', '2ND PLACE', '3RD PLACE', 'SPECIAL RECOGNITION'].includes(pos);
  if (isExplicitWinner || (record.badge_text && normalizeText(record.badge_text).length > 0)) {
    return true;
  }

  // Backward compatibility: ONLY the legacy registration in online-open-mic-2026
  const regId = normalizeText(record.registration_id).toUpperCase();
  const eventId = normalizeText(record.event_id).toLowerCase();
  if (regId === LEGACY_WINNER_REG_ID && (eventId === LEGACY_WINNER_EVENT_SLUG || !eventId)) {
    return true;
  }

  return false;
}

/**
 * Resolves all dynamic certificate fields with strict event scoping.
 */
async function resolveCertificateData(record, event = null, baseUrl = 'https://offstagecreators.in') {
  if (!record) return null;

  const eventSettings = parseEventCertSettings(event);
  const isWinner = isRecordWinner(record);
  const regId = normalizeText(record.registration_id).toUpperCase();
  const eventSlug = event ? event.slug : (record.event_id || config.EVENT.id);
  const eventTitle = event ? (event.title || event.name) : config.EVENT.title;

  // Backward-compatibility fallback values for Suhavani Kaur in online-open-mic-2026
  const isLegacyWinner = (regId === LEGACY_WINNER_REG_ID && (eventSlug === LEGACY_WINNER_EVENT_SLUG || !record.event_id));

  // 1. Position / Rank
  let position = normalizeText(record.position);
  if (!position) {
    position = isWinner ? 'WINNER' : 'Participant';
  }

  // 2. Certificate Title
  let certificateTitle = normalizeText(record.certificate_title);
  if (!certificateTitle) {
    if (isWinner) {
      certificateTitle = eventSettings.winnerCertificateTitle || 'CERTIFICATE OF EXCELLENCE';
    } else {
      certificateTitle = eventSettings.certificateTitle || 'CERTIFICATE OF PARTICIPATION';
    }
  }

  // 3. Achievement
  let achievement = normalizeText(record.achievement);
  if (!achievement && isWinner) {
    achievement = isLegacyWinner ? 'Winner — First Place' : (position !== 'Participant' ? position : 'Winner');
  }

  // 4. Badge Text
  let badgeText = normalizeText(record.badge_text);
  if (!badgeText && isWinner) {
    badgeText = isLegacyWinner ? '★ EVENT WINNER ★' : `★ ${position.toUpperCase()} ★`;
  }

  // 5. Official Citation Text
  let citation = normalizeText(record.citation);
  if (!citation && isLegacyWinner) {
    citation = 'for securing 1st Place as the Event Winner with an exceptional and captivating performance in';
  }

  // 6. Date
  const dateStr = eventSettings.issueDate || (event && event.event_date) || config.EVENT.date;

  // 7. QR Code & Verification URL
  const verificationUrl = `${baseUrl}/certificate?regId=${encodeURIComponent(regId)}`;
  let qrCodeDataUrl = null;
  try {
    qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      margin: 1,
      width: 280,
      color: { dark: '#1c1712', light: '#ffffff' }
    });
  } catch (err) {
    console.warn('[Certificate Service] QR generation notice:', err.message);
  }

  return {
    verifiedName: record.full_name,
    fullName: record.full_name,
    registrationId: regId,
    certificateId: regId,
    eventId: eventSlug,
    event: eventTitle,
    eventName: eventTitle,
    category: record.category || 'Performer',
    performanceTitle: record.performance_title || null,
    city: record.city || (event ? event.city : null),
    date: dateStr,
    verificationUrl,
    qrCode: qrCodeDataUrl,
    isWinner,
    position,
    achievement,
    certificateTitle: certificateTitle.toUpperCase(),
    badgeText: badgeText || null,
    citation: citation || null,
    signatory1Name: eventSettings.signatory1Name,
    signatory1Title: eventSettings.signatory1Title,
    signatory2Name: eventSettings.signatory2Name,
    signatory2Title: eventSettings.signatory2Title
  };
}

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an ISO A4 landscape vector SVG certificate (1600x1131).
 * Features guilloche pattern, metallic champagne gold gradients, rosette seal,
 * dynamic badges, auto-scaled typography, QR code, and executive signatures.
 */
function generateCertificateSvg(certData) {
  const W = 1600;
  const H = 1131;

  const isWinner = Boolean(certData.isWinner);
  const name = certData.verifiedName || certData.fullName || 'Participant';
  const eventTitle = certData.event || certData.eventName || 'ONLINE OPEN MIC 2026';
  const certId = certData.certificateId || certData.registrationId || 'OC-OM-CERT';
  const certTitle = (certData.certificateTitle || (isWinner ? 'CERTIFICATE OF EXCELLENCE' : 'CERTIFICATE OF PARTICIPATION')).toUpperCase();
  const category = certData.category || 'Performer';
  const performanceTitle = certData.performanceTitle ? `  •  "${certData.performanceTitle.toUpperCase()}"` : '';
  const dateStr = certData.date || '23 September 2026';
  const position = certData.position || (isWinner ? 'WINNER' : 'Participant');
  const badgeText = certData.badgeText || (isWinner ? '★ EVENT WINNER ★' : null);

  const sig1Name = certData.signatory1Name || 'Muskaan';
  const sig1Title = certData.signatory1Title || 'Co-Founder & Creative Director';
  const sig2Name = certData.signatory2Name || 'Shlok';
  const sig2Title = certData.signatory2Title || 'Co-Founder & Managing Director';

  // Compute participant font size dynamically based on length
  let nameFontSize = 64;
  if (name.length > 32) nameFontSize = 40;
  else if (name.length > 24) nameFontSize = 48;
  else if (name.length > 18) nameFontSize = 56;

  // Narrative text
  let narrativeLead = isWinner
    ? `for being declared the ${position} for outstanding creative excellence in`
    : 'for active participation and outstanding creative expression in';

  if (certData.citation) {
    narrativeLead = certData.citation;
  }

  // Guilloche background lines
  const step = 28;
  let guillochePaths = '';
  for (let x = -H; x < W + H; x += step) {
    guillochePaths += `<line x1="${x}" y1="0" x2="${x + H}" y2="${H}" stroke="rgba(195,160,95,0.04)" stroke-width="0.5"/>`;
  }
  for (let x = W + H; x > -H; x -= step) {
    guillochePaths += `<line x1="${x}" y1="0" x2="${x - H}" y2="${H}" stroke="rgba(195,160,95,0.04)" stroke-width="0.5"/>`;
  }

  // 24-point Scalloped Rosette Foil Seal
  let rosettePoints = '';
  const cx = 800;
  const cy = 878;
  const outerR = 68;
  const innerR = 60;
  const pts = 24;
  for (let i = 0; i < pts * 2; i++) {
    const angle = (i * Math.PI) / pts - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    rosettePoints += `${px.toFixed(1)},${py.toFixed(1)} `;
  }

  // Optional Badge SVG
  let badgeSvg = '';
  if (isWinner || badgeText) {
    const textToDraw = escapeXml(badgeText || '★ EVENT WINNER ★');
    badgeSvg = `
      <g transform="translate(800, 366)" filter="url(#goldShadow)">
        <rect x="-240" y="-17" width="480" height="34" rx="8" fill="url(#goldPillGrad)" stroke="#5c3a07" stroke-width="1.5"/>
        <rect x="-238" y="-15" width="476" height="30" rx="6" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1"/>
        <text x="0" y="5" font-family="'Cinzel', 'DM Sans', serif" font-size="13" font-weight="800" fill="#3a2203" text-anchor="middle" letter-spacing="1.5">${textToDraw}</text>
      </g>
    `;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&amp;family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600;1,700&amp;family=DM+Sans:wght@400;500;600;700;800&amp;family=Pinyon+Script&amp;display=swap');
      .brand-title { font-family: 'Cinzel', 'DM Sans', serif; font-size: 24px; font-weight: 800; fill: #1c1712; letter-spacing: 5px; }
      .brand-sub { font-family: 'DM Sans', Arial, sans-serif; font-size: 12.5px; font-weight: 700; fill: #946d29; letter-spacing: 3.5px; }
      .kicker { font-family: 'DM Sans', Arial, sans-serif; font-size: 12px; font-weight: 700; fill: #b38435; letter-spacing: 2px; }
      .cert-title { font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif; font-size: 48px; font-weight: 800; fill: #17120c; letter-spacing: 3px; }
      .pres-to { font-family: 'DM Sans', Arial, sans-serif; font-size: 15px; font-weight: 600; fill: #6e6151; letter-spacing: 2.5px; }
      .hero-name { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-weight: 700; fill: #16110a; }
      .narrative { font-family: 'DM Sans', Arial, sans-serif; font-size: 19px; font-weight: 400; fill: #4c4235; }
      .event-title { font-family: 'Cinzel', 'DM Sans', serif; font-size: 30px; font-weight: 800; fill: #926a24; letter-spacing: 2px; }
      .cat-text { font-family: 'DM Sans', Arial, sans-serif; font-size: 15px; font-weight: 700; fill: #3a3024; letter-spacing: 1px; }
      .commendation { font-family: 'DM Sans', Arial, sans-serif; font-size: 17px; fill: #5c5042; }
      .commendation-italic { font-family: 'DM Sans', Arial, sans-serif; font-size: 16px; font-style: italic; fill: #756857; }
      .sig-script { font-family: 'Pinyon Script', cursive; font-size: 46px; font-style: italic; fill: #1c1610; }
      .sig-name { font-family: 'DM Sans', Arial, sans-serif; font-size: 12.5px; font-weight: 800; fill: #221a12; letter-spacing: 1.5px; }
      .sig-title { font-family: 'DM Sans', Arial, sans-serif; font-size: 10.5px; font-weight: 600; fill: #7a6c5b; }
      .motto { font-family: 'Cinzel', 'DM Sans', serif; font-size: 13px; font-weight: 800; fill: #9b7129; letter-spacing: 3px; }
      .footer-sub { font-family: 'DM Sans', Arial, sans-serif; font-size: 10px; font-weight: 500; fill: #8f8374; letter-spacing: 0.5px; }
    </style>

    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fefdfa"/>
      <stop offset="50%" stop-color="#f8f4ec"/>
      <stop offset="100%" stop-color="#efe7d8"/>
    </linearGradient>

    <linearGradient id="goldFrameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#9e7328"/>
      <stop offset="30%" stop-color="#dfbe75"/>
      <stop offset="70%" stop-color="#cba353"/>
      <stop offset="100%" stop-color="#8e641e"/>
    </linearGradient>

    <linearGradient id="goldPillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8e641e"/>
      <stop offset="20%" stop-color="#d4a23f"/>
      <stop offset="50%" stop-color="#fff1c7"/>
      <stop offset="80%" stop-color="#d4a23f"/>
      <stop offset="100%" stop-color="#8e641e"/>
    </linearGradient>

    <linearGradient id="sealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff4d0"/>
      <stop offset="25%" stop-color="#f4d27c"/>
      <stop offset="55%" stop-color="#d4a23f"/>
      <stop offset="85%" stop-color="#a37121"/>
      <stop offset="100%" stop-color="#784d0f"/>
    </linearGradient>

    <linearGradient id="lineFade" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#bd9444" stop-opacity="0"/>
      <stop offset="20%" stop-color="#bd9444" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="#ebcb85" stop-opacity="1"/>
      <stop offset="80%" stop-color="#bd9444" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#bd9444" stop-opacity="0"/>
    </linearGradient>

    <filter id="goldShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(180,130,40,0.3)"/>
    </filter>
  </defs>

  <!-- Base Background -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <!-- Guilloche Security Texture -->
  <g>${guillochePaths}</g>

  <!-- Outer Dark Framing Border -->
  <rect x="32" y="32" width="${W - 64}" height="${H - 64}" fill="none" stroke="#181410" stroke-width="4"/>

  <!-- Primary Metallic Gold Frame -->
  <rect x="44" y="44" width="${W - 88}" height="${H - 88}" fill="none" stroke="url(#goldFrameGrad)" stroke-width="3"/>

  <!-- Fine Gold Hairline Inlay -->
  <rect x="52" y="52" width="${W - 104}" height="${H - 104}" fill="none" stroke="#dfc384" stroke-width="1"/>

  <!-- Inner Framing Line -->
  <rect x="64" y="64" width="${W - 128}" height="${H - 128}" fill="none" stroke="rgba(35,28,20,0.4)" stroke-width="1"/>

  <!-- Corner Flourishes (4x) -->
  <g stroke="#b88c3a" stroke-width="2" fill="none">
    <path d="M 64 120 L 64 64 L 120 64 M 64 64 L 92 92"/>
    <path d="M ${W - 64} 120 L ${W - 64} 64 L ${W - 120} 64 M ${W - 64} 64 L ${W - 92} 92"/>
    <path d="M 64 ${H - 120} L 64 ${H - 64} L 120 ${H - 64} M 64 ${H - 64} L 92 ${H - 92}"/>
    <path d="M ${W - 64} ${H - 120} L ${W - 64} ${H - 64} L ${W - 120} ${H - 64} M ${W - 64} ${H - 64} L ${W - 92} ${H - 92}"/>
  </g>

  <!-- Header Brand Lockup -->
  <g text-anchor="middle">
    <!-- Top Wings & Diamonds -->
    <line x1="600" y1="125" x2="740" y2="125" stroke="#cfa959" stroke-width="1.5"/>
    <circle cx="740" cy="125" r="3" fill="#cfa959"/>
    <circle cx="800" cy="125" r="28" fill="#ffffff" stroke="#cfa959" stroke-width="2"/>
    <text x="800" y="134" font-family="'Cinzel', serif" font-size="24" font-weight="900" fill="#9e7328" text-anchor="middle">✦</text>
    <circle cx="860" cy="125" r="3" fill="#cfa959"/>
    <line x1="860" y1="125" x2="1000" y2="125" stroke="#cfa959" stroke-width="1.5"/>

    <text x="800" y="195" class="brand-title">OFFSTAGE CREATORS</text>
    <text x="800" y="218" class="brand-sub">WORDS   •   PEOPLE   •   PLATFORMS</text>
    <text x="800" y="262" class="kicker">${isWinner ? '✦   OFFICIAL CREDENTIAL OF WINNING ACHIEVEMENT   ✦' : '✦   OFFICIAL CREDENTIAL OF ACHIEVEMENT   ✦'}</text>

    <!-- Main Certificate Title -->
    <text x="800" y="322" class="cert-title">${escapeXml(certTitle)}</text>
    <line x1="560" y1="338" x2="1040" y2="338" stroke="#caa558" stroke-width="1.5"/>
    <circle cx="800" cy="338" r="3.5" fill="#caa558"/>

    <!-- Dynamic Achievement Badge -->
    ${badgeSvg}

    <!-- Presentation Lead -->
    <text x="800" y="${badgeSvg ? 418 : 390}" class="pres-to">THIS IS PROUDLY PRESENTED TO</text>

    <!-- Participant Hero Name -->
    <text x="800" y="${badgeSvg ? 478 : 466}" class="hero-name" font-size="${nameFontSize}px">${escapeXml(name)}</text>
    <line x1="360" y1="${badgeSvg ? 498 : 486}" x2="1240" y2="${badgeSvg ? 498 : 486}" stroke="url(#lineFade)" stroke-width="2.5"/>
    <text x="800" y="${badgeSvg ? 502 : 490}" font-family="'DM Sans', sans-serif" font-size="12" fill="#9b7128">${isWinner ? '★' : '◆'}</text>

    <!-- Narrative Citation & Event -->
    <text x="800" y="552" class="narrative">${escapeXml(narrativeLead)}</text>
    <text x="800" y="600" class="event-title">${escapeXml(eventTitle.toUpperCase())}</text>
    <text x="800" y="638" class="cat-text">PERFORMANCE CATEGORY: ${escapeXml(category.toUpperCase())}${escapeXml(performanceTitle)}</text>
    <text x="800" y="676" class="commendation">organized and officially recognized by Offstage Creators.</text>
    <text x="800" y="715" class="commendation-italic">${isWinner ? 'In celebration of your exemplary talent, poetic brilliance, and winning performance.' : 'In appreciation of your authenticity, courage, and unique artistic voice on our stage.'}</text>
    <text x="800" y="742" class="commendation">Keep creating, inspiring, and expressing without limits.</text>
  </g>

  <!-- Left Column: QR Code & Verification Lockup -->
  <g transform="translate(145, 800)">
    <rect width="136" height="136" fill="#ffffff" stroke="#c49b49" stroke-width="1.5" rx="4"/>
    ${certData.qrCode ? `<image href="${certData.qrCode}" x="6" y="6" width="124" height="124"/>` : `<text x="68" y="72" font-family="'DM Sans', sans-serif" font-size="11" fill="#1c1712" text-anchor="middle">VERIFIED QR</text>`}
    
    <!-- Meta text beside QR -->
    <text x="156" y="22" font-family="'DM Sans', sans-serif" font-size="12" font-weight="800" fill="#1c1712">SCAN TO VERIFY</text>
    <text x="156" y="42" font-family="'DM Sans', sans-serif" font-size="11" font-weight="700" fill="#8f6825">AUTHENTIC CREDENTIAL</text>
    <text x="156" y="67" font-family="'DM Sans', sans-serif" font-size="12" font-weight="700" fill="#42372a">ID: ${escapeXml(certId)}</text>
    <text x="156" y="90" font-family="'DM Sans', sans-serif" font-size="11.5" font-weight="500" fill="#6e6150">DATE: ${escapeXml(dateStr)}</text>
    <text x="156" y="113" font-family="'DM Sans', sans-serif" font-size="11" font-weight="700" fill="#1e7b45">${isWinner ? `● STATUS: VERIFIED ${escapeXml(position.toUpperCase())}` : '● STATUS: VERIFIED'}</text>
  </g>

  <!-- Center Column: Gold Foil Scalloped Rosette Seal -->
  <g filter="url(#goldShadow)">
    <polygon points="${rosettePoints}" fill="url(#sealGrad)" stroke="#5c3a07" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="48" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3,2"/>
    <circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="#784d0f" stroke-width="1"/>
    <text x="${cx}" y="${cy - 12}" font-family="'Cinzel', serif" font-size="12" font-weight="900" fill="#422502" text-anchor="middle">★ ★ ★</text>
    <text x="${cx}" y="${cy + 8}" font-family="'Cinzel', serif" font-size="11" font-weight="800" fill="#381d00" text-anchor="middle" letter-spacing="1">${isWinner ? 'WINNER' : 'OFFICIAL'}</text>
    <text x="${cx}" y="${cy + 22}" font-family="'Cinzel', serif" font-size="7.5" font-weight="800" fill="#523207" text-anchor="middle" letter-spacing="0.5">${isWinner ? '1ST PLACE • EXCELLENCE' : 'SEAL OF EXCELLENCE'}</text>
  </g>

  <!-- Right Column: Authorized Signatures -->
  <g text-anchor="middle">
    <!-- Signature 1 -->
    <g transform="translate(1120, 880)">
      <text x="0" y="-8" class="sig-script">${escapeXml(sig1Name)}</text>
      <line x1="-90" y1="12" x2="90" y2="12" stroke="#4a3f32" stroke-width="1"/>
      <text x="0" y="34" class="sig-name">${escapeXml(sig1Name.toUpperCase())}</text>
      <text x="0" y="50" class="sig-title">${escapeXml(sig1Title)}</text>
    </g>

    <!-- Signature 2 -->
    <g transform="translate(1360, 880)">
      <text x="0" y="-8" class="sig-script">${escapeXml(sig2Name)}</text>
      <line x1="-90" y1="12" x2="90" y2="12" stroke="#4a3f32" stroke-width="1"/>
      <text x="0" y="34" class="sig-name">${escapeXml(sig2Name.toUpperCase())}</text>
      <text x="0" y="50" class="sig-title">${escapeXml(sig2Title)}</text>
    </g>
  </g>

  <!-- Bottom Brand Motto & Verification Footer -->
  <g text-anchor="middle">
    <text x="800" y="1060" class="motto">—   DIFFERENT VOICES   •   SAME STAGE   —</text>
    <text x="800" y="1082" class="footer-sub">Official Credential issued by Offstage Creators • Protected by Security Verification Engine</text>
  </g>
</svg>
`;

  return svg;
}

/**
 * Creates an archiver ZIP stream containing certificates for all given registrations.
 */
function createBulkCertificatesArchive(certDataList, eventTitle) {
  const archive = archiver('zip', { zlib: { level: 9 } });

  const manifest = {
    event: eventTitle,
    generatedAt: new Date().toISOString(),
    totalCertificates: certDataList.length,
    certificates: []
  };

  certDataList.forEach((cert, idx) => {
    const svgContent = generateCertificateSvg(cert);
    const cleanName = (cert.verifiedName || 'Participant').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `Certificate_${String(idx + 1).padStart(3, '0')}_${cert.registrationId}_${cleanName}.svg`;

    archive.append(Buffer.from(svgContent, 'utf-8'), { name: filename });

    manifest.certificates.push({
      registrationId: cert.registrationId,
      name: cert.verifiedName,
      position: cert.position,
      isWinner: cert.isWinner,
      certificateTitle: cert.certificateTitle,
      filename
    });
  });

  archive.append(Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'), { name: 'MANIFEST.json' });

  return archive;
}

function getCertificateSecret() {
  return config.JWT_SECRET || config.SESSION_SECRET || 'offstage-creators-certificate-secret-2026';
}

/**
 * Creates an HMAC-SHA256 signature token scoped to the participant registration and event.
 * Prevents URL parameter tampering so users cannot access another's certificate.
 */
function generateCertificateAccessToken(record, eventId) {
  if (!record) return null;
  const regId = normalizeText(record.registration_id || record.id).toUpperCase();
  const evId = normalizeText(eventId || record.event_id || config.EVENT.id).toLowerCase();
  const secret = getCertificateSecret();
  return crypto.createHmac('sha256', secret).update(`cert:${regId}:${evId}`).digest('hex').slice(0, 32);
}

/**
 * Verifies an HMAC-SHA256 access token against the participant registration and event.
 */
function verifyCertificateAccessToken(token, record, eventId) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim().toLowerCase();
  const expected = generateCertificateAccessToken(record, eventId);
  if (!expected) return false;
  if (cleanToken.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(cleanToken, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch (_) {
    return false;
  }
}

/**
 * Determines whether a participant's certificate is ready and published.
 * 
 * Rules:
 * 1. Event must have finalized certificates published: event.certificate_enabled !== 0
 * 2. Participant must not be REVOKED or CANCELLED
 * 3. Participant must be approved/paid
 * 4. Participant must have checked-in (checked_in = 1), be marked eligible (certificate_eligible = 1), or be an event winner
 * 5. Participant must have a valid email address
 */
function isCertificateReady(record, event) {
  if (!record) {
    return { isReady: false, reason: 'Registration record not found' };
  }

  // 1. Event publication check: Must be finalized and published
  if (event) {
    if (event.certificate_enabled === 0 || event.certificate_enabled === false) {
      return {
        isReady: false,
        reason: 'Certificates have not yet been published or enabled for this event by the organizers.'
      };
    }
  }

  // 2. Cancellation / Revocation check
  const regStatus = normalizeText(record.reg_status).toUpperCase();
  const paymentStatus = normalizeText(record.payment_status).toUpperCase();

  if (['REVOKED', 'CANCELLED'].includes(regStatus) || paymentStatus === 'REVOKED') {
    return {
      isReady: false,
      reason: 'Registration is cancelled or revoked.'
    };
  }

  if (regStatus !== 'APPROVED' && paymentStatus !== 'PAID') {
    return {
      isReady: false,
      reason: 'Registration is pending verification. Only approved participants can collect certificates.'
    };
  }

  // 3. Attendance or Declared Winner check
  const isWinner = isRecordWinner(record);
  const checkedIn = Number(record.checked_in || 0) === 1;
  const certEligible = Number(record.certificate_eligible || 0) === 1;

  if (!checkedIn && !certEligible && !isWinner) {
    return {
      isReady: false,
      reason: 'Attendance check-in is required before the certificate can be collected.'
    };
  }

  // 4. Contact check (email present)
  if (!record.email || !normalizeText(record.email)) {
    return {
      isReady: false,
      reason: 'Missing recipient email address.'
    };
  }

  return { isReady: true, reason: null };
}

/**
 * Generates the responsive HTML email body with the prominent "Collect Your Certificate" CTA button.
 */
function generateCertificateCollectBodyHtml({ recipient, event, collectionUrl, customMessage }) {
  const isWinner = isRecordWinner(recipient);
  const name = recipient.full_name || 'Creator';
  const regId = recipient.registration_id || recipient.id || '';
  const eventTitle = event ? (event.title || event.name) : config.EVENT.title;
  const eventDate = event ? (event.event_date || event.date) : config.EVENT.date;
  const category = recipient.category || 'Performer';
  const position = recipient.position || (isWinner ? 'WINNER' : 'Participant');
  const safeUrl = collectionUrl || 'https://offstagecreators.in/certificate';

  const defaultMsg = isWinner
    ? `Congratulations on your extraordinary winning performance at <strong>${escapeXml(eventTitle)}</strong>! Offstage Creators is thrilled to honor your artistry. Your official credential of excellence has been finalized, verified, and published.`
    : `Congratulations on your performance at <strong>${escapeXml(eventTitle)}</strong>! Your official certificate of achievement has been finalized, published, and verified by Offstage Creators.`;

  const msgContent = customMessage && customMessage.trim() ? customMessage.trim() : defaultMsg;

  return `
    <div style="text-align:center; margin-bottom:24px;">
      <span style="display:inline-block; padding:5px 14px; background:rgba(228,173,87,0.12); border:1px solid #e4ad57; border-radius:20px; color:#e4ad57; font-size:11px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase;">
        ✦ OFFICIAL CREDENTIAL READY FOR COLLECTION ✦
      </span>
      <h1 style="font-family:Georgia,serif; font-size:25px; color:#f7eee1; margin:16px 0 6px; line-height:1.25; font-weight:700;">
        ${isWinner ? 'Certificate of Excellence' : 'Certificate of Participation'}
      </h1>
      <p style="color:#a8a096; font-size:13.5px; margin:0;">
        Issued for <strong>${escapeXml(eventTitle)}</strong> (${escapeXml(eventDate || '2026')})
      </p>
    </div>

    <p style="font-size:15px; color:#eee4d5; margin:0 0 16px; line-height:1.6;">
      Dear <strong>${escapeXml(name)}</strong>,
    </p>

    <div style="font-size:14px; color:#d6ccbf; line-height:1.75; margin:0 0 24px;">
      ${msgContent}
    </div>

    <!-- CREDENTIAL DETAILS TABLE -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0e0c0a; border:1px solid #2a231c; border-radius:10px; margin:0 0 26px; font-size:13px;">
      <tr>
        <td style="padding:12px 16px; border-bottom:1px solid #1e1a16; color:#8e8477; font-weight:600; text-transform:uppercase; font-size:11px;">Participant</td>
        <td style="padding:12px 16px; border-bottom:1px solid #1e1a16; color:#f7eee1; font-weight:700; text-align:right;">${escapeXml(name)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; border-bottom:1px solid #1e1a16; color:#8e8477; font-weight:600; text-transform:uppercase; font-size:11px;">Event</td>
        <td style="padding:12px 16px; border-bottom:1px solid #1e1a16; color:#e4ad57; font-weight:700; text-align:right;">${escapeXml(eventTitle)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; border-bottom:1px solid #1e1a16; color:#8e8477; font-weight:600; text-transform:uppercase; font-size:11px;">Achievement</td>
        <td style="padding:12px 16px; border-bottom:1px solid #1e1a16; color:${isWinner ? '#f2ca6b' : '#f7eee1'}; font-weight:700; text-align:right;">${isWinner ? `🏆 ${escapeXml(position)}` : escapeXml(category)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px; color:#8e8477; font-weight:600; text-transform:uppercase; font-size:11px;">Credential ID</td>
        <td style="padding:12px 16px; color:#e4ad57; font-family:monospace; font-weight:800; font-size:13px; text-align:right;">${escapeXml(regId)}</td>
      </tr>
    </table>

    <!-- BIG PROMINENT GOLD CTA BUTTON -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 22px;">
      <tr>
        <td align="center">
          <a href="${safeUrl}" target="_blank" style="background:linear-gradient(135deg, #d4a23f 0%, #e4ad57 50%, #c49339 100%); color:#0e0c0a !important; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; text-decoration:none; padding:16px 36px; border-radius:8px; display:inline-block; box-shadow:0 6px 20px rgba(228, 173, 87, 0.35);">
            🏆 COLLECT YOUR CERTIFICATE →
          </a>
          <div style="margin-top:14px; font-size:11.5px; color:#8e8477; line-height:1.5;">
            Direct collection URL: <a href="${safeUrl}" target="_blank" style="color:#e4ad57; text-decoration:underline; word-break:break-all;">${safeUrl}</a>
          </div>
        </td>
      </tr>
    </table>

    <div style="background:#181410; border-left:3px solid #e4ad57; padding:14px 18px; border-radius:6px; font-size:12px; color:#a8a096; line-height:1.6; margin:22px 0 10px;">
      🔒 <strong>Secure Recipient Link:</strong> This authenticated collection link is uniquely assigned to your credential. When you open the page, you can preview your high-resolution certificate, download print-ready PDF and PNG versions, or verify its authenticity anytime using the embedded QR code.
    </div>

    <div style="margin-top:24px; padding-top:16px; border-top:1px solid #1e1a16; font-size:12px; color:#8e8477; line-height:1.6;">
      <p style="margin:0; color:#eee4d5;">
        Warm regards,<br>
        <strong style="color:#e4ad57;">Offstage Creators Leadership Team</strong><br>
        <span style="font-size:11px; color:#8e8477;">Words • People • Platforms</span>
      </p>
    </div>
  `;
}

module.exports = {
  DEFAULT_CERTIFICATE_SETTINGS,
  parseEventCertSettings,
  isRecordWinner,
  resolveCertificateData,
  generateCertificateSvg,
  createBulkCertificatesArchive,
  generateCertificateAccessToken,
  verifyCertificateAccessToken,
  isCertificateReady,
  generateCertificateCollectBodyHtml
};
