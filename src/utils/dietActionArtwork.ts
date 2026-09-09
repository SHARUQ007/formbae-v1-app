import { reportVariant } from './reportVisuals';

const ARTWORK = {
  snack: [
    require('../assets/editorial/actions/snack-1.jpg'),
    require('../assets/editorial/actions/snack-2.jpg'),
    require('../assets/editorial/actions/snack-3.jpg'),
  ],
  water: [
    require('../assets/editorial/actions/water-1.jpg'),
    require('../assets/editorial/actions/water-2.jpg'),
    require('../assets/editorial/actions/water-3.jpg'),
  ],
};

export function getDietActionArtwork(title: string, reportKey: string, slot: number) {
  // Match the action's subject, rather than a food mentioned only as a fallback.
  const category = /\b(water|hydrat\w*)\b/i.test(title) ? 'water'
    : /\b(fruit|snack\w*|biscuit\w*)\b/i.test(title) ? 'snack' : null;
  return category ? ARTWORK[category][reportVariant(reportKey, 3, slot)] : undefined;
}
