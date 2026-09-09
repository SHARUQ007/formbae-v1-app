import { Image, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { DietCoachFeedback } from '../services/dietDiaryService';
import { DietReportHistory } from './DietReportHistory';
import { getReportArchiveArt, REPORT_IMAGE_POOLS } from '../utils/reportArtworkLibrary';

const fixture = (date: string, score: number) => ({ schemaVersion: 17, weekStartDate: '2026-09-02', weekEndDate: '2026-09-08', generatedAt: date, headline: 'Lunch brings a little more variety', summary: 'A familiar lunch pattern emerged.', score: { overall: score, availability: 'available', components: [{ key: 'foodVariety', label: 'Food variety', score: 10, maxScore: 20 }] }, nextWeek: { actionPlan: [{ title: 'Prepare a familiar lunch', steps: ['Choose a recipe.'] }] } } as unknown as DietCoachFeedback);
const format = { formatPeriod: (start: string, end?: string) => `${start} – ${end}`, formatGenerated: (date: string) => `Generated ${date}` };

it('sorts saved reports, opens the original record and labels same-period score revisions', () => {
  const older = fixture('2026-09-08T10:00:00Z', 40);
  const newer = fixture('2026-09-09T10:00:00Z', 43);
  const onOpen = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<DietReportHistory reports={[older, newer]} onOpen={onOpen} {...format} />); });
  const cards = tree.root.findAllByType(TouchableOpacity);
  expect(cards).toHaveLength(2);
  act(() => cards[0].props.onPress());
  expect(onOpen).toHaveBeenCalledWith(newer);
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain('LATEST SAVED');
  expect(output).toContain('+3 points');
  expect(output).toContain('Same reporting period · score revision');
  expect(output).toContain('Prepare a familiar lunch');
  act(() => tree.unmount());
});

it('keeps zero scores and unchanged scores distinct from an unassessed report', () => {
  const reports = [fixture('2026-09-09T10:00:00Z', 0), fixture('2026-09-08T10:00:00Z', 0), fixture('2026-09-07T10:00:00Z', NaN)];
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<DietReportHistory reports={reports} onOpen={jest.fn()} {...format} />); });
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain('No score change');
  expect(output).toContain('Not assessed');
  expect(tree.root.findAllByType(TouchableOpacity)[0].props.accessibilityLabel).toContain('Score 0 out of 100');
  act(() => tree.unmount());
});

it('reuses the journal artwork in an empty archive and falls back when its image fails', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<DietReportHistory reports={[]} onOpen={jest.fn()} {...format} />); });
  expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Your collection starts here');
  act(() => tree.root.findByType(Image).props.onError());
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('report-illustration-reportReview');
  act(() => tree.unmount());
});

it('uses unique plant-based archive thumbnails and leaves excess slots to SVGs', () => {
  const artwork = getReportArchiveArt(12, '2026-09-02');
  const available = artwork.filter(Boolean);
  expect(available).toHaveLength(10);
  expect(new Set(available).size).toBe(10);
  expect(available).not.toContain(REPORT_IMAGE_POOLS.nutrition[3].source);
  expect(available).not.toContain(REPORT_IMAGE_POOLS.dietCover[2].source);
  expect(artwork.slice(10)).toEqual([undefined, undefined]);
  expect(getReportArchiveArt(12, '2026-09-02')).toEqual(artwork);
});
