import type { MainAppPreloadSnapshot } from '../services/preloadService';
import {
  STARTUP_PROGRESS_FLOOR,
  STARTUP_PROGRESS_LOADING_CEILING,
  startupArtworkResizeMode,
  startupProgressMeta,
  startupProgressTarget,
} from './startupPresentation';

function snapshot(
  phase: MainAppPreloadSnapshot['phase'],
  completed: number,
  total = 6,
): MainAppPreloadSnapshot {
  return { phase, completed, total, lastCompletedLabel: '' };
}

describe('startup presentation', () => {
  it('keeps the splash artwork full-bleed on phones without cropping wide screens', () => {
    expect(startupArtworkResizeMode(390, 844)).toBe('cover');
    expect(startupArtworkResizeMode(360, 640)).toBe('cover');
    expect(startupArtworkResizeMode(768, 1024)).toBe('contain');
    expect(startupArtworkResizeMode(1024, 768)).toBe('contain');
    expect(startupArtworkResizeMode(0, 0)).toBe('cover');
  });

  it('shows a small initial rail without inventing time-based progress', () => {
    expect(startupProgressTarget(false, snapshot('ready', 6))).toBe(
      STARTUP_PROGRESS_FLOOR,
    );
    expect(startupProgressTarget(true, snapshot('idle', 0))).toBe(
      STARTUP_PROGRESS_FLOOR,
    );
    expect(startupProgressTarget(true, snapshot('loading', 0))).toBe(
      STARTUP_PROGRESS_FLOOR,
    );
  });

  it('tracks settled setup tasks and reserves completion for the ready state', () => {
    expect(startupProgressTarget(true, snapshot('loading', 3))).toBe(0.5);
    expect(startupProgressTarget(true, snapshot('loading', 6))).toBe(
      STARTUP_PROGRESS_LOADING_CEILING,
    );
    expect(startupProgressTarget(true, snapshot('ready', 6))).toBe(1);
    expect(startupProgressTarget(true, snapshot('loading', 2), true)).toBe(1);
  });

  it('uses short, honest status metadata instead of a fabricated percentage', () => {
    expect(startupProgressMeta(false, false, snapshot('idle', 0))).toBe(
      'Starting',
    );
    expect(startupProgressMeta(true, false, snapshot('loading', 2))).toBe(
      '2/6',
    );
    expect(startupProgressMeta(true, false, snapshot('ready', 6))).toBe(
      'Ready',
    );
  });
});
