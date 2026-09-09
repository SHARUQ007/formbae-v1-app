# Diet report presentation contract

The approved diet report is a native document. The LLM supplies evidence and advice; it cannot select components, reorder sections, change styles, choose remote artwork or replace the six scoring criteria.

## Generation boundary

`backend/app/diet_report_contract.py` defines field-specific character, word and list budgets. The same rules are included in the draft, independent review and final repair prompts. Validation checks the expanded text, including server-owned fact substitutions, and runs again after server normalization.

- Headlines: at most 80 characters; weekly synthesis: at most 75 words and three sentences under the existing factual audit.
- Six score explanations: one complete sentence, at most 110 characters and 16 words.
- At most three insights, seven food groups, four meal windows, two actions and two follow-up questions.
- Actions have at most two short steps, with separately bounded rationale, cue, fallback and target.
- Failed text is rewritten by the existing bounded repair pass. Advice is never cut mid-sentence to meet these budgets. A failed final check retains the previous saved report and schedules the existing retry behavior.

The factual audit, evidence grounding and score calculations remain in force. Diet schema 17 and its scoring method are unchanged, preserving score comparisons.

## Native boundary

`app/src/utils/dietReportContract.ts` allowlists typed content at the document entry point, including cached reports. Malformed nested objects and arrays cannot become React text children. Non-finite measurements remain unavailable; zero stays zero. Saved question positions and bounded, nonrecursive report history are preserved.

Section order, headers, score labels, denominators, grid behavior, typography and spacing stay in app code. Unknown presentation fields are discarded. Invalid criterion ranges or denominators render an unavailable score instead of a fabricated value. Existing full-text disclosures and narrow-screen layouts remain available.

A regression test compares the entire serialized native tree before and after supplying model-controlled section order, templates, styles, HTML and image URLs. It must be identical.

## Contextual artwork

The existing local library contains 81 SVGs across 27 roles, plus 48 report-specific images: 24 covers/article images, 18 scoring images and six action images. Each SVG role and scoring/action topic has three distinct editions. Images are bundled, so rendering does not depend on an LLM-supplied URL or a remote image service.

Title matching covers drinks, snacks, protein, vegetables, meal windows, fruit, grains, dairy, nuts, preparation and diary context. Unknown topics use neutral report illustrations. Unknown food groups and meal windows retain an illustration rather than leaving an empty slot.

Protein artwork uses the explicit dietary preference; vegetarian, vegan, restricted and unknown preferences receive plant artwork. Score and action cards fall back to contextual SVGs if a bundled image fails to decode. A later report edition can still load its own image.

Edition selection is stable while reading and rotates across weeks. SVG coverage and three-edition rotation are checked automatically. Reuse across later editions is intentional; this is a bounded offline library, not unlimited unique generation.

## Validation and release

- App: 295 tests across 44 suites, lint, TypeScript and asset budgets passed.
- Backend: 174 tests passed, including malformed shapes, field budgets after fact expansion, successful repair, final repair rejection and preservation of the saved report.
- Backend revision: `621ed5f10e3f122a33b2daa9c847472bd0f6bed0`, pushed to `main` and `agent/optimize-workout-plan-flow`.
- No report-generation endpoint was called for this change. The current approved report was not regenerated.
- Render verified the exact serving revision above and database readiness after deployment.
