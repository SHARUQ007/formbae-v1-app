# FormBae App — Release Checklist

## Identifiers
- Android `applicationId`: `com.formbae` (android/app/build.gradle)
- iOS bundle id: `com.formbae` (FormBae.xcodeproj)
- App display name: FormBae (app.json / Info.plist / strings.xml)

## Versioning
- Marketing version: `1.0.0` (iOS `MARKETING_VERSION`, Android `versionName`).
- Build number: increment for every store upload (iOS `CURRENT_PROJECT_VERSION`, Android `versionCode`).
- Strategy: bump `versionName` on user-facing releases; always bump build/`versionCode`.

## Environment
- `API_BASE_URL` → production Next.js origin (e.g. `https://formbae.in`). Set in `.env` before building; `react-native-config` bakes it into the build.
- `RAZORPAY_KEY_ID` → **live** key for production builds.
- `SITE_URL` → `https://formbae.in`.
- Confirm `.env` is NOT committed (git-ignored); keep `.env.example` updated.

## Backend production
- Ensure `/api/mobile/*` is deployed and reachable from mobile.
- `SESSION_SECRET` (token signing) set in production; must match the server issuing tokens.
- Razorpay `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` set on the server.
- Live legal pages: `/privacy-policy`, `/terms-of-use`, `/refund-policy`, `/support`.

## Android release build
1. `cd App && npm install`
2. Set `.env` (production `API_BASE_URL`, live `RAZORPAY_KEY_ID`).
3. Create/keep an upload keystore; configure signing in `android/app/build.gradle` (`signingConfigs.release`) via `~/.gradle/gradle.properties` (never commit the keystore).
4. `cd android && ./gradlew clean bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
5. Upload the `.aab` to Play Console. Target SDK is 36 (meets current Play requirement).
6. Complete Data safety form using `docs/store-compliance.md` §1, and set an account deletion URL.

## iOS release build
1. `cd App/ios && bundle exec pod install` (or `pod install`).
2. Open `FormBae.xcworkspace` in Xcode.
3. Set your Team + signing (Automatic signing recommended); bundle id `com.formbae`.
4. Select "Any iOS Device", Product → Archive.
5. Distribute via App Store Connect. Enable Push capability only if/when remote push is configured.
6. Fill App Privacy (Nutrition labels) using `docs/store-compliance.md` §1.

## Icons & splash
- App icon: replace placeholder mipmaps (`android/app/src/main/res/mipmap-*`) and iOS `Images.xcassets/AppIcon` with the FormBae logo set.
- Splash: configure a branded launch screen (iOS `LaunchScreen`, Android splash). Source asset: `src/assets/logo.png`.
- TODO: generate full icon sets from the FormBae logo before submission.

## Pre-submission QA (test all flows)
- [ ] New user: Welcome → Login/Signup → Questionnaire → Analysis → Trainer match → Payment
- [ ] Questionnaire incomplete user resumes at questionnaire
- [ ] Questionnaire complete + unpaid → Analysis/Payment
- [ ] Paid website user logs in → payment syncs → correct paid screen
- [ ] Paid, no trainer → Finding Trainer
- [ ] Paid, trainer assigned, no plan → Plan Preparing (auto-advances)
- [ ] Active user → Home
- [ ] Native Razorpay checkout + web fallback both unlock plan
- [ ] Workout player: rest timer, video, per-exercise complete, finish (offline queue)
- [ ] Progress log + weekly check-in
- [ ] Trainer messaging send/receive
- [ ] Profile → Legal links open; Delete account works and logs out
- [ ] 401 handling forces logout; retry buttons work offline

## Store compliance gates
- [ ] No Expo packages (`grep -i expo package.json` → none)
- [ ] Only INTERNET / POST_NOTIFICATIONS / VIBRATE permissions on Android
- [ ] Privacy Policy + Terms links working in-app
- [ ] Account deletion present in-app + web deletion URL for Play
- [ ] Payment classification confirmed / documented (compliance §6)
- [ ] Health/fitness disclaimers present; no health permissions
- [ ] Reviewer/demo account seeded and credentials supplied out-of-band
- [ ] No debug UI in release; `console` noise stripped by release build
