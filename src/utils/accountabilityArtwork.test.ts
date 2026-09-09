import {
  canCreateAccountabilityCommitment,
  getAccountabilityTaskArtwork,
  getAccountabilityTaskLabel,
  accountabilityArtworkFrame,
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

  it('fits the shorter card without enlarging artwork on a 3x display', () => {
    const frame = accountabilityArtworkFrame({ width: 298, height: 212 }, { width: 1200, height: 667 }, 3)!;
    expect(frame.width * 3).toBeLessThanOrEqual(1200);
    expect(frame.height * 3).toBeLessThanOrEqual(667);
    expect(frame.height).toBeCloseTo(212, 0);
    expect(frame.left).toBeLessThan(0);
    expect(frame.left + frame.width).toBeGreaterThanOrEqual(298);
  });

  it('caps enlargement for taller accessible layouts and respects asset scale metadata', () => {
    const frame = accountabilityArtworkFrame({ width: 300, height: 350 }, { width: 1200, height: 667 }, 3)!;
    expect(frame.width).toBe(400);
    expect(frame.height * 3).toBeLessThanOrEqual(667);
    const scaled = accountabilityArtworkFrame({ width: 300, height: 350 }, { width: 400, height: 667 / 3, scale: 3 }, 3)!;
    expect(scaled).toEqual(frame);
    expect(accountabilityArtworkFrame({ width: 0, height: 0 }, { width: 1200, height: 667 }, 3)).toBeUndefined();
  });
});
