# Report artwork

## Expanded rotation library — 9 September 2026

The reports now use **24 new editorial photographs** and **69 original SVG illustrations**. The photo library provides three sets for the eight possible cover/article positions across the two reports; the vector library provides three compositions for each of 23 contextual roles. Navigation arrows remain consistent controls.

- JPEG library: [app/src/assets/editorial/report-library](../app/src/assets/editorial/report-library).
- Editable SVG originals: [app/src/assets/report-vectors](../app/src/assets/report-vectors).
- Exact photo prompts, original generated paths and project destinations: [report-artwork-library.json](report-artwork-library.json). All 24 photos were generated with the built-in imagegen tool, then resized to at most 960 pixels wide and saved as optimized JPEGs. The original PNGs were retained.
- Runtime selection: [reportArtworkLibrary.ts](../app/src/utils/reportArtworkLibrary.ts) and [reportVisuals.ts](../app/src/utils/reportVisuals.ts).
- Native vector catalogue: [reportIllustrationCatalog.ts](../app/src/utils/reportIllustrationCatalog.ts), generated from the editable SVGs using `node scripts/build-report-vectors.js` in the app directory. SVGs were authored directly as vectors, not raster traces.

Artwork rotates by the saved report period, with a stable fallback for older undated reports. Reopening or scrolling never reshuffles it. Successive weekly reports rotate through three cover/illustration editions, while nutrition articles use three separate sets. Article selection reserves the report cover and avoids repeated thumbnails within the report, including older reports with up to six references. Diet and weekly nutrition articles start at different positions in the pool.

The food-group section now uses illustrated full-width rows, wrapping food tags, aligned headings and explicit unknown states. Juice and unverified whole-grain qualifications remain visible. Repeated decorative section/action icons were removed. These images illustrate categories and report themes; they do not claim to photograph a user's own meals.

The 24 new JPEGs total **1,526,020 bytes**. The final shared asset directory is approximately 4.50 MB; iOS and Android totals are approximately 5.01 MB and 4.75 MB. Aggregate budgets were adjusted for the explicitly requested library; the 220 KB single-image cap is unchanged.

Validation: all 222 app tests across 36 suites, lint, TypeScript and asset-budget checks pass. Rotation tests cover stable reopening, three-week cycling, distinct article selections across report families and no cover/article duplication. All photo and vector variants were visually reviewed. HTML previews of the rendered food-section component tree were inspected at 390 pixels and at 320 pixels with 1.6× text; these supplement automated checks and are not device screenshots.

## Meal-window illustrations

Added 12 original SVGs: three distinct variants each for breakfast, lunch, evening and dinner. These use colourful ceramic, food and sky accents against dark report surfaces, with cups, bowls, lunchboxes, tiffins and covered plates. Each report week selects a stable variant through the existing rotation helper. These illustrate meal windows, not a claim about foods actually eaten.

The meal summaries use full-width cards with a dedicated artwork/header row and unclipped descriptions below. Source vectors are named `mealBreakfast-1.svg` through `mealDinner-3.svg` under `app/src/assets/report-vectors`; `ReportMealIllustration.tsx` handles canonical names and legacy meal-window aliases. All 12 vectors were visually inspected. The complete 48-vector catalogue passes the uniqueness/rotation check, and all 233 app tests, lint, TypeScript and asset checks pass.

## Initial artwork record

Created with the built-in imagegen tool on 9 September 2026. These are contextual editorial illustrations, not photographs of the user's own food or equipment. No external stock assets or generic icon packs were added.

## Saved assets

- Nutrition cover: `app/src/assets/editorial/report-nutrition-editorial.jpg` — 134,360 bytes.
- Training cover: `app/src/assets/editorial/report-training-editorial.jpg` — 104,219 bytes.
- Five original SVG illustrations: `app/src/components/ReportIllustration.tsx` — nutrition plate, training journal/dumbbell, recovery, measurement tape and evidence document.

The generated covers are shared by the reports and their source article cards. Project copies were converted to JPEG at a maximum width of 960 pixels; original generated PNG files remain in the imagegen output directory. Aggregate raster budgets were increased by 250 KB to accommodate the explicitly requested artwork; the existing 220 KB individual-file limit remains unchanged.

## Final generation prompts

### Nutrition

Use case: photorealistic-natural. Asset type: contextual editorial artwork for the nutrition review and nutrition article cards in a premium Indian fitness app. Create a wide landscape still-life photographed from an elevated three-quarter angle: a small matte charcoal ceramic bowl of lentils, a separate small dish of cooked green vegetables, a few fresh vegetables, one folded roti and a subtle notebook corner. Real ordinary Indian food, composed intentionally like a thoughtful nutrition magazine feature, not an advertisement or a rigid portion prescription. Flat near-black charcoal backdrop, quiet tactile paper and ceramic textures, soft neutral daylight from the upper left. Muted natural green and earthy food colors, ivory highlights, predominantly black and charcoal surrounding space; no yellow light, no golden haze, no gradients, no glows. Objects concentrated in a visually balanced composition that works cropped as a landscape article cover. Strong recognizable forms at thumbnail size. No people, no text, no labels, no logos, no icons, no charts, no watermarks. Contemporary authentic editorial photography, detailed and restrained.

### Training

Use case: photorealistic-natural. Asset type: contextual editorial artwork for a weekly training report and training article cards in a premium fitness app. Create a wide landscape still-life about reviewing an actual training week: one black hex dumbbell set at a gentle diagonal, a folded ivory cotton training towel, the edge of a charcoal exercise mat, and an open small ivory paper training journal with a pencil, pages containing only faint unmarked rules, no words or numbers. Thoughtful magazine photography rather than a gym motivational poster. Flat near-black charcoal backdrop, soft neutral daylight from upper left, honest tactile rubber metal cotton and paper textures, crisp recognizable forms at thumbnail size. Dominant black charcoal slate and ivory palette with a tiny muted sage detail at most. No yellow light, no golden haze, no gradients, no glow. Quiet balanced composition suitable for cropping as a wide native article cover. No people, no text, no labels, no logos, no generic icons, no graphs, no watermarks. Authentic, premium, restrained.

## Meal-builder card

The meal formula uses an illustrated header and full-width ingredient rows with labels above each suggestion. Three dedicated `mealFormula` SVG compositions rotate with the report period, using natural food colours and colourful tableware. The header stacks on narrow screens and at larger text sizes; suggestions remain fully visible.

## Illustrated report sections

Fifteen new vectors provide three editions each for the week review, scorecard, insights, next-week plan and reading room. Diet and weekly reports select different editions for the same week. Section artwork is decorative, keeps labels readable and uses coordinated blue, violet, teal, green and terracotta accents on dark surfaces. Existing meal and food-group illustrations remain distinct from these new section compositions.

## Nutrition criteria artwork

The nutrition scorecard now separates the overall score from six illustrated criterion cards. Each card pairs its title and points with custom food artwork, followed by a compact progress bar, the saved diary insight and the criterion definition. Unknown scores remain unknown; the scoring rubric and report data are unchanged. Layouts stack for narrow screens and larger text, without line truncation.

The built-in imagegen tool generated **18 original scorecard illustrations**, three for each of the six criteria. Assets live in [app/src/assets/editorial/scorecard](../app/src/assets/editorial/scorecard); exact prompts, original PNG paths and final destinations are recorded in [scorecard-artwork.json](scorecard-artwork.json). Original PNGs remain outside the app bundle. The 288px JPEG thumbnails total **398,776 bytes**. They rotate by saved report period and do not share images with report covers or the article carousel.

All 18 images were visually reviewed. Component-tree layout previews were inspected at 390px and 320px with 1.6× text. These are layout approximations, not device screenshots. All **234 tests across 38 suites**, ESLint, TypeScript and asset checks passed. Aggregate asset budgets include the requested 18 additional thumbnails; the individual raster cap is unchanged.

## SVG colour direction

SVG artwork may use a broad, expressive colour palette as long as it fits the surrounding UI. The 66 report SVGs now use natural tomato reds, carrot oranges, leafy greens, grain golds, cream dairy tones, and coordinated teal, blue, violet and terracotta accents for objects and section illustrations. Light outlines maintain clarity at small sizes. Keep report card backgrounds, text, controls and score indicators on the app theme tokens; use the broader colours inside artwork. Avoid neon colours and yellow gradients.

All 66 updated SVGs were visually reviewed together on the report surface and parsed successfully. All 56 focused report and artwork tests pass.

## Dietary preferences and protein artwork

Protein illustrations follow the current profile's **Food style** (`dietPref`) for both current and saved diet reports. Explicit unrestricted non-vegetarian or omnivorous preferences may use the existing chicken, egg and fish SVGs and protein scorecard images. Vegetarian, vegan, missing, ambiguous or restricted preferences use three dedicated plant-protein SVGs: lentils, tofu with peas, and chickpeas with soybeans. The protein scorecard uses a different variant from the food-group row within the same week. No preference is inferred from old diary entries, and recorded food descriptions are unchanged.

The profile cache supplies the initial preference; it refreshes on screen focus. Unknown preferences start with plant artwork. The new SVGs are `proteinPlant-1.svg` through `proteinPlant-3.svg`. All 255 tests across 39 suites, lint, TypeScript and asset checks pass, including preference changes, unknown profiles, restricted styles and all three artwork editions.

## Compact scoring criteria

Criterion cards now use SVG score rings beside the artwork and title. Each ring represents points divided by that criterion's own maximum, with explicit points shown in its centre. Zero points render an empty track; missing scores have an unavailable label and no progress-bar semantics.

Diary insights remain fully visible. Measured criteria provide an accessible **Scoring criterion** disclosure for their full definitions; unassessed criteria show the definition immediately. Larger text scales the rings and stacks the header to preserve space. Existing rotating artwork and protein dietary-preference selection are retained.

All 258 tests across 40 suites, ESLint, TypeScript and asset checks pass. Layout previews were inspected at 390px and 320px with 1.6× text; these supplement tests and are not native device screenshots.

## Goal and training context

“Your goal” and “Training nutrition” use matching side-by-side cards with distinct rotating SVGs. Titles and body text align, and the linked-workout count sits in the training card footer. Zero counts use neutral text; unknown counts are omitted. A single available summary fills the row. Narrow screens below 340px and text scaling at 1.4× or above use stacked cards. Full report summaries remain visible. Layout previews were reviewed at 390px and 320px with 1.6× text.

## Responsive nutrition score grid

The six criterion cards use two columns when their measured container fits two 152px cards and a 12px gap. The minimum card width scales with the user's text size, switching to one column when necessary. Compact cards place artwork beside a score ring, align titles and disclosures, and show the complete diary insight. Definitions expand under **Criterion**; expansion state survives container resizing. Existing dietary preference handling and artwork rotation are preserved.

All 265 tests across 41 suites, ESLint, TypeScript and asset checks pass. Tests cover width and font-scale breakpoints, container resizing, preserved disclosure state and dietary preferences. Component-tree layout previews were reviewed at 390px, 320px and 390px with 1.6× text; these are layout approximations rather than native device screenshots.

## Illustrated diary coverage

Diary coverage pairs the day and meal counts with six original SVGs: three `coverageDays` diary/calendar compositions and three `coverageMeals` food-log compositions. They rotate by report period, bringing the vector library to 75 illustrations. Neutral inset tiles keep the counts distinct from the evidence note. Below 360px or at 1.3× text and above, the tiles become stacked rows. Missing counts remain omitted; meal occasions and food descriptions retain their separate labels. Limited evidence and data-summary provenance remain visible when applicable.

Layout previews were reviewed at 390px and 320px with 1.6× text. The six SVGs parse successfully; lint, TypeScript, asset checks and the existing test suite pass after updating the two changed copy/catalog expectations.

## Illustrated action cards

Next-week actions pair a compact artwork header with numbered steps, a separate busy-day alternative and a contrasting check-in footer. The title and all saved instructions remain fully visible. Headers stack below 370px or at 1.3× text. Action ordering, deduplication and success measures continue to use the report's existing data.

Six original built-in imagegen photographs provide three snack compositions and three water compositions. They rotate by report period and action position. Artwork is selected from the action title; unrelated actions use a rotating plan SVG. All new food photographs use fruit and pulses, with no animal foods. The 320px JPEGs total 194,227 bytes; originals and exact prompts are recorded in [action-artwork.json](action-artwork.json). Aggregate asset allowances increased by 200KB for these requested images, retaining the individual image cap.

All six assets and component-tree previews at 390px and 320px with 1.6× text were visually reviewed. These previews are layout approximations rather than device screenshots. All 265 tests across 41 suites, lint, TypeScript and asset checks pass.

## Illustrated insight cards

Insight headings now select contextual SVG artwork from the finding title. Six original `insightSnack` and `insightDrinks` vectors provide three weekly editions each, bringing the library to 81 SVGs. Plant, protein and breakfast findings use the corresponding existing illustrations with a distinct slot; protein respects the profile's dietary preference. Other findings use report-focus artwork.

The heading sits beside a compact illustration; narrow screens and larger text stack it. “Why it matters” has its own neutral inset panel. Long observations show their complete first sentence, preserving decimal figures, with the original passage and diary evidence available through the existing disclosure. No line-count truncation is applied. Observations without a sentence boundary remain intact.

All six new SVGs parse successfully. Normal and large-text component-tree previews were reviewed. The 265 existing tests, lint, TypeScript and asset checks pass, alongside two new tests for complete previews, expanded evidence and vegetarian protein artwork.
