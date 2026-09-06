import {
  getDietReportEmptyArtwork,
  getProgressReportArtwork,
} from './reportArtwork';

function assetPath(source: unknown) {
  return String((source as { testUri?: string })?.testUri || '');
}

describe('gender-aware report artwork', () => {
  it.each([
    ['male', 'progress-report-hero-male.jpg'],
    ['female', 'progress-report-hero.jpg'],
    ['other', 'progress-report-hero-neutral.jpg'],
    ['', 'progress-report-hero-neutral.jpg'],
  ])('selects the correct progress artwork for %s', (gender, filename) => {
    expect(assetPath(getProgressReportArtwork(gender))).toContain(filename);
  });

  it.each([
    ['male', 'diet-report-empty-hero-male.jpg'],
    ['female', 'diet-report-empty-hero.jpg'],
    ['other', 'diet-report-empty-hero-neutral.jpg'],
    ['non-binary', 'diet-report-empty-hero-neutral.jpg'],
  ])('selects the correct diet artwork for %s', (gender, filename) => {
    expect(assetPath(getDietReportEmptyArtwork(gender))).toContain(filename);
  });
});
