# ✦ Offstage Creators Platform ✦

> **Official Event, Ticketing, Manual UPI Verification, and Live Session Management Suite**  
> Built with Node.js, Express, SQLite, and Vanilla CSS/JS.  
> *Zero 3rd-party payment gateway dependencies (No Razorpay). Direct ₹79 UPI verification + Gmail SMTP notification system.*

---

## 📋 Table of Contents

1. [Overview & Features](#overview--features)
2. [Event Architecture & Lineup](#event-architecture--lineup)
3. [Technology Stack](#technology-stack)
4. [Manual UPI Payment Flow (₹79)](#manual-upi-payment-flow-79)
5. [Google Meet Live Session System](#google-meet-live-session-system)
6. [Email Notification Suite (Gmail SMTP)](#email-notification-suite-gmail-smtp)
7. [QR Ticketing & Event Scanner](#qr-ticketing--event-scanner)
8. [Verified Certificate System](#verified-certificate-system)
9. [Admin Dashboard & Security](#admin-dashboard--security)
10. [Local Development Setup](#local-development-setup)
11. [Environment Variables](#environment-variables)
12. [Automated Test Suite](#automated-test-suite)
13. [Production Deployment](#production-deployment)

---

## 1. Overview & Features

Offstage Creators is a creative community platform for poets, storytellers, stand-up comedians, and musicians. The platform manages attendee and performer lifecycle end-to-end:

- **Featured Showcase**: Multi-event discovery with Online Open Mic dominating as Event #1 and Adhure Musafir (Delhi Show) as Event #2.
- **Performer Registration**: Multi-step booking form with client-side input masking and server-side validation.
- **Email OTP Verification**: Two-factor email validation before payment proof submission to eliminate spam and invalid email addresses.
- **Manual UPI Payment Verification**: Direct ₹79 UPI QR payment (`preetiyadav15071985@okaxis`), transaction screenshot upload, unique UTR verification, and admin approval.
- **Live Session / Google Meet Dispatcher**: Admin-only manual Meet link distributor with variable interpolation (`{{name}}`, `{{meet_link}}`, etc.), live responsive email preview, test email dispatch, batch delivery throttling, and failed retry queue.
- **Event Entry QR Passes & Scanner**: Client-side SVG/Canvas QR pass generation matching registration ID, and an in-browser camera QR code scanner with duplicate entry prevention.
- **Participation Certificates**: Dynamic Canvas-rendered certificates with verified signature seals, exportable to high-resolution PNG and PDF (via jsPDF).

---

## 2. Event Architecture & Lineup

The homepage and registration routing strictly follow this order:

1. **Event #1: Online Open Mic 2026**
   - **Date**: 23 September
   - **Time**: 7:30 PM IST
   - **Registration Fee**: ₹79 only
   - **Perks**: 5-7 minute slot, live audience, verified participation certificate.
   - **Route**: [`/register`](http://localhost:3000/register)
2. **Event #2: Adhure Musafir (Delhi Ground Show)**
   - **Date**: 4 October 2026
   - **Time**: 3:30 PM onwards
   - **Venue**: The Comedy Theatre, Hauz Khas, New Delhi
   - **Ticketing**: Linked directly to BookMyShow ([ET00515735](https://in.bookmyshow.com/events/adhure-musafir/ET00515735)).

---

## 3. Technology Stack

- **Backend**: Node.js, Express 4, Multer (multipart screenshot uploads), CORS.
- **Database**: SQLite3 via `data/offstage.db` (clean relational tables, zero external database setup required).
- **Email Delivery**: Nodemailer via Gmail SMTP (`smtp.gmail.com:587`), TLS, with transient error backoff retry.
- **Frontend**: Semantic HTML5, Vanilla CSS3 (curated dark/gold/warm aesthetic, glassmorphism, responsive mobile drawer), Vanilla ES6 JavaScript.
- **Libraries**:
  - `qrcode` (Server-side) & `qrcode.js` (Client-side ticket QR rendering)
  - `html5-qrcode` (Browser camera barcode/QR scanner)
  - `jspdf` (Client-side vector PDF certificate generator)
- **Zero Razorpay**: All legacy Razorpay SDKs, routes, test simulator scripts, and keys have been completely eradicated.

---

## 4. Manual UPI Payment Flow (₹79)

```
[ User Registers ]
       │
       ▼
[ Server issues Registration ID (e.g. OC-OM-XXXX) ]
       │
       ▼
[ Email OTP Sent (6-digit, salted SHA-256 hash) ]
       │
       ▼
[ User Verifies Email OTP ]
       │
       ▼
[ User views ₹79 UPI QR (preetiyadav15071985@okaxis) ]
       │
       ▼
[ User pays via GPay / PhonePe / Paytm / BHIM ]
       │
       ▼
[ User uploads Screenshot + enters 12-digit UTR ]
       │
       ▼
[ Backend saves proof in /uploads/screenshots ]
[ Status = PENDING_VERIFICATION ]
       │
       ▼
[ Admin reviews UTR & image in Dashboard ]
       ├── APPROVE ──► Status = PAID ──► Ticket Pass Unlocked & Emailed
       └── REJECT  ──► Status = REJECTED (Custom Reason) ──► Re-submission Allowed
```

- **Duplicate UTR Prevention**: The database enforces uniqueness on submitted transaction IDs across registrations to prevent fraud.
- **Tamper-Proof Status**: The frontend cannot alter payment status; only authenticated admin calls to `/api/admin/verify-payment` can transition a record to `PAID`.

---

## 5. Google Meet Live Session System

Located in the Admin Dashboard under **"🎥 Live Session / Google Meet"**:

- **Manual Link Entry**: Accepts standard Google Meet URLs (`https://meet.google.com/xxx-xxxx-xxx`). Strictly no automated Google Calendar OAuth required.
- **Dynamic Message Variables**: Organizers can use variables safely interpolated into the participant's email:
  - `{{name}}` — Participant's full name
  - `{{registration_id}}` — Unique registration ID
  - `{{event_name}}` — Selected event title
  - `{{session_title}}` — Session headline
  - `{{date}}` — Session date
  - `{{time}}` — Session time
  - `{{meet_link}}` — Google Meet link
- **Targeting Modes**:
  - `All Confirmed Participants` (paid performers for the selected event)
  - `Selected Participants` (searchable checklist with select/unselect all)
  - `Not Yet Sent` (excludes participants who already received links for this session)
- **Live Preview & Test Dispatch**: Real-time rendering with Desktop/Mobile toggle buttons and one-click test email dispatch.
- **Throttling & Resilience**: 350ms delay between batch emails to satisfy Gmail SMTP rate limits, plus automatic exponential retry on 421/451 errors.
- **Audit Logs & Retry**: Database tracks every delivery in `meet_email_logs`. Failed recipients can be retried with one click without duplicating successful recipients.

---

## 6. Email Notification Suite (Gmail SMTP)

Dispatches branded HTML emails with dark obsidian card headers, gold trim, clear CTAs, and sender attribution:
- `EMAIL_VERIFICATION` — 6-digit registration OTP.
- `REGISTRATION_RECEIVED` — Booking acknowledgement with UPI instructions.
- `PAYMENT_PROOF_RECEIVED` — Confirmation that UTR and screenshot are under organizer review.
- `PAYMENT_APPROVED` — Official confirmation with link to digital QR ticket pass.
- `PAYMENT_REJECTED` — Polite rejection notice citing the organizer's reason and link to upload new proof.
- `MEET_SESSION` — Google Meet invitation with high-visibility **"JOIN GOOGLE MEET →"** button.
- `CHECKIN_CONFIRMED` — Venue check-in greeting and certificate portal link.
- `CERTIFICATE_AVAILABLE` — Direct certificate download notification.

---

## 7. QR Ticketing & Event Scanner

- **QR Pass Page** ([`/success?id=OC-OM-XXXX`](http://localhost:3000/success)): Shows attendee credentials, category, verified status badge, and dynamic QR code encoding only the unique registration ID.
- **Scanner Portal** ([`/scanner`](http://localhost:3000/scanner)):
  - Built-in camera viewfinder using `html5-qrcode` with manual ID entry fallback.
  - Verifies payment status in real-time. Unpaid records are denied entry (`PAYMENT NOT SUBMITTED`).
  - Records single check-in. Subsequent scans trigger an `ALREADY CHECKED IN` warning with timestamp.

---

## 8. Verified Certificate System

- **Certificate Page** ([`/certificate`](http://localhost:3000/certificate)):
  - Available only to participants whose payment is `PAID` and who have completed venue check-in (`checked_in = 1`).
  - High-definition HTML5 Canvas rendering featuring the official Offstage Creators circular insignia, gold borders, calligraphy title, participant name, performance details, verification hash, and signatures of founders Muskaan & Shlok.
  - **Export Formats**: Instant 300 DPI PNG download and vector PDF export via `jsPDF`.

---

## 9. Admin Dashboard & Security

Accessible at [`/admin`](http://localhost:3000/admin):

- **Protected by Secret Key**: Requires `ADMIN_SECRET` passed via `x-admin-secret` header.
- **Dashboard Metrics**:
  - Total Registrations, Confirmed Paid, Awaiting Verification, Unpaid/Pending, Checked In, Revenue (₹), Google Meet Sessions Created, and Invitations Sent.
- **Pending Verification Queue**: Side-by-side inspection of uploaded payment screenshots, participant phone/email, and submitted UTR with one-click **"Approve (Mark Paid)"** or **"Reject"** with custom reason.
- **Searchable Registrations Master Table**: Filter by status or category, manual payment override, manual check-in toggle, and CSV audit export.
- **Meet Broadcast Studio**: Complete session builder, live preview, test sender, and recipient tracking.

---

## 10. Local Development Setup

### Prerequisites
- Node.js 18.x or higher
- npm 9.x or higher

### Installation
```bash
# 1. Clone repository
git clone https://github.com/rishiprattap/OC.git
cd OC

# 2. Install dependencies
npm install

# 3. Create environment configuration
cp .env.example .env

# 4. Edit .env with your credentials (see section 11)
```

### Running Locally
```bash
# Start production server
npm start

# Or start in watch mode for development
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## 11. Environment Variables

Configure your variables in `.env` (strictly excluded from git):

```env
# Application Port and URL
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

# Admin Authorization Key (Required to access /admin)
ADMIN_SECRET=YOUR_ADMIN_SECRET_HERE

# Event Constants
OPEN_MIC_FEE_INR=79

# Email Configuration (Gmail SMTP)
EMAIL_MODE=LIVE                  # Set to 'LIVE' for actual dispatch, 'TEST' for simulated
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=offstagecreators77@gmail.com
MAIL_PASSWORD=your_16_char_google_app_password
MAIL_FROM=offstagecreators77@gmail.com
MAIL_FROM_NAME=Offstage Creators
TEST_EMAIL_TO=your_personal_email@gmail.com
```

> **Note on Gmail App Passwords**:  
> Gmail requires a 16-character **App Password** created under Google Account Security &rarr; 2-Step Verification &rarr; App Passwords. Standard Google passwords will fail with SMTP error 535.

---

## 12. Automated Test Suite

The project includes an end-to-end master test suite validating all backend endpoints, validation rules, security gates, email rendering, and Meet dispatchers:

```bash
npm test
```

### Test Coverage (119 Tests — 100% Pass Rate):
1. **Platform & Payment Suite (`tests/test_platform.js`) — 52 Tests**:
   - Config API verification (`₹79`, UPI ID, QR asset).
   - Homepage event ordering (Open Mic #1, Delhi Show #2, zero "Coming Soon").
   - Multi-step registration, field validation, unique ID generation.
   - Email verification OTP generation and validation.
   - Payment screenshot upload & UTR handling.
   - Duplicate UTR collision prevention across registrations (HTTP 409).
   - Admin pending queue, overview stats, payment verification to `PAID`.
   - Admin payment rejection with custom reason.
   - Scanner ticket check-in and duplicate check-in blocking.
   - Certificate generation access control.
   - Admin security (unauthenticated access rejected with HTTP 401).
   - CSV audit export.
2. **Gmail SMTP & Email Suite (`tests/test_email_system.js`) — 32 Tests**:
   - Live SMTP connection health check.
   - Hashed OTP storage (salted SHA-256).
   - Proof submission blocked before email verification (HTTP 403).
   - Invalid OTP rejection & attempt incrementing.
   - Admin transactional email resending.
   - Credential protection (no passwords exposed in public endpoints).
3. **Google Meet Broadcast Suite (`tests/test_meet_system.js`) — 35 Tests**:
   - Security verification on `/api/admin/meet/*`.
   - Safe variable interpolation with HTML escaping (`{{name}}`, etc.).
   - Live HTML preview generation.
   - URL validation (accepts `meet.google.com/xxx-xxxx-xxx`, rejects invalid/malicious links).
   - Test email dispatch.
   - Recipient filtering (`ALL_PAID`, `SELECTED`, `NOT_SENT`).
   - Batch sequential sending with delivery logging.
   - Session delivery history and retry queue for failed deliveries.

---

## 13. Production Deployment

### Recommended Architecture (VPS / Ubuntu / Render)
```bash
# 1. Install PM2 process manager
npm install -g pm2

# 2. Start application
pm2 start server/index.js --name "offstage-creators"

# 3. Save PM2 startup list
pm2 save
pm2 startup
```

### Reverse Proxy (Nginx Example)
```nginx
server {
    listen 80;
    server_name offstagecreators.in www.offstagecreators.in;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📜 License & Copyright

© 2026 Offstage Creators. All rights reserved.  
Built with ♡ for the creative community.
