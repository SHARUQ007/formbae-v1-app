import { getBodyProfileArtwork, getPlanProfileArtwork } from './profileArtwork';

function assetPath(source: unknown) {
  return String((source as { testUri?: string })?.testUri || '');
}

describe('gender-aware profile artwork', () => {
  it.each([
    ['male', 'profile-overview-male.jpg'],
    ['female', 'profile-overview-female.jpg'],
    ['non-binary', 'profile-overview-neutral.jpg'],
    ['', 'profile-overview-neutral.jpg'],
  ])('selects the correct body profile artwork for %s', (gender, filename) => {
    expect(assetPath(getBodyProfileArtwork(gender))).toContain(filename);
  });

  it.each([
    ['male', 'progress-report-hero-male.jpg'],
    ['female', 'progress-report-hero.jpg'],
    ['other', 'progress-report-hero-neutral.jpg'],
  ])('selects the correct plan artwork for %s', (gender, filename) => {
    expect(assetPath(getPlanProfileArtwork(gender))).toContain(filename);
  });
});
