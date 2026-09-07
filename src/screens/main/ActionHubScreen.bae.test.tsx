import React from 'react';
import { Image } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { AccountabilityBaeSummary } from '../../types/api';
import { AccountabilityBaeCard, AccountabilityModeSwitch } from './ActionHubScreen';
import { getAccountabilityTaskArtwork } from '../../utils/accountabilityArtwork';

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
  it('uses artwork navigation with concise, accurate query states', async () => {
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
          todayArtwork={getAccountabilityTaskArtwork('workout')}
          onChange={onChange}
        />,
      );
    });
    expect(copy(renderer)).toContain('Unavailable');
    const modeArtwork = renderer.root.findAllByType(Image);
    expect(modeArtwork).toHaveLength(2);
    expect(modeArtwork.every((image) => image.props.resizeMode === 'contain')).toBe(true);
    renderer.root.findByProps({ accessibilityLabel: 'My day. Your focus' }).props.onPress();
    expect(onChange).toHaveBeenCalledWith('today');
  });

  it('keeps partner selection compact and discloses reciprocal privacy before matching', async () => {
    const onStart = jest.fn();
    const renderer = await renderCard({ status: 'inactive', preference: '', inviteCode: '' }, { onStart });
    const text = copy(renderer);
    expect(text).toContain('Better together');
    expect(text).toContain('photos unlock together');
    expect(text).toContain('no face required');
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
});
