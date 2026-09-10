import React from 'react';
import { Alert, Image, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { AccountabilityBaeSummary } from '../../types/api';
import { AccountabilityBaeCard, AccountabilityModeSwitch } from './ActionHubScreen';

const noop = () => undefined;
const unlockedAccess = { unlocked: true, override: 'default' as const, trophyScore: 50, trophyThreshold: 50, trophiesRemaining: 0 };

function copy(renderer: ReactTestRenderer.ReactTestRenderer) {
  return JSON.stringify(renderer.toJSON());
}

async function renderCard(data: AccountabilityBaeSummary | null, overrides: Partial<React.ComponentProps<typeof AccountabilityBaeCard>> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <AccountabilityBaeCard
        data={data}
        loading={false}
        compact={false}
        busy={false}
        friendCode=""
        onFriendCodeChange={noop}
        onStart={noop}
        onJoinFriend={noop}
        onShareFriendCode={noop}
        onSubmitProof={noop}
        onRetry={noop}
        onViewTrophies={noop}
        {...overrides}
      />,
    );
  });
  return renderer;
}

const matchedBase: AccountabilityBaeSummary = {
  status: 'matched', access: unlockedAccess,
  preference: 'female',
  inviteCode: '',
  partner: { userId: 'partner-1', displayName: 'Priya K.' },
  challenge: { id: 'challenge-1', title: 'Take a short walk', prompt: 'Move for ten minutes.', icon: 'walk', date: '2026-09-06', dueLabel: 'Today' },
};

describe('Accountability Bae UI states', () => {
  it('keeps view selection and unavailable partner status accessible', async () => {
    const onChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <AccountabilityModeSwitch
          activeView="bae"
          partnerStatus={undefined}
          partnerLoading={false}
          partnerUnavailable
          compact={false}
          onChange={onChange}
        />,
      );
    });
    expect(copy(renderer)).toContain('Unavailable');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Partner. Unavailable', accessibilityRole: 'tab' }).props.accessibilityState).toEqual({ selected: true });
    expect(renderer.root.findByProps({ accessibilityLabel: 'My day. Your focus', accessibilityRole: 'tab' }).props.accessibilityState).toEqual({ selected: false });
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    const partnerCaption = renderer.root
      .findAllByType(Text)
      .find(node => node.props.children === 'Unavailable');
    expect(partnerCaption?.props.numberOfLines).toBe(2);
    renderer.root.findByProps({ accessibilityLabel: 'My day. Your focus' }).props.onPress();
    expect(onChange).toHaveBeenCalledWith('today');
  });

  it('keeps partner selection compact and discloses reciprocal privacy before matching', async () => {
    const onStart = jest.fn();
    const renderer = await renderCard({ status: 'inactive', access: unlockedAccess, preference: '', inviteCode: '' }, { onStart });
    const text = copy(renderer);
    expect(text).toContain('Better together');
    expect(text).toContain('Only your first name and initial are shown.');
    expect(text).toContain('Photos unlock after midnight');
    expect(text).toContain('Showing your face is optional');
    renderer.root.findByProps({ accessibilityLabel: 'Female. Auto-match' }).props.onPress();
    expect(onStart).toHaveBeenCalledWith('female');
  });

  it('never renders a one-sided partner proof and keeps the user check-in available', async () => {
    const renderer = await renderCard({
      ...matchedBase,
      youSubmitted: false,
      partnerSubmitted: true,
      bothSubmitted: false,
      partnerProofUrl: '/accountability/bae/proof/partner',
    });
    const text = copy(renderer);
    expect(text).toContain('Priya K. checked in');
    expect(text).toContain('Complete with a photo');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Priya K., locked until after midnight and both people check in' })).toBeTruthy();
    const sources = renderer.root.findAllByType(Image).map((node) => JSON.stringify(node.props.source));
    expect(sources.some((source) => source.includes('/accountability/bae/proof/partner'))).toBe(false);
  });

  it('shows the completed state only after both people submit', async () => {
    const renderer = await renderCard({
      ...matchedBase,
      youSubmitted: true,
      partnerSubmitted: true,
      bothSubmitted: true,
      yourProofUrl: '/accountability/bae/proof/me',
      partnerProofUrl: '/accountability/bae/proof/partner',
    });
    const text = copy(renderer);
    expect(text).toContain('You both showed up');
    expect(text).not.toContain('Complete with a photo');
    const sources = renderer.root.findAllByType(Image).map((node) => JSON.stringify(node.props.source));
    expect(sources.some((source) => source.includes('/accountability/bae/proof/partner'))).toBe(false);
    expect(text).toContain('after midnight');
  });

  it('renders a safe locked state for partial or invalid access data', async () => {
    const renderer = await renderCard({
      status: 'locked',
      preference: '',
      inviteCode: '',
      access: {
        unlocked: false,
        override: 'default',
        trophyScore: Number.NaN,
        trophyThreshold: 0,
        trophiesRemaining: Number.POSITIVE_INFINITY,
      },
    });
    const text = copy(renderer);
    expect(text).toContain('50 more trophies');
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
  });

  it('does not expose an invite action until the friend code is ready', async () => {
    const renderer = await renderCard({
      status: 'waiting', access: unlockedAccess,
      preference: 'friend',
      inviteCode: '',
    });
    expect(copy(renderer)).toContain('Preparing…');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Invite' }).props.accessibilityState.disabled).toBe(true);
  });

  it('rejects contradictory completion flags from stale cached payloads', async () => {
    const renderer = await renderCard({
      ...matchedBase,
      youSubmitted: true,
      partnerSubmitted: false,
      bothSubmitted: true,
      yourProofUrl: '/accountability/bae/proof/me',
      partnerProofUrl: '/accountability/bae/proof/partner',
    });
    const text = copy(renderer);
    expect(text).not.toContain('You both showed up');
    expect(text).toContain('Priya K. has until midnight to check in.');
    const sources = renderer.root.findAllByType(Image).map((node) => JSON.stringify(node.props.source));
    expect(sources.some((source) => source.includes('/accountability/bae/proof/partner'))).toBe(false);
  });
});

it('shows revealed past-day photos while today remains locked', async () => {
  const renderer = await renderCard({ ...matchedBase, youSubmitted: true, partnerSubmitted: true, bothSubmitted: true,
    history: [{ date: '2026-09-05', state: 'revealed', revealAt: '2026-09-06T00:00:00+05:30', timezone: 'Asia/Kolkata', challenge: { id: 'past', title: 'A quiet break', prompt: '' }, youSubmitted: true, partnerSubmitted: true, photosRevealed: true, yourProofUrl: '/accountability/bae/proof/me/2026-09-05', partnerProofUrl: '/accountability/bae/proof/partner/2026-09-05' }] });
  expect(copy(renderer)).toContain('Past days');
  expect(copy(renderer)).toContain('A quiet break');
  const sources = renderer.root.findAllByType(Image).map(node => JSON.stringify(node.props.source));
  expect(sources.some(source => source.includes('/partner/2026-09-05'))).toBe(true);
});

it('keeps both trophy counts and partnership visible when no challenge is open', async () => {
  const renderer = await renderCard({ ...matchedBase, challenge: null,
    partner: { userId: 'partner-1', displayName: 'Priya K.', trophyCount: 87 },
    access: { unlocked: true, override: 'default', trophyScore: 132, trophyThreshold: 50, trophiesRemaining: 0 } });
  const text = copy(renderer);
  expect(text).toContain('No open challenges');
  expect(text).toContain('Priya K.');
  expect(text).toContain('132');
  expect(text).toContain('87');
  expect(text).not.toContain('Complete with a photo');
  expect(text).not.toContain('Today’s proof');
});

it('keeps a friend invite prominent while automatic matching is active without simulated progress', async () => {
  const onStart = jest.fn();
  const renderer = await renderCard({ status: 'waiting', access: unlockedAccess, preference: 'female', inviteCode: '' }, { onStart });
  expect(copy(renderer)).toContain('Preference saved');
  expect(copy(renderer)).toContain('Finding your fit');
  expect(copy(renderer)).toContain('Meet your partner');
  expect(copy(renderer)).not.toContain('MATCHING NOW');
  renderer.root.findByProps({ title: 'Invite a friend instead' }).props.onPress();
  expect(onStart).toHaveBeenCalledWith('friend');
});

it('opens partner details and keeps the friend alternative available after a match', async () => {
  const onViewPartner = jest.fn();
  const renderer = await renderCard(matchedBase, { onViewPartner });
  renderer.root.findByProps({ accessibilityLabel: 'View partner details' }).props.onPress();
  expect(onViewPartner).toHaveBeenCalledTimes(1);
  expect(copy(renderer)).toContain('Invite a friend instead');
});


it('honours an admin threshold and hides all matching actions while locked', async () => {
  const renderer = await renderCard({ ...matchedBase, access: { ...unlockedAccess, unlocked: false, trophyScore: 74, trophyThreshold: 75, trophiesRemaining: 1 } });
  const text = copy(renderer);
  expect(text).toContain('Unlock at 75 trophies');
  expect(text).toContain('1 more trophy');
  expect(text).not.toContain('Invite a friend instead');
  expect(text).not.toContain('Complete with a photo');
  expect(text).not.toContain('Priya');
  expect(renderer.root.findByProps({ accessibilityLabel: 'Partner mode unlock progress' }).props.accessibilityValue.now).toBe(74);
});


it.each(['female', 'friend'] as const)('opens preferences without cancelling the current %s connection', async preference => {
  const onStart = jest.fn();
  const alert = jest.spyOn(Alert, 'alert');
  const renderer = await renderCard({ status: 'waiting', access: unlockedAccess, preference, inviteCode: 'FRIEND123' }, { onStart });
  await ReactTestRenderer.act(() => {
    if (preference === 'friend') renderer.root.findByProps({ title: 'Back to match options' }).props.onPress();
    else renderer.root.findByProps({ accessibilityLabel: 'Change match preference' }).props.onPress();
  });
  expect(copy(renderer)).toContain('Choose your connection');
  expect(copy(renderer)).toContain(preference === 'friend' ? 'Your current invite stays ready' : 'Your current auto-match stays active');
  expect(onStart).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  await ReactTestRenderer.act(() => renderer.root.findByProps({ title: preference === 'friend' ? 'Back to your invite' : 'Back to current match' }).props.onPress());
  expect(copy(renderer)).toContain(preference === 'friend' ? 'FRIEND123' : 'Finding your fit');
  expect(copy(renderer)).not.toContain('Choose your connection');
  expect(onStart).not.toHaveBeenCalled();
  alert.mockRestore();
});
