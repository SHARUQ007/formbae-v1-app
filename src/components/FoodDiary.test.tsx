import { Image, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { FoodDiaryOverview } from './FoodDiaryOverview';
import { FoodDiaryEntry } from './FoodDiaryEntry';
import { loggedMealCount } from '../utils/foodDiarySummary';
import type { DietDiaryEntry } from '../store/dietDiaryStore';

const entry: DietDiaryEntry = { id: 'meal-1', kind: 'text', mealType: 'Lunch', createdAt: '2026-09-09T12:00:00Z', note: 'Rice and dal, with cucumber on the side.', storedLocally: true };

it('counts distinct logged meal windows and excludes both forms of skipped entry', () => {
  expect(loggedMealCount([entry, { ...entry, id: 'photo', kind: 'photo' }, { ...entry, id: 'skip-1', kind: 'skip', mealType: 'Dinner' }, { ...entry, id: 'skip-2', status: 'skipped', mealType: 'Breakfast' }])).toBe(1);
  expect(loggedMealCount([{ ...entry, kind: 'skip' }])).toBe(0);
  expect(loggedMealCount([entry, { ...entry, id: 'evening', mealType: 'Evening' }])).toBe(2);
});

it('keeps log and report navigation separate and renders supplied weekly counts', () => {
  const onLog = jest.fn(); const onReport = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<FoodDiaryOverview entries={2} meals={1} days={1} reportStatus="Ready to read" onLog={onLog} onReport={onReport} />); });
  const buttons = tree.root.findAllByType(TouchableOpacity);
  act(() => buttons[0].props.onPress());
  expect(onLog).toHaveBeenCalledTimes(1); expect(onReport).not.toHaveBeenCalled();
  act(() => buttons[1].props.onPress());
  expect(onReport).toHaveBeenCalledTimes(1);
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain('2 entries this week');
  expect(output).toContain('1 meals logged this week');
  expect(output).toContain('Ready to read');
  expect(output).not.toContain('% evidence');
  act(() => tree.unmount());
});

it('retains full diary text, meal context, edit behavior and offline state', () => {
  const onOpen = jest.fn(); const onEdit = jest.fn();
  let tree!: TestRenderer.ReactTestRenderer;
  const note = 'A long description with several foods. '.repeat(8);
  act(() => { tree = TestRenderer.create(<FoodDiaryEntry entry={{ ...entry, note, syncError: 'offline' }} time="12:00 PM" onOpen={onOpen} onEdit={onEdit} />); });
  const buttons = tree.root.findAllByType(TouchableOpacity);
  act(() => buttons.find(button => button.props.accessibilityLabel === 'Edit Lunch entry')!.props.onPress());
  expect(onEdit).toHaveBeenCalledTimes(1); expect(onOpen).not.toHaveBeenCalled();
  act(() => buttons.find(button => button.props.accessibilityLabel?.startsWith('Open Lunch'))!.props.onPress());
  expect(onOpen).toHaveBeenCalledTimes(1);
  const output = JSON.stringify(tree.toJSON());
  expect(output).toContain(note);
  expect(output).not.toContain('numberOfLines');
  expect(output).toContain('report-illustration-mealLunch');
  expect(output).toContain('sync pending');
  act(() => tree.unmount());
});

it('preserves the real photo source and authentication headers, with a neutral failed-photo fallback', () => {
  const source = { uri: 'https://example.test/meal.jpg', headers: { Authorization: 'synthetic-test-token' } };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<FoodDiaryEntry entry={{ ...entry, kind: 'photo', uri: source.uri }} source={source} time="12:00 PM" onOpen={jest.fn()} onEdit={jest.fn()} />); });
  expect(tree.root.findByType(Image).props.source).toEqual(source);
  act(() => tree.root.findByType(Image).props.onError());
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('report-illustration-diaryCapture');
  act(() => tree.unmount());
});
