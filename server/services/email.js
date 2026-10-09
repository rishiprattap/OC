/**
 * Offstage Creators — Email Service
 * Production custom-domain email system powered by Resend (with SMTP fallback for local dev).
 *
 * Sender identities:
 *   OTP verification:                  Offstage Creators <verify@offstagecreators.in>
 *   Registration confirmation/status:  Offstage Creators <registrations@offstagecreators.in>
 *   Event updates and reminders:       Offstage Creators <events@offstagecreators.in>
 *   Reply-to / support:                support@offstagecreators.in
 *
 * Separate API keys:
 *   RESEND_OTP_API_KEY           -> verify@offstagecreators.in
 *   RESEND_REGISTRATION_API_KEY  -> registrations@offstagecreators.in
 *   RESEND_EVENT_UPDATES_API_KEY -> events@offstagecreators.in
 *   (Falls back to RESEND_API_KEY if individual key is not set)
 */

const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const config = require('../config');
const { run, get } = require('../db');

// ─── Resend Clients & Sender Resolution ────────────────────────────────────────

const resendClients = {
  OTP: null,
  REGISTRATION: null,
  EVENTS: null,
  DEFAULT: null
};

function getResendClient(category = 'DEFAULT') {
  const cat = String(category).toUpperCase();
  if (resendClients[cat]) return resendClients[cat];

  let apiKey = '';
  if (cat === 'OTP') {
    apiKey = process.env.RESEND_OTP_API_KEY || config.RESEND.otpApiKey || process.env.RESEND_API_KEY || config.RESEND.defaultApiKey;
  } else if (cat === 'REGISTRATION') {
    apiKey = process.env.RESEND_REGISTRATION_API_KEY || config.RESEND.registrationApiKey || process.env.RESEND_API_KEY || config.RESEND.defaultApiKey;
  } else if (cat === 'EVENTS') {
    apiKey = process.env.RESEND_EVENT_UPDATES_API_KEY || config.RESEND.eventUpdatesApiKey || process.env.RESEND_API_KEY || config.RESEND.defaultApiKey;
  } else {
    apiKey = process.env.RESEND_API_KEY || config.RESEND.defaultApiKey ||
             process.env.RESEND_OTP_API_KEY || config.RESEND.otpApiKey ||
             process.env.RESEND_REGISTRATION_API_KEY || config.RESEND.registrationApiKey ||
             process.env.RESEND_EVENT_UPDATES_API_KEY || config.RESEND.eventUpdatesApiKey;
  }

  if (apiKey && apiKey.trim() && !apiKey.startsWith('re_placeholder') && !apiKey.startsWith('changeme')) {
    resendClients[cat] = new Resend(apiKey.trim());
    return resendClients[cat];
  }

  return null;
}

function getSenderForCategory(category = 'DEFAULT') {
  const cat = String(category).toUpperCase();
  switch (cat) {
    case 'OTP':
      return config.RESEND.senders.otp;
    case 'REGISTRATION':
      return config.RESEND.senders.registration;
    case 'EVENTS':
      return config.RESEND.senders.events;
    default:
      return config.RESEND.senders.registration;
  }
}

// ─── SMTP Fallback (strictly blocked in production/Vercel) ────────────────────

let smtpTransporter = null;

function getSmtpTransporter() {
  // Silent fallback to Gmail is strictly prohibited.
  // In production or on Vercel, Resend with @offstagecreators.in is mandatory.
  if (config.NODE_ENV === 'production' || process.env.VERCEL) {
    return null;
  }
  // Only allowed during automated test execution or explicit local testing
  if (process.env.NODE_ENV !== 'test' && process.env.ALLOW_DEV_SMTP !== 'true') {
    return null;
  }
  if (smtpTransporter) return smtpTransporter;

  const { user, password, host, port, secure } = config.EMAIL;
  if (!user || !password) return null;

  smtpTransporter = nodemailer.createTransport({
    host: host || 'localhost',
    port: port || 587,
    secure: port === 465 || secure,
    auth: { user, pass: password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000
  });
  return smtpTransporter;
}

// ─── Audit Logging ────────────────────────────────────────────────────────────

async function logEmail({ registrationId, recipient, emailType, subject, status, messageId, errorMessage }) {
  try {
    await run(
      `INSERT INTO email_logs (registration_id, recipient, email_type, subject, status, provider_message_id, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [registrationId || null, recipient, emailType, subject, status, messageId || null, errorMessage || null]
    );
  } catch (err) {
    console.error('[Email Audit] Notice writing email log:', err.message);
  }
}

// ─── Unsubscribe Verification ─────────────────────────────────────────────────

async function isEmailUnsubscribed(email) {
  if (!email) return false;
  try {
    const row = await get(`SELECT id FROM unsubscribed_emails WHERE email = ?`, [email.trim().toLowerCase()]);
    return Boolean(row);
  } catch (_) {
    return false;
  }
}

// ─── Core Send Function ───────────────────────────────────────────────────────

/**
 * Send an email through Resend using the correct sender and API key,
 * with fallback to SMTP if Resend is unconfigured in development.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.html - HTML body
 * @param {string} [params.text] - Plain text fallback
 * @param {string} params.emailCategory - 'OTP' | 'REGISTRATION' | 'EVENTS'
 * @param {string} params.emailType - Internal log tag (e.g. 'OTP_VERIFICATION')
 * @param {string} [params.registrationId] - Optional registration ID
 * @param {boolean} [params.isOptionalAnnouncement] - If true, checks unsubscribe list
 */
async function sendEmail({
  to,
  subject,
  html,
  text,
  emailCategory = 'REGISTRATION',
  emailType = 'NOTIFICATION',
  registrationId = null,
  isOptionalAnnouncement = false
}) {
  const cleanTo = String(to || '').trim().toLowerCase();
  if (!cleanTo) {
    throw new Error('Recipient email is required.');
  }

  // Check unsubscribe preferences for optional/promotional event messages
  if (isOptionalAnnouncement) {
    const unsubscribed = await isEmailUnsubscribed(cleanTo);
    if (unsubscribed) {
      console.log(`[Email] Skipping ${emailType} to ${cleanTo} — recipient has opted out.`);
      await logEmail({
        registrationId,
        recipient: cleanTo,
        emailType,
        subject,
        status: 'SKIPPED_OPTED_OUT',
        errorMessage: 'Recipient has unsubscribed from optional event updates.'
      });
      return { success: true, skipped: true, reason: 'OPTED_OUT' };
    }
  }

  const sender = getSenderForCategory(emailCategory);
  const replyTo = config.RESEND.senders.support;
  const resend = getResendClient(emailCategory);

  // 1. Try Resend if configured
  if (resend) {
    try {
      const response = await resend.emails.send({
        from: sender,
        to: cleanTo,
        reply_to: replyTo,
        subject,
        html,
        text: text || stripHtmlToPlainText(html)
      });

      if (response.error) {
        throw new Error(response.error.message || 'Resend API returned an error.');
      }

      const messageId = response.data?.id || null;
      console.log(`[Email / Resend] Sent ${emailType} (${emailCategory}) from "${sender}" to ${cleanTo} — ID: ${messageId}`);
      await logEmail({
        registrationId,
        recipient: cleanTo,
        emailType,
        subject,
        status: 'SENT',
        messageId
      });
      return { success: true, provider: 'resend', from: sender, messageId };
    } catch (err) {
      console.error(`[Email / Resend] Failed to send ${emailType} to ${cleanTo}:`, err.message);
      await logEmail({
        registrationId,
        recipient: cleanTo,
        emailType,
        subject,
        status: 'FAILED',
        errorMessage: err.message
      });
      throw err;
    }
  }

  // 2. Strict Production Guard: No silent fallback to Gmail allowed.
  const isProd = config.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (isProd) {
    const requiredVar = emailCategory === 'OTP' ? 'RESEND_OTP_API_KEY' :
                        emailCategory === 'REGISTRATION' ? 'RESEND_REGISTRATION_API_KEY' :
                        emailCategory === 'EVENTS' ? 'RESEND_EVENT_UPDATES_API_KEY' : 'RESEND_API_KEY';
    const errMsg = `Resend is not configured for category "${emailCategory}". Please set ${requiredVar} in Vercel environment variables. All emails must originate from @offstagecreators.in via Resend. Falling back to Gmail is strictly prohibited.`;
    console.error(`[Email Error] ${errMsg}`);
    await logEmail({
      registrationId,
      recipient: cleanTo,
      emailType,
      subject,
      status: 'NOT_CONFIGURED',
      errorMessage: errMsg
    });
    throw new Error(errMsg);
  }

  // 3. Fallback to local dev/test transporter ONLY in non-production test environments
  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: sender,
        to: cleanTo,
        replyTo,
        subject,
        html,
        text: text || stripHtmlToPlainText(html)
      });

      console.log(`[Email / Dev Fallback] Sent ${emailType} to ${cleanTo} — ID: ${info.messageId}`);
      await logEmail({
        registrationId,
        recipient: cleanTo,
        emailType,
        subject,
        status: 'SENT',
        messageId: info.messageId
      });
      return { success: true, provider: 'dev-smtp', from: sender, messageId: info.messageId };
    } catch (err) {
      console.error(`[Email / Dev Fallback] Failed to send ${emailType} to ${cleanTo}:`, err.message);
      await logEmail({
        registrationId,
        recipient: cleanTo,
        emailType,
        subject,
        status: 'FAILED',
        errorMessage: err.message
      });
      throw err;
    }
  }

  // 4. No email provider configured
  const errMsg = `No email provider configured for ${emailCategory}. Please configure Resend API keys.`;
  console.warn(`[Email Warning] ${errMsg}`);
  await logEmail({
    registrationId,
    recipient: cleanTo,
    emailType,
    subject,
    status: 'NOT_CONFIGURED',
    errorMessage: errMsg
  });

  return { success: false, notConfigured: true, error: errMsg };
}

// ─── HTML Email Wrapper ───────────────────────────────────────────────────────

function emailWrapper({ title, preheader, bodyContent, unsubscribeUrl = null }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #0d0c0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #eee4d5; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 580px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #141210; border: 1px solid #2a231c; border-radius: 12px; overflow: hidden; }
    .header { background: #181410; border-bottom: 1px solid #2a231c; padding: 28px 32px; text-align: center; }
    .logo-text { font-size: 11px; font-weight: 800; letter-spacing: 0.2em; color: #e4ad57; text-transform: uppercase; }
    .logo-sub { font-size: 20px; font-weight: 700; color: #f7eee1; margin-top: 4px; }
    .body { padding: 32px; font-size: 14px; line-height: 1.7; color: #eee4d5; }
    .otp-box { background: #0a0908; border: 2px solid #e4ad57; border-radius: 10px; padding: 24px; text-align: center; margin: 24px 0; }
    .otp-number { font-family: 'Courier New', Courier, monospace; font-size: 42px; font-weight: 900; letter-spacing: 0.25em; color: #e4ad57; }
    .otp-label { font-size: 11px; color: #8e8477; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 8px; font-weight: 600; }
    .info-row { display: flex; justify-content: space-between; border-bottom: 1px solid #1e1a16; padding: 10px 0; font-size: 13px; }
    .info-label { color: #8e8477; }
    .info-value { color: #f7eee1; font-weight: 600; text-align: right; }
    .cta-btn { display: inline-block; background: #e4ad57; color: #0d0c0a !important; font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 14px 28px; border-radius: 6px; text-decoration: none; margin: 22px 0 10px; }
    .status-badge { display: inline-block; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 16px; }
    .badge-approved { background: rgba(110, 219, 140, 0.15); border: 1px solid rgba(110, 219, 140, 0.4); color: #88f0a4; }
    .badge-pending { background: rgba(228, 173, 87, 0.15); border: 1px solid rgba(228, 173, 87, 0.4); color: #e4ad57; }
    .badge-rejected { background: rgba(226, 105, 71, 0.15); border: 1px solid rgba(226, 105, 71, 0.4); color: #ff9e85; }
    .reg-id { font-family: 'Courier New', monospace; font-size: 18px; font-weight: 800; color: #e4ad57; letter-spacing: 0.05em; }
    .muted { color: #8e8477; font-size: 12px; line-height: 1.6; }
    .footer { text-align: center; padding: 24px 32px; border-top: 1px solid #1e1a16; color: #706659; font-size: 11px; line-height: 1.6; }
    a { color: #e4ad57; text-decoration: none; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#0d0c0a; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#eee4d5;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#0d0c0a;font-size:1px;">${preheader}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d0c0a; width:100%; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px; width:100%; background-color:#141210; border:1px solid #2a231c; border-radius:12px; overflow:hidden;">
          <tr>
            <td style="background-color:#181410; border-bottom:1px solid #2a231c; padding:26px 32px; text-align:center;">
              <div style="font-size:11px; font-weight:800; letter-spacing:0.2em; color:#e4ad57; text-transform:uppercase;">Offstage Creators</div>
              <div style="font-size:19px; font-weight:700; color:#f7eee1; margin-top:4px;">Creative Stage &amp; Community</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px; background-color:#141210; color:#eee4d5; font-size:14px; line-height:1.7;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="text-align:center; padding:22px 32px; border-top:1px solid #1e1a16; color:#706659; font-size:11px; background-color:#141210; line-height:1.6;">
              © ${year} Offstage Creators · All rights reserved.<br>
              Official Support: <a href="mailto:support@offstagecreators.in" style="color:#e4ad57; text-decoration:none;">support@offstagecreators.in</a><br>
              Instagram: <a href="https://www.instagram.com/offstagecreators/" target="_blank" style="color:#e4ad57; text-decoration:none;">@offstagecreators</a>
              ${unsubscribeUrl ? `<br><br><a href="${unsubscribeUrl}" style="color:#8e8477; text-decoration:underline;">Unsubscribe from optional event updates</a>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function stripHtmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

// ─── Concrete Email Handlers ──────────────────────────────────────────────────

/**
 * Send OTP verification email.
 * Subject strictly excludes OTP code. Code expires in 5 minutes.
 */
async function sendOTPEmail({ registrationId, email, name, otp, expiryMinutes = 5, eventTitle = 'Offstage Creators Event' }) {
  const subject = 'Your Offstage Creators verification code';
  const preheader = `Your 6-digit verification code is ready. Valid for ${expiryMinutes} minutes.`;

  const bodyContent = `
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#f7eee1;">Verify Your Email Address</h2>
    <p>Hi ${name || 'Creator'},</p>
    <p>You are reserving your performance spot for <strong>${eventTitle}</strong>. Please enter the verification code below to confirm your email and complete your registration:</p>

    <div class="otp-box">
      <div class="otp-number">${otp}</div>
      <div class="otp-label">One-Time Verification Code</div>
    </div>

    <table width="100%" cellpadding="6" cellspacing="0" style="margin: 16px 0; border-top: 1px solid #1e1a16; border-bottom: 1px solid #1e1a16;">
      <tr>
        <td style="color:#8e8477; font-size:13px;">Registration Reference</td>
        <td align="right" style="color:#f7eee1; font-family:monospace; font-weight:700; font-size:13px;">${registrationId}</td>
      </tr>
      <tr>
        <td style="color:#8e8477; font-size:13px;">Code Validity</td>
        <td align="right" style="color:#e4ad57; font-weight:700; font-size:13px;">${expiryMinutes} minutes</td>
      </tr>
    </table>

    <p class="muted" style="margin-top:20px;">
      ⚠️ <strong>Security Notice:</strong> This code expires in ${expiryMinutes} minutes. Do NOT share this code with anyone. Offstage Creators staff will never ask for your verification code. If you did not initiate this request, you can safely ignore this email.
    </p>
  `;

  const html = emailWrapper({ title: subject, preheader, bodyContent });
  const text = `Hi ${name || 'Creator'},\n\nYour Offstage Creators verification code is: ${otp}\n\nRegistration Reference: ${registrationId}\nValid for: ${expiryMinutes} minutes.\n\nDo not share this code with anyone.\nIf you did not initiate this request, please ignore this email.\n\nOffstage Creators Support: support@offstagecreators.in`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
    emailCategory: 'OTP',
    emailType: 'OTP_VERIFICATION',
    registrationId
  });
}

/**
 * Send registration confirmation email after OTP verification.
 */
async function sendRegistrationConfirmationEmail({ registrationId, email, name, category, performanceTitle, event = {} }) {
  const appUrl = config.APP_URL;
  const regUrl = `${appUrl}/registration/${registrationId}`;
  const eventTitle = event.title || event.name || 'Online Open Mic 2026';
  const eventDate = event.date || event.event_date || 'Upcoming';
  const eventTime = event.time || event.start_time || 'TBA';
  const venue = event.venue || event.venue_name || 'Online (Google Meet)';

  const subject = `Your Offstage Creators registration confirmation — ${registrationId}`;
  const preheader = `Your spot for ${eventTitle} is recorded under ${registrationId}. Review your registration details.`;

  const bodyContent = `
    <div class="status-badge badge-pending">Registration Recorded · Under Review</div>
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#f7eee1;">Registration Confirmed! ✦</h2>
    <p>Hi ${name || 'Creator'},</p>
    <p>Your email has been verified and your registration for <strong>${eventTitle}</strong> is recorded in our system. Here is your summary:</p>

    <table width="100%" cellpadding="8" cellspacing="0" style="margin: 16px 0; border: 1px solid #2a231c; border-radius: 8px; background: #0e0c0a;">
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Registration ID</td>
        <td align="right" style="color:#e4ad57; font-family:monospace; font-weight:800; font-size:15px;">${registrationId}</td>
      </tr>
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Performer Name</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${name}</td>
      </tr>
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Performance Category</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${category || 'General'}</td>
      </tr>
      ${performanceTitle ? `
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Performance Title</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${performanceTitle}</td>
      </tr>` : ''}
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Event Schedule</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${eventDate} · ${eventTime}</td>
      </tr>
      <tr>
        <td style="color:#8e8477; font-size:13px;">Venue / Stage</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${venue}</td>
      </tr>
    </table>

    <p style="margin-top:20px;"><strong>Next steps:</strong></p>
    <p style="color:#cfc5b6; font-size:13px; line-height:1.6;">
      • Your registration pass and payment proof are being reviewed by the curation team.<br>
      • Once approved, you will receive an official approval email and calendar link.<br>
      • Verified attendees receive an official certificate after event participation.
    </p>

    <div style="text-align:center; margin:24px 0 16px;">
      <a href="${regUrl}" class="cta-btn">VIEW REGISTRATION PASS →</a>
    </div>

    <p class="muted">
      Keep your Registration ID <strong>${registrationId}</strong> safe. If you have questions or need changes, contact us at <a href="mailto:support@offstagecreators.in">support@offstagecreators.in</a>.
    </p>
  `;

  const html = emailWrapper({ title: subject, preheader, bodyContent });
  const text = `Hi ${name},\n\nYour registration for ${eventTitle} is confirmed!\n\nRegistration ID: ${registrationId}\nCategory: ${category}\nSchedule: ${eventDate} · ${eventTime}\nVenue: ${venue}\n\nView Pass: ${regUrl}\n\nQuestions? Contact: support@offstagecreators.in`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
    emailCategory: 'REGISTRATION',
    emailType: 'REGISTRATION_CONFIRMATION',
    registrationId
  });
}

/**
 * Send approval email when admin approves a registration.
 */
async function sendApprovalEmail({ registrationId, email, name, category, performanceTitle, event = {} }) {
  const appUrl = config.APP_URL;
  const regUrl = `${appUrl}/registration/${registrationId}`;
  const eventTitle = event.title || event.name || 'Online Open Mic 2026';
  const eventDate = event.date || event.event_date || 'Upcoming';
  const eventTime = event.time || event.start_time || 'TBA';
  const venue = event.venue || event.venue_name || 'Online (Google Meet)';

  const subject = `Registration Approved — ${registrationId} | Offstage Creators`;
  const preheader = `Congratulations ${name}! Your registration for ${eventTitle} has been approved.`;

  const bodyContent = `
    <div class="status-badge badge-approved">✓ Spot Confirmed · Approved</div>
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#f7eee1;">See You on Stage! 🎙️</h2>
    <p>Hi ${name},</p>
    <p>Great news! The Offstage Creators team has <strong>approved your registration</strong> for <strong>${eventTitle}</strong>. Your performance slot is confirmed.</p>

    <table width="100%" cellpadding="8" cellspacing="0" style="margin: 16px 0; border: 1px solid #2a231c; border-radius: 8px; background: #0e0c0a;">
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Registration ID</td>
        <td align="right" style="color:#e4ad57; font-family:monospace; font-weight:800; font-size:15px;">${registrationId}</td>
      </tr>
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Performer</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${name}</td>
      </tr>
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Category</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${category || 'General'}</td>
      </tr>
      ${performanceTitle ? `
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Performance Title</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${performanceTitle}</td>
      </tr>` : ''}
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Schedule</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${eventDate} · ${eventTime}</td>
      </tr>
      <tr>
        <td style="color:#8e8477; font-size:13px;">Venue / Stage</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${venue}</td>
      </tr>
    </table>

    <div style="text-align:center; margin:22px 0 16px;">
      <a href="${regUrl}" class="cta-btn">VIEW YOUR ENTRY PASS →</a>
    </div>

    <h3 style="margin:20px 0 8px; font-size:15px; color:#f7eee1;">Performer Guidelines</h3>
    <p class="muted">
      • Please join 10 minutes prior to scheduled start time for audio/video check.<br>
      • Ensure a quiet environment and stable internet connection.<br>
      • Each performer receives 5–7 minutes for their piece.<br>
      • Participation certificates are issued after event attendance.
    </p>
  `;

  const html = emailWrapper({ title: subject, preheader, bodyContent });
  const text = `Hi ${name},\n\nYour spot for ${eventTitle} is APPROVED!\nRegistration ID: ${registrationId}\nSchedule: ${eventDate} · ${eventTime}\nVenue: ${venue}\n\nView Pass: ${regUrl}\n\nSupport: support@offstagecreators.in`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
    emailCategory: 'REGISTRATION',
    emailType: 'REGISTRATION_APPROVED',
    registrationId
  });
}

/**
 * Send rejection email when registration cannot be approved.
 */
async function sendRejectionEmail({ registrationId, email, name, reason }) {
  const appUrl = config.APP_URL;
  const subject = `Registration Update — ${registrationId} | Offstage Creators`;
  const preheader = `An update regarding your registration ${registrationId}.`;

  const bodyContent = `
    <div class="status-badge badge-rejected">Registration Update</div>
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#f7eee1;">Registration Update</h2>
    <p>Hi ${name || 'Creator'},</p>
    <p>Thank you for your interest in performing with Offstage Creators. We are writing to let you know that your registration <strong>${registrationId}</strong> could not be approved at this time.</p>

    ${reason ? `
    <div style="background:#0e0c0a; border: 1px solid #2a231c; border-radius:8px; padding:16px 20px; margin:18px 0; font-size:13px;">
      <strong style="color:#8e8477;">Reason:</strong><br>
      <span style="color:#f7eee1; margin-top:4px; display:inline-block;">${reason}</span>
    </div>` : ''}

    <p style="margin-top:18px;">You are welcome to submit a fresh registration for upcoming events:</p>
    <div style="text-align:center; margin:20px 0 16px;">
      <a href="${appUrl}/register" class="cta-btn">BROWSE / RE-REGISTER →</a>
    </div>

    <p class="muted">
      If you believe this was an error or have questions, reach us at <a href="mailto:support@offstagecreators.in">support@offstagecreators.in</a>.
    </p>
  `;

  const html = emailWrapper({ title: subject, preheader, bodyContent });
  const text = `Hi ${name},\n\nYour registration ${registrationId} could not be approved at this time.\n${reason ? `Reason: ${reason}\n` : ''}\nIf you have questions, please contact support@offstagecreators.in.`;

  return sendEmail({
    to: email,
    subject,
    html,
    text,
    emailCategory: 'REGISTRATION',
    emailType: 'REGISTRATION_REJECTED',
    registrationId
  });
}

/**
 * Send an event announcement or update email.
 * Uses RESEND_EVENT_UPDATES_API_KEY and events@offstagecreators.in sender.
 * Honors unsubscribe preferences.
 */
async function sendEventAnnouncementEmail({
  to,
  name,
  subject,
  headline,
  bodyText,
  event = {},
  actionButtonText = null,
  actionButtonUrl = null,
  registrationId = null,
  isPromotional = true
}) {
  const eventTitle = event.title || event.name || 'Offstage Creators Event';
  const effectiveSubject = subject || `An update about your Offstage Creators event — ${eventTitle}`;
  const preheader = headline || `An important update regarding ${eventTitle}.`;

  const unsubscribeToken = Buffer.from(to.toLowerCase()).toString('base64url');
  const unsubscribeUrl = `${config.APP_URL}/api/email/unsubscribe?email=${encodeURIComponent(to)}&token=${unsubscribeToken}`;

  const bodyContent = `
    <div class="status-badge badge-pending">Event Update</div>
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#f7eee1;">${headline || eventTitle}</h2>
    <p>Hi ${name || 'Creator'},</p>
    <div style="font-size:14px; line-height:1.7; color:#eee4d5; margin:16px 0;">
      ${bodyText}
    </div>

    ${(event.date || event.venue) ? `
    <table width="100%" cellpadding="8" cellspacing="0" style="margin: 18px 0; border: 1px solid #2a231c; border-radius: 8px; background: #0e0c0a;">
      ${event.date ? `
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Event Date &amp; Time</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${event.date}${event.time ? ` · ${event.time}` : ''}</td>
      </tr>` : ''}
      ${event.venue ? `
      <tr>
        <td style="color:#8e8477; font-size:13px;">Venue / Stage</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${event.venue}</td>
      </tr>` : ''}
    </table>` : ''}

    ${actionButtonText && actionButtonUrl ? `
    <div style="text-align:center; margin:24px 0 16px;">
      <a href="${actionButtonUrl}" class="cta-btn">${actionButtonText} →</a>
    </div>` : ''}

    <p class="muted" style="margin-top:20px;">
      This update was sent by Offstage Creators. If you need support, email us at <a href="mailto:support@offstagecreators.in">support@offstagecreators.in</a>.
    </p>
  `;

  const html = emailWrapper({ title: effectiveSubject, preheader, bodyContent, unsubscribeUrl });
  const text = `Hi ${name || 'Creator'},\n\n${headline || eventTitle}\n\n${stripHtmlToPlainText(bodyText)}\n\nSupport: support@offstagecreators.in\nUnsubscribe: ${unsubscribeUrl}`;

  return sendEmail({
    to,
    subject: effectiveSubject,
    html,
    text,
    emailCategory: 'EVENTS',
    emailType: 'EVENT_ANNOUNCEMENT',
    registrationId,
    isOptionalAnnouncement: isPromotional
  });
}

/**
 * Send an event reminder email (e.g. 24h before or day-of).
 */
async function sendEventReminderEmail({
  to,
  name,
  event = {},
  meetLink = null,
  registrationId = null
}) {
  const eventTitle = event.title || event.name || 'Online Open Mic';
  const eventDate = event.date || event.event_date || 'Today';
  const eventTime = event.time || event.start_time || '6:00 PM IST';
  const venue = event.venue || event.venue_name || 'Online (Google Meet)';

  const subject = `Reminder: Upcoming event: ${eventTitle}`;
  const preheader = `Your upcoming performance at ${eventTitle} is scheduled for ${eventDate} at ${eventTime}.`;

  const unsubscribeToken = Buffer.from(to.toLowerCase()).toString('base64url');
  const unsubscribeUrl = `${config.APP_URL}/api/email/unsubscribe?email=${encodeURIComponent(to)}&token=${unsubscribeToken}`;

  const bodyContent = `
    <div class="status-badge badge-approved">Event Reminder</div>
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#f7eee1;">Get Ready for the Stage! 🎙️</h2>
    <p>Hi ${name || 'Creator'},</p>
    <p>This is a friendly reminder that <strong>${eventTitle}</strong> is taking place soon. Here are the key details for your session:</p>

    <table width="100%" cellpadding="8" cellspacing="0" style="margin: 16px 0; border: 1px solid #2a231c; border-radius: 8px; background: #0e0c0a;">
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Date &amp; Time</td>
        <td align="right" style="color:#e4ad57; font-weight:700; font-size:14px;">${eventDate} · ${eventTime}</td>
      </tr>
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Venue</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${venue}</td>
      </tr>
      ${registrationId ? `
      <tr>
        <td style="color:#8e8477; font-size:13px;">Your Registration ID</td>
        <td align="right" style="color:#f7eee1; font-family:monospace; font-weight:700; font-size:13px;">${registrationId}</td>
      </tr>` : ''}
    </table>

    ${meetLink ? `
    <div style="background:#0a0908; border:1px solid #e4ad57; border-radius:8px; padding:18px; text-align:center; margin:20px 0;">
      <div style="color:#8e8477; font-size:11px; text-transform:uppercase; letter-spacing:0.15em;">Google Meet Stage Link</div>
      <a href="${meetLink}" target="_blank" style="display:inline-block; margin-top:8px; font-size:15px; font-weight:700; color:#e4ad57;">${meetLink}</a>
    </div>` : ''}

    <p class="muted">
      • Please arrive 10 minutes early for sound checks.<br>
      • Keep your camera on in a well-lit, quiet area.<br>
      • Reach out to <a href="mailto:support@offstagecreators.in">support@offstagecreators.in</a> if you need assistance.
    </p>
  `;

  const html = emailWrapper({ title: subject, preheader, bodyContent, unsubscribeUrl });
  const text = `Hi ${name},\n\nReminder: ${eventTitle} is scheduled for ${eventDate} · ${eventTime} at ${venue}.\n${meetLink ? `Stage Link: ${meetLink}\n` : ''}\nSupport: support@offstagecreators.in`;

  return sendEmail({
    to,
    subject,
    html,
    text,
    emailCategory: 'EVENTS',
    emailType: 'EVENT_REMINDER',
    registrationId,
    isOptionalAnnouncement: false
  });
}

/**
 * Diagnostic helper: Checks whether offstagecreators.in is verified in Resend.
 */
async function checkDomainStatus() {
  const client = getResendClient('DEFAULT') || getResendClient('OTP');
  if (!client) {
    return {
      configured: false,
      status: 'UNCONFIGURED',
      message: 'No valid Resend API key configured in environment variables.'
    };
  }

  try {
    const listRes = await client.domains.list();
    if (listRes.error) {
      return {
        configured: true,
        status: 'ERROR',
        error: listRes.error.message
      };
    }

    const domains = listRes.data?.data || listRes.data || [];
    const targetDomain = domains.find(d => d.name?.toLowerCase() === 'offstagecreators.in');

    if (!targetDomain) {
      return {
        configured: true,
        status: 'NOT_FOUND',
        domain: 'offstagecreators.in',
        message: 'Domain offstagecreators.in has not been added to this Resend account yet.'
      };
    }

    return {
      configured: true,
      status: targetDomain.status, // 'verified', 'pending', etc.
      domainId: targetDomain.id,
      records: targetDomain.records || []
    };
  } catch (err) {
    return {
      configured: true,
      status: 'EXCEPTION',
      error: err.message
    };
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function interpolateVariables(template, variables) {
  return String(template || '').replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
    const trimmed = key.trim();
    return variables[trimmed] !== undefined ? variables[trimmed] : match;
  });
}

function renderMeetSessionEmail({ session = {}, participant = {}, customMessage = '' }) {
  const eventName = session.event_name || 'Offstage Creators Event';
  const sessionTitle = session.title || session.sessionTitle || 'Live Online Session';
  const sessionDate = session.date || '';
  const sessionTime = session.time || '';
  const meetUrl = session.meet_url || session.meetUrl || '';
  const participantName = participant?.full_name || participant?.name || 'Performer';
  const regId = participant?.registration_id || 'N/A';

  const variables = {
    name: participantName,
    registration_id: regId,
    event_name: eventName,
    session_title: sessionTitle,
    date: sessionDate,
    time: sessionTime,
    meet_link: meetUrl
  };

  const subject = `Offstage Creators — Google Meet Details | ${sessionTitle}`;
  const rawMessage = customMessage !== undefined && customMessage !== '' ? customMessage : (session.message || '');
  const formattedMessage = rawMessage ? interpolateVariables(rawMessage, variables).replace(/\r?\n/g, '<br>') : '';

  const bodyContent = `
    <div class="status-badge badge-approved">Live Google Meet Session</div>
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#f7eee1;">${escapeHtml(sessionTitle)}</h2>
    <p>Hello <strong>${escapeHtml(participantName)}</strong>,</p>
    <p>Here are the live Google Meet access details for your upcoming session for <strong>${escapeHtml(eventName)}</strong>.</p>

    <table width="100%" cellpadding="8" cellspacing="0" style="margin: 16px 0; border: 1px solid #2a231c; border-radius: 8px; background: #0e0c0a;">
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Event</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${escapeHtml(eventName)}</td>
      </tr>
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Session</td>
        <td align="right" style="color:#ffd685; font-weight:700; font-size:13px;">${escapeHtml(sessionTitle)}</td>
      </tr>
      ${sessionDate ? `
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Date</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${escapeHtml(sessionDate)}</td>
      </tr>` : ''}
      ${sessionTime ? `
      <tr style="border-bottom: 1px solid #1e1a16;">
        <td style="color:#8e8477; font-size:13px;">Time</td>
        <td align="right" style="color:#f7eee1; font-weight:600; font-size:13px;">${escapeHtml(sessionTime)}</td>
      </tr>` : ''}
      <tr>
        <td style="color:#8e8477; font-size:13px;">Participant</td>
        <td align="right" style="color:#f7eee1; font-size:13px;">${escapeHtml(participantName)} (${escapeHtml(regId)})</td>
      </tr>
    </table>

    ${meetUrl ? `
    <div style="background:#0a0908; border:1px solid #e4ad57; border-radius:8px; padding:18px; text-align:center; margin:20px 0;">
      <div style="color:#8e8477; font-size:11px; text-transform:uppercase; letter-spacing:0.15em;">Google Meet Link</div>
      <a href="${escapeHtml(meetUrl)}" target="_blank" style="display:inline-block; margin-top:8px; font-size:15px; font-weight:700; color:#e4ad57;">${escapeHtml(meetUrl)}</a>
    </div>` : ''}

    ${formattedMessage ? `
      <div style="background:#110f0d; border-left: 3px solid #e4ad57; padding: 16px 20px; margin: 20px 0; border-radius: 4px; font-size: 14px; line-height: 1.7; color: #f7eee1;">
        <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #e4ad57; text-transform: uppercase; margin-bottom: 8px;">Organizer Note</div>
        ${formattedMessage}
      </div>
    ` : ''}

    <p class="muted" style="margin-top:20px;">
      ✦ <strong>Session Guidelines</strong>: Please join 5–10 minutes prior to the start time. Keep your microphone muted upon entry until your name is called. Support: <a href="mailto:support@offstagecreators.in">support@offstagecreators.in</a>.
    </p>
  `;

  const html = emailWrapper({ title: subject, preheader: `Google Meet details for ${sessionTitle}`, bodyContent });
  return { subject, html };
}

async function sendMeetEmail({ session, participant, recipientEmail, isTest = false }) {
  const targetRecipient = recipientEmail || participant?.email;
  if (!targetRecipient) {
    throw new Error('No recipient email address provided');
  }

  const { subject, html } = renderMeetSessionEmail({ session, participant });
  const finalSubject = isTest ? `[TEST PREVIEW] ${subject}` : subject;

  return sendEmail({
    to: targetRecipient,
    subject: finalSubject,
    html,
    emailCategory: 'EVENTS',
    emailType: isTest ? 'MEET_TEST' : 'MEET_SESSION',
    registrationId: participant?.registration_id || null,
    isOptionalAnnouncement: false
  });
}

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendRegistrationConfirmationEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendEventAnnouncementEmail,
  sendEventReminderEmail,
  renderMeetSessionEmail,
  sendMeetEmail,
  checkDomainStatus,
  isEmailUnsubscribed,
  emailWrapper,
  stripHtmlToPlainText,
  interpolateVariables,
  escapeHtml,
  getSenderForCategory,
  getResendClient
};

