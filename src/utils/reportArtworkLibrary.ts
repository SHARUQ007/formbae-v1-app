import type { ImageSourcePropType } from 'react-native';
import { reportEdition, reportVariant } from './reportVisuals';

export const REPORT_IMAGE_POOLS = {
  dietCover: [
    { id: 'diet-cover-1', source: require('../assets/editorial/report-library/diet-cover-1.jpg') as ImageSourcePropType },
    { id: 'diet-cover-2', source: require('../assets/editorial/report-library/diet-cover-2.jpg') as ImageSourcePropType },
    { id: 'diet-cover-3', source: require('../assets/editorial/report-library/diet-cover-3.jpg') as ImageSourcePropType },
  ],
  weeklyCover: [
    { id: 'weekly-cover-1', source: require('../assets/editorial/report-library/weekly-cover-1.jpg') as ImageSourcePropType },
    { id: 'weekly-cover-2', source: require('../assets/editorial/report-library/weekly-cover-2.jpg') as ImageSourcePropType },
    { id: 'weekly-cover-3', source: require('../assets/editorial/report-library/weekly-cover-3.jpg') as ImageSourcePropType },
  ],
  nutrition: [
    { id: 'nutrition-article-1', source: require('../assets/editorial/report-library/nutrition-article-1.jpg') as ImageSourcePropType },
    { id: 'nutrition-article-2', source: require('../assets/editorial/report-library/nutrition-article-2.jpg') as ImageSourcePropType },
    { id: 'nutrition-article-3', source: require('../assets/editorial/report-library/nutrition-article-3.jpg') as ImageSourcePropType },
    { id: 'nutrition-article-4', source: require('../assets/editorial/report-library/nutrition-article-4.jpg') as ImageSourcePropType },
    { id: 'nutrition-article-5', source: require('../assets/editorial/report-library/nutrition-article-5.jpg') as ImageSourcePropType },
    { id: 'nutrition-article-6', source: require('../assets/editorial/report-library/nutrition-article-6.jpg') as ImageSourcePropType },
    { id: 'nutrition-article-7', source: require('../assets/editorial/report-library/nutrition-article-7.jpg') as ImageSourcePropType },
    { id: 'nutrition-article-8', source: require('../assets/editorial/report-library/nutrition-article-8.jpg') as ImageSourcePropType },
    { id: 'nutrition-article-9', source: require('../assets/editorial/report-library/nutrition-article-9.jpg') as ImageSourcePropType },
  ],
  training: [
    { id: 'training-article-1', source: require('../assets/editorial/report-library/training-article-1.jpg') as ImageSourcePropType },
    { id: 'training-article-2', source: require('../assets/editorial/report-library/training-article-2.jpg') as ImageSourcePropType },
    { id: 'training-article-3', source: require('../assets/editorial/report-library/training-article-3.jpg') as ImageSourcePropType },
  ],
  recovery: [
    { id: 'recovery-article-1', source: require('../assets/editorial/report-library/recovery-article-1.jpg') as ImageSourcePropType },
    { id: 'recovery-article-2', source: require('../assets/editorial/report-library/recovery-article-2.jpg') as ImageSourcePropType },
    { id: 'recovery-article-3', source: require('../assets/editorial/report-library/recovery-article-3.jpg') as ImageSourcePropType },
  ],
  habits: [
    { id: 'habits-article-1', source: require('../assets/editorial/report-library/habits-article-1.jpg') as ImageSourcePropType },
    { id: 'habits-article-2', source: require('../assets/editorial/report-library/habits-article-2.jpg') as ImageSourcePropType },
    { id: 'habits-article-3', source: require('../assets/editorial/report-library/habits-article-3.jpg') as ImageSourcePropType },
  ],
} as const;

export type ReportArtworkTopic = 'nutrition' | 'training' | 'recovery' | 'habits';

export function getReportCover(topic: 'nutrition' | 'training', reportKey: string) {
  const pool = REPORT_IMAGE_POOLS[topic === 'nutrition' ? 'dietCover' : 'weeklyCover'];
  return pool[reportVariant(reportKey, pool.length)].source;
}

/** Reserve covers and choose each source image once within this report. */
export function getReportArticleArt(topics: ReportArtworkTopic[], reportKey: string, family: 'diet' | 'weekly') {
  const coverPool = REPORT_IMAGE_POOLS[family === 'diet' ? 'dietCover' : 'weeklyCover'];
  const used = new Set<string>([coverPool[reportVariant(reportKey, coverPool.length)].id]);
  const occurrence: Partial<Record<ReportArtworkTopic, number>> = {};
  return topics.map(topic => {
    const pool = REPORT_IMAGE_POOLS[topic];
    const slot = occurrence[topic] || 0;
    occurrence[topic] = slot + 1;
    // Nutrition has three complete article sets; other topics have three covers.
    const offset = (reportEdition(reportKey) * (topic === 'nutrition' ? 3 : 1) + (topic === 'nutrition' && family === 'weekly' ? 3 : 0) + slot) % pool.length;
    const ordered = [...pool.slice(offset), ...pool.slice(0, offset)];
    // Older reports may contain more than three references. Keep their cards,
    // choosing unused, related editorial art rather than repeating a thumbnail.
    const related = topic === 'nutrition' ? REPORT_IMAGE_POOLS.dietCover
      : topic === 'training' ? [...REPORT_IMAGE_POOLS.weeklyCover, ...REPORT_IMAGE_POOLS.recovery]
      : topic === 'recovery' ? [...REPORT_IMAGE_POOLS.training, ...REPORT_IMAGE_POOLS.habits]
      : [...REPORT_IMAGE_POOLS.weeklyCover, ...REPORT_IMAGE_POOLS.training];
    const selected = [...ordered, ...related].find(item => !used.has(item.id));
    if (!selected) return undefined;
    used.add(selected.id);
    return selected.source;
  });
}

/** Unique plant-based thumbnails for an archive, including restricted/unknown diets.
 * Beyond the local photo pool, the archive uses rotating SVGs instead of repeats.
 */
export function getReportArchiveArt(count: number, reportKey: string) {
  const pool = [...REPORT_IMAGE_POOLS.nutrition.filter(item => item.id !== 'nutrition-article-4'), ...REPORT_IMAGE_POOLS.dietCover.filter(item => item.id !== 'diet-cover-3')];
  const offset = reportVariant(reportKey, pool.length);
  const ordered = [...pool.slice(offset), ...pool.slice(0, offset)];
  return Array.from({ length: count }, (_, index) => ordered[index]?.source);
}
