export const MAIN_STARTUP_MIN_MS = 3_000;
export const MAIN_STARTUP_MAX_MS = 5_000;

export function startupWindowRemaining(
  elapsedMs: number,
  minimumMs = MAIN_STARTUP_MIN_MS,
  maximumMs = MAIN_STARTUP_MAX_MS,
) {
  const elapsed = Math.max(0, elapsedMs);
  return {
    minimumMs: Math.max(0, minimumMs - elapsed),
    maximumMs: Math.max(0, maximumMs - elapsed),
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Holds Main long enough to avoid a flash, but never lets optional warm-up
 * turn into an unbounded loading screen. Authentication itself remains
 * outside this deadline because routing without a known session is unsafe.
 */
export async function waitForMainStartupWindow(
  mountedAt: number,
  criticalReady: Promise<unknown>,
) {
  const remaining = startupWindowRemaining(Date.now() - mountedAt);
  await Promise.all([
    delay(remaining.minimumMs),
    Promise.race([
      criticalReady.catch(() => undefined),
      delay(remaining.maximumMs),
    ]),
  ]);
}
