/**
 * Offstage Creators — Express Server Entry Point
 */
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const config = require('./config');

// ─── Routers ──────────────────────────────────────────────────────────────────
const registrationsRouter = require('./routes/registrations');
const otpRouter = require('./routes/otp');
const paymentsRouter = require('./routes/payments');
const scannerRouter = require('./routes/scanner');
const certificateRouter = require('./routes/certificate');
const adminRouter = require('./routes/admin');
const emailRouter = require('./routes/email');

// Load meet router conditionally (may not exist in all deployments)
let meetRouter;
try {
  meetRouter = require('./routes/meet');
} catch (_) {
  meetRouter = null;
}

const app = express();

// ─── Trust Proxy (required for Vercel / rate limiting to work correctly) ──────
app.set('trust proxy', 1);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: config.APP_URL,
  credentials: true
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ─── Session ──────────────────────────────────────────────────────────────────
const isProd = config.NODE_ENV === 'production';
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,          // HTTPS only in production
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 8 * 60 * 60 * 1000  // 8 hours
  },
  name: 'oc.sid'
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────

// OTP endpoints: 10 requests per 15 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many OTP requests. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Registration endpoint: 20 per hour per IP
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Admin login: 10 attempts per 15 minutes per IP
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many login attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ─── Static Files ─────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.use('/assets', express.static(path.join(publicDir, 'assets')));

// Vercel Analytics stub for local dev
app.get(['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js'], (req, res) => {
  res.type('application/javascript').send('/* [local dev] Vercel Analytics stub */');
});

// Uploaded screenshots
const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const uploadsDir = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/registrations', registrationLimiter, registrationsRouter);
app.use('/api/otp', otpLimiter, otpRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/scanner', scannerRouter);
app.use('/api/certificate', certificateRouter);
app.use('/api/admin/login', adminLoginLimiter);  // rate limit login specifically
app.use('/api/admin', adminRouter);
app.use('/api/email', emailRouter);
if (meetRouter) app.use('/api/admin/meet', meetRouter);

// Public config endpoint
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    event: config.EVENT,
    delhiEvent: config.DELHI_EVENT,
    upi: config.UPI,
    fee: config.OPEN_MIC_FEE_INR,
    amount: config.OPEN_MIC_FEE_INR
  });
});

// ─── Frontend HTML Routes ─────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get(['/register', '/registration'], (req, res) => res.sendFile(path.join(publicDir, 'register.html')));
app.get('/registration/:id', (req, res) => res.sendFile(path.join(publicDir, 'registration.html')));
app.get(['/registration/success', '/success'], (req, res) => res.sendFile(path.join(publicDir, 'success.html')));
app.get('/certificate', (req, res) => res.sendFile(path.join(publicDir, 'certificate.html')));
app.get('/scanner', (req, res) => res.sendFile(path.join(publicDir, 'scanner.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(publicDir, 'admin.html')));

// Fallback — serve index.html
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (!isVercel && require.main === module) {
  app.listen(config.PORT, () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  ✦ OFFSTAGE CREATORS PLATFORM ✦`);
    console.log(`  URL:         http://localhost:${config.PORT}`);
    console.log(`  Environment: ${config.NODE_ENV}`);
    console.log(`  Register:    http://localhost:${config.PORT}/register`);
    console.log(`  Admin:       http://localhost:${config.PORT}/admin`);
    console.log('═══════════════════════════════════════════════════════');
  });
}

module.exports = app;
