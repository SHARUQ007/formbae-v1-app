# FormBae Mobile App

Bare React Native (no Expo) customer app for FormBae — workout plan, trainer messaging, progress, and onboarding funnel for users coming from Meta ads or the web payment flow.

## Stack

- React Native CLI 0.86 + TypeScript
- React Navigation (native stack + bottom tabs)
- `react-native-keychain` — secure auth token storage
- `react-native-config` — environment variables
- `react-native-razorpay` — native in-app checkout
- `@notifee/react-native` — local reminders (offline, no server needed)
- `react-native-webview` — exercise video playback (YouTube embeds)
- `react-native-linear-gradient`, `react-native-vector-icons`, `react-native-svg`
- API: Next.js BFF at `{API_BASE_URL}/api/mobile/*` (see `docs/mobile-api.md`)

## Prerequisites

- Node.js ≥ 22
- Xcode + CocoaPods (iOS)
- Android Studio + SDK (Android)
- FormBae **frontend** dev server running (`cd frontend && npm run dev`)
- FormBae **backend** running (`cd backend && uvicorn app.main:app --reload`)

## Setup

```bash
cd App
npm install
cp .env.example .env
```

### Environment variables (`.env`)

| Variable | Description |
|----------|-------------|
| `API_BASE_URL` | Next.js origin reachable from device/emulator |
| `SITE_URL` | Public site for web payment fallback |

**Emulator defaults:**

- Android emulator → `http://10.0.2.2:3000` (maps to host `localhost`)
- iOS simulator → `http://127.0.0.1:3000`

**Physical device:** use your machine LAN IP, e.g. `http://192.168.1.10:3000`.

## Run

```bash
# Metro
npm start

# Android
npm run android

# iOS (first time)
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios
```

## User lifecycle routing

After splash, the app loads the secure token and calls `GET /api/mobile/me/status`.

| Backend `recommendedNextScreen` | App route |
|-----------------------------------|-----------|
| `welcome` | Auth / Welcome |
| `questionnaire` | Onboarding → Questionnaire |
| `analysis_report` | Onboarding → Analysis Report |
| `payment` | Onboarding → Payment Required |
| `payment_sync` | Paid → Payment Sync |
| `paid_welcome` | Paid → Paid Welcome |
| `finding_trainer` | Paid → Finding Trainer |
| `plan_preparing` | Paid → Plan Preparing (auto-polls status) |
| `finding_trainer` | Paid → Finding Trainer |
| `home` | Main tabs |

### Payment-after-website flow

1. User pays on `formbae.in` discovery funnel.
2. Opens app → **I already have a FormBae account** → login with same mobile.
3. `POST /api/mobile/payment/sync` runs (also on login) to attach `TraineeAccess` by mobile.
4. Paid users skip questionnaire unless profile/funnel data is missing.

## Project structure

```
App/
  android/ ios/
  src/
    assets/         # Logo, images
    components/     # UI primitives
    screens/        # auth, onboarding, paid, main
    navigation/     # Root, Auth, Onboarding, Paid, Main tabs
    services/       # API clients per domain
    store/          # Auth + local questionnaire draft
    theme/          # Colors aligned with web (emerald / Manrope-like)
    types/
    utils/
```

## Features

- **Native Razorpay checkout** — create order → SDK → verify → instant unlock, with web fallback
- **Workout player** — per-exercise video (YouTube), rest timer with +15s/skip, per-exercise completion, finish workout
- **Offline-safe workouts** — completions persist locally and flush automatically when back online
- **Local reminders** — daily workout, weekly check-in, and trainer nudges via `@notifee/react-native` (works offline)
- **Remote push (optional)** — auto-registers a device token when Firebase config is present (see below)
- **API resilience** — timeout, retries on GET/5xx, typed errors, 401 auto-logout

## Native dependency notes

- **react-native-config:** rebuild after changing `.env`
- **react-native-vector-icons:** Feather icons; fonts linked in `android/app/build.gradle`
- **react-native-keychain:** requires device/simulator (not plain web)
- **react-native-razorpay:** set `RAZORPAY_KEY_ID` in `.env`; iOS needs `pod install`
- **@notifee/react-native:** Android 13+ needs `POST_NOTIFICATIONS` (declared in manifest, prompted at runtime)
- **react-native-webview:** used for exercise videos; iOS needs `pod install`

### Enabling remote push (FCM/APNs) — optional

Local reminders work out of the box. To enable server-sent push:

1. `npm install @react-native-firebase/app @react-native-firebase/messaging`
2. Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
3. Apply the Google Services gradle plugin (Android) and enable Push capability (iOS)

`registerForRemotePush()` will then send the device token to `POST /api/mobile/notifications/register`. Until configured, it safely no-ops.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Network error on API | Check `API_BASE_URL`, frontend running, same Wi‑Fi for physical device |
| 401 after login | `SESSION_SECRET` must match between app server and token signing |
| Login 404 | Use signup flow (`createIfMissing`) or complete web payment first |
| Empty workout plan | Trainer must publish active plan in admin/trainer dashboard |
| Payment fails in app | Verify `RAZORPAY_KEY_ID` / server `RAZORPAY_KEY_SECRET`; web fallback always available |
| No videos | Exercise must have a YouTube URL/key on the plan |
| iOS build missing pods | `cd ios && bundle exec pod install` |

## Typecheck

```bash
npm run typecheck
```

## Store submission

This app is built for App Store + Play Store submission. Before publishing, read:

- `docs/store-compliance.md` — data collected, permissions, privacy/terms, account deletion, health disclaimer, payment classification, reviewer account.
- `docs/store-listing.md` — app name, descriptions, keywords, screenshots, review notes.
- `docs/release-checklist.md` — signing, versioning, release builds, QA flows, compliance gates.

Key compliance facts:
- **Identifiers:** Android `com.formbae`, iOS `com.formbae`, Android targetSdk 36.
- **Permissions:** INTERNET, POST_NOTIFICATIONS (contextual), VIBRATE only. No camera/photos/location/health.
- **No Expo** packages. **No analytics/ads SDKs.**
- **Account deletion:** Profile → Delete account (`POST /api/mobile/me/delete-request`).
- **Legal:** Profile → Legal & support (Privacy, Terms, Refund, Support) via `GET /api/mobile/legal`.
- **Payment:** Razorpay for real-world human coaching (native checkout + web fallback). See compliance §6.
- **Health:** fitness guidance, not medical advice; disclaimers in questionnaire, analysis, workout player, legal screen.

## Remaining TODOs

- [ ] Generate final app icon + splash sets from the FormBae logo (placeholders in place)
- [ ] Add a public web account-deletion URL for the Play data-safety form
- [ ] Add Firebase config files to activate remote push (infra + code already wired)
- [ ] Confirm payment classification with store reviewers (web-first fallback ready if required)

See `docs/mobile-api.md` for full backend endpoint documentation.
