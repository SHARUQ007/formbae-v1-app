import { buildReportReading, REPORT_READING_LIBRARY } from './reportReading';
import { getReportArticleArt, getReportCover } from './reportArtworkLibrary';

it('keeps report citations first and adds distinct further reading to reach six cards', () => {
  const source = REPORT_READING_LIBRARY.diet[0];
  const articles = buildReportReading([source, { ...source, url: `${source.url}?ref=duplicate` }], 'diet', '2026-09-02');
  expect(articles).toHaveLength(6);
  expect(articles[0]).toMatchObject({ id: source.id, kind: 'reference' });
  expect(articles.slice(1).every(article => article.kind === 'reading')).toBe(true);
  expect(new Set(articles.map(article => article.url)).size).toBe(6);
});

it('offers six optional articles when no sources were cited and excludes non-HTTPS sources', () => {
  const source = REPORT_READING_LIBRARY.diet[0];
  const articles = buildReportReading([{ ...source, url: 'file:///private' }], 'diet', '2026-09-02');
  expect(articles).toHaveLength(6);
  expect(articles.every(article => article.kind === 'reading' && article.url.startsWith('https://'))).toBe(true);
});

it.each(['diet', 'weekly'] as const)('keeps the %s reading order stable on reopen and every card image distinct', family => {
  const articles = buildReportReading([], family, '2026-09-02');
  expect(buildReportReading([], family, '2026-09-02')).toEqual(articles);
  expect(buildReportReading([], family, '2026-09-09')).not.toEqual(articles);
  const art = getReportArticleArt(articles.map(article => article.topic!), '2026-09-02', family);
  expect(art.every(Boolean)).toBe(true);
  expect(new Set(art).size).toBe(6);
  expect(art).not.toContain(getReportCover(family === 'diet' ? 'nutrition' : 'training', '2026-09-02'));
});
