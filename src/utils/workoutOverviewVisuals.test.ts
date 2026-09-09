import { workoutOverviewVisuals } from './workoutOverviewVisuals';

it('keeps the artwork stable on repeat visits and cycles through six covers on six days', () => {
  const editions = Array.from({ length: 6 }, (_, day) => workoutOverviewVisuals('day-one', 'standard', `2026-09-${10 + day}`, 'Full body strength'));
  expect(new Set(editions.map(edition => edition.artworkId)).size).toBe(6);
  expect(workoutOverviewVisuals('day-one', 'standard', '2026-09-10', 'Full body strength')).toEqual(editions[0]);
  expect(new Set(editions.map(edition => edition.variant))).toEqual(new Set([0, 1, 2]));
});

it('uses the recovery selection for mobility days', () => {
  const ids = Array.from({ length: 3 }, (_, day) => workoutOverviewVisuals('mobility', 'standard', `2026-09-${10 + day}`, 'Recovery and mobility').artworkId);
  expect(new Set(ids)).toEqual(new Set(['training-article-2', 'weekly-cover-3', 'weekly-cover-2']));
});
