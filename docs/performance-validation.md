# Performance validation

Image warm-up shares pending sources across callers and limits native loads to
four at a time. A failed source releases its slot, does not block the remaining
images, and can be retried. Authenticated source keys include request headers.

Workout title normalization returns unchanged cached objects by reference and
copies only the plan days whose headings need formatting. A shared plan in the
bundle and today's payload remains shared after normalization. Prescriptions,
exercise progress, and saved data remain unchanged.

Validation: asset budget, ESLint, TypeScript, 412 tests across 75 suites, and a
production iOS Metro bundle including bundled artwork. Shared assets total
5.29 MB. Native device performance was not benchmarked in this pass.

## Request and history optimization — 12 September 2026

Workout history reuses the session-scoped progress and leaderboard caches. Warm
history renders immediately; the optional leaderboard no longer blocks history
loading. Pull-to-refresh forces fresh requests and keeps displayed history and
calendar selection if the refresh fails. Memoized date groups avoid recomputing
exercise summaries when unrelated loading or leaderboard state changes.

API cancellation now removes listeners and stops retry backoff. Multiple requests
can share an abort signal without overwriting each other's handlers. Timeouts
cover response-body reads; shared GETs respect timeout and retry policies. A late
401 from a previous login cannot sign out the current account.

Validation: asset budget (87 shared rasters, 5.26 MB), ESLint, TypeScript, and
544 tests across 98 suites passed. Regression cases cover cancellation, body-read
timeout, GET deduplication, changed accounts, warm history, slow rankings, and
failed refresh. Existing unrelated tests still emit React `act` warnings. No
device timing benchmark or new native build was performed for this pass.
