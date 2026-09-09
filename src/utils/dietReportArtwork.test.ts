import { dietTopicIllustration } from './dietReportArtwork';
import { REPORT_ILLUSTRATIONS } from './reportIllustrationCatalog';
import { reportVariant } from './reportVisuals';

it.each([
  ['Choose water', 'insightDrinks'], ['Swap biscuits', 'insightSnack'], ['Add vegetables', 'vegetables'],
  ['Choose plant protein', 'protein'], ['Prepare breakfast', 'mealBreakfast'], ['Prepare lunch', 'mealLunch'],
  ['Build dinner', 'mealDinner'], ['Plan your evening', 'mealEvening'], ['Choose fruit', 'fruit'],
  ['Explore grains', 'wholeGrains'], ['Try curd', 'dairy'], ['Add nuts', 'nutsSeeds'],
  ['Prepare a balanced plate', 'mealFormula'], ['Describe your meals', 'coverageMeals'],
  ['An unfamiliar topic', 'reportFocus'], ['__proto__', 'reportFocus'],
])('provides contextual local artwork for %s', (title, kind) => {
  expect(dietTopicIllustration(title)).toBe(kind);
});

it('has three distinct valid SVGs for every role and rotates across three reports', () => {
  const weeks = ['2026-09-02', '2026-09-09', '2026-09-16'];
  for (const variants of Object.values(REPORT_ILLUSTRATIONS)) {
    expect(variants).toHaveLength(3);
    expect(new Set(variants).size).toBe(3);
    for (const svg of variants) {
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).not.toMatch(/<script|https?:\/\/(?!www\.w3\.org)/i);
    }
    expect(new Set(weeks.map(week => variants[reportVariant(week)])).size).toBe(3);
    expect(reportVariant(weeks[0])).toBe(reportVariant(weeks[0]));
  }
});
