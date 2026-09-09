import React from 'react';
import { TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DietReportInsights } from './DietReportInsights';

it('keeps a complete decimal-containing preview and makes the original observation available', () => {
  const opening = 'One diary note described 1.5 glasses of a soft drink.';
  const rest = 'The remaining notes did not specify quantities, so the diary cannot establish total intake. A later dinner also described a soft drink alongside a meal.';
  const finding = { title: 'Soft drinks appear in the diary', observation: `${opening} ${rest}`, meaning: '', evidence: ['Friday dinner'], label: 'Focus' };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<DietReportInsights findings={[finding]} reportKey="2026-09-02" />); });
  expect(JSON.stringify(tree.toJSON())).toContain(opening);
  expect(JSON.stringify(tree.toJSON())).not.toContain(rest);
  act(() => tree.root.findByType(TouchableOpacity).props.onPress());
  expect(JSON.stringify(tree.toJSON())).toContain(`${opening} ${rest}`);
  expect(JSON.stringify(tree.toJSON())).toContain('Friday dinner');
  act(() => tree.unmount());
});

it('uses plant protein artwork for vegetarian readers and keeps unpunctuated observations intact', () => {
  const observation = 'Dal and beans were named at lunch but the diary does not include portion sizes';
  const finding = { title: 'Protein appeared at lunch', observation, meaning: '', evidence: [], label: 'Keep doing' };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<DietReportInsights findings={[finding]} dietPreference="Vegetarian" reportKey="2026-09-02" />); });
  expect(tree.root.findAll(node => node.props.testID === 'report-illustration-proteinPlant').length).toBeGreaterThan(0);
  expect(JSON.stringify(tree.toJSON())).toContain(observation);
  expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
  act(() => tree.unmount());
});
