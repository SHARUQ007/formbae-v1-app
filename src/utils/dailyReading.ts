import { REPORT_READING_LIBRARY } from './reportReading';

// Reuse the publisher links verified for the report reading room. This is a
// daily rotation of saved reading, not a feed of newly published articles.
const library = [...new Map(
  [...REPORT_READING_LIBRARY.weekly, ...REPORT_READING_LIBRARY.diet].map(article => [article.url, article]),
).values()];
const topics = ['training', 'nutrition', 'recovery'] as const;

export function localReadingDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dailyReading(dateKey: string) {
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
  return topics.map(topic => {
    const pool = library.filter(article => article.topic === topic);
    return pool[((day % pool.length) + pool.length) % pool.length];
  });
}
