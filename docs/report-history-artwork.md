# Report history artwork and layout

Generated with the built-in image-generation tool. The reusable production asset is [nutrition-journal.jpg](../app/src/assets/editorial/history/nutrition-journal.jpg), optimized to 960 × 480 JPEG for the native archive header and empty archive. The full-resolution original remains in the generator's output directory.

Final generation prompt:

> Create a polished editorial still-life illustration for the report-history screen of FormBae, a premium dark fitness and nutrition mobile app. Wide landscape composition, about 2:1 aspect ratio. A small stack of three charcoal linen nutrition journals with blank ivory page edges and a discreet warm gold ribbon bookmark, an open cream blank notebook with absolutely no writing, and a small matte black bowl of chickpeas with a few tomatoes, cucumber slices, an orange wedge and herb leaves, arranged together in a sophisticated quiet composition across the center. Entirely plant-based ingredients, no eggs, meat or dairy. Photorealistic studio still life with soft directional light, tactile paper and ceramic, rich natural food colors. Seamless near-black background #05060a with generous negative space around the objects. The objects must be legible as a thumbnail, no tiny decorations. Restrained luxury editorial aesthetic matching black and charcoal UI with white typography and pale gold accents. No text, no letters, no numbers, no logo, no UI, no charts, no yellow gradient. The artwork represents a personal collection of nutrition reports over time. Produce a standalone reusable artwork asset, not a screenshot or mockup.

The report cards reuse ten existing plant-based food photographs, with no duplicated photo within that pool. Additional archive entries and failed image loads receive existing SVG illustrations. The layout uses the current charcoal, white and gold palette, wraps text without line clamps, and stacks at narrow widths or larger accessibility text sizes.

Reports sort by saved time and open their original record. Score differences use the existing comparison utility, including unavailable scores, zero changes, scoring-method compatibility and same-period revision labels. The current report's design and backend generation remain unchanged.

Validation: full app check, including asset budgets, lint, TypeScript and 299 tests; visual inspection of component-tree previews at 390 px and 320 px with 1.4× text. These previews approximate React Native layout in a browser; they are not device screenshots.
