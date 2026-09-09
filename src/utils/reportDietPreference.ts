/** Decorative animal-protein artwork requires an explicit, unrestricted food style. */
export function allowsNonVegetarianArtwork(preference?: string): boolean {
  const value = (preference || '').toLowerCase().replace(/[_–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Ambiguous styles and restrictions use plant protein rather than guessing.
  if (/\b(vegan|jain|pescatarian|pescetarian|eggetarian|vegeterian|vegetarian)\b/.test(value.replace(/\bnon\s*(vegetarian|vegeterian)\b/g, ''))) return false;
  if (/\b(no|not|avoid|without|allerg\w*|free)\b/.test(value)) return false;
  return /^(non\s*(veg|vegetarian|vegeterian)|omnivore|omnivorous)\b/.test(value);
}
