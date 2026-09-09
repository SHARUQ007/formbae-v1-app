import { REPORT_IMAGE_POOLS } from './reportArtworkLibrary';

const trainingArt = [...REPORT_IMAGE_POOLS.training, ...REPORT_IMAGE_POOLS.weeklyCover];
const recoveryArt = [REPORT_IMAGE_POOLS.training[1], REPORT_IMAGE_POOLS.weeklyCover[2], REPORT_IMAGE_POOLS.weeklyCover[1]];

/** Stable throughout a local day, advancing on the next day without randomness. */
export function workoutOverviewVisuals(planDayId: string, mode: string, dateKey: string, focus = '') {
  let identity = 0;
  for (const char of `${planDayId}:${mode}`) identity = (identity * 31 + char.charCodeAt(0)) % 0x100000000;
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  const day = Number.isFinite(parsed) ? Math.floor(parsed / 86400000) : 0;
  const pool = /recovery|mobility|stretch|yoga/i.test(focus) ? recoveryArt : trainingArt;
  const artwork = pool[(day + identity) % pool.length];
  return { artwork: artwork.source, artworkId: artwork.id, variant: (day + identity + Math.floor(day / 6)) % 3 };
}
