/**
 * Offstage Creators — Email Service
 * Nodemailer-based SMTP service with professional HTML email templates.
 * All credentials loaded from environment variables — never hardcoded.
 */
const nodemailer = require('nodemailer');
const config = require('../config');
const { run } = require('../db');

// ─── Transporter ──────────────────────────────────────────────────────────────

function createTransporter() {
  const { user, password, host, port, secure } = config.EMAIL;

  if (!user || !password) {
    console.warn('[Email] SMTP credentials not configured — emails will not be sent.');
    console.warn('[Email] MAIL_USER:', user ? 'SET' : 'MISSING');
    console.warn('[Email] MAIL_PASSWORD:', password ? 'SET' : 'MISSING');
    return null;
  }

  console.log(`[Email] Creating SMTP transporter — host:${host} port:${port} user:${user}`);

  const isGmail = host === 'smtp.gmail.com' || user.endsWith('@gmail.com');

  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || secure,
    auth: { user, pass: password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000
  });
}

let transporter = createTransporter();

// ─── Audit Logging ────────────────────────────────────────────────────────────

async function logEmail({ registrationId, recipient, emailType, subject, status, messageId, errorMessage }) {
  try {
    await run(
      `INSERT INTO email_logs (registration_id, recipient, email_type, subject, status, provider_message_id, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [registrationId || null, recipient, emailType, subject, status, messageId || null, errorMessage || null]
    );
  } catch (err) {
    console.error('[Email] Failed to write email log:', err.message);
  }
}

// ─── Core Send Function ───────────────────────────────────────────────────────

async function sendEmail({ registrationId, to, subject, html, emailType }) {
  if (!transporter) {
    transporter = createTransporter();
  }
  if (!transporter) {
    const errMsg = 'SMTP not configured — missing MAIL_USER or MAIL_PASSWORD';
    console.error('[Email]', errMsg);
    await logEmail({ registrationId, recipient: to, emailType, subject, status: 'FAILED', errorMessage: errMsg });
    throw new Error(errMsg);
  }

  const fromField = config.EMAIL.fromName
    ? `"${config.EMAIL.fromName}" <${config.EMAIL.from}>`
    : config.EMAIL.from;

  try {
    const info = await transporter.sendMail({ from: fromField, to, subject, html });
    console.log(`[Email] Sent ${emailType} to ${to} — MessageID: ${info.messageId}`);
    await logEmail({ registrationId, recipient: to, emailType, subject, status: 'SENT', messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] Failed to send ${emailType} to ${to}:`, err.message);
    await logEmail({ registrationId, recipient: to, emailType, subject, status: 'FAILED', errorMessage: err.message });
    throw err;
  }
}

// ─── HTML Email Wrapper ───────────────────────────────────────────────────────

function emailWrapper({ title, preheader, bodyContent }) {
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
    .logo-sub { font-size: 20px; font-weight: 700; color: #f7eee1; margin-top: 2px; }
    .body { padding: 32px; }
    .otp-box { background: #0a0908; border: 2px solid #e4ad57; border-radius: 10px; padding: 24px; text-align: center; margin: 24px 0; }
    .otp-number { font-family: 'Courier New', monospace; font-size: 42px; font-weight: 900; letter-spacing: 0.2em; color: #e4ad57; }
    .otp-label { font-size: 11px; color: #8e8477; text-transform: uppercase; letter-spacing: 0.15em; margin-top: 8px; }
    .info-row { display: flex; justify-content: space-between; border-bottom: 1px solid #1e1a16; padding: 10px 0; font-size: 13px; }
    .info-label { color: #8e8477; }
    .info-value { color: #f7eee1; font-weight: 600; text-align: right; }
    .cta-btn { display: inline-block; background: #e4ad57; color: #0d0c0a; font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; padding: 14px 32px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
    .status-approved { background: rgba(110, 219, 140, 0.1); border: 1px solid rgba(110, 219, 140, 0.4); border-radius: 8px; padding: 16px 20px; color: #88f0a4; font-size: 13px; }
    .status-rejected { background: rgba(226, 105, 71, 0.1); border: 1px solid rgba(226, 105, 71, 0.4); border-radius: 8px; padding: 16px 20px; color: #ff9e85; font-size: 13px; }
    .reg-id { font-family: 'Courier New', monospace; font-size: 20px; font-weight: 800; color: #e4ad57; letter-spacing: 0.05em; }
    .muted { color: #8e8477; font-size: 12px; line-height: 1.6; }
    .footer { text-align: center; padding: 20px 32px; border-top: 1px solid #1e1a16; color: #5a5248; font-size: 11px; }
    p { margin: 0 0 14px; line-height: 1.7; font-size: 14px; }
    h2 { margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #f7eee1; }
    h3 { margin: 0 0 16px; font-size: 16px; font-weight: 700; color: #f7eee1; }
  </style>
</head>
<body>
  <div class="wrapper">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;color:#0d0c0a;">${preheader}</div>` : ''}
    <div class="card">
      <div class="header">
        <div class="logo-text">Offstage Creators</div>
        <div class="logo-sub">Online Open Mic ${year}</div>
      </div>
      <div class="body">
        ${bodyContent}
      </div>
      <div class="footer">
        © ${year} Offstage Creators · Built with ♡ for the creative community<br>
        <a href="https://www.instagram.com/offstagecreators/" style="color:#e4ad57; text-decoration:none;">@offstagecreators</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Email Templates ──────────────────────────────────────────────────────────

/**
 * Send OTP verification email.
 */
async function sendOTPEmail({ registrationId, email, name, otp, expiryMinutes }) {
  const subject = `Your Offstage Creators Verification Code: ${otp}`;
  const html = emailWrapper({
    title: 'Email Verification — Offstage Creators',
    preheader: `Your OTP is ${otp}. Valid for ${expiryMinutes} minutes.`,
    bodyContent: `
      <h2>Verify Your Email</h2>
      <p>Hi ${name || 'there'},</p>
      <p>You're registering for the <strong>Online Open Mic 2026</strong>. Please use the code below to verify your email address and complete your registration.</p>

      <div class="otp-box">
        <div class="otp-number">${otp}</div>
        <div class="otp-label">Your One-Time Verification Code</div>
      </div>

      <div class="info-row">
        <span class="info-label">Valid for</span>
        <span class="info-value">${expiryMinutes} minutes</span>
      </div>
      <div class="info-row">
        <span class="info-label">Registration ID</span>
        <span class="info-value" style="font-family:monospace;">${registrationId}</span>
      </div>

      <p style="margin-top:20px;" class="muted">
        This code expires in ${expiryMinutes} minutes. If you did not initiate this request, you can safely ignore this email.
        Do NOT share this code with anyone.
      </p>
    `
  });

  return sendEmail({ registrationId, to: email, subject, html, emailType: 'OTP_VERIFICATION' });
}

/**
 * Send registration confirmation email after OTP is verified.
 */
async function sendRegistrationConfirmationEmail({ registrationId, email, name, category, performanceTitle, event }) {
  const appUrl = config.APP_URL;
  const regUrl = `${appUrl}/registration/${registrationId}`;
  const subject = `Registration Confirmed — ${registrationId} | Offstage Creators`;
  const html = emailWrapper({
    title: 'Registration Confirmed — Offstage Creators',
    preheader: `Your registration ${registrationId} is confirmed. See you on stage!`,
    bodyContent: `
      <h2>Registration Confirmed! ✦</h2>
      <p>Hi ${name},</p>
      <p>You are officially registered for the <strong>Online Open Mic 2026</strong>. Here are your registration details:</p>

      <div class="info-row">
        <span class="info-label">Registration ID</span>
        <span class="info-value"><span class="reg-id">${registrationId}</span></span>
      </div>
      <div class="info-row">
        <span class="info-label">Name</span>
        <span class="info-value">${name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Category</span>
        <span class="info-value">${category}</span>
      </div>
      ${performanceTitle ? `<div class="info-row">
        <span class="info-label">Performance Title</span>
        <span class="info-value">${performanceTitle}</span>
      </div>` : ''}
      <div class="info-row">
        <span class="info-label">Event Date</span>
        <span class="info-value">${event.date} · ${event.time}</span>
      </div>

      <p style="margin-top:20px;">Your registration is now under review by our organizers. You will receive an approval email once confirmed.</p>
      <p>You can view your registration pass anytime at:</p>
      <a href="${regUrl}" class="cta-btn">VIEW MY REGISTRATION PASS →</a>

      <p class="muted" style="margin-top:24px;">
        Keep your Registration ID <strong>${registrationId}</strong> safe — you will need it for event entry.
      </p>
    `
  });

  return sendEmail({ registrationId, to: email, subject, html, emailType: 'REGISTRATION_CONFIRMATION' });
}

/**
 * Send approval email when admin approves a registration.
 */
async function sendApprovalEmail({ registrationId, email, name, category, performanceTitle, event }) {
  const appUrl = config.APP_URL;
  const regUrl = `${appUrl}/registration/${registrationId}`;
  const subject = `🎉 You're Approved! Registration ${registrationId} | Offstage Creators`;
  const html = emailWrapper({
    title: 'Registration Approved — Offstage Creators',
    preheader: `Congratulations! Your registration for Online Open Mic is approved.`,
    bodyContent: `
      <div class="status-approved">
        ✓ &nbsp;<strong>Your registration has been approved by the organizers!</strong>
      </div>

      <h2 style="margin-top:24px;">See You on Stage! 🎙️</h2>
      <p>Hi ${name},</p>
      <p>Great news! The Offstage Creators team has <strong>approved your registration</strong> for the Online Open Mic 2026. Your spot is confirmed.</p>

      <div class="info-row">
        <span class="info-label">Registration ID</span>
        <span class="info-value"><span class="reg-id">${registrationId}</span></span>
      </div>
      <div class="info-row">
        <span class="info-label">Name</span>
        <span class="info-value">${name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Category</span>
        <span class="info-value">${category}</span>
      </div>
      ${performanceTitle ? `<div class="info-row">
        <span class="info-label">Performance Title</span>
        <span class="info-value">${performanceTitle}</span>
      </div>` : ''}
      <div class="info-row">
        <span class="info-label">Event Date</span>
        <span class="info-value">${event.date} · ${event.time}</span>
      </div>

      <a href="${regUrl}" class="cta-btn">VIEW YOUR ENTRY PASS →</a>

      <h3>Performer Guidelines</h3>
      <p class="muted">
        • Join the online room <strong>10 minutes before</strong> show time (7:20 PM IST) for audio check.<br>
        • Have your camera and a quiet space ready.<br>
        • Your performance slot is 5–7 minutes.<br>
        • The Google Meet link will be shared closer to the event date.<br>
        • Participation certificates are issued after event attendance.
      </p>

      <p style="margin-top:20px; font-size:16px; color:#f7eee1; font-style:italic;">
        "ek lafz. ek awaaz. aur ek shaam." ♡
      </p>
    `
  });

  return sendEmail({ registrationId, to: email, subject, html, emailType: 'REGISTRATION_APPROVED' });
}

/**
 * Send rejection email when admin rejects a registration.
 */
async function sendRejectionEmail({ registrationId, email, name, reason }) {
  const appUrl = config.APP_URL;
  const subject = `Registration Update — ${registrationId} | Offstage Creators`;
  const html = emailWrapper({
    title: 'Registration Update — Offstage Creators',
    preheader: `An update regarding your registration ${registrationId}.`,
    bodyContent: `
      <div class="status-rejected">
        ✕ &nbsp;<strong>Your registration could not be approved at this time.</strong>
      </div>

      <h2 style="margin-top:24px;">Registration Update</h2>
      <p>Hi ${name},</p>
      <p>We're sorry to inform you that your registration <strong>${registrationId}</strong> for the Online Open Mic 2026 was not approved.</p>

      ${reason ? `<div style="background:#110f0d; border: 1px solid #2a231c; border-radius:8px; padding:16px 20px; margin:16px 0; font-size:13px;">
        <strong style="color:#8e8477;">Reason:</strong><br>
        <span style="color:#f7eee1;">${reason}</span>
      </div>` : ''}

      <p>If you believe this is an error or would like to re-register, please visit our registration page:</p>
      <a href="${appUrl}/register" class="cta-btn">RE-REGISTER →</a>

      <p class="muted" style="margin-top:20px;">
        If you have any questions, please reach out to us on Instagram at
        <a href="https://www.instagram.com/offstagecreators/" style="color:#e4ad57;">@offstagecreators</a>.
      </p>
    `
  });

  return sendEmail({ registrationId, to: email, subject, html, emailType: 'REGISTRATION_REJECTED' });
}

module.exports = {
  sendOTPEmail,
  sendRegistrationConfirmationEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendEmail,
  emailWrapper
};
