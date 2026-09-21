const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('./config');

const registrationsRouter = require('./routes/registrations');
const paymentsRouter = require('./routes/payments');
const scannerRouter = require('./routes/scanner');
const certificateRouter = require('./routes/certificate');
const adminRouter = require('./routes/admin');
const emailRouter = require('./routes/email');
const meetRouter = require('./routes/meet');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Static files
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
// Static assets
const publicAssetsDir = path.join(publicDir, 'assets');
app.use('/assets', express.static(publicAssetsDir));
app.use('/OC/assets', express.static(publicAssetsDir)); // backwards compatibility if any client has /OC/assets cached

// Local dev stubs for Vercel Analytics & Speed Insights to prevent 404 console errors
app.get(['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js'], (req, res) => {
  res.type('application/javascript').send('/* [local dev] Vercel Analytics / Speed Insights stub */');
});

// Uploaded screenshots
const uploadsDir = path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api/registrations', registrationsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/scanner', scannerRouter);
app.use('/api/certificate', certificateRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/meet', meetRouter);
app.use('/api/email', emailRouter);

// Public config endpoint for client UI
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    event: config.EVENT,
    delhiEvent: config.DELHI_EVENT,
    upi: config.UPI,
    fee: config.OPEN_MIC_FEE_INR
  });
});

// Clean Frontend HTML Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get(['/register', '/registration'], (req, res) => {
  res.sendFile(path.join(publicDir, 'register.html'));
});

app.get(['/registration/success', '/success'], (req, res) => {
  res.sendFile(path.join(publicDir, 'success.html'));
});

app.get('/certificate', (req, res) => {
  res.sendFile(path.join(publicDir, 'certificate.html'));
});

app.get('/scanner', (req, res) => {
  res.sendFile(path.join(publicDir, 'scanner.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Fallback for subpaths or index
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(config.PORT, () => {
  console.log('========================================================');
  console.log(`✦ OFFSTAGE CREATORS PLATFORM RUNNING ✦`);
  console.log(`URL: http://localhost:${config.PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Event #1: ${config.EVENT.title} (${config.EVENT.date} at ${config.EVENT.time}) - Fee: ₹${config.OPEN_MIC_FEE_INR}`);
  console.log(`Event #2: ${config.DELHI_EVENT.title} (${config.DELHI_EVENT.date})`);
  console.log(`Registration Route: http://localhost:${config.PORT}/register`);
  console.log(`Certificate Route: http://localhost:${config.PORT}/certificate`);
  console.log(`Scanner Route: http://localhost:${config.PORT}/scanner`);
  console.log(`Admin Portal: http://localhost:${config.PORT}/admin`);
  console.log('========================================================');
});

module.exports = app;
