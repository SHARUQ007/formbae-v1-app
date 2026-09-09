# Food diary presentation

The food diary uses the report palette and typography, illustrated weekly stats, separate log/report shortcuts, dated entry groups and meal cards with full-width descriptions. Notes remain complete; edit and photo preview callbacks are preserved. Real uploaded photos retain their original image source and authentication headers.

Weekly entry counts are labeled **Entries**, since one diary entry may contain several foods. Meal totals exclude skipped slots and count each meal window once per day. Days logged use these meal totals. A saved report displays **Ready to read**; current-period enrichment remains separate from the saved report's readiness.

## Artwork

- [meal-journal.jpg](../app/src/assets/editorial/diary/meal-journal.jpg): newly generated plant-based diary artwork, optimized to 800 × 400 JPEG. Reused by populated and empty diary headers.
- [diaryCapture-1.svg](../app/src/assets/report-vectors/diaryCapture-1.svg), [diaryCapture-2.svg](../app/src/assets/report-vectors/diaryCapture-2.svg), [diaryCapture-3.svg](../app/src/assets/report-vectors/diaryCapture-3.svg): new editable illustrations of a notebook, pencil and meal, used in stats, logging shortcuts and photo-error fallbacks. The generated native catalogue contains 84 SVGs.
- Text-only entries reuse the existing three editions of each breakfast, lunch, evening and dinner illustration. Their artwork is decorative meal-window context, not a claim about the foods consumed.

Raster generation used the built-in image-generation tool. Final prompt:

> Generate a standalone reusable editorial artwork for a premium dark mobile food diary. Wide 2:1 landscape, near-black charcoal background #05060a. A small open unmarked food journal with cream blank pages and a graphite pencil lies beside a simple matte black bowl of colorful chickpea and cucumber salad, a small bowl of rice and a mandarin wedge. Overhead three-quarter studio still life, contemporary natural food photography with tactile ceramic and paper, softly lit and clearly recognizable at small mobile thumbnail size. Composition concentrated in center with generous dark margins; sophisticated warm white and restrained natural food colors, no yellow haze or gradients. All food must be plant-based: no eggs, meat or dairy. No text, letters, numbers, labels, logo, smartphone, icons, charts, UI, or watermark. Distinct from a stack of archive books: this depicts recording one meal in today's diary. Do not make a screen mockup.

Validation: app lint, TypeScript, asset budgets and 303 tests pass. New tests cover skipped-meal counting, separate navigation callbacks, preserved notes and editing, offline state, and authenticated photo sources with error fallback. Component-tree browser previews were inspected at 390 px and 320 px with enlarged text; these are layout approximations rather than native device screenshots.

Backend report generation and saved report data were not changed.
