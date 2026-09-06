import {
  MAIN_STARTUP_MAX_MS,
  MAIN_STARTUP_MIN_MS,
  startupWindowRemaining,
  waitForMainStartupWindow,
} from './startupGate';

describe('startupWindowRemaining', () => {
  it('keeps a three second minimum and five second hard warm-up window', () => {
    expect(startupWindowRemaining(0)).toEqual({
      minimumMs: MAIN_STARTUP_MIN_MS,
      maximumMs: MAIN_STARTUP_MAX_MS,
    });
    expect(startupWindowRemaining(1_250)).toEqual({
      minimumMs: 1_750,
      maximumMs: 3_750,
    });
  });

  it('never returns negative waits after a slow authentication', () => {
    expect(startupWindowRemaining(6_000)).toEqual({ minimumMs: 0, maximumMs: 0 });
  });

  it('holds an immediately ready preload for the three second minimum', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    let resolved = false;
    const waiting = waitForMainStartupWindow(0, Promise.resolve()).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    jest.advanceTimersByTime(MAIN_STARTUP_MIN_MS - 1);
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await waiting;
    expect(resolved).toBe(true);
    jest.useRealTimers();
  });

  it('stops waiting for a stalled preload at five seconds', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    let resolved = false;
    const neverReady = new Promise<void>(() => undefined);
    const waiting = waitForMainStartupWindow(0, neverReady).then(() => {
      resolved = true;
    });

    jest.advanceTimersByTime(MAIN_STARTUP_MAX_MS - 1);
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await waiting;
    expect(resolved).toBe(true);
    jest.useRealTimers();
  });
});
