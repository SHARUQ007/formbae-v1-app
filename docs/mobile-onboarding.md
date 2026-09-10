# Mobile onboarding

The app chooses the journey from the authenticated account’s server status, not from whether the person tapped sign in or signup. Web members should use the phone number used for their payment.

## New member

Welcome → account → setup introduction → questionnaire → assessment → membership checkout → paid setup checklist → first plan → Accountability.

The questionnaire resumes at the first unanswered question and saves drafts both to the server and locally under the user ID. Legacy unscoped device drafts are intentionally ignored. Required answers include starting point, goal, schedule, training location and food preference; optional coach notes cover limitations and available equipment. Failures offer retry without navigating past an unfinished step.

## Existing paid web member

Sign in → paid setup checklist. Membership is already complete. The next action is the first missing step:

1. Complete profile, if needed. Existing complete web profiles skip this step.
2. Choose a coach from the included, currently visible options. Selection is persisted before continuing.
3. Create the first workout plan.
4. Enter the app when an active plan exists.

Already active users continue to the normal app. Existing renewal/grace behavior is preserved. Paid profile completion goes directly back to the setup checklist, never through assessment or checkout. A failed membership check does not claim payment success or grant access.

## First plan contract

- `GET /api/mobile/onboarding/plan`: `idle`, `building`, `failed`, or `completed` (with `planId`). No cache.
- `POST /api/mobile/onboarding/plan`: requires an active paid entitlement, completed profile/questionnaire, and a selected coach. Uses only the authenticated user ID.
- An atomic per-user lease in `mobile_onboarding_builds` prevents simultaneous builds across app sessions and backend workers. It expires after six minutes so a crashed request can be retried. Network uncertainty retains the lease while the remote worker may still be finishing.
- Backend calls the Next internal `/api/internal/mobile-onboarding-plan` endpoint using `BACKEND_INTERNAL_TOKEN`. It reuses `ensureStarterPlanForUser` without `forceCreate`, preserving any existing active plan. Human coaches receive the existing starter-plan behavior; AI coaches use the existing AI planner.
- A build is marked complete only after an active plan is found. The app checks every 15 seconds while a build is active and the app is in the foreground, and checks again on return. It does not fabricate percentage progress or automatically create a plan on mount.
- Coach changes enforce membership tier on the server and are blocked during first-plan creation.

## Release and checks

Deploy the frontend internal builder and backend endpoints before distributing the updated mobile client. The existing frontend URL and internal token configuration are reused. No external notification or payment is sent by setup tests.

Automated coverage includes new/paid/existing routing, partial drafts, account isolation, coach selection and tier enforcement, paid-profile completion, payment-check failures, explicit plan creation, duplicate requests, lost responses, failed builds, stale leases, and active-plan preservation. A production build validates the Next route; an iOS JS bundle validates the new mobile navigation modules. Live payment and AI-provider behavior still depends on the deployed services and their credentials.
