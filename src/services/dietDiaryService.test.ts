import { getBackendApiBaseUrl } from '../constants/config';
import {
  resolveDietDiaryImageUrl,
  shouldAuthenticateDietDiaryImage,
} from './dietDiaryService';

describe('diet diary image URLs', () => {
  it('only authenticates images served by the configured backend', () => {
    const backend = getBackendApiBaseUrl();

    expect(shouldAuthenticateDietDiaryImage(`${backend}/api/mobile/diet/image.jpg`)).toBe(true);
    expect(shouldAuthenticateDietDiaryImage(`${backend}.example.com/image.jpg`)).toBe(false);
    expect(shouldAuthenticateDietDiaryImage('https://images.example.com/meal.jpg')).toBe(false);
  });

  it('resolves server paths but preserves valid local and remote image URLs', () => {
    expect(resolveDietDiaryImageUrl('/diet/image.jpg')).toBe(
      `${getBackendApiBaseUrl()}/api/mobile/diet/image.jpg`,
    );
    expect(resolveDietDiaryImageUrl('file:///tmp/meal.jpg')).toBe('file:///tmp/meal.jpg');
    expect(resolveDietDiaryImageUrl('https://images.example.com/meal.jpg')).toBe(
      'https://images.example.com/meal.jpg',
    );
  });
});
