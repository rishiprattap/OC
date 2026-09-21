# ✦ Offstage Creators Platform ✦

> **Production-Ready Event Registration, Email OTP Verification, and Ticketing Platform**  
> Built with Node.js, Express, SQLite, and Vanilla CSS/JS.  
> *Features cryptographically secure Email OTP verification, deterministic registration state lifecycle, server-generated QR passes, and a session-based Admin Dashboard.*

---

## 📋 Table of Contents

1. [Overview & Highlights](#1-overview--highlights)
2. [Event Information](#2-event-information)
3. [Registration & OTP Verification Flow](#3-registration--otp-verification-flow)
4. [Technology Stack & Architecture](#4-technology-stack--architecture)
5. [Database Schema & State Machine](#5-database-schema--state-machine)
6. [Email Notification System](#6-email-notification-system)
7. [QR Code Ticketing & Permalink Routes](#7-qr-code-ticketing--permalink-routes)
8. [Admin Dashboard & Security](#8-admin-dashboard--security)
9. [Environment Variables & Configuration](#9-environment-variables--configuration)
10. [Local Development Setup](#10-local-development-setup)
11. [Automated Test Suite](#11-automated-test-suite)
12. [Production Deployment](#12-production-deployment)

---

## 1. Overview & Highlights

Offstage Creators is a creative community platform for poets, storytellers, stand-up comedians, and musicians. The platform has been rebuilt from scratch to provide a robust, deterministic event registration experience:

- **Server-Side Email OTP Verification**: Cryptographically secure 6-digit OTP generation (`crypto.randomInt`), salted SHA-256 storage, constant-time comparison, 10-minute expiry, 5-attempt brute-force protection, and 60-second resend cooldown.
- **Deterministic Registration Lifecycle**: Registration state is persisted in the database (`PENDING_VERIFICATION` → `VERIFIED` → `APPROVED` / `REJECTED`), never relying on volatile frontend memory.
- **Dedicated QR Pass Permalinks**: `/registration/:id` loads verified registration state and renders a server-generated QR code. Survives page refreshes and direct URL access.
- **Secure Admin Panel**: Session-based admin authentication (`express-session` with HTTP-only cookies). Admins can search, filter by status, approve (auto-triggers approval email), reject with reason (auto-triggers rejection email), and check in attendees.
- **Transactional HTML Email Service**: Nodemailer-based SMTP service with responsive HTML templates for OTP verification, registration confirmation, admin approval, and rejection updates.
- **Full Privacy & Analytics**: Integrated Vercel Web Analytics & Speed Insights with automatic PII sanitization and zero admin tracking.

---

## 2. Event Information

1. **Event #1: Online Open Mic 2026** (Featured Platform Event)
   - **Date**: 23 September
   - **Time**: 7:30 PM IST
   - **Venue**: Online (Google Meet)
   - **Fee**: ₹79 only
   - **Perks**: 5–7 minute performance slot, live audience, verified participation certificate.
   - **Route**: [`/register`](http://localhost:3000/register)
2. **Event #2: Adhure Musafir (Delhi Ground Show)**
   - **Date**: 4 October 2026
   - **Time**: 3:30 PM onwards
   - **Venue**: The Comedy Theatre, Hauz Khas, New Delhi
   - **Ticketing**: Direct BookMyShow partnership ([ET00515735](https://in.bookmyshow.com/events/adhure-musafir/ET00515735)).

---

## 3. Registration & OTP Verification Flow

```
[ Step 1: User Form Submission ]
  Performer fills Name, Email, Phone, Category, Performance Title.
  Frontend validates all fields client-side before sending.
       │
       ▼
[ Step 2: Backend Registration Creation ]
  Backend creates registration record with status: PENDING_VERIFICATION.
  Generates unique registration ID (e.g., OC-OM-XXXXXX).
  Generates secure 6-digit random OTP, salts & hashes it (SHA-256).
  Stores hash, salt, expiry (10 min), and attempt counter in otp_sessions table.
       │
       ▼
[ Step 3: Transactional OTP Email Sent ]
  Nodemailer sends professional HTML verification email to user via SMTP.
  Resend cooldown (60s) enforced.
       │
       ▼
[ Step 4: OTP Verification Screen ]
  User enters 6-digit code on interactive verification screen.
  Backend validates hash in constant time, increments attempts, checks expiry.
  On success: status becomes VERIFIED, otp_verified = 1.
  Confirmation email sent with registration ID and pass link.
       │
       ▼
[ Step 5: Registration Pass / QR Code Page ]
  User views dedicated pass at /registration/:id with server-generated QR code.
  Survives page refreshes and direct URL access.
       │
       ▼
[ Step 6: Admin Review & Approval ]
  Admin views registration in /admin panel.
  On Approve: status becomes APPROVED; backend sends Congratulations & Guidelines email.
  On Reject: status becomes REJECTED; backend sends update email with custom reason.
```

---

## 4. Technology Stack & Architecture

```
OC/
├── api/                    # Vercel Serverless Function entrypoint (index.js)
├── data/                   # SQLite database directory (offstage.db)
├── public/                 # Rebuilt static frontend assets
│   ├── css/                # style.css, forms.css
│   ├── js/
│   │   ├── main.js         # Landing page interactions & mobile nav
│   │   ├── register.js     # Multi-step registration & OTP entry controller
│   │   ├── registration.js # /registration/:id permalink controller
│   │   ├── admin.js        # Session-authenticated Admin panel controller
│   │   └── analytics.js    # Privacy-filtered Vercel analytics wrapper
│   ├── index.html          # Modern dark/gold landing page
│   ├── register.html       # 3-step registration & OTP verification page
│   ├── registration.html   # Dedicated registration pass & QR page
│   ├── admin.html          # Session-protected Admin dashboard
│   ├── success.html        # Legacy redirect handler
│   ├── certificate.html    # Dynamic canvas participation certificate generator
│   └── scanner.html        # Camera-based event entry scanner
├── server/                 # Express backend
│   ├── routes/
│   │   ├── registrations.js# POST create, GET /:id permalink + QR
│   │   ├── otp.js          # POST /send, POST /verify
│   │   ├── admin.js        # POST /login, GET /overview, POST /approve, /reject, /checkin
│   │   └── email.js        # Email audit logs & redirect endpoints
│   ├── services/
│   │   ├── otp.js          # Crypto OTP generation, hashing, rate limits
│   │   └── email.js        # Nodemailer SMTP service + HTML email templates
│   ├── config.js           # Centralized environment-based configuration
│   ├── db.js               # SQLite connection, schema setup, indexed tables
│   └── index.js            # Express server initialization & middleware
├── tests/                  # Automated test suite
│   ├── test_platform.js    # Rebuilt platform & OTP flow tests (39 assertions)
│   ├── test_analytics.js   # Privacy & script verification suite
│   └── run_all.js          # Master test runner
├── vercel.json             # Vercel deployment routing & rewrites
├── package.json            # Project manifest & dependencies
├── .env.example            # Environment template
└── README.md               # Documentation
```

---

## 5. Database Schema & State Machine

The SQLite database (`data/offstage.db`) defines the following core tables:

### `registrations`
- `id` (INTEGER PRIMARY KEY)
- `registration_id` (TEXT UNIQUE) — e.g., `OC-OM-69410FF1`
- `event_id` (TEXT)
- `full_name` (TEXT)
- `email` (TEXT)
- `phone` (TEXT)
- `city` (TEXT)
- `category` (TEXT) — Poetry & Shayari, Stand-up Comedy, Storytelling, Singing/Music
- `instagram` (TEXT)
- `performance_title` (TEXT)
- `performance_description` (TEXT)
- `amount` (REAL)
- `otp_verified` (INTEGER: 0 or 1)
- `otp_verified_at` (DATETIME)
- `reg_status` (TEXT) — `PENDING_VERIFICATION`, `VERIFIED`, `APPROVED`, `REJECTED`
- `checked_in` (INTEGER: 0 or 1)
- `checkin_at` (DATETIME)
- `approved_at` (DATETIME), `approved_by` (TEXT)
- `rejected_at` (DATETIME), `rejected_reason` (TEXT)
- `created_at` (DATETIME), `updated_at` (DATETIME)

### `otp_sessions`
- `id` (INTEGER PRIMARY KEY)
- `email` (TEXT)
- `registration_id` (TEXT)
- `otp_hash` (TEXT) — Salted SHA-256 hash (never plain text)
- `otp_salt` (TEXT) — Cryptographic salt
- `expires_at` (DATETIME) — 10 minutes from generation
- `attempts` (INTEGER) — Max 5 attempts
- `last_sent_at` (DATETIME) — Enforces 60-second cooldown
- `verified` (INTEGER: 0 or 1)

### `email_logs`
- Audit log of all sent emails with recipient, template type, timestamp, provider MessageID, and error message if failed.

---

## 6. Email Notification System

All emails are sent via SMTP using server-side environment variables (`MAIL_USER`, `MAIL_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`). Credentials are never bundled in client code.

| Email Type | Trigger | Content |
| :--- | :--- | :--- |
| `OTP_VERIFICATION` | User submits registration form | 6-digit OTP code, expiration notice, registration ID |
| `REGISTRATION_CONFIRMATION` | User verifies OTP successfully | Confirmed registration summary, registration ID, direct link to `/registration/:id` |
| `REGISTRATION_APPROVED` | Admin clicks "Approve" | Celebration badge, performance slot guidelines, Google Meet briefing |
| `REGISTRATION_REJECTED` | Admin clicks "Reject" | Polite notice with organizer's rejection reason and re-registration link |

---

## 7. QR Code Ticketing & Permalink Routes

- **Permalink URL**: `/registration/:id` (e.g., `/registration/OC-OM-69410FF1`)
- **Server-Side QR**: The backend generates a crisp, high-resolution Base64 PNG QR code containing the registration ID and returns it in the API response.
- **Client Fallback**: If offline or cached, frontend `qrcode.js` or QR API acts as fallback.
- **Refresh Proof**: All registration data is fetched dynamically from SQLite on page load. Refreshing never loses or regenerates the pass.

---

## 8. Admin Dashboard & Security

- **Route**: [`/admin`](http://localhost:3000/admin)
- **Session Auth**: Login via `POST /api/admin/login` using credentials from `.env`. Sets an HTTP-only session cookie.
- **No Client Secrets**: Secrets are never saved in browser `localStorage`.
- **Brute-Force Protection**: Login endpoint has a dedicated rate limiter (`adminLoginLimiter`).
- **Capabilities**:
  - Dashboard metric overview (Total, Pending, Verified, Approved, Rejected, Checked-in).
  - Search by Name, Email, Phone, or Registration ID.
  - Tab filters by Status (`ALL`, `PENDING_VERIFICATION`, `VERIFIED`, `APPROVED`, `REJECTED`).
  - View full performer details, registration timestamp, OTP state.
  - One-click **Approve** (triggers approval email).
  - One-click **Reject** with custom reason modal (triggers rejection email).
  - One-click **Check-In** at event entry.

---

## 9. Environment Variables & Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Local server port | `3000` |
| `NODE_ENV` | Environment mode | `development` or `production` |
| `APP_URL` | Base application URL | `http://localhost:3000` or `https://offstage-creators.vercel.app` |
| `SESSION_SECRET` | Secret key for signing session cookies | *random 64-char string* |
| `MAIL_HOST` / `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `MAIL_PORT` / `SMTP_PORT` | SMTP port | `587` |
| `MAIL_USER` / `SMTP_USER` | SMTP username / email address | `offstagecreators77@gmail.com` |
| `MAIL_PASSWORD` / `SMTP_PASS` | SMTP App Password | *16-character Google App Password* |
| `MAIL_FROM` | From email field | `offstagecreators77@gmail.com` |
| `ADMIN_EMAIL` | Admin login email | `admin@offstagecreators.com` |
| `ADMIN_PASSWORD` | Admin login password (plain or bcrypt hash) | `R!SHI88_Admin` |
| `DATABASE_PATH` | Path to SQLite database file | `./data/offstage.db` |

---

## 10. Local Development Setup

```bash
# 1. Clone repository
git clone https://github.com/rishiprattap/OC.git
cd OC

# 2. Install dependencies
npm install

# 3. Configure environment
# Ensure .env contains your SMTP credentials and session secret

# 4. Start development server
npm start
# or with live reload:
npm run dev

# 5. Access pages in your browser:
# Homepage:     http://localhost:3000
# Registration: http://localhost:3000/register
# Admin Panel:  http://localhost:3000/admin
```

---

## 11. Automated Test Suite

Run the full end-to-end test suite:

```bash
npm test
```

This executes:
1. **Platform & Registration Suite** (`tests/test_platform.js`):
   - Health & Config API
   - Input validation (missing name, malformed email, bad phone)
   - Registration creation & rate limits
   - Resend cooldown enforcement (429)
   - Wrong OTP rejection & attempt limits (400)
   - Correct OTP validation & status update to `VERIFIED` (200)
   - Registration permalink API & server-side QR code generation
   - Admin access control (401 on unauthorized)
   - Admin login & session cookie issuance
   - Admin approval & email dispatch
   - Admin rejection & rejection email dispatch
   - Attendee check-in
2. **Vercel Analytics & Privacy Suite** (`tests/test_analytics.js`):
   - Verification of Web Analytics & Speed Insights scripts
   - PII sanitization and exclusion of admin pages

---

## 12. Production Deployment

### Deploying to Vercel

1. Push your changes to the `main` branch:
   ```bash
   git push origin main
   ```
2. In the Vercel Dashboard for project `offstage-creators`:
   - Go to **Settings** → **Environment Variables**.
   - Add all variables listed in [Environment Variables](#9-environment-variables--configuration):
     - `SESSION_SECRET`
     - `MAIL_USER` / `SMTP_USER`
     - `MAIL_PASSWORD` / `SMTP_PASSWORD`
     - `MAIL_HOST` (`smtp.gmail.com`)
     - `MAIL_PORT` (`587`)
     - `ADMIN_EMAIL`
     - `ADMIN_PASSWORD`
     - `APP_URL` (e.g. `https://offstage-creators.vercel.app`)
3. Redeploy or trigger automatic build on push.
4. Deep link routes like `/registration/:id` are routed via `vercel.json` rewrites.

---

© 2026 Offstage Creators · Built with ♡ for the creative community.
