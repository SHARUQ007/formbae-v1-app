# Diet and weekly reports: audit and execution plan

Date: 9 September 2026

## Outcome

Each report should answer four questions: what happened, what it means, what to do next, and what the evidence cannot establish. The diet report interprets described foods and practical meal decisions. The weekly report connects training delivery, food evidence, session feedback and optional body measurements. Its nutrition section must add a training-relevant interpretation rather than reproduce the diet report.

## Audit findings

| Area | Finding | Required change |
| --- | --- | --- |
| Period integrity | Weekly aggregate workouts, rolling log windows and seven-day charts use different windows. | Use exactly seven local dates, with one explicit period for every displayed fact. |
| Historical integrity | Cached narrative can receive current metrics and charts. | Freeze report-period statistics and keep new evidence for the next report separate. |
| Nutrition evidence | Weekly context can include stale generated diet conclusions. | Build current food evidence directly from dated diary entries. |
| Content density | Prompts require fixed counts of wins, patterns, highlights and sources even when evidence does not justify them. | Remove minimum quotas. Allow fewer stronger findings; never pad. |
| Duplication | Summary, highlights, findings, benefits, risks, domain cards and plan repeat the same advice. | Give observations, interpretation and implementation distinct homes. |
| Metrics | Composite momentum rewards logging and consecutive exercise; estimated diet score looks clinically authoritative. | Show visible criteria with numerators, denominators and limits. Clearly label the diet score as an editorial assessment of described foods. |
| Actions | Multiple sections recommend different actions; legacy CTA can differ from visible priority. | Show at most two ranked plans with cue, steps, fallback and observable success measure. Route CTA from the displayed action. |
| Food uncertainty | Photo-only or omitted foods cannot establish intake or nutritional adequacy. | Explicitly state described-food coverage and relevant limitations. |
| Body measurements | First/last records may have different populated fields or only one reading. | Compare finite same-metric measurements on different dates; do not infer muscle/fat change. |
| Question answers | Filtering questions can change their submitted array indices. | Preserve original server question indices. |
| Deduplication | Token matching can erase distinct counts or opposite claims. | Preserve numbers, dates and negation when comparing content. |
| Deployment | Health checks alone cannot establish that the new prompt is deployed. | Verify Render's running Git SHA through an authenticated release endpoint before regeneration. |

## Report design

The report toolbar stays visible while scrolling: an icon-only back control on the left, a flexible title in the middle and History at the top right on the same row. Report surfaces are flat charcoal/black, without yellow gradients or tinted yellow action panels. Small solid accent marks establish hierarchy without washing the page in color. Hide the bottom navigation during diet report reading, including history and archived reports, and restore it on exit. Android back follows the report's internal navigation.

Use original contextual nutrition/training editorial covers and custom SVG illustrations for food, training, recovery, measurements and evidence. Functional navigation arrows remain recognizable controls. See [artwork assets and exact generation prompts](report-artwork.md).

### Diet

1. Dated report identity, a concise food-pattern verdict and a two- or three-sentence account of the completed week (roughly 40–65 words). Summarize the main patterns; do not list every meal in a paragraph.
2. Factual coverage: described meals and days, with one concise scope note.
3. A visible six-criterion scorecard: points, criterion definitions, interpretation and explicit limits. Unknown evidence stays unknown.
4. Up to three distinct findings. Each has an observation, supporting diary evidence and one useful implication.
5. A prominent next-week plan with up to two ranked actions. Each specifies a routine cue, practical steps, an easier fallback and a measurable target. Familiar foods and stated preferences shape choices. Avoid additional swap advice when the canonical action plan is present.
6. Visible meal-window detail, foods named in the diary and a flexible meal formula. These answer distinct evidence/implementation questions without repeating the principal findings.
7. Only unanswered questions that would change advice, preserving their original identities.
8. Native article-style source cards open the original publication in an in-app reader. PDFs and unavailable embedded pages offer the original browser link. No "How to read the report" section.

### Weekly

1. Exact report dates, a short cross-domain verdict and contextual training artwork.
2. A compact snapshot of completed training and food entries.
3. A two- or three-sentence weekly summary and visible seven-day activity timeline. Missing logs do not prove inactivity or fasting.
4. Three visible criteria: standard sessions against the personal weekly target, described-food days out of seven, and matched session feedback against completed sessions. Unknown denominators show unavailable values.
5. Up to three evidence-led interpretations with source excerpts and no repeated highlight/domain narrative. Nutrition adds a broader implication rather than retelling every meal in the diet report.
6. Visible session mix and comparable body readings, omitting redundant empty breakdowns. Changes require comparable evidence.
7. At most two ranked actions with practical execution and a domain-specific button. Rest and recovery are compatible with progress; no consecutive-day exercise incentive.
8. Native source article cards. Fallback data summaries remain distinguishable from personalized interpretation through a short byline, without a separate reading-instructions section.

## Backend contract and generation

- Preserve existing fields for cached reports and older app versions; new metadata fields are additive and optional to clients.
- Add `reportKind`, `generationMethod` and `evidenceCoverage`.
- Assign IDs to current evidence records and principal findings. Structured action plans link back to a finding and supporting evidence.
- Prioritize current dated logs, then explicit profile preferences/context, then historical continuity. Historical recommendations do not prove compliance.
- Treat all free-text input as untrusted data. Do not follow embedded instructions.
- Never infer image contents, calories/macros, quantities, diagnoses, nutrient deficiencies, weight composition, unlogged food intake or sleep quality.
- Use source facts from a maintained allowlist only when they support advice actually given.
- Validate structured output and bounded numeric values. Remove duplicate content without collapsing distinct measurements. Retain a valid report if generation fails; expose an honest data summary when appropriate.
- Exclude noncomparable prior-report narrative from generation context. Audit counts, meal-to-food associations, skipped versus described occasions, substance mentions, recommendation consistency and unsupported absence claims against current source records.
- Preserve complete sentences and grammatical headings; do not truncate explanations at arbitrary short character boundaries.
- Keep every narrative block brief: two or three short sentences at most. Put meal details in evidence cards and instructions in discrete steps. Older oversized summaries use a concise saved summary when available, without ellipses or mid-sentence clipping.
- Avoid expensive regeneration solely to fill an arbitrary section quota.

## Validation and release sequence

1. Establish existing backend test and app typecheck baseline; preserve unrelated working-tree changes.
2. Test exact date boundaries, duplicate meal/session records, frozen snapshots, sparse/zero evidence, malformed provider output, missing plans, comparable measurements and prior-period comparisons.
3. Test new structured actions plus old-schema fallback, duplicate text, action routing, question indices and disclosure accessibility.
4. Run backend suite, app typecheck, targeted lint and relevant app tests. Review final diff and generated fixture content.
5. Commit only report-related backend changes and release verification support. Push without force to the deployment branch after confirming its remote state.
6. Poll the authenticated release endpoint and readiness until the expected commit is serving on Render. Do not trigger generation against the old release.
7. Resolve the authorized account, regenerate diet first and weekly second, inspect the new schemas, periods, findings/actions, generation method and persisted timestamps. Do not regenerate other users.

## Reference basis

- [WHO healthy diet, updated 26 January 2026](https://www.who.int/news-room/fact-sheets/detail/healthy-diet): qualitative variety, balance, moderation and culturally appropriate food choices; not a basis for estimating intake from incomplete logs.
- [ICMR–NIN Dietary Guidelines for Indians 2024](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI07052024P.pdf): local food context and diverse dietary patterns.
- [WHO physical activity](https://www.who.int/news-room/fact-sheets/detail/physical-activity): activity supports health, but logged session count alone cannot establish intensity, training volume or fitness change.
- [W3C disclosure/accordion accessibility](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/): accessible controls and communicated expanded state; applied through React Native accessibility properties.
- [Render default environment variables](https://render.com/docs/environment-variables): `RENDER_GIT_COMMIT` identifies the running deployed revision.

## Delivery record

- Completed audit and redesign of both report renderers, preserving existing unrelated local edits.
- Final app integration validation passed 209 tests across 33 suites, TypeScript, ESLint and asset budgets. The subsequent sentence-splitting compatibility refinement passed all 37 focused weekly tests.
- Viewed diet and weekly report opening sections and action plans on the booted iPhone simulator. The expanded layouts render the generated covers, custom SVGs and same-row History control correctly. Temporary preview entry and files were restored/removed afterward. The later brevity change is covered by legacy-summary and decimal-boundary regressions.
- Added an authenticated serving-commit endpoint and a deployment-gated, single-account regeneration script. Six release/gate tests pass, including rejection of a data-summary fallback as a personalized generation result.
- Backend revision `15d3c9b6cf10addb2845dced457cfe4b429b5840` was pushed, verified serving on Render, and used to generate both reports for the authorized account. The backend suite passed 145 tests.
- Live source-by-source content review caught unsupported prior-period comparisons, invented meal counts, incorrect food associations and clipped explanations.
- Corrective revision `7c3b4b6a4ecf14aa4766875f1bab9c546374c281` was pushed to the backend deployment branch and verified serving on Render with database readiness. It adds a mandatory independent source review, verified count substitutions, final output checks and concise narrative limits (diet schema 17, weekly schema 11).
- The corrective backend suite passed 154 tests; final synthetic-fixture and grammar refinements passed all 63 focused report checks. No production diary records were committed as fixtures.
- The first attempt on the corrective release retained the prior diet report after validation failed; the deployment script detected the stale schema and stopped before weekly generation. Diagnosis used controlled local reproduction with private temporary artifacts and no database writes; the final releases and persisted reviews are recorded below.
- Revision `d7064342bf2e7a2c30be0266af94ee361a0d8e20` simplified generation to visible canonical content, derived compatibility fields afterward, and added one bounded repair with final validation. All 159 backend tests passed. Render served this revision with database readiness, but the live candidate still failed validation and the previous report remained intact.
- A scoped independent audit model was validated through the existing provider integration. The coach and workout model configuration stays unchanged. Request compatibility was checked against the [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) and [GPT-5.5 model documentation](https://developers.openai.com/api/docs/models/gpt-5.5). Private diagnostic artifacts remain outside the repository.
- The independent audit diagnostic confirmed GPT-5.5 responses from OpenAI through the existing gateway. Source review plus bounded repair produced a normalized schema-17 candidate with correct meal associations, three-sentence recap and consistent actions. A calendar-date false positive in frequency validation was corrected. All 162 backend tests passed.
- Backend revision `0f7ea746815697bf72455d033fdb7245afecb12c` was pushed to both the deployment and working branches, then verified serving on Render with database readiness before report generation.
- The fresh diet report (schema 17) was persisted at `2026-09-09T02:31:35.937631+05:30`. Independent review of the actual saved result confirmed correct source associations and counts, score arithmetic, a three-sentence 43-word recap, two measurable actions, preserved evidence and no clipped prose.
- The subsequent weekly generation returned HTTP 500 and retained its existing report. This prompted a separate weekly diagnosis. The release script now supports selecting only the report that needs replacement, so the reviewed diet report was not regenerated.
- The exact-source local weekly diagnosis completed successfully within the bounded three calls; no deterministic cause for the earlier HTTP 500 was reproduced. It identified two separate quality defects: the source audit lacked the reference catalogue, and an already-punctuated fact could gain a second period. Both are corrected, and weekly action guidance now emphasizes training/tracking decisions rather than repeating diet swaps.
- Backend revision `39e98f7ed0dc80730a4a89c978a0e3ef93e6629e` was pushed after all 164 backend tests, compile and diff checks passed. Render's serving revision and database readiness were verified before generating only the weekly report.
- The final weekly report (schema 11) was persisted at `2026-09-09T02:46:21.159931+05:30`. Its actual saved content matches the generation response. Independent review confirmed source-matched statistics, all seven dates, three grounded findings, two measurable actions and two complete source article cards. The longest narrative is 55 words in three sentences, with no generated block exceeding three sentences.
- Final read-only verification confirmed the current Render revision, the new saved weekly report, and the unchanged reviewed diet report. Both cover 2–8 September 2026 for the authorized account. Backend working tree is clean; app changes are available in the shared workspace, with all 213 app tests and the full app check passing.
- Both mobile report-loading GET requests can generate synchronously. Their timeout now covers the bounded generation window without automatic retries; unrelated requests keep their existing settings. Twelve focused service tests, typecheck and targeted lint passed, including delayed completion and a single timed-out fetch.
- Final app integration check passed all 213 tests in 34 suites, TypeScript, ESLint and asset budgets.

## Score explanation brevity follow-up

- The cutoff screenshot matched the archived schema-16 report: all six explanations had been stored at exactly 110 characters without sentence endings. The current schema-17 report already has complete explanations of 8–11 words. The mobile diary cache could refresh in the background while leaving the screen's local report state on the older snapshot.
- Opening the current report now requests fresh data through the client cache and updates the visible report. This preserves the server's weekly generation cadence and retains the visible report if the request fails.
- Backend revision `7502a24a66287fe1ada74f6588e9875754165fae` enforces one complete score explanation sentence, at most 16 words and 110 characters after fact expansion. Drafting, source review and repair share the rule. Validation rejects incomplete endings, ellipses, joined clauses and oversized explanations instead of clipping prose. Scoring criteria and schema are unchanged.
- The revision was pushed and verified serving on Render with database readiness. The subsequent account-scoped report read returned the existing ready schema-17 report with all six short, complete explanations; no replacement generation was needed. All 166 backend tests and 228 app tests passed, along with app TypeScript and asset checks.
