# Leaderboard invite handoff

`RootNavigator` hosts `TrophyInviteGate` independently of auth/onboarding route resets. Cold-start and warm URLs are parsed against `https://formbae.in/invite/trophy/CODE` and `formbae://invite/trophy/CODE` only. A pending invitation is persisted before login, then bound to the authenticated user. Another account does not inherit it.

The gate loads a server-validated preview, shows the inviter and sharing details, and waits for **Join leaderboard**. It handles self/duplicate/invalid invites, retry, success, and offline dismissal. Acceptance invalidates leaderboard cache and refreshes an already-mounted leaderboard. Invites do not enroll users in partner mode or bypass membership/onboarding.

Web checkout stages a pending invitation on the paid account. Login/foreground checks retrieve it; the app never connects users merely because a link was opened or a membership was purchased. This supports installation on a new device without relying on app-store referral passthrough. Both local pending links and server-staged invitations use a 30-day expiry; dismissal records are scoped to the account and code.

Native registrations:

- iOS: `FormBae.entitlements` associated domain, both AppDelegate URL forwarding methods, `formbae` URL scheme.
- Android: verified HTTPS intent filter on `formbae.in`, separate custom-scheme intent filter.

Release requires rebuilt native apps and deployed website association files. Production Android signing fingerprints and actual App Store/Play Store URLs must be configured on the web deployment; they were not supplied during implementation. Detailed rollout instructions and device smoke tests are in the frontend repository’s `docs/invite-links.md`. The current Android release signing configuration must be replaced with distribution signing before a Play release.
