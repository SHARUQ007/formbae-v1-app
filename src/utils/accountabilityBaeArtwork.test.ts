import { getAccountabilityBaeArtwork, getAccountabilityBaeModeCaption } from './accountabilityBaeArtwork';

function assetPath(source: unknown) {
  return String((source as { testUri?: string })?.testUri || '');
}

describe('Accountability Bae presentation', () => {
  it.each(['locked', 'inactive', 'waiting', undefined] as const)('uses discovery artwork before a match for %s', (status) => {
    expect(assetPath(getAccountabilityBaeArtwork(status))).toContain('accountability-bae-discovery.jpg');
  });

  it('uses connected artwork after a match', () => {
    expect(assetPath(getAccountabilityBaeArtwork('matched'))).toContain('accountability-bae-connected.jpg');
  });

  it.each([
    ['locked', 'Locked'],
    ['inactive', 'Work out together'],
    ['waiting', 'Matching'],
    ['matched', 'Connected'],
    [undefined, 'Work out together'],
  ] as const)('provides concise navigation copy for %s', (status, caption) => {
    expect(getAccountabilityBaeModeCaption(status)).toBe(caption);
  });
});
