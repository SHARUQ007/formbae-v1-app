import React from 'react';
import { TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DietScoreGrid, getDietScoreColumns } from './DietScoreGrid';
import { DietScoreCriterion } from './DietScoreCriterion';

const criteria = [
  { key: 'foodVariety', label: 'Food variety', criterion: 'The range of foods described.', value: 9, maxScore: 20, insight: 'Lunch included lentils and vegetables.' },
  { key: 'proteinCoverage', label: 'Protein across meals', criterion: 'Protein foods described across meal occasions.', value: 13, maxScore: 20, insight: 'Dal was recorded at lunch.' },
];

describe('responsive nutrition-score grid', () => {
  it.each([
    [280, 1, 1], [315, 1, 1], [316, 1, 2], [346, 1, 2], [346, 1.3, 1], [600, 1.6, 2],
  ])('uses %i available pixels at %ix text to choose %i columns', (width, fontScale, expected) => {
    expect(getDietScoreColumns(width, fontScale)).toBe(expected);
  });

  it('responds to container resizing without losing expanded definitions or dietary preferences', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(<DietScoreGrid criteria={criteria} reportKey="2026-09-02" dietPreference="Vegetarian" />); });
    const grid = tree.root.findAll(node => node.props.testID === 'diet-score-grid' && node.props.onLayout)[0];
    act(() => grid.props.onLayout({ nativeEvent: { layout: { width: 800 } } }));
    expect(tree.root.findAllByType(DietScoreCriterion).every(card => card.props.compact)).toBe(true);
    expect(tree.root.findAllByType(DietScoreCriterion).every(card => card.props.dietPreference === 'Vegetarian')).toBe(true);
    act(() => tree.root.findAllByType(TouchableOpacity)[0].props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain(criteria[0].criterion);
    act(() => grid.props.onLayout({ nativeEvent: { layout: { width: 260 } } }));
    expect(tree.root.findAllByType(DietScoreCriterion).every(card => !card.props.compact)).toBe(true);
    expect(JSON.stringify(tree.toJSON())).toContain(criteria[0].criterion);
    expect(JSON.stringify(tree.toJSON())).toContain(criteria[0].insight);
    act(() => tree.unmount());
  });
});
