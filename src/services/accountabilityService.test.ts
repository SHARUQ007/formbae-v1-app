import { normalizeAccountabilityBaeSummary } from './accountabilityService';

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
      status: 'inactive',
      partner: null,
      challenge: null,
    });
    expect(normalizeAccountabilityBaeSummary(null)).toBeNull();
  });

  it('never trusts a contradictory both-submitted flag', () => {
    expect(normalizeAccountabilityBaeSummary({
      status: 'matched',
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
      status: 'matched',
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
