import { getBodyProfileArtwork, getGymProfileArtwork, getPlanProfileArtwork } from './profileArtwork';

function assetPath(source: unknown) {
  return String((source as { testUri?: string })?.testUri || '');
}

describe('gender-aware profile artwork', () => {
  it.each([
    ['male', 'profile-body-v2-male.jpg'],
    ['female', 'profile-body-v2-female.jpg'],
    ['non-binary', 'profile-body-v2-neutral.jpg'],
    ['', 'profile-body-v2-neutral.jpg'],
  ])('selects the correct body profile artwork for %s', (gender, filename) => {
    expect(assetPath(getBodyProfileArtwork(gender))).toContain(filename);
  });

  it.each([
    ['male', 'profile-plan-v2-male.jpg'],
    ['female', 'profile-plan-v2-female.jpg'],
    ['other', 'profile-plan-v2-neutral.jpg'],
  ])('selects the correct plan artwork for %s', (gender, filename) => {
    expect(assetPath(getPlanProfileArtwork(gender))).toContain(filename);
  });

  it.each([
    ['male', 'profile-gym-male.jpg'],
    ['female', 'profile-gym-female.jpg'],
    ['other', 'profile-gym-neutral.jpg'],
  ])('selects the correct gym artwork for %s', (gender, filename) => {
    expect(assetPath(getGymProfileArtwork(gender))).toContain(filename);
  });
});
