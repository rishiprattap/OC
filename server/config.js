require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL || '',
  ADMIN_SECRET: process.env.ADMIN_SECRET || 'R!SHI88',
  OPEN_MIC_FEE_INR: parseInt(process.env.OPEN_MIC_FEE_INR, 10) || 79,
  UPI: {
    upiId: 'preetiyadav15071985@okaxis',
    payeeName: 'Preeti Yadav / Offstage Creators',
    qrAssetPath: '/assets/payment-qr.jpeg',
    amount: 79
  },
  EMAIL: {
    mode: process.env.EMAIL_MODE || 'TEST',
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.MAIL_PORT, 10) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER || 'offstagecreators77@gmail.com',
    password: (process.env.MAIL_PASSWORD || '').replace(/\s+/g, ''), // clean any space formatting in App Password
    from: process.env.MAIL_FROM || 'offstagecreators77@gmail.com',
    fromName: process.env.MAIL_FROM_NAME || 'Offstage Creators',
    testEmailTo: process.env.TEST_EMAIL_TO || 'offstagecreators77@gmail.com'
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
  }
};
