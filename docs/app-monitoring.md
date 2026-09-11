# App intelligence: source audit and implementation

Audit date: 12 September 2026. Scope: the React Native app, FastAPI persistence and mobile endpoints, and the Next.js admin dashboard. This is a source audit with isolated database and browser fixture validation, not a review of production member data.

## What changed

The App sidebar now contains dedicated monitoring screens grouped into Audience, Training, Nutrition & insights, Membership & coaching, Accountability and Operations. Existing partner, reminder and diary-storage controls remain under Configuration. These are new monitoring surfaces, not redirects to existing user management pages.

Every record monitor provides date ranges, literal text search, status/category filters, relevant totals, daily trends, state breakdowns, 30-row server pagination, record inspection and a member journey. The member journey combines retained feature records and client observations without exposing chat bodies, photos, questionnaire answers or credentials. The overview surfaces deletion requests, prolonged matching, incomplete gym details, failed builds and observed reliability failures.

## Feature coverage and source evidence

| Monitor route under `/admin/app` | Source and evidence | Meaning and limits |
| --- | --- | --- |
| overview | Indexed monitoring records and bounded Places counters | Rolling activity, latest attention records and feature navigation; counts are not billing estimates |
| activity; members/:userId | All allowlisted projections plus new client observations | Chronological history; current-state records carry their saved date, not a fabricated event timestamp |
| screens | `RootNavigator.tsx`, `monitoringService.ts` | Visits, distinct member reach and foreground time per leaf route; background/resume counts a new observed visit |
| retention | New screen telemetry | Rolling 24-hour/7-day/30-day active members and repeat visits on distinct IST dates; not signup cohort retention |
| members | `users`, role=user | Enabled/disabled account records and trainer assignment; not every account necessarily uses mobile |
| profiles | `profiles` | Fitness goal, training days and diet preferences; saved profile is not proof of setup completion |
| onboarding | `funnel_events`; `mobile.py` setup endpoints | Mobile account creation, questionnaire draft/completion and analysis milestones; event counts, not a sequential conversion percentage |
| workouts | `workout_logs`; `workout_history.py`, `optimized.py` | One completed session per member/date/plan/day/mode. Exercise and streak-only markers excluded; replayed completions deduplicated. Saved snapshots expose actual exercise names, muscles and set counts; legacy rows cannot reconstruct missing performance data |
| feedback | `workout_feedback:{userId}` | Sentiment, scope, exercise and replacement preference; free-text feedback excluded; source retains a bounded history |
| plans | `plans` | Current plan status, assignment and training cycle, not all previous plan status transitions |
| progress | `body_logs` | Measurement submissions and dated member history; no inferred medical or fitness claims |
| check-ins | `mobile_checkin:{userId}` | Submitted completion, energy and difficulty; notes excluded |
| nutrition | `mobile_diet_diary:{userId}` | Meals by type and logged/skipped status; no image bytes, signed URLs or notes |
| reports | `mobile_diet_feedback:*`, `mobile_progress_review:*` | Deduplicated generated report dates and records awaiting a first report; source history is bounded; reading this monitor never generates an AI report |
| reading | `ReadingArticleCard.tsx` | Article opens by topic; not reading completion or dwell within external articles |
| gyms | `profiles.lifestyleJson` | Saved place ID, membership type/provider and dates; details are member-provided. Names only when already stored; no paid Google calls |
| access | `trainee_access` | Current active/scheduled/expired app access and trainer tier; distinct from gym subscriptions |
| payment-grants | `commerce_payment_grants`; `payment_grants.py` | Unique verified payment-to-access ledger entries; not amounts, refunds or webhook volume |
| coaching | `trainer_bookings` | Trainer booking dates and statuses; meeting credentials excluded |
| messages | `messages` | Message activity and sender role; message bodies excluded |
| matching | `mobile_accountability_bae:{userId}` | Current preference and state; waiting+friend means invite ready, not automatic matching; waiting hours measured at refresh |
| partner-checkins | `partner_days` | One record per member/challenge day; submitted vs waiting and whether both submitted; proofs excluded |
| commitments | `mobile_accountability:{userId}` | Personal commitments and completion states; bounded source history |
| trophies | `mobile_trophies:{userId}` | Saved score per member, not award history |
| connections | `mobile_trophy_connections:{userId}` | Distinct saved connection IDs per member excluding self; both sides may be counted |
| preferences | `mobile_settings:{userId}` | Saved reminder choices; not device permission or delivery |
| notification-events | `notificationService.ts` | Observed permission result. Remote push delivery/open receipts are not integrated |
| builds | `mobile_onboarding_builds`; `mobile.py` | Last first-plan build status and expired leases; snapshots, not an immutable job log |
| generation | `ai_workout_generation_events` | Provider attempts, tokens, duration and fallback flags; attempts are not unique generations or currency cost |
| reliability | `apiClient.ts`, `StableImage.tsx` | Client outcome counts, failures and mean/max durations per endpoint family or asset class; request time includes retries; image screen context is the active screen at observation |
| privacy | `mobile_delete_request:{userId}` | Pending deletion request and age; does not automatically delete accounts |
| logins | `login_events`, role=user | Recorded successful sign-ins; historical source cannot reliably distinguish web/mobile or failed authentication |
| coverage | Source refresh state, route inventory, monitoring audit | Partial/error/freshness status, observed/unobserved screens, telemetry retention/limits/kill switch, admin changes and Places allowance consumption |

## Instrumentation decisions

The old `/mobile/activity` service deliberately deduplicates each member/path/day. It remains for compatibility and is **not** reinterpreted as visits, sessions or DAU. New identified observations use `/api/mobile/telemetry`.

- Track authenticated leaf navigation via `onReady`/`onStateChange`; no route parameters are sent. Before-login screens remain unobserved in identified telemetry.
- Count foreground engagement on navigation away/background; restart sessions after 30 minutes in background or authentication changes. A terminated process can lose its final dwell event.
- Track internal partner states and diary/report panels separately as feature views. Repeated polling of the same panel does not inflate views.
- Queue at most 80 events in memory, flush at most 40 every 30 seconds or on background, timeout after five seconds, no retry storm or durable content cache. Logout discards queued observations and aborts the old request. No telemetry errors block app actions.
- API observations use fixed endpoint families, never URLs, identifiers, query strings, payloads or response text. Shared GETs are observed once after deduplication. Image events classify bundled/remote/protected assets without sending image URLs.
- Event IDs are idempotent per authenticated user. The server owns identity and expiry, rejects unknown event types/names/statuses and implausible timestamps, and caps batch size.
- Default limits: 120 batches/member/day, four/member/minute, 2,000 batches/day fleet-wide. Administrators can set the member daily budget between 1 and 240, retention between 7 and 90 days (default 60), or disable ingestion. Atomic Mongo counters enforce budgets across workers. This is deliberately best-effort analytics, not a complete event ledger.

## Storage, queries and privacy

`backend/app/monitoring_records.py` projects only named fields. `backend/app/app_monitoring.py` writes the separate `app_monitor_records` store. Source refresh scans native `_id` cursors in batches of 100 (four for settings whose JSON may contain images), joins only the affected role=user member names, writes idempotent projections and keeps prior rows until a full source cycle completes. Successful cycles prune removed source records. Failed/interrupted cycles resume; a two-minute lease prevents concurrent workers from doing the same step. The browser can pause/resume a refresh.

Queries filter and paginate on the server, use section/date/member/status indexes, cap aggregation time, and permit disk spill. Aggregated responses are bounded; raw source tables never reach the frontend. The overview is cached for 15 seconds after authentication, invalidated on completed refresh, control changes and existing account mutations. Daily charts zero-fill missing dates and use the configured application timezone. The UI displays timestamps in IST, matching the app's current timezone.

Source snapshots need an administrator refresh; there is no unconfigured background scheduler. The UI marks unrefreshed/partial/failed sources explicitly. First refresh can take multiple batches. Data is as-of the refresh, not a transactional snapshot across all collections. Current-state age/expiry values update on refresh.

Internal routes require both the backend internal token and a current administrator identity forwarded by authenticated Next.js server code. No internal token is sent to the browser. Only role=user records are projected. Account deletion also deletes the member's monitoring records. Telemetry TTL applies only to observations; expiry is checked in queries because Mongo TTL cleanup is asynchronous. Reducing retention also shortens existing expiry and removes already-expired telemetry. Source feature records retain their existing application lifecycle. Config changes and refresh starts are audited for 180 days.

## Remaining coverage boundaries

Native crashes, external video watch completion, remote notification delivery receipts, anonymous attribution and signup cohort retention require additional event sources. Current telemetry does not claim to measure them. No session replay, keystroke capture, location tracking, model prompts, private media or message bodies are collected. Metrics from saved records can include web-originated activity where the source does not persist platform provenance. A new app release is required before client observations appear.

Places allowance includes upstream attempts, including failures; it does not equal billed requests or rupee spend. The existing global/user Places protections remain intact. Reading monitors or refreshing projections makes no Google/AI requests.

## Validation and rollout

- Full app lint, asset budget, TypeScript and Jest checks: 95 suites / 526 tests passed, including queue bounds, account isolation, rate-limit pause, foreground time and feature-view deduplication.
- Backend full unittest suite and isolated local MongoDB tests: projections, sensitive-field exclusion, invite state, workout replay identity, expiry dates, bounded refresh/pruning, pagination, literal regex search, telemetry idempotency, admin role checks and retention controls.
- Frontend lint, TypeScript, tests and Next.js production build. Actual monitoring components rendered with fixture data at 1440px and 390px in headless Chrome: no page overflow or browser exceptions; record details expand. This does not replace an authenticated production smoke test.
- Deploy backend first (startup creates indexes), then frontend. Open **App → Tracking & controls** and refresh saved records. Release the app build for new observations; inspect observed screen coverage and reliability after real usage. No API keys or secrets need adding to the mobile bundle.

Reference decisions: [React Navigation screen tracking](https://reactnavigation.org/docs/screen-tracking/), [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/), [MongoDB aggregation groups](https://www.mongodb.com/docs/manual/reference/operator/aggregation/group/).
