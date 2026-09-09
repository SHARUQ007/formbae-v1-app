# Report reading room

Updated 9 September 2026. The article reader uses a safe-area provider inside its full-screen modal, as described in the [Safe Area Context modal guidance](https://appandflow.github.io/react-native-safe-area-context/api/safe-area-provider/). Its 48-point back button sits outside the WebView and loading/error content. Native Android back uses the same close action. The iPhone 16 Pro simulator confirmed that the header sits below the status bar; automated tests verify dismissal while loading and after publisher errors.

Reports retain their cited sources first, then add optional reading to provide six cards. Added cards say “Further reading”; they are not attributed to the generated report as citations or personalized advice. The order rotates by saved report week, and the existing artwork selector prevents duplicate card images or reuse of the report cover. Nutrition reports can browse nutrition reading even when their generated source list is empty.

The publisher pages below were checked when this library was added. Card copy describes each article; it does not reproduce the article or turn its general guidance into a personal prescription.

| Topic | Publisher page |
| --- | --- |
| Fibre | [NHS: How to get more fibre into your diet](https://www.nhs.uk/live-well/eat-well/digestive-health/how-to-get-more-fibre-into-your-diet/) |
| Protein | [Harvard Nutrition Source: Protein](https://nutritionsource.hsph.harvard.edu/what-should-you-eat/protein/) |
| Meal preparation | [Harvard Nutrition Source: Meal Prep Guide](https://nutritionsource.hsph.harvard.edu/meal-prep/) |
| Hydration | [NHS: Water, drinks and hydration](https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/water-drinks-nutrition/) |
| Food labels | [NHS: Food labels](https://www.nhs.uk/live-well/eat-well/food-guidelines-and-food-labels/how-to-read-food-labels/) |
| Meal balance | [Harvard Nutrition Source: Healthy Eating Plate](https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/) |
| Activity | [CDC: Adult Activity](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html) |
| Gentle strength | [NHS: Strength exercises](https://www.nhs.uk/live-well/exercise/strength-exercises/) |
| Flexibility | [NHS: Flexibility exercises](https://www.nhs.uk/live-well/exercise/flexibility-exercises/) |
| Sleep | [CDC: About Sleep](https://www.cdc.gov/sleep/about/index.html) |

Implementation: `app/src/components/ReportArticleReader.tsx`, `ReportSourceArticles.tsx` and `app/src/utils/reportReading.ts`. Full app validation passed 233 tests in 38 suites, lint, TypeScript and asset budgets. The final heading change passed all 33 affected tests and targeted lint. Native visual checks used a separate preview server; the shared development entry was not replaced, and the temporary preview was removed afterward.
