const nodemailer = require('nodemailer');
const crypto = require('crypto');
const config = require('../config');
const { run } = require('../db');

// Create Nodemailer Transporter
function createTransporter() {
  if (!config.EMAIL.user || !config.EMAIL.password) {
    return null;
  }

  const isGmail = config.EMAIL.host === 'smtp.gmail.com' || (config.EMAIL.user || '').endsWith('@gmail.com');

  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.EMAIL.user,
        pass: config.EMAIL.password
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }

  const isSecure = config.EMAIL.port === 465 || config.EMAIL.secure;

  return nodemailer.createTransport({
    host: config.EMAIL.host,
    port: config.EMAIL.port,
    secure: isSecure,
    auth: {
      user: config.EMAIL.user,
      pass: config.EMAIL.password
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

let transporter = createTransporter();

// Reload transporter if credentials or config update
function refreshTransporter() {
  transporter = createTransporter();
}

// Cryptographic OTP Generation and Hashing
function generateOtp() {
  // Cryptographically secure 6-digit number between 100000 and 999999
  return crypto.randomInt(100000, 1000000).toString();
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashOtp(otp, salt) {
  return crypto.createHash('sha256').update(`${otp}:${salt}`).digest('hex');
}

function verifyOtpHash(otp, salt, expectedHash) {
  if (!otp || !salt || !expectedHash) return false;
  const computed = hashOtp(otp, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedHash));
}

// Master HTML Email Wrapper Template (Editorial Dark Aesthetic)
function renderEmailWrapper({ title, preheader, headline, bodyContent, ctaUrl, ctaText, badgeText, badgeColor }) {
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const logoUrl = `${appUrl}/assets/logo.png`;
  const defaultBadgeColor = badgeColor || '#e4ad57';
  const defaultBadgeText = badgeText || 'ONLINE OPEN MIC';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Offstage Creators'}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0d0c0a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #eee4d5;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-spacing: 0;
      border-collapse: collapse;
    }
    td {
      padding: 0;
    }
    img {
      border: 0;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0d0c0a;
      padding-bottom: 40px;
    }
    .main-table {
      background-color: #171411;
      margin: 0 auto;
      width: 100%;
      max-width: 600px;
      border: 1px solid #2d2620;
      border-radius: 12px;
      overflow: hidden;
    }
    .header-pad {
      padding: 36px 36px 24px;
      text-align: center;
      background: linear-gradient(180deg, #241e18 0%, #171411 100%);
      border-bottom: 1px solid #2d2620;
    }
    .logo-img {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      margin-bottom: 12px;
    }
    .brand-kicker {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #e4ad57;
      margin: 0 0 4px;
    }
    .brand-title {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 22px;
      font-weight: 700;
      color: #f7eee1;
      letter-spacing: 0.05em;
      margin: 0;
    }
    .body-pad {
      padding: 32px 36px;
    }
    .event-badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(228, 173, 87, 0.12);
      border: 1px solid ${defaultBadgeColor};
      border-radius: 20px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: ${defaultBadgeColor};
      margin-bottom: 16px;
    }
    .headline {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 28px;
      line-height: 1.25;
      font-weight: 700;
      color: #f7eee1;
      margin: 0 0 20px;
    }
    .headline em {
      font-style: italic;
      color: #e4ad57;
    }
    .content-text {
      font-size: 15px;
      line-height: 1.65;
      color: #d6ccbe;
      margin: 0 0 22px;
    }
    .highlight-card {
      background-color: #100e0c;
      border: 1px solid #332b24;
      border-radius: 8px;
      padding: 20px;
      margin: 22px 0;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #1f1b17;
      font-size: 13px;
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: #8e8477;
    }
    .detail-val {
      color: #f7eee1;
      font-weight: 700;
      text-align: right;
    }
    .otp-box {
      background: #080706;
      border: 2px dashed #e4ad57;
      border-radius: 8px;
      padding: 18px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 34px;
      font-weight: 800;
      letter-spacing: 0.28em;
      color: #ffd685;
    }
    .btn-cta {
      display: inline-block;
      background: linear-gradient(135deg, #e4ad57 0%, #e26947 100%);
      color: #0d0c0a !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 14px 28px;
      border-radius: 6px;
      box-shadow: 0 6px 20px rgba(228, 173, 87, 0.25);
    }
    .footer-pad {
      padding: 24px 36px;
      text-align: center;
      border-top: 1px solid #241e18;
      background-color: #120f0d;
    }
    .footer-text {
      font-size: 12px;
      color: #80766a;
      line-height: 1.6;
      margin: 0;
    }
    .footer-links a {
      color: #e4ad57;
      text-decoration: none;
      font-size: 12px;
      margin: 0 8px;
    }
  </style>
</head>
<body>
  <center class="wrapper">
    <table class="main-table" width="100%">
      <!-- Header -->
      <tr>
        <td class="header-pad">
          <p class="brand-kicker">OFFSTAGE CREATORS</p>
          <h1 class="brand-title">Community of Stage &amp; Voice</h1>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td class="body-pad">
          <div class="event-badge">${defaultBadgeText}</div>
          <h2 class="headline">${headline}</h2>
          ${bodyContent}

          ${ctaUrl && ctaText ? `
            <div style="text-align: center; margin: 30px 0 16px;">
              <a href="${ctaUrl}" class="btn-cta" target="_blank">${ctaText}</a>
            </div>
          ` : ''}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td class="footer-pad">
          <p class="footer-text" style="margin-bottom: 8px;">
            <b>Offstage Creators</b> • ek lafz. ek awaaz. aur ek shaam.
          </p>
          <p class="footer-text">
            Online Open Mic • 23 September • 7:30 PM IST
          </p>
          <div class="footer-links" style="margin-top: 12px;">
            <a href="${appUrl}" target="_blank">Website</a> •
            <a href="${appUrl}/certificate" target="_blank">Certificates</a> •
            <a href="https://www.instagram.com/offstagecreators/" target="_blank">Instagram</a>
          </div>
          <p class="footer-text" style="margin-top: 16px; font-size: 11px; color: #61584e;">
            © 2026 Offstage Creators. All rights reserved. Do not reply to this automated email.
          </p>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`;
}

// Core sendEmail with DB Logging and Registration Tracking
async function sendEmail({ to, subject, html, text, emailType, registrationId }) {
  const isLive = (config.EMAIL.mode || '').toUpperCase() === 'LIVE';
  let targetRecipient = to;
  let finalSubject = subject;

  // In TEST mode, deliver to configured TEST_EMAIL_TO
  if (!isLive) {
    targetRecipient = config.EMAIL.testEmailTo || config.EMAIL.user || 'offstagecreators77@gmail.com';
    finalSubject = `[TEST MODE - Original To: ${to}] ${subject}`;
    console.log(`[EMAIL TEST MODE] Redirecting email for ${to} to ${targetRecipient}`);
  }

  const mailOptions = {
    from: `"${config.EMAIL.fromName || 'Offstage Creators'}" <${config.EMAIL.from || config.EMAIL.user}>`,
    to: targetRecipient,
    replyTo: config.EMAIL.user || 'offstagecreators77@gmail.com',
    subject: finalSubject,
    html: html,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    headers: {
      'X-Priority': '1 (Highest)',
      'X-MSMail-Priority': 'High',
      'Importance': 'High'
    }
  };

  const now = new Date().toISOString();

  // Fail closed if email credentials are missing from environment
  if (!config.EMAIL.user || !config.EMAIL.password || !transporter) {
    const configError = 'EMAIL_CONFIGURATION_ERROR: MAIL_USER or MAIL_PASSWORD is not configured in environment.';
    console.error(`[EMAIL_DISPATCH] type=${emailType || 'GENERAL'} recipient=${targetRecipient} status=FAILED error=${configError}`);

    // Audit log failure
    await run(
      `INSERT INTO email_logs (
        registration_id, recipient, email_type, subject, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, 'FAILED', ?, ?)`,
      [registrationId || null, to, emailType || 'GENERAL', subject, configError, now]
    );

    if (registrationId) {
      await run(
        `UPDATE registrations SET
          last_email_type = ?,
          email_status = 'FAILED',
          email_error = ?
        WHERE registration_id = ?`,
        [emailType || 'UNKNOWN', configError, registrationId]
      );
    }

    return {
      success: false,
      error: configError,
      code: 'EMAIL_CONFIGURATION_ERROR'
    };
  }

  let info = null;
  let attempts = 0;
  const maxAttempts = 3;

  try {
    while (attempts < maxAttempts) {
      attempts++;
      try {
        info = await transporter.sendMail(mailOptions);
        break;
      } catch (sendErr) {
        const errMsg = sendErr.message || '';
        const isTemporary = /421|451|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|Temporary/i.test(errMsg);
        if (isTemporary && attempts < maxAttempts) {
          console.warn(`[EMAIL WARNING] Transient SMTP error on attempt ${attempts}/${maxAttempts} (${errMsg}). Retrying in ${attempts * 1200}ms...`);
          await new Promise((resolve) => setTimeout(resolve, attempts * 1200));
        } else {
          throw sendErr;
        }
      }
    }
    console.log(`[EMAIL_DISPATCH] type=${emailType || 'GENERAL'} recipient=${targetRecipient} status=SENT messageId=${info?.messageId}`);

    // Audit log entry
    await run(
      `INSERT INTO email_logs (
        registration_id, recipient, email_type, subject, status, provider_message_id, created_at
      ) VALUES (?, ?, ?, ?, 'SENT', ?, ?)`,
      [registrationId || null, to, emailType || 'GENERAL', subject, info.messageId || 'unknown', now]
    );

    // Update registration record if applicable
    if (registrationId) {
      const typeColumnMap = {
        'EMAIL_VERIFICATION': 'email_last_sent_at',
        'REGISTRATION_RECEIVED': 'registration_email_sent_at',
        'PAYMENT_PROOF_RECEIVED': 'payment_proof_email_sent_at',
        'PAYMENT_APPROVED': 'payment_confirmation_email_sent_at',
        'PAYMENT_REJECTED': 'payment_rejection_email_sent_at',
        'REGISTRATION_CONFIRMED': 'payment_confirmation_email_sent_at',
        'CHECKIN_CONFIRMED': 'checkin_email_sent_at',
        'CERTIFICATE_AVAILABLE': 'certificate_email_sent_at'
      };

      const specificColumn = typeColumnMap[emailType];
      if (specificColumn) {
        await run(
          `UPDATE registrations SET
            ${specificColumn} = ?,
            last_email_type = ?,
            last_email_sent_at = ?,
            email_status = 'SENT',
            email_error = NULL
          WHERE registration_id = ?`,
          [now, emailType, now, registrationId]
        );
      } else {
        await run(
          `UPDATE registrations SET
            last_email_type = ?,
            last_email_sent_at = ?,
            email_status = 'SENT',
            email_error = NULL
          WHERE registration_id = ?`,
          [emailType, now, registrationId]
        );
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      recipient: targetRecipient
    };

  } catch (err) {
    const safeErrorMsg = err.message || 'SMTP delivery failure';
    console.error(`[EMAIL_DISPATCH] type=${emailType || 'GENERAL'} recipient=${targetRecipient} status=FAILED error=${safeErrorMsg}`);

    // Audit log failure
    await run(
      `INSERT INTO email_logs (
        registration_id, recipient, email_type, subject, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, 'FAILED', ?, ?)`,
      [registrationId || null, to, emailType || 'GENERAL', subject, safeErrorMsg, now]
    );

    // Record error on registration without reverting payment or registration status
    if (registrationId) {
      await run(
        `UPDATE registrations SET
          last_email_type = ?,
          email_status = 'FAILED',
          email_error = ?
        WHERE registration_id = ?`,
        [emailType || 'UNKNOWN', safeErrorMsg, registrationId]
      );
    }

    return {
      success: false,
      error: safeErrorMsg
    };
  }
}

// 1. Email Verification OTP Email
async function sendEmailVerificationEmail({ to, name, otp, registrationId }) {
  const subject = `${otp} is your verification code — Offstage Creators`;
  const headline = `Verify Your <em>Email Address</em>`;

  const bodyContent = `
    <p class="content-text">
      Hello <b>${escapeHtml(name)}</b>,
    </p>
    <p class="content-text">
      Thank you for registering for the upcoming <b>Online Open Mic</b> with Offstage Creators. Please confirm your email address using the 6-digit code below:
    </p>

    <div class="otp-box">
      <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #8e8477; margin-bottom: 8px;">
        YOUR 6-DIGIT VERIFICATION CODE
      </div>
      <div class="otp-code">${otp}</div>
      <div style="font-size: 12px; color: #e4ad57; margin-top: 8px;">
        ⏳ Valid for 10 minutes only
      </div>
    </div>

    <p class="content-text" style="font-size: 13px; color: #9d9488;">
      Enter this code on the registration screen to confirm your spot. If you did not initiate this registration, you can safely ignore this message.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Your 6-digit Offstage Creators verification code is ${otp}. Valid for 10 minutes.`,
    headline,
    bodyContent,
    badgeText: 'STEP 2: EMAIL VERIFICATION'
  });

  const plainText = `Hello ${name},\n\nYour 6-digit verification code for Offstage Creators Online Open Mic is: ${otp}\n\nThis code is valid for 10 minutes.\n\nEnter this code on the registration page to confirm your email.\n\n— Offstage Creators Team\nhttps://offstage-creators.vercel.app`;

  return sendEmail({
    to,
    subject,
    html,
    text: plainText,
    emailType: 'EMAIL_VERIFICATION',
    registrationId
  });
}

// 2. Registration Received (After Email Verified, Payment Required)
async function sendRegistrationReceivedEmail({ to, registration }) {
  const regId = registration.registration_id;
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const subject = `Offstage Creators — Registration Received | ${regId}`;
  const headline = `Registration <em>Received</em>`;

  const bodyContent = `
    <p class="content-text">
      Hello <b>${escapeHtml(registration.full_name)}</b>,
    </p>
    <p class="content-text">
      Your performer details have been recorded for <b>Online Open Mic 2026</b>. To secure your 5-7 minute slot, please complete your ₹79 UPI payment.
    </p>

    <div class="highlight-card">
      <div class="detail-row">
        <span class="detail-label">Participant:</span>
        <span class="detail-val">${escapeHtml(registration.full_name)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Registration ID:</span>
        <span class="detail-val" style="color: #e4ad57; font-family: monospace;">${regId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Event:</span>
        <span class="detail-val">Online Open Mic (23 September • 7:30 PM)</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Performance Category:</span>
        <span class="detail-val">${escapeHtml(registration.category || 'Performer')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Fee Amount:</span>
        <span class="detail-val" style="color: #6edb8c;">₹79 (Payable via UPI)</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Payment Status:</span>
        <span class="detail-val" style="color: #e4ad57;">PAYMENT REQUIRED</span>
      </div>
    </div>

    <p class="content-text" style="font-weight: 700; color: #f7eee1; margin-bottom: 8px;">
      Payment Instructions:
    </p>
    <ol style="color: #d6ccbe; font-size: 14px; line-height: 1.7; padding-left: 20px; margin: 0 0 20px;">
      <li>Scan the official UPI QR code or pay to <b>${config.UPI.upiId}</b>.</li>
      <li>Pay exactly ₹79.</li>
      <li>Copy the 12-digit UPI Reference / UTR Number.</li>
      <li>Upload your payment screenshot on the registration portal.</li>
    </ol>

    <p class="content-text" style="font-size: 12px; color: #8e8477;">
      Note: Your slot is confirmed only after manual verification of your payment proof by the organizing team.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Registration ${regId} received. Complete your ₹79 UPI payment to secure your slot.`,
    headline,
    bodyContent,
    ctaUrl: `${appUrl}/register`,
    ctaText: 'COMPLETE PAYMENT →',
    badgeText: 'PAYMENT REQUIRED (₹79)'
  });

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'REGISTRATION_RECEIVED',
    registrationId: regId
  });
}

// 3. Payment Proof Received (Under Verification)
async function sendPaymentProofReceivedEmail({ to, registration }) {
  const regId = registration.registration_id;
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const subject = `Offstage Creators — Payment Proof Received | ${regId}`;
  const headline = `Payment Proof <em>Received</em>`;

  const bodyContent = `
    <p class="content-text">
      Hello <b>${escapeHtml(registration.full_name)}</b>,
    </p>
    <p class="content-text">
      We have received your ₹79 UPI payment proof. Your submission is now in the verification queue.
    </p>

    <div class="highlight-card">
      <div class="detail-row">
        <span class="detail-label">Registration ID:</span>
        <span class="detail-val" style="color: #e4ad57; font-family: monospace;">${regId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Transaction ID / UTR:</span>
        <span class="detail-val" style="font-family: monospace; color: #ffd685;">${escapeHtml(registration.transaction_id || 'Submitted')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount:</span>
        <span class="detail-val" style="color: #6edb8c;">₹79</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Payment Status:</span>
        <span class="detail-val" style="color: #e4ad57;">UNDER VERIFICATION</span>
      </div>
    </div>

    <p class="content-text">
      The Offstage Creators team manually verifies bank credits. Once verified, your official ticket pass and check-in QR code will be generated automatically.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Payment proof for ${regId} received. Status: UNDER VERIFICATION.`,
    headline,
    bodyContent,
    ctaUrl: `${appUrl}/success?id=${encodeURIComponent(regId)}`,
    ctaText: 'VIEW REGISTRATION STATUS →',
    badgeText: 'PAYMENT UNDER VERIFICATION',
    badgeColor: '#e4ad57'
  });

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'PAYMENT_PROOF_RECEIVED',
    registrationId: regId
  });
}

// 4. Payment Approved Email (Pass Unlocked)
async function sendPaymentApprovedEmail({ to, registration }) {
  const regId = registration.registration_id;
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const subject = `Offstage Creators — Payment Confirmed ✓ | ${regId}`;
  const headline = `Payment Verified &amp; <em>Confirmed!</em>`;

  const bodyContent = `
    <p class="content-text">
      Hello <b>${escapeHtml(registration.full_name)}</b>,
    </p>
    <p class="content-text">
      Great news! Your ₹79 payment has been manually verified by the Offstage Creators organizing team. Your registration is now <b>CONFIRMED</b>.
    </p>

    <div class="highlight-card" style="border-color: #3b6b45;">
      <div class="detail-row">
        <span class="detail-label">Registration ID:</span>
        <span class="detail-val" style="color: #e4ad57; font-family: monospace;">${regId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Event:</span>
        <span class="detail-val">Online Open Mic 2026</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date &amp; Time:</span>
        <span class="detail-val">23 September • 7:30 PM IST</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Payment Status:</span>
        <span class="detail-val" style="color: #6edb8c;">PAID &amp; VERIFIED (₹79)</span>
      </div>
    </div>

    <p class="content-text" style="font-size: 13px; color: #d5cbbd;">
      <b>Important Performer Instructions:</b><br>
      • Your official entry pass with a check-in QR code is ready.<br>
      • Keep your pass accessible on your phone.<br>
      • Please join 10 minutes prior (7:20 PM IST) for audio check.<br>
      • Participation certificates will be unlocked on the certificate portal following attendance.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Payment verified! Registration ${regId} is confirmed for Online Open Mic.`,
    headline,
    bodyContent,
    ctaUrl: `${appUrl}/success?id=${encodeURIComponent(regId)}`,
    ctaText: 'VIEW MY REGISTRATION PASS →',
    badgeText: '✓ PAYMENT VERIFIED & CONFIRMED',
    badgeColor: '#6edb8c'
  });

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'PAYMENT_APPROVED',
    registrationId: regId
  });
}

// 5. Payment Rejected Email (Allows resubmission)
async function sendPaymentRejectedEmail({ to, registration, reason }) {
  const regId = registration.registration_id;
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const subject = `Offstage Creators — Payment Verification Update | ${regId}`;
  const headline = `Payment Verification <em>Update</em>`;

  const rejectionReason = reason || 'Payment screenshot was unclear or UTR could not be matched with bank record.';

  const bodyContent = `
    <p class="content-text">
      Hello <b>${escapeHtml(registration.full_name)}</b>,
    </p>
    <p class="content-text">
      We reviewed your payment submission for registration <b>${regId}</b>, but we were unable to verify the transaction.
    </p>

    <div class="highlight-card" style="border-color: #8c3b28;">
      <div class="detail-row">
        <span class="detail-label">Registration ID:</span>
        <span class="detail-val" style="color: #e4ad57; font-family: monospace;">${regId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Submitted UTR:</span>
        <span class="detail-val" style="font-family: monospace;">${escapeHtml(registration.transaction_id || '—')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status:</span>
        <span class="detail-val" style="color: #ff8566;">VERIFICATION FAILED</span>
      </div>
      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #2d2620; font-size: 13px; color: #ff9e85;">
        <b>Organizer Note:</b> ${escapeHtml(rejectionReason)}
      </div>
    </div>

    <p class="content-text">
      Don't worry — your participant details are saved! Please verify that exactly ₹79 was sent to <b>${config.UPI.upiId}</b> and re-upload a clear screenshot showing the UTR number.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Payment proof for ${regId} could not be verified. Please resubmit proof.`,
    headline,
    bodyContent,
    ctaUrl: `${appUrl}/register`,
    ctaText: 'RESUBMIT PAYMENT PROOF →',
    badgeText: 'VERIFICATION UPDATE',
    badgeColor: '#e26947'
  });

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'PAYMENT_REJECTED',
    registrationId: regId
  });
}

// 6. Registration Confirmed Email (Full Details)
async function sendRegistrationConfirmationEmail({ to, registration }) {
  const regId = registration.registration_id;
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const subject = `Offstage Creators — Registration Confirmed ✓ | ${regId}`;
  const headline = `Stage Slot <em>Confirmed!</em>`;

  const bodyContent = `
    <p class="content-text">
      Hello <b>${escapeHtml(registration.full_name)}</b>,
    </p>
    <p class="content-text">
      Your stage slot for <b>Online Open Mic 2026</b> is officially confirmed. Here are your event access details:
    </p>

    <div class="highlight-card">
      <div class="detail-row">
        <span class="detail-label">Registration ID:</span>
        <span class="detail-val" style="color: #e4ad57; font-family: monospace;">${regId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Piece Title:</span>
        <span class="detail-val">${escapeHtml(registration.performance_title || 'Stage Performance')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Slot Duration:</span>
        <span class="detail-val">5 – 7 Minutes</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Show Date:</span>
        <span class="detail-val">23 September 2026</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Call Time:</span>
        <span class="detail-val">7:20 PM IST (Audio Check)</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Show Starts:</span>
        <span class="detail-val">7:30 PM IST</span>
      </div>
    </div>

    <p class="content-text" style="font-size: 13px; color: #8e8477;">
      Please keep your digital QR pass ready when joining the session room.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Your slot is confirmed for Online Open Mic on 23 September.`,
    headline,
    bodyContent,
    ctaUrl: `${appUrl}/success?id=${encodeURIComponent(regId)}`,
    ctaText: 'VIEW MY PASS →',
    badgeText: 'CONFIRMED PASS'
  });

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'REGISTRATION_CONFIRMED',
    registrationId: regId
  });
}

// 7. Check-in Confirmed Email
async function sendCheckinEmail({ to, registration }) {
  const regId = registration.registration_id;
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const subject = `Offstage Creators — Check-in Confirmed ✓`;
  const headline = `Welcome to the <em>Stage!</em>`;

  const bodyContent = `
    <p class="content-text">
      Hello <b>${escapeHtml(registration.full_name)}</b>,
    </p>
    <p class="content-text">
      Your entry and attendance check-in for <b>Online Open Mic</b> have been confirmed.
    </p>

    <div class="highlight-card">
      <div class="detail-row">
        <span class="detail-label">Registration ID:</span>
        <span class="detail-val" style="color: #e4ad57; font-family: monospace;">${regId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Check-in Status:</span>
        <span class="detail-val" style="color: #6edb8c;">CHECKED IN ✓</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Certificate Eligibility:</span>
        <span class="detail-val" style="color: #6edb8c;">ELIGIBLE</span>
      </div>
    </div>

    <p class="content-text">
      Have a memorable performance! Your verified participation certificate is now unlocked and can be generated on the certificate portal.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Check-in confirmed for ${registration.full_name}. Have a great performance!`,
    headline,
    bodyContent,
    ctaUrl: `${appUrl}/certificate`,
    ctaText: 'GET CERTIFICATE →',
    badgeText: 'ATTENDANCE CONFIRMED'
  });

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'CHECKIN_CONFIRMED',
    registrationId: regId
  });
}

// 8. Certificate Available Email
async function sendCertificateAvailableEmail({ to, registration }) {
  const regId = registration.registration_id;
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const subject = `Offstage Creators — Your Participation Certificate`;
  const headline = `Your Certificate is <em>Ready</em>`;

  const bodyContent = `
    <p class="content-text">
      Congratulations <b>${escapeHtml(registration.full_name)}</b>,
    </p>
    <p class="content-text">
      Thank you for your creative contribution to <b>Online Open Mic</b>. Your verified participation certificate is now ready for generation and download.
    </p>

    <div class="highlight-card">
      <div class="detail-row">
        <span class="detail-label">Participant:</span>
        <span class="detail-val">${escapeHtml(registration.full_name)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Registration ID:</span>
        <span class="detail-val" style="color: #e4ad57; font-family: monospace;">${regId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Piece:</span>
        <span class="detail-val">${escapeHtml(registration.performance_title || 'Creative Performance')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Format:</span>
        <span class="detail-val">High-Res PNG &amp; Print-Ready PDF</span>
      </div>
    </div>

    <p class="content-text">
      Click below to preview your certificate and download in high resolution.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Congratulations ${registration.full_name}! Your participation certificate is ready.`,
    headline,
    bodyContent,
    ctaUrl: `${appUrl}/certificate`,
    ctaText: 'DOWNLOAD CERTIFICATE →',
    badgeText: 'CERTIFICATE READY'
  });

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'CERTIFICATE_AVAILABLE',
    registrationId: regId
  });
}

// 9. Admin Notification Email (Pending Verification Alert)
async function sendAdminNotificationEmail({ registration }) {
  const adminEmail = config.EMAIL.user || 'offstagecreators77@gmail.com';
  const appUrl = config.APP_URL || 'http://localhost:3000';
  const regId = registration.registration_id;
  const subject = `New Payment Verification Required | ${regId}`;
  const headline = `New Payment <em>To Verify</em>`;

  const bodyContent = `
    <p class="content-text">
      A participant has submitted payment proof for <b>Online Open Mic</b>. Please verify the credit in the bank statement.
    </p>

    <div class="highlight-card" style="border-color: #e4ad57;">
      <div class="detail-row">
        <span class="detail-label">Registration ID:</span>
        <span class="detail-val" style="color: #e4ad57; font-family: monospace;">${regId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Participant:</span>
        <span class="detail-val">${escapeHtml(registration.full_name)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Phone:</span>
        <span class="detail-val">${escapeHtml(registration.phone)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount:</span>
        <span class="detail-val" style="color: #6edb8c;">₹79</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Submitted UTR:</span>
        <span class="detail-val" style="color: #ffd685; font-family: monospace;">${escapeHtml(registration.transaction_id || '—')}</span>
      </div>
    </div>

    <p class="content-text" style="font-size: 13px; color: #8e8477;">
      Log in to the organizer portal to inspect the receipt screenshot and approve or reject the submission.
    </p>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `New payment proof submitted by ${registration.full_name} (${regId}) for ₹79.`,
    headline,
    bodyContent,
    ctaUrl: `${appUrl}/admin`,
    ctaText: 'REVIEW PAYMENT IN ADMIN →',
    badgeText: 'ACTION REQUIRED: PAYMENT PROOF',
    badgeColor: '#e4ad57'
  });

  return sendEmail({
    to: adminEmail,
    subject,
    html,
    emailType: 'ADMIN_NOTIFICATION',
    registrationId: regId
  });
}

// SMTP Health Check Diagnostic
async function verifySmtpHealth() {
  if (!config.EMAIL.user || !config.EMAIL.password) {
    return {
      success: false,
      error: 'EMAIL_CONFIGURATION_ERROR: MAIL_USER or MAIL_PASSWORD is not configured in environment.',
      code: 'EMAIL_CONFIGURATION_ERROR',
      smtp: {
        host: config.EMAIL.host,
        port: config.EMAIL.port,
        user: config.EMAIL.user || 'NOT_CONFIGURED',
        mode: config.EMAIL.mode
      }
    };
  }

  try {
    if (!transporter) {
      transporter = createTransporter();
    }
    if (!transporter) {
      return {
        success: false,
        error: 'EMAIL_CONFIGURATION_ERROR: Transporter could not be initialized.',
        code: 'EMAIL_CONFIGURATION_ERROR',
        smtp: {
          host: config.EMAIL.host,
          port: config.EMAIL.port,
          user: config.EMAIL.user,
          mode: config.EMAIL.mode
        }
      };
    }

    await transporter.verify();
    return {
      success: true,
      message: 'SMTP Connected & Authenticated ✓',
      smtp: {
        host: config.EMAIL.host,
        port: config.EMAIL.port,
        user: config.EMAIL.user,
        mode: config.EMAIL.mode
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'SMTP verification failed',
      smtp: {
        host: config.EMAIL.host,
        port: config.EMAIL.port,
        user: config.EMAIL.user,
        mode: config.EMAIL.mode
      }
    };
  }
}

// Admin Send Test Diagnostic Email
async function sendTestEmail(targetRecipient) {
  const to = targetRecipient || config.EMAIL.testEmailTo || config.EMAIL.user || 'offstagecreators77@gmail.com';
  const subject = `Offstage Creators — SMTP Health Check [${new Date().toLocaleTimeString()}]`;
  const headline = `SMTP Diagnostic <em>Successful</em>`;

  const bodyContent = `
    <p class="content-text">
      This is an automated test message from the <b>Offstage Creators</b> mail subsystem.
    </p>
    <div class="highlight-card">
      <div class="detail-row">
        <span class="detail-label">Host:</span>
        <span class="detail-val">${config.EMAIL.host}:${config.EMAIL.port}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Sender:</span>
        <span class="detail-val">${config.EMAIL.user}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Mode:</span>
        <span class="detail-val" style="color: #6edb8c;">${config.EMAIL.mode}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Timestamp:</span>
        <span class="detail-val">${new Date().toISOString()}</span>
      </div>
    </div>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: 'Offstage Creators mail system is operational.',
    headline,
    bodyContent,
    badgeText: 'SMTP HEALTH CHECK'
  });

  return sendEmail({
    to,
    subject,
    html,
    emailType: 'HEALTH_CHECK'
  });
}

// Safe Variable Interpolation
function interpolateVariables(text, variables) {
  if (!text) return '';
  return String(text).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (key in variables) {
      return escapeHtml(variables[key]);
    }
    return match;
  });
}

// Google Meet Session Email Renderer
function renderMeetSessionEmail({ session, participant, customMessage }) {
  const eventName = session.event_name || 'Offstage Creators Event';
  const sessionTitle = session.title || 'Live Online Session';
  const sessionDate = session.date || '';
  const sessionTime = session.time || '';
  const meetUrl = session.meet_url || '';
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
  const rawMessage = customMessage !== undefined ? customMessage : (session.message || '');
  const formattedMessage = rawMessage ? interpolateVariables(rawMessage, variables).replace(/\r?\n/g, '<br>') : '';

  const bodyContent = `
    <p class="content-text">
      Hello <b>${escapeHtml(participantName)}</b>,
    </p>
    <p class="content-text">
      Here are the live Google Meet access details for your upcoming session for <b>${escapeHtml(eventName)}</b>.
    </p>

    <div class="highlight-card">
      <div class="detail-row">
        <span class="detail-label">Event:</span>
        <span class="detail-val">${escapeHtml(eventName)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Session:</span>
        <span class="detail-val" style="color: #ffd685; font-weight: 700;">${escapeHtml(sessionTitle)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date:</span>
        <span class="detail-val">${escapeHtml(sessionDate)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Time:</span>
        <span class="detail-val">${escapeHtml(sessionTime)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Meet Link:</span>
        <span class="detail-val" style="font-family: monospace; font-size: 13px;">
          <a href="${escapeHtml(meetUrl)}" target="_blank" style="color: #e4ad57; text-decoration: underline; word-break: break-all;">
            ${escapeHtml(meetUrl)}
          </a>
        </span>
      </div>
    </div>

    ${formattedMessage ? `
      <div style="background: rgba(228, 173, 87, 0.06); border-left: 3px solid #e4ad57; padding: 18px 20px; margin: 24px 0; border-radius: 4px;">
        <p style="font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: #e4ad57; text-transform: uppercase; margin: 0 0 10px;">
          Organizer Note
        </p>
        <div style="font-size: 14px; line-height: 1.7; color: #f7eee1;">
          ${formattedMessage}
        </div>
      </div>
    ` : ''}

    <div class="card" style="background: #120f0d; border: 1px solid #201c18; padding: 16px 20px; margin-top: 24px; border-radius: 6px;">
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #8e8477; margin-bottom: 6px;">
        <span>Participant: <b style="color: #d5cbbd;">${escapeHtml(participantName)}</b></span>
        <span>Registration ID: <b style="color: #e4ad57; font-family: monospace;">${escapeHtml(regId)}</b></span>
      </div>
      <p style="font-size: 12px; color: #80766a; line-height: 1.6; margin: 8px 0 0; border-top: 1px solid #1a1612; padding-top: 8px;">
        ✦ <b>Session Guidelines</b>: Please join the room 5–10 minutes prior to the start time. Keep your microphone muted upon entry until your name is announced.
      </p>
    </div>
  `;

  const html = renderEmailWrapper({
    title: subject,
    preheader: `Google Meet details for ${sessionTitle} (${sessionDate})`,
    headline: `${escapeHtml(sessionTitle)}`,
    badgeText: 'LIVE GOOGLE MEET SESSION',
    bodyContent,
    ctaUrl: meetUrl,
    ctaText: 'JOIN GOOGLE MEET →'
  });

  return { subject, html };
}

// Send Google Meet Email (Single or Test)
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
    emailType: isTest ? 'MEET_TEST' : 'MEET_SESSION',
    registrationId: participant?.registration_id || null
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = {
  generateOtp,
  generateSalt,
  hashOtp,
  verifyOtpHash,
  refreshTransporter,
  sendEmail,
  sendEmailVerificationEmail,
  sendRegistrationReceivedEmail,
  sendPaymentProofReceivedEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
  sendRegistrationConfirmationEmail,
  sendCheckinEmail,
  sendCertificateAvailableEmail,
  sendAdminNotificationEmail,
  verifySmtpHealth,
  sendTestEmail,
  interpolateVariables,
  renderMeetSessionEmail,
  sendMeetEmail
};
