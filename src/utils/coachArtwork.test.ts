import { getCoachArtworkSource } from './coachArtwork';
import { setAuthToken } from '../services/apiClient';

describe('getCoachArtworkSource', () => {
  afterEach(() => setAuthToken(null));

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

  it('supports existing embedded trainer photos while the backend migrates to URLs', () => {
    const photoUrl = 'data:image/jpeg;base64,cGhvdG8=';
    expect(getCoachArtworkSource({ name: 'Amal', photoUrl })).toEqual({ uri: photoUrl });
  });

  it('resolves optimized mobile trainer photo paths against the backend', () => {
    expect(getCoachArtworkSource({ name: 'Amal', photoUrl: '/api/mobile/trainer/amal/photo?v=1' })).toEqual({
      uri: 'http://127.0.0.1:8000/api/mobile/trainer/amal/photo?v=1',
    });
  });

  it('authenticates same-backend trainer photos', () => {
    setAuthToken('coach-photo-token');
    expect(getCoachArtworkSource({
      name: 'Amal',
      photoUrl: '/api/mobile/trainer/amal/photo?v=1',
    })).toEqual({
      uri: 'http://127.0.0.1:8000/api/mobile/trainer/amal/photo?v=1',
      headers: { Authorization: 'Bearer coach-photo-token' },
    });
  });

  it('rejects unsupported image URI schemes', () => {
    expect(getCoachArtworkSource({ name: 'Coach', photoUrl: 'ftp://example.com/photo.jpg' })).toBeNull();
  });
});
