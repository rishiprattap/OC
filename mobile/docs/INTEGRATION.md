# Public backend map

Repository inspection covered the Express entrypoint, all route modules, config/database layer, public HTML/JavaScript workflows, brand assets and existing tests. Source implementation takes precedence over the older root README: the current database layer uses PostgreSQL (`pg`) with a JSON local-store fallback, not SQLite.

| Feature | Existing routes | Behavior |
| --- | --- | --- |
| Events | GET `/api/events`, `/api/events/:slug` | Published event list and event configuration, category/provider/fee/UPI data |
| Accounts | POST `/api/auth/register`, `/verify-email`, `/resend-verification`, `/login`, `/logout` | Shared users table and session cookie |
| Session | GET `/api/auth/me` | Revalidate on startup and foreground |
| Recovery | POST `/api/auth/forgot-password`, `/reset-password` | Existing emailed token; no separate reset database |
| Profile | PUT `/api/user/profile` | Name, phone, age, city, Instagram; email stays verified/immutable |
| History | GET `/api/user/registrations` | Same user ID / verified email history as website |
| Registration | POST `/api/registrations` | Existing capacity/status/provider validation, verified-account skip-OTP or guest OTP |
| Promo/referral | POST `/api/registrations/validate-promo` | Server pricing; validation repeated during registration |
| Guest OTP | POST `/api/otp/send`, `/verify` | Existing registration/email scope and cooldown rules |
| Payment | POST `/api/payments/submit-proof`, `/confirm-free` | Multipart `screenshot`, `registrationId`, `transactionId`; no client payment success |
| Ticket | GET `/api/registrations/:id` | Server QR. App exposes entry ticket only for APPROVED + isValidPass |
| Certificate | POST `/api/certificate/verify`; GET `/api/certificate/download/:id?eventId=...` | Verification includes registration and event, then original server SVG |
| Gallery | GET `/api/gallery?eventId=...` | Published event images only |

The API client permits only reviewed method/path combinations. No `/api/admin`, `/api/scanner`, `/api/email`, gallery mutations or `/api/events/all` routes are permitted. External URLs are restricted to HTTPS (or mailto for support). Images are loaded separately without attaching API session headers to third-party hosts.

## Existing storage

Events hold publication, registration state/provider, fees, dates, categories, UPI and certificate configuration. Registrations hold event/user/email association, performance details, fee breakdown, OTP state, payment proof/reference, approval state, ticket identity and certificate eligibility. Users hold shared account credentials/profile; OTP sessions and password resets store verification state. Promo codes, gallery images and app settings support their existing public workflows. No schema changes are introduced.

## Existing limitations observed

- Express session middleware does not configure a persistent store; serverless/session continuity cannot be guaranteed by the mobile client.
- JSON fallback event queries can return unpublished records even when SQL publication filters are requested. The app independently filters `isPublished` and refuses an unpublished detail screen.
- The legacy event formatter uses `fee || 79`, which can misrepresent a zero fee. The app uses `isPaid` for the initial display and the registration response/ticket final fee for actual payment. Server verification remains authoritative.
- Registration/ticket lookup and certificate endpoints use the website's existing public lookup design. Payment proof verification tokens are optional on the current server. No stronger authorization is claimed or bypass introduced by this app; public rollout should include a dedicated backend security review.
- Public signup verification and account recovery behavior are inherited unchanged. No live email delivery was tested.
- No push-token or push-delivery endpoints exist. The push adapter remains disabled.

No production changes, database migrations, backend edits or admin feature changes are part of this branch. The sole root configuration change disables Vercel Git deployments for the review branch `feat/offstage-android` to honor the no-deployment requirement.
