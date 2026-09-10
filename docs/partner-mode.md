# Partner mode: daily shared tasks

## Product rules

Matched members receive one shared task each calendar day. Assignment is created
on the first member's visit and persisted for both members. Reopening, background
refresh, concurrent requests, task edits, or pausing a task do not change an
existing assignment. No LLM call or scheduled generation job is required.

The day uses `APP_TIMEZONE` (currently Asia/Kolkata in the app's environment).
Each stored assignment captures its timezone and next-midnight deadline, so a
configuration change does not move an existing deadline. Both members see the
same deadline even when traveling. The UI names the timezone explicitly.

Each member completes the action and uploads one photo. A successful upload is
final; retries are idempotent and cannot replace another submission. The upload
must include the displayed assignment ID and date. Uploads that finish after
midnight are rejected and their temporary image is deleted. Client clocks do
not determine acceptance or reveal eligibility. A photo is a self-reported
check-in, not automated verification that the action occurred.

Before midnight neither photo is returned, even when both people have submitted.
After midnight both photos unlock only when both members submitted. Missing one
or both check-ins leaves both images private permanently. Completion status is
visible during the day, but photos and storage URLs are not. Past days shows up
to 31 recent assignments alongside the current day's new task. No punishment,
public ranking, or new trophy award is attached to these challenges.

## Context and variety

The default library contains eight editable tasks. Admins can add, edit and pause
tasks, with category, photo instructions, estimated duration, eligibility setting,
context, priority and repeat cooldown. The library supports up to 200 saved task
records. Default task overrides persist by ID; pausing all tasks does not cause
an invisible fallback challenge to be assigned.

Selection first excludes paused tasks and settings incompatible with either
member. Recorded movement restrictions exclude movement tasks. Recent context
uses the previous seven closed days: fewer than two completed workouts, fewer
than seven food logs, a workout yesterday, or recently completed training.
Missing records are treated as missing logged activity, not proof of inactivity.
No medical inference or exercise prescription is generated.

Fresh eligible tasks are preferred. Matching both members' context scores above
matching one; within that score the admin priority breaks ties. General tasks
provide a compatible fallback. A stable pair/date hash breaks remaining ties.
When all candidates are within their cooldown, the least recently assigned
eligible task is used. If none fit, Partner mode shows “No open challenges” with
no photo CTA. Both members’ trophy counts, their shared completion summary and
past days remain visible. An admin can add an eligible task without waiting
another day.

## Admin dashboard

`/admin/app/accountability-bae` has three tabs:

- Daily activity: challenge date, pair counts, zero/one/both submission states,
  paginated member/task rows and seven-day shared completion rates.
- Task library: add/edit forms, active/paused status, context and eligibility
  controls. Changes affect future assignment snapshots only.
- Member access: existing 50-trophy rule and per-user access overrides.

Metrics count actual assigned pair-days, not all matched accounts. Unvisited
days are not manufactured as missed assignments. Admins see names and submission
status, never task photo URLs, bytes or object storage paths. API actions require
an admin web session and authenticated internal backend connection.

## Storage and performance

`partner_tasks` stores editable definitions; `partner_days` stores one unique
`_id = pairId:date` document per pair-day. Assignment uses `$setOnInsert`; each
submission updates only its hashed member field and increments counts atomically.
Daily/history/admin reads exclude photo data. Pair/date and date indexes bound
history and dashboard queries. Native refresh runs only in the visible Partner
view while foregrounded, with overlapping polls suppressed.

Uploaded JPEG/PNG/WebP images are decoded with Pillow, checked against byte and
pixel limits, resized to at most 1280 pixels, and re-encoded without EXIF/GPS.
Photo endpoints re-check pair membership, both submissions and server deadline
on every request. Existing authenticated storage is reused; public object URLs
are never issued. New matches use new pair IDs, even for the same two people.
Per-member matching leases prevent concurrent candidates claiming the same user.

Photo access expires after 31 days. Expired storage is cleaned on the pair's next
assignment. Run `python -m scripts.cleanup_partner_photos` daily in the existing
job environment to reclaim photos for inactive pairs too. No scheduler has been
provisioned by this change. Leaving a match revokes access and deletes its stored
proofs. Legacy match settings remain compatible, but old prototype proofs are
not republished into the new reveal history.

## Research and decisions

- A [systematic review and meta-analysis of digital health engagement strategies](https://www.jmir.org/2023/1/e47987/)
  examines social support, goals and planning, and feedback. It supports evaluating
  these techniques together; it does not validate this specific end-of-day photo
  mechanic. Track assignment-to-upload rates and both-member completion by day.
- [BeReal's audience model](https://help.bereal.com/hc/en-us/articles/10444893090205-Audience)
  and [private Memories](https://help.bereal.com/hc/en-us/articles/7531349180829-Memories)
  illustrate separating intended viewers from retained photo history. Our feature
  uses only the active pair and requires a completed day before revealing.
- [OWASP file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
  informs type/size validation, decoded image processing and authenticated access.
  [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
  informs checks on every image read instead of relying on hidden UI controls.
- [Pillow ImageOps documentation](https://pillow.readthedocs.io/en/stable/reference/ImageOps.html)
  informs orientation handling before metadata-free re-encoding.

These are product design inputs, not evidence of a guaranteed adherence benefit.
Keep tasks manageable, avoid requiring faces or sensitive information, and review
completion patterns before expanding reminders or rewards.

## Rollout and validation

Deploy the backend including Pillow and indexes first, then the admin web app and
mobile build. Older mobile builds must refresh/update to submit an assignment ID.
Existing pairs keep their connection and receive new daily assignments on visit.
Server-evaluated reveals require no cron to unlock; photo cleanup is independent.

Regression tests cover scoring, cooldowns, stable snapshots, midnight boundaries,
missed days, unauthorized photo access, concurrent member fields, stale uploads,
retry idempotency, metadata stripping, admin authorization/validation and mobile
locked/revealed history. Test on two real accounts around the configured midnight
before enabling a broad rollout; automated tests do not measure user adherence.
