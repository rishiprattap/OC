# Verification record

Date: 30 October 2026, Asia/Calcutta.

## Automated evidence

- `npm run typecheck`: passed with strict TypeScript and unchecked-index checks.
- `npm test`: 7 tests passed. Covers the public endpoint allowlist, production HTTPS, approved-ticket gates, event registration availability, certificate identity (including legacy event resolution) and patched Metro image-parser compatibility.
- `npm run test:backend`: 25 checks passed against an isolated copy of the actual backend. Covers account creation/OTP, shared session, profile update, promo fee, invalid promo, authenticated and guest registration, guest OTP, payment proof/verification gating, history, certificate readiness/event mismatch/download, password recovery, logout and login.
- `npx expo install --check`: installed packages match the Expo SDK 54 bundled module map (offline validation).
- `npx expo prebuild --platform android --no-install`: passed.
- `npx expo export --platform android --output-dir dist --max-workers 2`: passed; 897 modules, 2.46 MB Hermes bundle, 19 assets. Required unsandboxed temporary-file access for Hermes on this Windows host.
- Dependency audit after build-tool patching: nine low-severity upstream findings, no moderate/high/critical findings. Avoid `npm audit fix --force`, which proposes incompatible Expo downgrades.
- Production GET `/api/events`: unavailable, returned `DEPLOYMENT_PAUSED`. No production mutations attempted.

## Native device evidence

Installed the final standalone APK successfully on the workspace-owned Android API 35 x86_64 emulator. Home, Events, My Tickets, Gallery and Profile rendered; sign-in opened from the tabs. Verified the system back button returns from sign-in to My Tickets after disabling the incompatible predictive-back opt-in. No AndroidRuntime or ReactNativeJS error logs appeared during the smoke test. Structured hosting errors now display readable service-unavailable text. This is a guest/navigation smoke test, not live authenticated acceptance.

Screenshots: [Home](screenshots/home.png), [Account](screenshots/account.png).

## Remaining validation

Native Gradle `:app:assembleRelease` passed (321 tasks, ARM64 and x86_64). APK signature verification passed with the generated Android debug certificate. Package `in.offstagecreators.app`, version 1.0.0 (1), minimum API 24, target API 36. SHA-256: `1d559b936e392aba8ce24c90b1a0dbe67e7cd45ab7a49afec919db998d9048c2`. This standalone testing build includes its Hermes bundle and requires no Metro server. Production smoke tests require restoration of the existing service. Camera/gallery permission behavior, physical-device cold-start sessions, native share/save destinations, real email delivery and real organizer payment approval require device acceptance testing before public release.

## Manual acceptance script

1. Install the testing APK; open all five tabs, rotate/back/background/relaunch, and check small-screen text and keyboard scrolling.
2. Once production is available, sign into a test account shared with the website. Verify profile edits synchronize, background/kill/relaunch retains a valid session, expiry requests login, and logout clears local state.
3. Create a test account with real email delivery. Verify invalid/expired OTP and resend cooldown. Exercise password recovery through the email link and native pasted-link form.
4. Register for an authorized test event. Confirm allowed category, promo/referral pricing, capacity/closed errors, duplicate-registration handling and guest verification.
5. Submit only an authorized test payment receipt with a unique UTR. Ensure it remains pending until a real organizer approves it on the existing website. Never use production money or records for automated tests.
6. Check history, approved ticket QR, revoked/rejected behavior, save/share cancellation and Android back handling.
7. Verify an eligible certificate for the correct participant/event; test unavailable and mismatched events; download and share its SVG.
8. Browse multiple event galleries, fullscreen/back/share and slow/offline networks. Notifications must clearly state unavailable.
