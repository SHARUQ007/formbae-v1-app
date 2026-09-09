import type { ImageSourcePropType } from 'react-native';
import { reportVariant } from './reportVisuals';
import { allowsNonVegetarianArtwork } from './reportDietPreference';

export const DIET_SCORE_ARTWORK = {
  foodVariety: [
    require('../assets/editorial/scorecard/foodVariety-1.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/foodVariety-2.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/foodVariety-3.jpg') as ImageSourcePropType,
  ],
  plantFoods: [
    require('../assets/editorial/scorecard/plantFoods-1.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/plantFoods-2.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/plantFoods-3.jpg') as ImageSourcePropType,
  ],
  proteinCoverage: [
    require('../assets/editorial/scorecard/proteinCoverage-1.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/proteinCoverage-2.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/proteinCoverage-3.jpg') as ImageSourcePropType,
  ],
  mealBalance: [
    require('../assets/editorial/scorecard/mealBalance-1.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/mealBalance-2.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/mealBalance-3.jpg') as ImageSourcePropType,
  ],
  wholeFoodPattern: [
    require('../assets/editorial/scorecard/wholeFoodPattern-1.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/wholeFoodPattern-2.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/wholeFoodPattern-3.jpg') as ImageSourcePropType,
  ],
  goalAlignment: [
    require('../assets/editorial/scorecard/goalAlignment-1.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/goalAlignment-2.jpg') as ImageSourcePropType,
    require('../assets/editorial/scorecard/goalAlignment-3.jpg') as ImageSourcePropType,
  ],
} as const;

export function getDietScoreArtwork(key: string, reportKey: string, dietPreference?: string): ImageSourcePropType | undefined {
  if (key === 'proteinCoverage' && !allowsNonVegetarianArtwork(dietPreference)) return undefined;
  const pool = DIET_SCORE_ARTWORK[key as keyof typeof DIET_SCORE_ARTWORK];
  return pool?.[reportVariant(reportKey, pool.length)];
}
