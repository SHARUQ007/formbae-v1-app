import type { ReportIllustrationKind } from './reportIllustrationCatalog';

/** Only locally authored illustrations are selectable; model URLs are never used.
 * Match the title's subject, not evidence or foods mentioned as a fallback.
 */
export function dietTopicIllustration(title: string, fallback: ReportIllustrationKind = 'reportFocus'): ReportIllustrationKind {
  if (/\b(drinks?|alcohol|soda|juice|sprite|7\s?up|water|hydrat\w*)\b/i.test(title)) return 'insightDrinks';
  if (/\b(biscuits?|snacks?|cookies?)\b/i.test(title)) return 'insightSnack';
  if (/\b(protein|dal|lentils?|beans?|tofu|paneer|eggs?|chicken|fish)\b/i.test(title)) return 'protein';
  if (/\b(vegetables?|plants?|fibre|fiber|produce)\b/i.test(title)) return 'vegetables';
  if (/\b(breakfast|mornings?)\b/i.test(title)) return 'mealBreakfast';
  if (/\b(lunch|midday)\b/i.test(title)) return 'mealLunch';
  if (/\b(dinner|supper)\b/i.test(title)) return 'mealDinner';
  if (/\b(evenings?)\b/i.test(title)) return 'mealEvening';
  if (/\b(fruits?|berries|apples?|bananas?)\b/i.test(title)) return 'fruit';
  if (/\b(grains?|millets?|oats?|roti|rice|bread|quinoa)\b/i.test(title)) return 'wholeGrains';
  if (/\b(milk|curd|yog[hu]+rt|dairy)\b/i.test(title)) return 'dairy';
  if (/\b(nuts?|seeds?|almonds?|peanuts?)\b/i.test(title)) return 'nutsSeeds';
  if (/\b(prep\w*|cook\w*|plates?|balanced?|recipes?)\b/i.test(title)) return 'mealFormula';
  if (/\b(log\w*|record\w*|diar\w*|describ\w*)\b/i.test(title)) return 'coverageMeals';
  return fallback;
}

export function dietCriterionIllustration(key: string): ReportIllustrationKind {
  switch (key) {
    case 'foodVariety': return 'nutrition';
    case 'plantFoods': return 'vegetables';
    case 'proteinCoverage': return 'protein';
    case 'mealBalance': return 'mealFormula';
    case 'wholeFoodPattern': return 'mealLunch';
    case 'goalAlignment': return 'reportPlan';
    default: return 'reportScore';
  }
}
