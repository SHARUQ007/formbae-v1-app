import React from 'react';
import { Image } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ReportFoodGroups } from './ReportFoodGroups';
import { DietScoreCriterion } from './DietScoreCriterion';
import { allowsNonVegetarianArtwork } from '../utils/reportDietPreference';
import { getDietScoreArtwork } from '../utils/dietScoreArtwork';

describe('diet-aware protein artwork', () => {
  it.each(['Vegetarian', 'VEGAN', 'Veg', 'Vegeterian', 'Jain', 'Eggetarian', 'Pescatarian', 'Mostly vegetarian', '', undefined, 'not non-veg', 'Non vegetarian, no eggs', 'Non-veg / vegetarian'])('uses plant artwork for %s', preference => {
    expect(allowsNonVegetarianArtwork(preference)).toBe(false);
    for (const week of ['2026-09-02', '2026-09-09', '2026-09-16']) {
      expect(getDietScoreArtwork('proteinCoverage', week, preference)).toBeUndefined();
    }
  });

  it.each(['Non vegetarian', 'NON-VEG', 'Non_Vegetarian', 'Nonvegetarian', 'Omnivore', 'Omnivorous'])('recognizes the explicit non-vegetarian preference %s', preference => {
    expect(allowsNonVegetarianArtwork(preference)).toBe(true);
    expect(getDietScoreArtwork('proteinCoverage', '2026-09-02', preference)).toBeDefined();
  });

  it('updates the food-group SVG when the preference changes, without rewriting diary evidence', () => {
    const groups = [{ key: 'protein', label: 'Protein foods', observedFoods: ['Chicken from an older entry'] }];
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(<ReportFoodGroups groups={groups} reportKey="2026-09-02" dietPreference="Non vegetarian" />); });
    expect(tree.root.findAll(node => node.props.testID === 'report-illustration-protein').length).toBeGreaterThan(0);
    act(() => tree.update(<ReportFoodGroups groups={groups} reportKey="2026-09-02" dietPreference="Vegetarian" />));
    expect(tree.root.findAll(node => node.props.testID === 'report-illustration-protein')).toHaveLength(0);
    expect(tree.root.findAll(node => node.props.testID === 'report-illustration-proteinPlant').length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Chicken from an older entry');
    act(() => tree.unmount());
  });

  it('uses rotating plant SVGs in the protein scorecard for vegetarian and unknown profiles', () => {
    const props = { criterionKey: 'proteinCoverage', label: 'Protein foods', definition: 'Protein across meals.', value: 12, maxScore: 20, insight: 'Dal appeared at lunch.' };
    const illustrations = new Set<string>();
    for (const week of ['2026-09-02', '2026-09-09', '2026-09-16']) {
      let tree!: TestRenderer.ReactTestRenderer;
      act(() => { tree = TestRenderer.create(<DietScoreCriterion {...props} reportKey={week} dietPreference="Vegetarian" />); });
      expect(tree.root.findAllByType(Image)).toHaveLength(0);
      const art = tree.root.findAll(node => node.props.testID === 'report-illustration-proteinPlant' && node.props.xml)[0];
      illustrations.add(art.props.xml);
      act(() => tree.update(<DietScoreCriterion {...props} reportKey={week} />));
      expect(tree.root.findAllByType(Image)).toHaveLength(0);
      act(() => tree.update(<DietScoreCriterion {...props} reportKey={week} dietPreference="Non vegetarian" />));
      expect(tree.root.findAllByType(Image)).toHaveLength(1);
      act(() => tree.unmount());
    }
    expect(illustrations.size).toBe(3);
  });
});

it('uses contextual plant-safe SVG artwork when a bundled score photo fails to decode', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(<DietScoreCriterion criterionKey="plantFoods" label="Plants" definition="Named plants" value={7} maxScore={20} insight="Lunch named beans." reportKey="2026-09-02" />); });
  act(() => tree.root.findByType(Image).props.onError());
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('report-illustration-vegetables');
  // A new edition can use its own image; failure does not disable the library.
  act(() => tree.update(<DietScoreCriterion criterionKey="plantFoods" label="Plants" definition="Named plants" value={7} maxScore={20} insight="Lunch named beans." reportKey="2026-09-09" />));
  expect(tree.root.findAllByType(Image)).toHaveLength(1);
  act(() => tree.unmount());
});
