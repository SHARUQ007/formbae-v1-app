# Workout title grammar

Workout headings use written conjunctions consistently across the Workout and Accountability tabs, plan history, session summary, session detail and accessibility labels. For example, `Full Body Strength + Fat Burn` displays as `Full Body Strength and Fat Burn`.

- `app/src/utils/workoutTitle.ts` formats both fresh API responses and persisted cache reads. Existing offline plans do not need regeneration or a cache reset.
- `backend/app/workout_titles.py` applies the same rule when serving saved plans, plan history, workout detail and workout availability.
- `frontend/lib/utils/workout-title.ts` normalizes generated headings before they are saved. The AI prompt asks for grammatical English in notes and summaries too. Headings outside the existing mobile word/character budget, or ending with an unfinished conjunction, fail validation so another provider can be tried. They are never sliced into fragments.
- Starter templates use written conjunctions. The existing titles, exercise selections, prescriptions and report layouts otherwise retain their meaning and structure.

Normalization is limited to workout titles. Numeric plus signs such as `50+` and `+2`, exercise prescriptions and IDs are preserved. These deterministic rules address shorthand; they are not a general-purpose grammar checker for arbitrary prose.

Validation: app check (311 tests), frontend check (72 tests), backend suite (176 tests). The title tests cover legacy records, repeated conjunctions, acronyms, numeric plus signs, idempotence and the generated heading budget.
