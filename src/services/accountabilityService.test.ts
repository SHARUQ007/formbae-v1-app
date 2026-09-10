import { normalizeAccountabilityBaeSummary } from './accountabilityService';
const access = { unlocked: true, override: 'default', trophyScore: 50, trophyThreshold: 50 };

describe('Partner accountability response normalization', () => {
  it('turns a partial locked payload into finite, render-safe progress', () => {
    expect(normalizeAccountabilityBaeSummary({
      status: 'locked',
      access: {
        trophyScore: Number.NaN,
        trophyThreshold: 0,
        trophiesRemaining: Number.POSITIVE_INFINITY,
      },
    })).toMatchObject({
      status: 'locked',
      preference: '',
      inviteCode: '',
      access: {
        unlocked: false,
        trophyScore: 0,
        trophyThreshold: 50,
        trophiesRemaining: 50,
      },
    });
  });

  it('falls back safely when a cached payload has an unknown status', () => {
    expect(normalizeAccountabilityBaeSummary({ status: 'future-state' })).toMatchObject({
      status: 'locked',
      partner: null,
      challenge: null,
    });
    expect(normalizeAccountabilityBaeSummary(null)).toBeNull();
  });

  it('never trusts a contradictory both-submitted flag', () => {
    expect(normalizeAccountabilityBaeSummary({
      status: 'matched', access,
      bothSubmitted: true,
      youSubmitted: true,
      partnerSubmitted: false,
      partnerProofUrl: ' /proof/partner ',
    })).toMatchObject({
      status: 'matched',
      youSubmitted: true,
      partnerSubmitted: false,
      bothSubmitted: false,
      partnerProofUrl: undefined,
    });
  });

  it('fills optional challenge fields without inventing a challenge', () => {
    expect(normalizeAccountabilityBaeSummary({
      status: 'matched', access,
      partner: { displayName: ' Priya K. ' },
      challenge: { title: ' Take a walk ' },
    })).toMatchObject({
      partner: { userId: '', displayName: 'Priya K.' },
      challenge: {
        id: '',
        title: 'Take a walk',
        prompt: '',
        icon: 'walk',
        date: '',
        dueLabel: 'Today',
      },
    });
  });
});

it('keeps both current photos hidden until the server explicitly reveals them', () => {
  const value = { status: 'matched', access, youSubmitted: true, partnerSubmitted: true, bothSubmitted: true, yourProofUrl: '/mine', partnerProofUrl: '/theirs' };
  expect(normalizeAccountabilityBaeSummary(value)).toMatchObject({ photosRevealed: false, yourProofUrl: undefined, partnerProofUrl: undefined });
  expect(normalizeAccountabilityBaeSummary({ ...value, photosRevealed: true })).toMatchObject({ photosRevealed: true, yourProofUrl: '/mine', partnerProofUrl: '/theirs' });
});

it('past days cannot leak a one-sided photo from a malformed payload', () => {
  const result = normalizeAccountabilityBaeSummary({ status: 'matched', access, history: [null, { date: '2026-09-09', youSubmitted: true, partnerSubmitted: false, photosRevealed: true, yourProofUrl: '/private', partnerProofUrl: '/private-other' }] });
  expect(result?.history).toHaveLength(1);
  expect(result?.history?.[0]).toMatchObject({ photosRevealed: false, yourProofUrl: undefined, partnerProofUrl: undefined });
});


it('fails closed for missing, below-threshold and contradictory access', () => {
  for (const blocked of [undefined, { ...access, trophyScore: 49 }, { ...access, trophyThreshold: 75 }, { ...access, override: 'locked' }, { ...access, unlocked: false }]) {
    expect(normalizeAccountabilityBaeSummary({ status: 'matched', access: blocked, partner: { displayName: 'Hidden' }, challenge: { title: 'Hidden task' }, inviteCode: 'SECRET' })).toMatchObject({ status: 'locked', partner: null, challenge: null, inviteCode: '', photosRevealed: false });
  }
});

it('allows exact-threshold access and explicit admin exceptions', () => {
  expect(normalizeAccountabilityBaeSummary({ status: 'inactive', access: { ...access, trophyScore: 75, trophyThreshold: 75 } })?.status).toBe('inactive');
  expect(normalizeAccountabilityBaeSummary({ status: 'inactive', access: { ...access, trophyScore: 1, trophyThreshold: 75, override: 'unlocked' } })?.status).toBe('inactive');
  expect(normalizeAccountabilityBaeSummary({ status: 'locked', access: { ...access, override: 'unlocked' } })?.status).toBe('locked');
});
