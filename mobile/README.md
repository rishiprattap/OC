# Offstage Creators for Android

Native Expo / React Native / TypeScript app for the public Offstage Creators experience. The app uses the existing Express backend and accounts at `https://offstagecreators.in`. It contains no WebView, admin screens, scanner, privileged credentials, database, or admin API calls.

## Setup

Use Node 20.19+ (or a compatible newer LTS), npm, JDK 17 or 21, and Android Studio with Android SDK 36. Install dependencies separately from the website:

```powershell
cd mobile
npm ci
npx expo prebuild --platform android
npx expo run:android
```

This app requires a native development build because it uses a native cookie manager. Expo Go is not supported. Subsequent JavaScript development can use `npx expo start` with the generated debug app, or `npx expo run:android`.

Copy `.env.example` to `.env` only when overriding the public API origin. The default is the production HTTPS origin. Environment values prefixed `EXPO_PUBLIC_` are bundled into the APK and must never contain secrets. Local debug builds permit `http://10.0.2.2:3000`, `http://localhost:3000`, and `http://127.0.0.1:3000`; release builds reject HTTP. The generated debug manifest permits cleartext development traffic. The release manifest does not.

## Features

- Home, published events, status filters and event details; external registration providers open the device browser over HTTPS.
- Shared account signup, email verification, login, recovery, profile editing and logout.
- Internal event registration with saved details, categories, performance information, promo/referral validation, guest OTP and authoritative final fees.
- Event-specific UPI QR and payee details, gallery/camera receipt selection, UTR entry and multipart proof submission. Only server status can confirm a payment or ticket.
- Registration history, approved server-issued ticket QR, Android folder saving and native sharing.
- Event-scoped certificate verification, server-generated SVG download and sharing. Availability is controlled by the backend.
- Event galleries with virtualized image grids and fullscreen viewing.
- Dark/gold theme, existing brand assets, native stack/back navigation, keyboard scrolling, loading/empty/error states and pull-to-refresh.

Push notifications are intentionally unavailable: the existing backend has no authenticated device-token registration or delivery service. `src/services/notifications.ts` defines the adapter contract. No permission is requested and no dummy success is shown.

## Testing

```powershell
npm run typecheck
npm test
```

For isolated backend integration checks, install the existing backend dependencies at repository root first, then run:

```powershell
cd ..
npm ci
cd mobile
npm run test:backend
```

The harness copies backend code to a temporary ignored fixture directory, creates synthetic records, replaces email delivery with an in-process collector, clears external service variables, binds to loopback, and deletes the fixture after testing. It does not use production data or admin APIs. See `docs/TESTING.md` for observed results and outstanding device checks.

## Testing APK on Windows

Generate the Android project, then run:

```powershell
npx expo prebuild --platform android
powershell -ExecutionPolicy Bypass -File scripts/build-testing.ps1 -JavaHome "C:\path\to\jdk" -AndroidSdk "C:\path\to\Android\Sdk"
```

The local script builds a standalone release-mode APK with the generated **debug signing key**, for testing only. It includes its JavaScript bundle and does not need Metro. Output: `android/app/build/outputs/apk/release/app-release.apk`. The default contains ARM64 and x86_64. Pass `-Architectures 'armeabi-v7a,arm64-v8a,x86_64'` to include 32-bit ARM devices. Minimum Android API is 24; target is API 36.

On Windows, use a short physical checkout path (for example `C:\src\OC`) before installing/building. Long directory names can exceed Ninja/CMake's 260-character path limit; a virtual drive mapping may also break Expo autolinking. Build intermediates are disposable, but do not move a working checkout without preserving your changes.

The locked build tools override PostCSS to its patched version. `tooling/image-size-compat` adapts Metro's file-path calls to the patched image-size 2 parser, which accepts byte buffers. This adapter runs only during asset bundling; its path/buffer compatibility is tested.

Install using Android's package installer (temporarily allow installation from your chosen file source), or:

```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

The repository also includes a **manual-only** `Build testing Android APK` GitHub Actions workflow. When available in GitHub's Actions UI, choose the review branch and run it to obtain an APK artifact. GitHub may require the workflow to exist on the default branch before exposing manual dispatch; no merge is performed here. Before then, use the local or EAS build instructions. The workflow runs type checks, policy tests and isolated backend tests before building on Linux. It never deploys the website or publishes to an app store, and has not been dispatched automatically.

## Signed release APK / AAB

Package identity: `in.offstagecreators.app`. App version: `1.0.0`; Android version code: `1`. Confirm ownership and increment the version code before later releases.

EAS build configuration is included, but no EAS project is linked and nothing is uploaded, published, submitted or deployed automatically. When you approve a release:

```powershell
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

`preview` produces an installable internal APK. `production` produces an AAB. Use `--profile release-apk` for a signed release APK. EAS will ask you to create or supply Android signing credentials. Keep the keystore and recovery information secure; never commit them or `credentials.json`. Review the generated project ID before committing configuration changes. EAS cloud builds upload source to Expo, so run these commands only when you choose to use that service.

For local release signing, generate the native project, configure a release signing configuration using environment variables/secure Gradle properties, and replace the generated debug signing configuration in `android/app/build.gradle`. Run `:app:assembleRelease` or `:app:bundleRelease`. Never distribute the locally generated debug-key APK as a production release. Native files are generated and ignored; preserve custom signing through your private build pipeline/config plugin, not committed secrets.

## Structure

`src/screens/` contains public screens, `src/components/` reusable native controls, `src/services/` the API allowlist/files/push adapter, `src/state/` authentication, and `src/theme.ts` brand tokens. `assets/` contains existing website branding. Website/backend source is unchanged. `.vercelignore` excludes the mobile project from website deployment uploads. The root Vercel configuration disables automatic deployments only for `feat/offstage-android`, preventing a preview deployment when this review branch is pushed; `main` behavior is unchanged.

## Authentication and data

Requests use the existing `oc.sid` HttpOnly session cookie. Native Android cookie handling sends it to the same API origin. A copy is stored in Expo SecureStore for cold-start restoration, with an eight-hour client expiry matching the existing backend maximum. The server remains authoritative and may expire earlier. Passwords and profile histories are never persisted by the app. Logout attempts server invalidation and clears local cookies and secure storage even if offline. Android backups are disabled.

The backend currently uses Express MemoryStore for sessions. Session persistence across server restarts or independent serverless instances is an existing backend limitation; this app does not add a token service or silently extend sessions. Production infrastructure/session hardening should be reviewed before public release.

## Known integration limits

At verification time on 30 October 2026 (Asia/Calcutta), the production API returned `DEPLOYMENT_PAUSED`. The app reports service errors and cannot make live features available until the existing deployment is restored by its owner. This change does not deploy or unpause it.

Password recovery emails retain the website's existing link. Users can reset there or paste the link/token into the native reset form. Verified email addresses cannot be edited because the current profile API does not support an email-change verification workflow. Certificates are delivered as SVG because that is the backend's native output format. Ticket export saves/shares the backend QR PNG; the full event/person detail remains visible in the app. External provider purchases are managed by that provider and appear in this app only if the existing backend records them.

Read `docs/INTEGRATION.md` before adding endpoints. Do not expose existing admin or scanner routes through this app.
