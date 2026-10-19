import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { PaymentFlowOverlay, usePaymentFlow } from './PaymentFlow';
import type { PaymentAttempt, PaymentFlow } from './PaymentFlow';
import { StorePurchaseError } from '../services/storePurchaseService';

jest.mock('./MotionAnimation', () => ({ MotionAnimation: () => null }));

/** Renders the overlay and hands the live flow back, so a test can drive it. */
function Harness({
  onReady,
  recheck,
}: {
  onReady: (flow: PaymentFlow) => void;
  recheck?: () => Promise<{ active: boolean }>;
}) {
  const flow = usePaymentFlow({ gateway: 'store', recheck, onConfirmed: () => undefined });
  onReady(flow);
  return <PaymentFlowOverlay flow={flow} planName="Monthly" />;
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType('Text' as never)
    .flatMap((node) => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
    .filter((child): child is string => typeof child === 'string');
}

describe('PaymentFlow', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  let flow: PaymentFlow;

  function render(recheck?: () => Promise<{ active: boolean }>) {
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Harness onReady={(live) => { flow = live; }} recheck={recheck} />,
      );
    });
  }

  async function run(attempt: PaymentAttempt) {
    await ReactTestRenderer.act(async () => { await flow.start(attempt); });
  }

  afterEach(() => {
    ReactTestRenderer.act(() => renderer?.unmount());
    jest.useRealTimers();
  });

  test('a purchase the store took but the server has not seen is pending, not failed', async () => {
    render();
    // purchaseStoreProduct resolves, so the money moved; the entitlement simply is not
    // ours yet. Reading this as a failure is what put a "pay" button in front of
    // somebody who had already paid.
    await run(async () => ({ active: false }));
    expect(flow.phase).toBe('pending');
    expect(flow.outcome?.canRetry).toBe(false);
    expect(texts(renderer)).toContain('This payment is already recorded. You won’t be charged again.');
  });

  test('a pending payment draws no way to pay again', async () => {
    render();
    await run(async () => ({ active: false }));
    const labels = texts(renderer);
    expect(labels).toContain('Check again');
    expect(labels).not.toContain('Try again');
  });

  test('a refused payment offers another attempt and says nothing was charged', async () => {
    render();
    await run(async () => { throw new StorePurchaseError('FAILED', 'Card declined.'); });
    expect(flow.phase).toBe('failed');
    const labels = texts(renderer);
    expect(labels).toContain('Try again');
    expect(labels).toContain('Card declined.');
    expect(labels).toContain('Nothing has been charged.');
  });

  test('retry is refused for a payment that was taken, whatever the screen draws', async () => {
    const attempt = jest.fn<Promise<{ active: boolean }>, []>().mockResolvedValue({ active: false });
    render();
    await run(attempt);
    ReactTestRenderer.act(() => flow.retry());
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  test('a dismissed store sheet closes the flow and says nothing', async () => {
    render();
    await run(async () => { throw new StorePurchaseError('CANCELLED', ''); });
    expect(flow.phase).toBe('idle');
    expect(renderer.toJSON()).toBeNull();
  });

  test('a pending payment is chased on its own until the entitlement lands', async () => {
    jest.useFakeTimers();
    const recheck = jest.fn()
      .mockResolvedValueOnce({ active: false })
      .mockResolvedValue({ active: true });
    render(recheck);
    await run(async () => ({ active: false }));
    expect(flow.phase).toBe('pending');
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(3000); });
    expect(recheck).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(3000); });
    expect(flow.phase).toBe('confirmed');
  });

  test('the progress frame names the step being waited on', async () => {
    render();
    let release: (value: { active: boolean }) => void = () => undefined;
    const pending = new Promise<{ active: boolean }>((resolve) => { release = resolve; });
    ReactTestRenderer.act(() => {
      flow.start(async (report) => { report('confirming'); return pending; });
    });
    expect(texts(renderer)).toContain('Confirming your payment');
    await ReactTestRenderer.act(async () => { release({ active: true }); await pending; });
  });
});
