import {
  canCreateAccountabilityCommitment,
  getAccountabilityTaskArtwork,
  getAccountabilityTaskLabel,
} from './accountabilityArtwork';

function assetPath(source: unknown) {
  return String((source as { testUri?: string })?.testUri || '');
}

describe('accountability task presentation', () => {
  it.each([
    ['diet', 'accountability-food-memory.jpg'],
    ['workout', 'accountability-workout-card.jpg'],
    ['refresh', 'accountability-plan.jpg'],
    ['progress', 'accountability-progress.jpg'],
  ])('selects purpose-built artwork for %s', (kind, filename) => {
    expect(assetPath(getAccountabilityTaskArtwork(kind))).toContain(filename);
  });

  it('uses the progress artwork and label as a safe fallback', () => {
    expect(assetPath(getAccountabilityTaskArtwork('future-task'))).toContain('accountability-progress.jpg');
    expect(getAccountabilityTaskLabel('future-task')).toBe('WEEKLY REVIEW');
  });

  it('labels active items consistently', () => {
    expect(getAccountabilityTaskLabel('diet')).toBe('FOOD MEMORY');
  });

  it('only creates persistent commitments for completable task kinds', () => {
    expect(canCreateAccountabilityCommitment('diet')).toBe(true);
    expect(canCreateAccountabilityCommitment('workout')).toBe(true);
    expect(canCreateAccountabilityCommitment('refresh')).toBe(false);
    expect(canCreateAccountabilityCommitment('progress')).toBe(false);
  });
});
