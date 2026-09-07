import React from 'react';
import { Image, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { AccountabilityBaeSummary } from '../../types/api';
import { AccountabilityBaeCard, AccountabilityModeSwitch } from './ActionHubScreen';

const noop = () => undefined;

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
        onLeave={noop}
        onRetry={noop}
        onViewTrophies={noop}
        {...overrides}
      />,
    );
  });
  return renderer;
}

const matchedBase: AccountabilityBaeSummary = {
  status: 'matched',
  preference: 'female',
  inviteCode: '',
  partner: { userId: 'partner-1', displayName: 'Priya K.' },
  challenge: { id: 'challenge-1', title: 'Take a short walk', prompt: 'Move for ten minutes.', icon: 'walk', date: '2026-09-06', dueLabel: 'Today' },
};

describe('Accountability Bae UI states', () => {
  it('uses lightweight icon navigation with concise, accurate query states', async () => {
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
    expect(renderer.root.findAll(node => node.props.name === 'sun')).toHaveLength(1);
    expect(renderer.root.findAll(node => node.props.name === 'users')).toHaveLength(1);
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
    const renderer = await renderCard({ status: 'inactive', preference: '', inviteCode: '' }, { onStart });
    const text = copy(renderer);
    expect(text).toContain('Better together');
    expect(text).toContain('Only your first name and initial are shown.');
    expect(text).toContain('Photos unlock after you both check in');
    expect(text).toContain('showing your face is optional');
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
    expect(text).toContain('Check in with a photo');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Priya K., locked until both people check in' })).toBeTruthy();
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
    expect(text).not.toContain('Check in with a photo');
    const sources = renderer.root.findAllByType(Image).map((node) => JSON.stringify(node.props.source));
    expect(sources.some((source) => source.includes('/accountability/bae/proof/partner'))).toBe(true);
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
      status: 'waiting',
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
    expect(text).toContain('Waiting for Priya K.');
    const sources = renderer.root.findAllByType(Image).map((node) => JSON.stringify(node.props.source));
    expect(sources.some((source) => source.includes('/accountability/bae/proof/partner'))).toBe(false);
  });
});
