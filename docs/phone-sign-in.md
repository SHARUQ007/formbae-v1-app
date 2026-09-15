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
- [ ] **Required on iOS**: register the reCAPTCHA return scheme in `ios/FormBae/Info.plist`
      `CFBundleURLTypes`. It is `GOOGLE_APP_ID` from `GoogleService-Info.plist` with its
      colons turned into dashes and `app-` in front:

      ```
      GOOGLE_APP_ID  1:190649836345:ios:a93f4d0338c4a566b9bee8
      URL scheme     app-1-190649836345-ios-a93f4d0338c4a566b9bee8
      ```

      Not `REVERSED_CLIENT_ID`, which older Firebase docs name and which only exists once
      Google Sign-In is enabled on the project. Not the bundle id either. Firebase checks
      for this exact string and calls `fatalError` when it is absent, so a wrong value
      crashes the app the moment a code is requested - it does not degrade. Regenerate it
      if the Firebase app is ever recreated.

Silent-push verification is not optional in practice. Without it every attempt logs

```
Remote notification registration failed, phone sign-in will use reCAPTCHA:
no valid "aps-environment" entitlement string found for application
```

and falls back to a reCAPTCHA sheet that did not complete for us. Both halves are needed -
the app has to be allowed to receive the push, and Firebase has to be able to send it:

- [ ] **Push Notifications** capability on the iOS target (Xcode → Signing & Capabilities →
      + Capability). With automatic signing this enables it on the App ID, regenerates the
      profile, and writes `aps-environment` into the entitlements. Adding that key by hand
      without the App ID carrying the capability fails the build with
      `doesn't include the aps-environment entitlement`
- [ ] **APNs auth key (.p8)**: Apple Developer → Keys → + → Apple Push Notifications
      service. It downloads once, so keep it. Upload it at Project settings → Cloud
      Messaging with its Key ID and your Team ID. The capability alone only lets the app
      receive the push; this is what lets Firebase send one
- [ ] **SMS region policy**: Authentication → Settings → allow `IN`. Not hardening - a new
      project denies every region, and until India is allowed every verification fails with
      `auth/operation-not-allowed`, whatever else is configured. Keep it as an allowlist of
      just `IN` rather than opening it up
- [ ] Enable **App Check** (Play Integrity, App Attest), then enforce it on Authentication
- [ ] Set a **Cloud Billing budget alert** on the phone-auth SKU

Those three are the actual SMS-abuse controls. The backend's rate limits sit
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

Three settings in the Podfile are load-bearing, and each one is there for a reason that is
not obvious from reading it.

`$RNFirebaseDisableSPM = true`. React Native Firebase v26 resolves Firebase through Swift
Package Manager by default. SPM products are automatic libraries, so each pod embeds its
own copy of Firebase and they collide at link time; RNFB's own installer refuses the
combination outright. Resolving through CocoaPods is the opt-out it documents.

`use_frameworks! :linkage => :static`, now the default rather than an opt-in env var.
Firebase's Swift pods cannot be plain static libraries: the Objective-C pods they import
publish no module maps, so Firebase's umbrella header cannot find `FirebaseAuth-Swift.h`.
Static frameworks give every pod a module without changing how it is distributed.

`:modular_headers => true` on four pods. Belt and braces for the same problem, scoped
rather than `use_modular_headers!` globally, which would change header resolution for all
105 pods.

Worth knowing: Firebase is deprecating CocoaPods, and new versions stop being published
there after **October 2026**. Existing versions keep working. Moving to SPM before then
means moving the app to dynamic linkage - budget for it rather than discovering it at the
deadline.

## Diagnosing a failure

The SDK collapses most failures into `auth/operation-not-allowed` or a generic message, and
the device console does not carry the JS error. Ask Firebase directly instead - no app, no
device, no build in the way:

```
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=$API_KEY" \
  -H "Content-Type: application/json" -d '{"phoneNumber":"+919961634121"}'
```

`API_KEY` is `API_KEY` in `GoogleService-Info.plist`. The error it returns is the specific
one, where the app only ever sees the category. It is how the region policy above was
found, after a long detour through entitlements, URL schemes and push configuration.

For failures that really are on the device, attach a console and reproduce:

```
xcrun devicectl device process launch --device <udid> --console --terminate-existing com.formbae
```

Do not pipe it through `tail` - the output buffers and nothing appears until the process
ends. That hid a failed build earlier, and then an empty log.

## Known gaps

Deleting a FormBae account does not delete the Firebase user — that needs the Admin SDK,
which we deliberately do not carry. Either disclose it in the privacy policy or add a Cloud
Function; it is a decision, not an oversight.
