# Phone sign-in

Signing in used to take a mobile number and return a 30-day token. Nothing else. Knowing a
number was enough to become its owner, and asking with `createIfMissing: false` told any
caller whether a number had an account. Sign-in now proves the number first.

## How it works

Firebase sends the SMS and checks the code, on the device. It hands back an ID token, and
the backend answers one question about it: which number did this person just prove they
hold. No code is ever sent to us or stored by us.

```
LoginScreen        +91 digits, optional name
  -> otpService.startPhoneVerification('+91…')      Firebase sends the SMS
VerifyOtpScreen    six digits
  -> otpService.confirmCode(…)                      Firebase returns an ID token
  -> POST /api/mobile/auth/login { …, firebaseIdToken }
Backend            budget -> verify -> bind number -> the existing sign-in
```

Whether the number already has an account is answered **after** the code checks out. That
costs an SMS on a mistyped number, and in exchange the endpoint stops being a way to
enumerate which numbers are registered. The screen holds the ID token, so the "no account
yet, add your name" step re-posts the same one rather than sending a second SMS.

`otpService` is the only module that imports Firebase, and it is `require`d lazily so
`@react-native-firebase/app` does not initialise during cold start for trainees who are
already signed in.

## What the backend checks

Beyond the signature and audience: that the sign-in really was a phone verification, that
`auth_time` is recent, and that the proven number is the one being signed in to.

The `auth_time` check is the one worth understanding. An ID token stays refreshable for as
long as the device keeps the Firebase session, so "this token is valid" is much weaker than
"this person just proved possession". Sign-in wants the second.

Codes: `OTP_REQUIRED`, `OTP_INVALID`, `OTP_EXPIRED`, `OTP_STALE`, `OTP_PHONE_MISMATCH`
(401), `UNSUPPORTED_REGION` (400), `OTP_VERIFIER_UNAVAILABLE` (503). Read these from
`error.payload.code` — `apiClient` gives every 401 the same "Session expired" message.

## Turning it on

Enforcement is off until the stored policy says otherwise, so the backend ships first and
nothing changes for any install.

1. Deploy the backend with `FIREBASE_PROJECT_ID` set and `MOBILE_OTP_REQUIRED=false`.
2. Release the app with Firebase configured (below).
3. Raise `minimumSupportedVersion` in the `mobile_app_version_policy` app_settings row,
   Android first. Old installs are gated into `UpdateRequiredScreen` before they ever
   reach sign-in.
4. Once that has drained — days, not hours; some people open the app monthly — set
   `required.android` in the `mobile_otp_policy` row, then `required.ios`:

   ```json
   { "required": { "ios": false, "android": true } }
   ```

Rolling back is setting it to `false`. No deploy. `MOBILE_OTP_REQUIRED` is the floor and
the kill switch; the row is the live lever.

A token that is sent is always checked, even while enforcement is off — otherwise sending
a broken one would be a way back to unverified sign-in.

## Firebase console setup

The app builds without any of this; phone sign-in just reports itself unavailable. Both
`google-services.json` and `GoogleService-Info.plist` are safe to commit — they are client
configuration, and the security model is SHA pinning plus App Check, not secrecy.

- [ ] Create or reuse a Firebase project, enable **Authentication → Sign-in method → Phone**
- [ ] Add the Android app, package **`com.formbae`**, and put `google-services.json` in
      `android/app/`
- [ ] **SHA-1 and SHA-256 for every signing key** — the debug keystore, the upload key, and
      **Play App Signing's key** from Play Console → Setup → App integrity. Missing that
      last one is the classic "works in internal testing, fails for every real install"
- [ ] Add the iOS app, and drag `GoogleService-Info.plist` into Xcode with *Copy items if
      needed*. Confirm it is a member of the **FormBae target**, or it is not in the bundle
- [ ] Upload an **APNs auth key (.p8)** to Project settings → Cloud Messaging, with its Key
      ID and Team ID. This is what gives iOS the silent-push verification that keeps the
      reCAPTCHA sheet away
- [ ] Add `REVERSED_CLIENT_ID` from `GoogleService-Info.plist` as a URL scheme in
      `ios/FormBae/Info.plist` `CFBundleURLTypes`. Still needed with APNs configured: the
      fallback fires on simulators and on devices with push disabled
- [ ] Enable **App Check** (Play Integrity, App Attest), then enforce it on Authentication
- [ ] **SMS region policy**: allow `IN` only
- [ ] Set a **Cloud Billing budget alert** on the phone-auth SKU

Those last three are the actual SMS-abuse controls. The backend's rate limits sit
*downstream* of the spend — Firebase sends from the device, before any request reaches us.
What they cap is what sign-in costs us: lookups, token verification, and the account
creation that writes three documents per new number.

- [ ] Add **test phone numbers** (Authentication → Settings). They are how store reviewers
      get in and how the team develops on a simulator, which has no silent push. Put one in
      App Store Connect → App Review Information and Play Console → App access. Treat the
      code as a low-grade secret: it signs in as that number against the real project.

Android needs Play Integrity enabled and the app on at least a closed track for valid
verdicts. Sideloaded debug builds fall back to reCAPTCHA.

## iOS pod setup, and why it looks the way it does

React Native Firebase v26 resolves Firebase through Swift Package Manager by default. SPM
products are automatic libraries, so under this project's static linkage each pod embeds
its own copy of Firebase and they collide at link time. The Podfile therefore sets
`$RNFirebaseDisableSPM = true` and resolves Firebase through CocoaPods instead.

That in turn hits the older problem: Firebase's Swift pods cannot build as static libraries
unless the Objective-C pods they import publish module maps. Four pods are given
`:modular_headers => true` individually rather than turning on `use_modular_headers!`
globally, which would change header resolution for all 105 pods.

Worth knowing: Firebase is deprecating CocoaPods, and new versions stop being published
there after **October 2026**. Existing versions keep working. Moving to SPM before then
means moving the app to dynamic linkage, which is a larger change than it sounds - budget
for it rather than discovering it at the deadline.

## Known gaps

Deleting a FormBae account does not delete the Firebase user — that needs the Admin SDK,
which we deliberately do not carry. Either disclose it in the privacy policy or add a Cloud
Function; it is a decision, not an oversight.
