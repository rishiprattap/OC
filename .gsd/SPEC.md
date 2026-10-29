# Offstage Creators Android

Status: FINALIZED

## Scope
Build a native React Native / Expo / TypeScript Android application in mobile/ with Home, Events, My Tickets, Gallery and Profile tabs. Reuse production public APIs and accounts. Include account OTP/recovery, profile editing, event-specific registration with server-calculated promotions, UPI proof upload, server ticket QR, certificate verification/download/share and native gallery sharing. Dark charcoal and gold branding, accessibility, loading/error/empty states and Android navigation are required.

## Boundaries
No admin UI, scanner, admin APIs, new database, production deployment or main-branch merge. Work on feat/offstage-android and create a review PR. Preserve website source and production data. Push is architecture only until an authenticated backend device-registration and delivery service exists. Never simulate approvals.

## Acceptance evidence
TypeScript, automated public contract/security/state tests, Android bundle and APK build if available, UI screenshot, documented release signing and honest device/production testing limitations. Live production checks are read-only; destructive or email/payment tests run against isolated local fixtures.
