import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ReportFoodGroups } from './ReportFoodGroups';

describe('illustrated food evidence', () => {
  it('deduplicates food tags without inventing frequencies or intake for empty groups', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ReportFoodGroups reportKey="2026-09-02" groups={[
      { key: 'vegetables', label: 'Vegetables', status: 'limited', observedFoods: ['Broccoli', ' broccoli ', 'Carrot', null] },
      { key: 'dairy', label: 'Milk & curd', status: 'notSeen', observedFoods: [] },
    ]} />); });
    const labels = renderer.root.findAll(node => Boolean(node.props.accessibilityLabel)).map(node => node.props.accessibilityLabel);
    expect(labels).toContain('Vegetables. Named in diary. Broccoli, Carrot.');
    expect(labels).toContain('Milk & curd. Not described.');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Seen less often');
    act(() => renderer.unmount());
  });

  it('retains juice and unspecified-grain qualifications with separate contextual illustrations', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ReportFoodGroups reportKey="2026-09-02" groups={[
      { key: 'fruit', label: 'Fruit', observedFoods: ['Orange juice'] },
      { key: 'wholeGrains', label: 'Whole grains', observedFoods: ['Roti'] },
    ]} />); });
    const labels = renderer.root.findAll(node => Boolean(node.props.accessibilityLabel)).map(node => node.props.accessibilityLabel);
    expect(labels.some(label => label.includes('whole fruit is not described'))).toBe(true);
    expect(labels.some(label => label.includes('Whole-grain content is unconfirmed'))).toBe(true);
    expect(renderer.root.findAll(node => node.props.testID === 'report-illustration-fruit').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.testID === 'report-illustration-wholeGrains').length).toBeGreaterThan(0);
    act(() => renderer.unmount());
  });
});
