import { getCoachArtworkSource } from './coachArtwork';

describe('getCoachArtworkSource', () => {
  it('uses the bundled gold artwork for Ava even when the legacy green URL is returned', () => {
    expect(getCoachArtworkSource({ name: 'Ava', photoUrl: '/ai-questionnaire/goal-baseline.webp' })).toEqual(
      expect.objectContaining({ testUri: expect.stringContaining('ava-coach-gold.jpg') }),
    );
  });

  it('preserves remote photos for personal trainers', () => {
    expect(getCoachArtworkSource({ name: 'Amal', photoUrl: 'https://example.com/amal.jpg' })).toEqual({
      uri: 'https://example.com/amal.jpg',
    });
  });
});
