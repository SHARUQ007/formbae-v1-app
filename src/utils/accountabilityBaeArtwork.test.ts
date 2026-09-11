import { getAccountabilityBaeArtwork, getAccountabilityBaeModeCaption, getPartnerState } from './accountabilityBaeArtwork';

function assetPath(source: unknown) {
  return String((source as { testUri?: string })?.testUri || '');
}

describe('Accountability Bae presentation', () => {
  it.each(['locked', 'inactive', 'waiting', undefined] as const)('uses discovery artwork before a match for %s', (status) => {
    expect(assetPath(getAccountabilityBaeArtwork(status))).toContain('accountability-bae-discovery-square.jpg');
  });

  it('uses connected artwork after a match', () => {
    expect(assetPath(getAccountabilityBaeArtwork('matched'))).toContain('accountability-bae-connected.jpg');
  });

  it.each([
    ['locked', 'Locked'],
    ['inactive', 'Train together'],
    ['waiting', 'Matching'],
    ['matched', 'Connected'],
    [undefined, 'Loading'],
  ] as const)('provides concise navigation copy for %s', (status, caption) => {
    expect(getAccountabilityBaeModeCaption(status)).toBe(caption);
  });
});

it('distinguishes friend invitations from an automatic search', () => {
  expect(getAccountabilityBaeModeCaption('waiting', 'friend')).toBe('Invite a friend');
  expect(getAccountabilityBaeModeCaption('waiting', 'female')).toBe('Matching');
  expect(getAccountabilityBaeModeCaption('matched', 'friend')).toBe('Connected');
  expect(getAccountabilityBaeModeCaption('inactive', 'friend')).toBe('Train together');
});

it('treats invite setup separately from automatic matching', () => {
  expect(getPartnerState('waiting', 'friend')).toBe('invite');
  expect(getPartnerState('waiting', 'male')).toBe('matching');
  expect(getPartnerState('waiting', 'female')).toBe('matching');
  expect(getPartnerState('matched', 'friend')).toBe('matched');
});
