import React from 'react';
import { ScrollView, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WeeklyActivityRecord } from './WeeklyActivityRecord';
import type { WeeklyActivityDay } from '../utils/weeklyReport';

const data: WeeklyActivityDay[] = Array.from({ length: 7 }, (_, index) => ({
  date: `2026-09-0${index + 2}`,
  workouts: 0,
  foodLogs: [0, 1, 2, 3, 2, 2, null][index],
}));

const rn = require('react-native');
let tree: ReturnType<typeof create>;

afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.restoreAllMocks();
});

function renderAt(width: number, fontScale = 1) {
  jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width, height: 844, fontScale, scale: 3 });
  act(() => { tree = create(<WeeklyActivityRecord data={data} reportKey="2026-09-02" />); });
  return tree;
}

it('preserves each dated count and distinguishes no entry from unavailable detail', () => {
  renderAt(390);
  expect(tree.root.findAllByType(View).filter(node => node.props.testID === 'weekly-activity-grid')).toHaveLength(1);
  const labels = tree.root.findAllByType(View).filter(node => node.props.accessible && node.props.accessibilityLabel).map(node => node.props.accessibilityLabel);
  expect(labels).toHaveLength(14);
  expect(labels).toContain('5 Sept, Food logs: 3 saved entries');
  expect(labels).toContain('5 Sept, Training: no saved entry');
  expect(labels).toContain('8 Sept, Food logs: detail unavailable');
  expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
});

it('keeps all seven days available in a narrow layout with larger text', () => {
  renderAt(320, 1.4);
  expect(tree.root.findAllByType(View).filter(node => node.props.testID === 'weekly-activity-day-list')).toHaveLength(1);
  expect(tree.root.findAllByType(View).filter(node => node.props.testID === 'weekly-activity-grid')).toHaveLength(0);
  expect(tree.root.findAllByType(View).filter(node => node.props.accessible && node.props.accessibilityLabel)).toHaveLength(14);
  expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
});
