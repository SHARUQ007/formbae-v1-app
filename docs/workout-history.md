# Workout history summaries

## Behavior
- The history list and calendar open a read-only historical session, never the current workout player.
- Entries show the saved workout title, muscle groups, exercise names and logged-set count. Quick remains a small mode label.
- The detail screen shows the recorded date, SVG front/back muscle map, exercise list, planned prescription, and actual sets/reps/weight/work seconds when available.
- Saved prescriptions are labeled separately from performed sets. Completion of a whole session alone does not claim each prescribed movement was performed.
- Legacy completion markers use only their associated owned plan and mode. Missing old plan details remain unavailable; no current plan or invented quick fallback is shown as historical performance.

## Journal design
The history page uses a custom SVG line print, plain statistics and date-led entries. It has no decorative icon badges, gradients or image downloads. The detail screen uses the same typography and numbered exercise sections, keeping the anatomical SVG muscle map.

The optional calendar opens on the latest recorded month. It uses seven equal columns, 44-point-tall touch targets, small gold marks for workout dates, an outline for today, and a filled circle for the selected date. Its selection survives collapsing and reopening. Month navigation stops at the first recorded month and the current month; future dates are disabled. Calendar browsing does not filter the complete workout list.

## Capture and persistence
The player captures chosen exercise variants and actual set logs before clearing local progress. Each exercise completion and final session completion send these through the existing authenticated API. The backend stores an immutable versioned JSON snapshot with the completion marker. Repeating a completion request does not rewrite it after a plan edit.

Quick and standard local progress are separated. Timed prescriptions are not submitted as rep counts. Exercise replacement is disabled once sets have been logged for that movement so one slot cannot silently combine different exercises. Offline queue payloads retain the exercise snapshot. Rejected client requests keep local progress rather than claiming an offline save.

The optional response contract is in `WorkoutHistoryEntry` and `WorkoutHistoryExercise`. New app clients tolerate older backend responses with unavailable-detail copy. Deploy the updated backend and updated app to capture and display new detailed sessions. Existing sessions can only recover data still stored; previously cleared local set logs cannot be reconstructed.

## Existing limits
- Offline retry timestamps still use the server processing date; this change preserves the queue's existing date behavior.
- Explicit admin plan deletion currently also deletes its workout logs. Snapshots preserve history through edits and switching, not intentional cascading deletions.
- Existing repeated-plan streak-only completions retain their original counting behavior.
- No calorie, load-volume, or full-session duration estimates are invented. Set seconds describe measured working time, not rest time or total workout length.

## Checks
Covered: full history list, selected archived session navigation, muscle map targets, actual vs prescribed sets, unavailable and prescription-only records, selected variants, quick/standard storage isolation, offline payloads, rejected saves. Backend tests cover snapshots, undo, legacy plans, ownership, mode filtering, batching and payload limits. No production deployment/device session was performed during implementation.

Design checks: calendar month bounds, seven-column alignment, multiple sessions per date, empty history, retained selection and refresh failure under React StrictMode. Browser previews using the actual screen components, React Native Web and fixture data were inspected at 390px and 320px widths. These previews do not replace an iOS device check. The reported static-flag warning was not reproduced in the render/refresh tests.
