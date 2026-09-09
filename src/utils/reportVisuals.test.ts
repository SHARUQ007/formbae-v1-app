import { getReportArticleArt, getReportCover, REPORT_IMAGE_POOLS, type ReportArtworkTopic } from './reportArtworkLibrary';
import { REPORT_ILLUSTRATIONS } from './reportIllustrationCatalog';
import { reportVariant } from './reportVisuals';
import { DIET_SCORE_ARTWORK, getDietScoreArtwork } from './dietScoreArtwork';

const pathOf = (image: unknown) => (image as { testUri?: string })?.testUri;

describe('report artwork editions', () => {
  it('rotates six distinct score illustrations through three complete editions', () => {
    const all = Object.values(DIET_SCORE_ARTWORK).flat().map(pathOf);
    expect(all).toHaveLength(18);
    expect(new Set(all).size).toBe(18);
    for (const key of Object.keys(DIET_SCORE_ARTWORK)) {
      const editions = ['2026-09-02', '2026-09-09', '2026-09-16'].map(week => pathOf(getDietScoreArtwork(key, week, 'Non vegetarian')));
      expect(new Set(editions).size).toBe(3);
      expect(pathOf(getDietScoreArtwork(key, '2026-09-23', 'Non vegetarian'))).toBe(editions[0]);
    }
    expect(getDietScoreArtwork('unknown', '2026-09-02')).toBeUndefined();
  });
  it('rotates weekly covers through three editions and keeps a reopened report stable', () => {
    for (const topic of ['nutrition', 'training'] as const) {
      const weeks = ['2026-09-02', '2026-09-09', '2026-09-16'];
      const covers = weeks.map(week => pathOf(getReportCover(topic, week)));
      expect(new Set(covers).size).toBe(3);
      expect(getReportCover(topic, weeks[0])).toBe(getReportCover(topic, weeks[0]));
      expect(pathOf(getReportCover(topic, '2026-09-23'))).toBe(covers[0]);
    }
  });

  it.each(['nutrition', 'training', 'recovery', 'habits'] as const)('never repeats %s source thumbnails or the current cover, including legacy six-source reports', topic => {
    for (const family of ['diet', 'weekly'] as const) {
      const topics: ReportArtworkTopic[] = Array(6).fill(topic);
      const images = getReportArticleArt(topics, '2026-09-02', family).map(pathOf);
      expect(images.every(Boolean)).toBe(true);
      expect(new Set(images).size).toBe(6);
      expect(images).not.toContain(pathOf(getReportCover(family === 'diet' ? 'nutrition' : 'training', '2026-09-02')));
    }
  });

  it('uses different nutrition source sets between report types and successive weeks', () => {
    const topics: ReportArtworkTopic[] = ['nutrition', 'nutrition', 'nutrition'];
    const diet = getReportArticleArt(topics, '2026-09-02', 'diet').map(pathOf);
    const weekly = getReportArticleArt(topics, '2026-09-02', 'weekly').map(pathOf);
    const next = getReportArticleArt(topics, '2026-09-09', 'diet').map(pathOf);
    expect(diet.some(image => weekly.includes(image))).toBe(false);
    expect(diet.some(image => next.includes(image))).toBe(false);
  });

  it('ships 24 distinct photos and three original compositions for every vector role', () => {
    const images = Object.values(REPORT_IMAGE_POOLS).flat();
    expect(images).toHaveLength(24);
    expect(new Set(images.map(image => pathOf(image.source))).size).toBe(24);
    const vectors = Object.values(REPORT_ILLUSTRATIONS);
    expect(vectors.flat()).toHaveLength(84);
    expect(new Set(vectors.flat()).size).toBe(84);
    expect(vectors.every(variants => variants.length === 3)).toBe(true);
    expect(reportVariant('2026-09-02', 3, 0)).not.toBe(reportVariant('2026-09-02', 3, 1));
    expect(reportVariant('undated saved report')).toBe(reportVariant('undated saved report'));
  });
});
