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

  // Event constants
  OPEN_MIC_FEE_INR: parseInt(process.env.OPEN_MIC_FEE_INR, 10) || 79,

  UPI: {
    upiId: 'preetiyadav15071985@okaxis',
    payeeName: 'Preeti Yadav / Offstage Creators',
    qrAssetPath: '/assets/payment-qr.jpeg',
    amount: 79
  },

  EMAIL: {
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT, 10) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER || '',
    password: (process.env.MAIL_PASSWORD || '').replace(/\s+/g, ''),
    from: process.env.MAIL_FROM || process.env.MAIL_USER || '',
    fromName: process.env.MAIL_FROM_NAME || 'Offstage Creators'
  },

  EVENT: {
    id: 'online-open-mic-2026',
    title: 'Online Open Mic 2026',
    date: '23 September',
    time: '7:30 PM IST',
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
  OTP_EXPIRY_MINUTES: 10,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 60
};
