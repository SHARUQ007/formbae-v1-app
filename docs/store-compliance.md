# FormBae App — Store Compliance

This document supports App Store (Apple) and Google Play submissions. Review with a
qualified legal/compliance advisor before publishing.

## 1. Data collected

| Data type | Why collected | Linked to user | Shared w/ 3rd parties | Used for tracking | Deletable | Required |
|-----------|---------------|----------------|-----------------------|-------------------|-----------|----------|
| Name | Personalize coaching, trainer messaging | Yes | No | No | Yes | Required |
| Phone number | Login identity, match web payment | Yes | Payment processor (Razorpay) at checkout | No | Yes | Required |
| Email (optional) | Receipts, support | Yes | Payment processor at checkout | No | Yes | Optional |
| Age | Fitness analysis & plan safety | Yes | No | No | Yes | Required |
| Gender | Fitness analysis, trainer matching | Yes | No | No | Yes | Required |
| Height / Weight | Fitness analysis, progress tracking | Yes | No | No | Yes | Required |
| Fitness goal & preferences | Analysis, plan, trainer match | Yes | No | No | Yes | Required |
| Injury / restriction notes | Plan safety | Yes | No | No | Yes | Optional |
| Payment status | Unlock plan, lifecycle routing | Yes | Payment processor | No | Partial* | Required |
| Progress logs / check-ins | Coaching & progress | Yes | No | No | Yes | Optional |
| Food photos / diet diary | User-requested meal logging and trainer context | Yes | No | No | Yes | Optional |
| Messages to trainer | Coaching communication | Yes | No | No | Yes | Optional |
| Push token (if FCM configured) | Reminders/notifications | Yes | Google/Apple push service | No | Yes | Optional |
| Crash/analytics | Not collected currently | — | — | — | — | — |

\* Payment/invoice records may be retained where required by tax/legal obligations even after account deletion.

- **No third-party advertising SDKs. No cross-app tracking (no ATT prompt needed unless tracking is added later).**
- **No analytics/crash SDK is currently bundled.** If one is added (e.g. Sentry/Firebase Analytics), update this table and the store data-safety forms.

## 2. Permissions used

| Permission | Platform | Purpose | Timing |
|-----------|----------|---------|--------|
| INTERNET | Android | API calls | Implicit |
| POST_NOTIFICATIONS | Android 13+ | Local workout/check-in reminders | Requested contextually (Profile → toggles / after login), not at first launch |
| VIBRATE | Android | Notification feedback | Implicit |
| CAMERA | Android / iOS | Capture food photos for Diet Diary | Requested only when user taps Take food photo |
| READ_MEDIA_IMAGES / Photo Library | Android / iOS | Import existing food photos into Diet Diary | Requested only when user taps Import from gallery |
| Notifications | iOS | Local reminders | Requested when user engages with reminders |

Not requested: Location, Contacts, Bluetooth, Microphone, HealthKit, Google Fit / Health Connect, SCHEDULE_EXACT_ALARM.

## 3. Privacy Policy & Terms

- In-app links: **Profile → Legal & support** (Privacy Policy, Terms of Use, Refund Policy, Help & Support, Email support).
- Served by backend `GET /api/mobile/legal`, pointing at the existing web pages:
  - `/privacy-policy`, `/terms-of-use`, `/refund-policy`.
- The app will not ship without working Privacy Policy and Terms links.

## 4. Account deletion (required by both stores)

- In-app path: **Profile → Delete account** (`DeleteAccountScreen`).
- Confirmation dialog before deletion; explains what is deleted and what may be retained.
- Backend `POST /api/mobile/me/delete-request`:
  - Immediately deactivates the account (`allowlistFlag=disabled`) so access is revoked.
  - Records a deletion request; personal data is purged within 30 days.
  - Payment/invoice records may be retained where legally required.
- After request, the app logs the user out and clears local auth state.

## 5. Health & fitness disclaimer

- FormBae provides fitness coaching, **not medical advice, diagnosis, or treatment.**
- Disclaimers shown in: questionnaire (injury/health questions), analysis report, workout player, and Legal & support screen.
- No HealthKit / Google Fit / Health Connect integration → no health-permission declarations required.
- Avoid medical claims, guaranteed transformation claims, and body-shaming copy in all listings and in-app copy.

## 6. Payment compliance notes

- Payment is for **real-world, human personal-training / coaching services** (a recommended human trainer builds and manages the plan), processed via **Razorpay**.
- Apple Guideline 3.1.3(e) and Google Play allow external/third-party payment for **physical services / person-to-person real-world services** rather than digital-only content.
- The app supports **native Razorpay checkout** and a **web checkout fallback**; both settle to the same backend verification and lifecycle sync.
- **Risk / action before submission:** confirm with Apple/Google review that the offering is classified as a real-world coaching service (not a digital subscription). If a reviewer classifies it as digital content, the compliant fallback is to remove in-app purchase CTAs and complete payment on the web, then sync status — the app already supports web-first payment. Document the chosen path in the review notes.

## 7. App Store review risks & mitigations

- **Payment classification** (see §6) — provide clear review notes describing the human-coaching service.
- **Account required before content** — provide a reviewer/demo account (see §9) that is already paid + has an assigned trainer + published plan so reviewers reach the main app without waiting for manual trainer assignment.
- **Local notifications** — permission requested contextually, not at launch.

## 8. Play Store review risks & mitigations

- **Data safety form** — fill using §1.
- **Account deletion** — in-app + (recommended) a public web deletion URL; §4 covers in-app. Add a web deletion request page/URL for the Play data-safety "deletion URL" field.
- **Foreground/exact alarms** — not used; reminders are inexact local notifications (no policy declaration).
- **Health apps policy** — no health permissions; disclaimers present.

## 9. Reviewer / test account

- Provide reviewer credentials **out-of-band** (App Store Connect / Play Console review notes), never hardcoded in the app or committed to git.
- Seed a reviewer account in the backend that is: enabled `user`, `hasPaid=true`, `trainerAssigned=true`, `planReady=true`, with a small published plan, so `recommendedNextScreen=home`.
- Do not expose any demo/test controls to real users.

## 10. Security

- Auth token stored in `react-native-keychain` (Keychain / Keystore-backed).
- No secrets committed; API base URL via `react-native-config` (`.env` is git-ignored, `.env.example` committed).
- 401 → global logout; logout and delete-account clear local auth state.
- Razorpay `key_secret` lives only on the server; the app only uses the publishable key id.
