/**
 * Offstage Creators — Server Configuration
 * All sensitive values loaded from environment variables only.
 */
require('dotenv').config();

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_URL: process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),

  // Admin credentials — must be set via environment
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@offstagecreators.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_SECRET: process.env.ADMIN_SECRET || 'R!SHI88',

  // Session security
  SESSION_SECRET: process.env.SESSION_SECRET || 'change_this_in_production_please',
  OTP_SECRET: process.env.OTP_SECRET || process.env.SESSION_SECRET || 'oc_otp_secure_hmac_secret',

  // Resend API keys & sender identities (offstagecreators.in domain)
  RESEND: {
    domain: 'offstagecreators.in',
    otpApiKey: process.env.RESEND_OTP_API_KEY || process.env.RESEND_API_KEY || '',
    registrationApiKey: process.env.RESEND_REGISTRATION_API_KEY || process.env.RESEND_API_KEY || '',
    eventUpdatesApiKey: process.env.RESEND_EVENT_UPDATES_API_KEY || process.env.RESEND_API_KEY || '',
    defaultApiKey: process.env.RESEND_API_KEY || '',
    senders: {
      otp: 'Offstage Creators <verify@offstagecreators.in>',
      registration: 'Offstage Creators <registrations@offstagecreators.in>',
      events: 'Offstage Creators <events@offstagecreators.in>',
      support: 'support@offstagecreators.in'
    }
  },

  // Event constants
  OPEN_MIC_FEE_INR: parseInt(process.env.OPEN_MIC_FEE_INR, 10) || 79,

  UPI: {
    upiId: 'rishiprattap@fam',
    payeeName: 'Rishi Pratap',
    qrAssetPath: '/assets/payment-qr.jpeg',
    amount: 79
  },

  EMAIL: {
    host: process.env.MAIL_HOST || '',
    port: parseInt(process.env.MAIL_PORT, 10) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER || '',
    password: (process.env.MAIL_PASSWORD || '').replace(/\s+/g, ''),
    from: process.env.MAIL_FROM || 'Offstage Creators <registrations@offstagecreators.in>',
    fromName: process.env.MAIL_FROM_NAME || 'Offstage Creators'
  },

  EVENT: {
    id: 'online-open-mic-2026',
    title: 'Online Open Mic 2026',
    date: '7 October',
    time: '6:00 PM IST',
    fee: 79,
    voice: 'Tomboy',
    tagline: 'ek lafz. ek awaaz. aur ek shaam.'
  },

  DELHI_EVENT: {
    id: 'delhi-adhure-musafir-2026',
    title: 'Adhure Musafir',
    date: '4 October 2026',
    time: '3:30 PM onwards',
    venue: 'The Comedy Theatre, Hauz Khas, New Delhi',
    bookMyShowUrl: 'https://in.bookmyshow.com/events/adhure-musafir/ET00515735'
  },

  // OTP settings
  OTP_EXPIRY_MINUTES: 5,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 60
};
