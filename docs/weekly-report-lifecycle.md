# Weekly report lifecycle

The backend owns the due date in `nextReviewAt`. The initial review is due seven
days after the first progress visit. A completed report starts a new seven-day
window when generation finishes. A schema upgrade or a tab refresh cannot bring
that date forward.

At the boundary, the review checks the seven completed local calendar dates
ending before the due date. Both displayed requirements must be met: three
completed workouts and twelve meal logs. The report uses those same dated
records. Lifetime totals and the previous report's statistics do not qualify a
new period.

If the period falls short, no report is generated and the next scheduled check
moves forward seven days. That date is persisted, so it does not reset on every
visit. Returning after a long absence evaluates only the most recently closed
period, without backfilling several reports. Activity logged in the new period
cannot trigger an early replacement for a missed week.

The last saved report stays readable throughout the seven-day window, while a
replacement is prepared, and after a missed week. It remains in history. The
report's `stats`, `reportStats`, period and narrative stay frozen; `cycleStats`
and `cyclePeriod` describe progress toward the next report separately.

`cycleState` is `collecting`, `scheduled`, `preparing`, or `retry_wait`.
`generationPending` is true only for an eligible, due generation request.
Generation failures keep the saved report and use a separate retry cooldown;
the cooldown never becomes a new report date. Runtime state overrides any
legacy state accidentally saved inside a report snapshot.

The app derives its countdown from `nextReviewAt`, with `nextInDays` retained
for older servers. It does not show preparing or poll weekly generation before
the due date. The dashboard identifies a skipped week while retaining View
report. The progress cache version is bumped to discard obsolete lifecycle
payloads.

Generation still starts through the existing background job on a progress read;
this change does not introduce a scheduled worker. Explicit administrative force
generation remains an exception. Mobile reads never force generation.

Regression coverage includes early goals, exact due boundaries, dropped activity,
each unmet requirement, missed cycles, long absences, schema changes, immutable
snapshots, retry timing, generation duration, cached countdowns, and polling.
