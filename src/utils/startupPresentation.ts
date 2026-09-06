import type { MainAppPreloadSnapshot } from '../services/preloadService';

export const STARTUP_PROGRESS_FLOOR = 0.08;
export const STARTUP_PROGRESS_LOADING_CEILING = 0.94;

export function startupArtworkResizeMode(
  viewportWidth: number,
  viewportHeight: number,
): 'cover' | 'contain' {
  if (viewportWidth <= 0 || viewportHeight <= 0) return 'cover';

  // The artwork is composed for tall phones. On tablets and landscape screens,
  // containing it preserves every person while the black canvas masks sidebars.
  return viewportHeight / viewportWidth < 1.65 ? 'contain' : 'cover';
}

export function startupProgressTarget(
  ready: boolean,
  snapshot: MainAppPreloadSnapshot,
  finishing = false,
) {
  if (!ready) return STARTUP_PROGRESS_FLOOR;
  if (finishing || snapshot.phase === 'ready') return 1;
  if (snapshot.total <= 0) return STARTUP_PROGRESS_FLOOR;

  const completedProgress = snapshot.completed / snapshot.total;
  return Math.min(
    STARTUP_PROGRESS_LOADING_CEILING,
    Math.max(STARTUP_PROGRESS_FLOOR, completedProgress),
  );
}

export function startupProgressMeta(
  ready: boolean,
  finishing: boolean,
  snapshot: MainAppPreloadSnapshot,
) {
  if (!ready) return 'Starting';
  if (finishing || snapshot.phase === 'ready') return 'Ready';
  if (
    snapshot.phase === 'loading' &&
    snapshot.total > 0 &&
    snapshot.completed > 0
  ) {
    return `${snapshot.completed}/${snapshot.total}`;
  }
  return 'Starting';
}
