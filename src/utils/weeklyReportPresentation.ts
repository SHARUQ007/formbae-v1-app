import type { ReportIllustrationKind } from './reportIllustrationCatalog';

/** Split prose for reading, without rewriting claims or truncating old reports. */
export function weeklyReadingBlocks(value: string): string[] {
  return value.trim().split(/\n+/).flatMap(paragraph => {
    const text = paragraph.trim();
    const blocks: string[] = [];
    const boundary = /[.!?]["”’']?\s+(?=["“‘']?[A-Z0-9])/g;
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = boundary.exec(text))) {
      const end = match.index + match[0].trimEnd().length;
      const candidate = text.slice(start, end);
      // A title, initial or common abbreviation is not a sentence ending.
      if (/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|e\.g|i\.e)|\b[A-Z])\.$/i.test(candidate)) continue;
      blocks.push(candidate.trim());
      start = boundary.lastIndex;
    }
    if (text.slice(start).trim()) blocks.push(text.slice(start).trim());
    return blocks;
  });
}

export function weeklyContextIllustration(domain: string, title = ''): ReportIllustrationKind {
  if (domain === 'nutrition' || domain === 'diet') {
    if (/\b(water|drink|hydration)\b/i.test(title)) return 'insightDrinks';
    if (/\b(breakfast|morning meal)\b/i.test(title)) return 'mealBreakfast';
    if (/\b(log|logging|diary|describe)\b/i.test(title)) return 'diaryCapture';
    return 'nutrition';
  }
  if (domain === 'body' || domain === 'measurements') return 'measurements';
  if (domain === 'recovery') return 'recovery';
  if (domain === 'consistency') return 'coverageDays';
  if (domain === 'training' || domain === 'workout') return 'training';
  return 'reportFocus';
}
