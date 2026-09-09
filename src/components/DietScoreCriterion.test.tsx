import React from 'react';
import { TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { Circle } from 'react-native-svg';
import { DietScoreCriterion } from './DietScoreCriterion';
import { colors } from '../theme/colors';

const props = { criterionKey: 'plantFoods', label: 'Plants and fibre-rich foods', definition: 'Variety of plants described.', value: 7, maxScore: 20, insight: 'Lunch included vegetables and dal.', reportKey: '2026-09-02' };

describe('compact nutrition criteria', () => {
  it('keeps diary evidence visible and lets the reader reveal the scoring definition', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(<DietScoreCriterion {...props} />); });
    expect(JSON.stringify(tree.toJSON())).toContain(props.insight);
    expect(JSON.stringify(tree.toJSON())).not.toContain(props.definition);
    const button = tree.root.findByType(TouchableOpacity);
    expect(button.props.accessibilityState.expanded).toBe(false);
    act(() => button.props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain(props.definition);
    expect(button.props.accessibilityState.expanded).toBe(true);
    act(() => button.props.onPress());
    expect(JSON.stringify(tree.toJSON())).not.toContain(props.definition);
    expect(JSON.stringify(tree.toJSON())).toContain(props.insight);
    act(() => tree.unmount());
  });

  it('distinguishes zero points from an unassessed criterion', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(<DietScoreCriterion {...props} value={0} />); });
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'progressbar')[0].props.accessibilityValue.now).toBe(0);
    expect(tree.root.findAllByType(Circle).filter(node => node.props.stroke === colors.accent)).toHaveLength(0);
    act(() => tree.update(<DietScoreCriterion {...props} value={null} />));
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'progressbar')).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain(props.definition);
    expect(JSON.stringify(tree.toJSON())).not.toContain(props.insight);
    expect(tree.root.findAllByType(TouchableOpacity)).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('draws the ring using the criterion maximum rather than treating points as a percentage', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(<DietScoreCriterion {...props} value={10} maxScore={20} />); });
    const arc = tree.root.findAllByType(Circle).find(node => node.props.stroke === colors.accent)!;
    const track = tree.root.findAllByType(Circle).find(node => node.props.stroke === colors.border)!;
    const drawn = Number(arc.props.strokeDasharray.split(' ')[0]);
    const [available, circumference] = track.props.strokeDasharray.split(' ').map(Number);
    expect(available / circumference).toBeCloseTo(0.75);
    expect(drawn / available).toBeCloseTo(0.5);
    expect(tree.root.findAll(node => node.props.accessibilityRole === 'progressbar')[0].props.accessibilityLabel).toBe(`${props.label}: 10 out of 20`);
    act(() => tree.unmount());
  });
});
