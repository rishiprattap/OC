# Android implementation state

Branch: feat/offstage-android

## Implemented
Native Expo SDK 54 / React Native 0.81 / TypeScript app in mobile/. Public-only API allowlist, shared native cookie sessions with SecureStore restoration, five tabs, account/recovery/profile forms, event registration/promos/OTP, UPI proof, approved ticket QR exports, event-scoped SVG certificates and gallery sharing. Push adapter intentionally disabled. Website/backend source and data remain unchanged. Root Vercel config disables deployments only for the review branch.

## Evidence
Strict TypeScript passed. Seven policy/build tests and 25 isolated actual-backend checks passed. Expo prebuild, SDK compatibility and Android Hermes export passed (897 modules, 2.46 MB). Production public API returns DEPLOYMENT_PAUSED; no live mutations attempted. Patched image-size/PostCSS overrides remove high/moderate audit findings; nine low upstream findings remain.

## Native verification
Gradle assembleRelease succeeded: 321 tasks, ARM64 + x86_64, standalone Hermes bundle. apksigner and manifest metadata verification passed. Installed and launched on Android API 35 emulator. Five tabs and sign-in render without app crash logs. Device testing identified a structured hosting error displayed as [object Object] and predictive back exiting the app; fixed service-error formatting and disabled predictive-back opt-in. Incremental build passed in 3m 11s. Final APK installed, service-error display verified, and system back returned from sign-in to My Tickets. Screenshots stored in mobile/docs/screenshots. No production mutations performed.

## Review handoff
Source, build profiles, setup guide and test documentation are implemented. Final APK signature/checksum and screenshots are verified. Source and documentation are ready for the review branch and draft PR; deliverables are packaged in the task outputs directory. Production acceptance remains blocked by DEPLOYMENT_PAUSED. No deployment or merge is authorized.
## Constraints
No deployment, no main merge, no admin app features, no separate database. Do not claim production flows or push notifications work until services are available. Use only synthetic fixtures for tests.
