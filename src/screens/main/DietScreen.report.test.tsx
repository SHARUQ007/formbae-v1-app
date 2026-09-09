import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { DietCoachFeedback } from '../../services/dietDiaryService';
import * as dietDiaryService from '../../services/dietDiaryService';
import { appTabBarStyle, hiddenTabBarStyle } from '../../navigation/tabBarStyle';
import {
  DietReportPendingState,
  DietReportNavigationBar,
  DietReportStory,
  formatDaysToNextDietReport,
  getDietReportEnrichmentState,
  useDietReportTabBar,
} from './DietScreen';

function completeReport(): DietCoachFeedback {
  return {
    schemaVersion: 17,
    weekStartDate: '2026-08-24',
    weekEndDate: '2026-08-30',
    generatedAt: '2026-08-30T10:00:00.000Z',
    title: 'Weekly Diet Report',
    headline: 'Lunch became more balanced',
    summary: 'The diary shows a repeatable lunch pattern and one clear opportunity at breakfast.',
    weekSummary: 'Lunches provided the clearest food picture, with dal, rice and beans appearing together. Two breakfasts were described, so the morning pattern is less clear. Several dinners were also missing from the diary.',
    nextFocus: 'Legacy focus should not replace the structured focus',
    highlights: [],
    status: 'ready',
    enrichmentScore: 50,
    requirements: { enrichment: 50 },
    stats: {
      loggedItems: 12,
      mealMoments: 10,
      daysLogged: 6,
      describedDaysLogged: 5,
      describedEntries: 9,
      describedMealMoments: 9,
      memoryEntries: 9,
      photoEntries: 3,
      workoutsCompleted: 2,
      mealCounts: { morning: 2, afternoon: 4, evening: 2, night: 2 },
      describedMealCounts: { morning: 2, afternoon: 3, evening: 2, night: 2 },
      recentFoods: ['dal', 'rice', 'beans'],
    },
    score: {
      availability: 'available',
      overall: 78,
      label: 'Strong week',
      trend: 4,
      components: [
        { key: 'foodVariety', label: 'Food variety', score: 16, maxScore: 20, insight: 'Several familiar staples were named across the diary.' },
        { key: 'proteinCoverage', label: 'Protein foods across meals', score: 16, maxScore: 20, insight: 'Dal and beans contributed named protein foods.' },
        { key: 'mealBalance', label: 'Meal balance', score: 11, maxScore: 15, insight: 'The clearest combinations were described at lunch.' },
        { key: 'wholeFoodPattern', label: 'Food preparation and processing', score: 11, maxScore: 15, insight: 'The diary described familiar staple-based meals.' },
        { key: 'goalAlignment', label: 'Fit with your goal', score: 8, maxScore: 10, insight: 'The recorded lunch structure fits the stated strength goal.' },
        {
          key: 'plantFoods',
          label: 'Plants and fibre-rich foods',
          score: 16,
          maxScore: 20,
          insight: 'Vegetables or fruit appeared in several described meals.',
        },
      ],
    },
    wins: [
      {
        title: 'Protein appeared at lunch',
        detail: 'Dal or beans appeared in three lunches.',
        evidence: 'Monday, Wednesday and Friday lunches',
      },
    ],
    priorityInsights: [
      {
        rank: 1,
        title: 'Make breakfast easier',
        observation: 'Breakfast had the least detail this week.',
        whyItMatters: 'A repeatable option can reduce morning decisions.',
        benefit: 'Breakfast becomes easier to repeat on busy mornings.',
        riskIfUnchanged: 'Breakfast may remain the least consistent meal in the diary.',
        nextStep: 'Prepare oats and fruit the night before.',
        evidence: ['Two breakfasts described'],
      },
    ],
    patterns: [
      {
        key: 'lunch-variety',
        title: 'Lunch variety improved',
        status: 'building',
        summary: 'Lunch included more than one food group on several days.',
        evidence: ['Dal, rice and beans were named together'],
      },
    ],
    foodGroups: [
      {
        key: 'pulses',
        label: 'Pulses and legumes',
        status: 'present',
        observedFoods: ['dal', 'beans'],
        insight: 'Keep these familiar protein foods in rotation.',
      },
    ],
    mealGuidance: [
      {
        mealType: 'Lunch',
        observedCount: 3,
        status: 'observed',
        pattern: 'Lunch often paired dal with rice.',
        advice: 'Add one familiar vegetable alongside it.',
      },
    ],
    mealRhythm: {
      summary: 'Lunch was the most consistently described meal.',
      strongestWindow: 'Lunch',
      opportunityWindow: 'Breakfast',
    },
    goalAlignment: {
      summary: 'Regular lunch protein supports the strength goal.',
      supports: ['Dal and beans at lunch'],
      gaps: ['Breakfast detail'],
    },
    trainingNutrition: {
      summary: 'Named protein foods appeared near two training days.',
      trainingDayAction: 'Repeat the familiar dal lunch after training.',
      restDayAction: 'Keep the same balanced lunch structure.',
    },
    nextWeek: {
      primaryFocus: 'Build a repeatable breakfast',
      whyItMatters: 'It targets the least-described meal without changing the whole day.',
      benefit: 'Breakfast becomes easier to repeat and review.',
      riskIfUnchanged: 'Morning meal coverage is likely to remain the main gap.',
      actions: ['Choose one breakfast option.', 'Prepare one ingredient the night before.'],
      implementationPlan: {
        cue: 'After cleaning up dinner',
        action: 'Set out oats and a bowl',
        fallback: 'Keep fruit and curd ready',
        successMeasure: 'Describe breakfast on three days',
      },
      trackingFocus: 'Name the breakfast protein when present.',
      mealBuilder: {
        title: 'Simple breakfast formula',
        plants: 'Fruit',
        protein: 'Curd or preferred protein food',
        carbs: 'Oats or whole-grain toast',
        extras: 'Seeds or spices',
      },
      smartSwaps: [
        {
          from: 'Breakfast decided at the last minute',
          to: 'One option prepared the night before',
          why: 'Makes the intended choice easier.',
        },
      ],
    },
    limitations: ['Several dinners were not described.'],
    safetyNotices: [
      {
        id: 'wellness-only',
        title: 'General guidance only',
        body: 'Use your clinician for advice about a medical condition.',
        severity: 'info',
      },
    ],
    sections: [
      {
        id: 'future-note',
        title: 'A useful extra note',
        summary: 'This newer field remains readable.',
        items: ['A future-format detail'],
      },
    ],
    facts: [
      {
        id: 'valid-guide',
        title: 'Build variety across the week',
        body: 'A varied pattern can make nutrient coverage easier.',
        sourceLabel: 'World Health Organization',
        sourceUrl: 'https://www.who.int/healthy-diet',
      },
      {
        id: 'duplicate-guide',
        title: 'Duplicate source should not render',
        body: 'Duplicate body should not render.',
        sourceLabel: 'WHO duplicate',
        sourceUrl: 'https://www.who.int/healthy-diet',
      },
      {
        id: 'unsafe-guide',
        title: 'Unlinked reference',
        body: 'The attribution remains readable without an actionable unsafe URL.',
        sourceLabel: 'Reference publisher',
        sourceUrl: 'http://example.com/not-secure',
      },
    ],
    questionsForNextWeek: ['Which breakfast is easiest?', 'When do you usually train?'],
  };
}

function pendingReport(enrichmentScore: number): DietCoachFeedback {
  return {
    weekStartDate: '2026-08-24',
    weekEndDate: '2026-08-30',
    generatedAt: '',
    title: 'Weekly Diet Report',
    summary: '',
    nextFocus: '',
    highlights: [],
    status: 'pending',
    nextInDays: 1,
    enrichmentScore,
    requirements: { enrichment: 50 },
    stats: {
      loggedItems: 8,
      mealMoments: 7,
      daysLogged: 4,
      describedEntries: 7,
      memoryEntries: 7,
      photoEntries: 1,
      mealCounts: { morning: 2, afternoon: 3, evening: 1, night: 1 },
      recentFoods: ['oats', 'dal'],
    },
  };
}

function renderedText(renderer: ReactTestRenderer.ReactTestRenderer) {
  const collect = (node: unknown): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(collect).join('');
    if (node && typeof node === 'object' && 'children' in node) {
      return collect((node as { children?: unknown }).children);
    }
    return '';
  };
  return collect(renderer.toJSON());
}

async function expandDetail(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const button = renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  expect(button).toBeDefined();
  await ReactTestRenderer.act(() => button.props.onPress());
}

describe('DietReportStory', () => {
  afterEach(() => jest.restoreAllMocks());
  it('shows a compact weekly review, all scoring criteria and detailed food evidence without a method disclosure', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={completeReport()} />);
    });
    const text = renderedText(renderer);
    [
      'Lunch became more balanced', 'THIS WEEK IN REVIEW', completeReport().weekSummary!,
      'Your nutrition scorecard', 'DIARY PATTERN SCORE', 'SCORING CRITERIA',
      'Build a repeatable breakfast', 'Protein appeared at lunch',
      'Breakfast had the least detail this week.', 'A repeatable option can reduce morning decisions.',
      'Details · 1 diary note', 'Several dinners were not described.',
      'Describe breakfast on three days', 'Name the breakfast protein when present.', 'Which breakfast is easiest?',
      'Simple breakfast formula', 'Pulses and legumes', 'Training nutrition',
      'Plants & fibre', 'Protein foods', 'Goal fit', '+4 pointsvs last report',
      'Your meals, in detail', 'Build your plate', 'Read & explore',
    ].forEach(value => expect(text).toContain(value));
    expect(text.indexOf('What matters this week')).toBeLessThan(text.indexOf('Foods named in your diary'));
    expect(text.indexOf('Foods named in your diary')).toBeLessThan(text.indexOf('Your next 7 days'));
    expect(text.indexOf('Your next 7 days')).toBeLessThan(text.indexOf('Which breakfast is easiest?'));
    expect(text.match(/Build a repeatable breakfast/g)).toHaveLength(1);
    expect(text.match(/Breakfast had the least detail this week\./g)).toHaveLength(1);
    expect(text).not.toContain(completeReport().summary);
    expect(text).not.toContain('When do you usually train?');
    expect(text).not.toContain('Method & sources');
    expect(text).not.toContain('How to read');
    expect(text).not.toContain('If unchanged');
    expect(text).toContain('Breakfast decided at the last minute');
    expect(text).not.toContain('Update the app to see all details');
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '5 days with detail').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '9 described meals').length).toBeGreaterThan(0);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(1);
    const criteria = new Set(renderer.root.findAll(node => node.props.accessibilityRole === 'progressbar').map(node => node.props.accessibilityLabel));
    expect(criteria.size).toBe(6);
    expect(criteria.has('Plants and fibre-rich foods: 16 out of 20')).toBe(true);
    expect(renderer.root.findAll(node => node.props.testID === 'diet-report-editorial-art').length).toBeGreaterThan(0);
    expect(text).not.toContain('Add one familiar vegetable alongside it.');
    expect(text).not.toContain('Repeat the familiar dal lunch after training.');
  });

  it('uses the concise legacy summary instead of displaying a saved wall of text', async () => {
    const report = completeReport();
    report.weekSummary = `Long legacy narrative. ${'This older report included lengthy descriptions of recorded foods across every day and meal window. '.repeat(9)}`;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<DietReportStory feedback={report} interactive={false} />); });
    const text = renderedText(renderer);
    expect(text).toContain(report.summary);
    expect(text).not.toContain('Long legacy narrative.');
    expect(text).toContain('What matters this week');
    expect(text).toContain('Your meals, in detail');
    expect(text).toContain('Describe breakfast on three days');
  });

  it('keeps decimal figures within a short complete narrative and avoids longer sentence lists', async () => {
    const report = completeReport();
    report.weekSummary = 'The first observation uses 2.5 as a recorded figure. The second observation stays separate. The third closes the review.';
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />); });
    expect(renderedText(renderer)).toContain(report.weekSummary);
    report.weekSummary = 'First observation. Second observation. Third observation. Fourth observation.';
    await ReactTestRenderer.act(() => renderer.update(<DietReportStory feedback={report} />));
    expect(renderedText(renderer)).toContain(report.summary);
    expect(renderedText(renderer)).not.toContain('Fourth observation.');
  });

  it('lets archived readers browse deduplicated source articles and return to the report', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={completeReport()} interactive={false} />);
    });
    const text = renderedText(renderer);
    expect(text).not.toContain('Duplicate source should not render');
    expect(text).not.toContain('Unlinked reference');
    expect(text).toContain('Read & explore');
    expect(text).toContain('The plan for that week');
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
    await expandDetail(renderer, 'Read Build variety across the week from World Health Organization');
    expect(renderer.root.findAll(node => node.props.source?.uri === 'https://www.who.int/healthy-diet').length).toBeGreaterThan(0);
    await expandDetail(renderer, 'Back to report');
    expect(renderer.root.findAll(node => node.props.source?.uri === 'https://www.who.int/healthy-diet')).toHaveLength(0);
  });

  it('retains criterion definitions without inventing missing legacy scores', async () => {
    const report = completeReport();
    report.score!.components = report.score!.components.filter(component => component.key === 'plantFoods');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />); });
    const criteria = new Set(renderer.root.findAll(node => node.props.accessibilityRole === 'progressbar').map(node => node.props.accessibilityLabel));
    expect(criteria).toEqual(new Set(['Plants and fibre-rich foods: 16 out of 20']));
    expect(renderedText(renderer)).toContain('The range of different foods and food groups described.');
    expect(renderedText(renderer)).toContain('—of 20');
    expect(renderedText(renderer)).not.toContain('Not assessed from the available report data.');
  });

  it('uses the structured action contract in priority order and gives repeated execution text to the measurable target', async () => {
    const report = completeReport();
    report.nextWeek!.actionPlan = [
      { id: 'second', priority: 2, title: 'Keep a practical backup', why: 'A familiar option lowers effort.', cue: 'Before your grocery shop', steps: ['Add curd to the list.'], fallback: 'Use a preferred dairy alternative.', successMeasure: 'Have one backup available this week.', sourceInsightId: 'breakfast', evidenceIds: [] },
      { id: 'first', priority: 1, title: 'Try one breakfast routine', why: 'Make the morning decision easier.', cue: 'After dinner on Sunday', steps: ['Describe breakfast on three days', 'Put oats beside a bowl.'], fallback: 'Choose fruit and curd.', successMeasure: 'Describe breakfast on three days', sourceInsightId: 'breakfast', evidenceIds: [] },
    ];
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />);
    });
    const text = renderedText(renderer);
    expect(text.indexOf('Try one breakfast routine')).toBeLessThan(text.indexOf('Keep a practical backup'));
    expect(text.match(/Describe breakfast on three days/g)).toHaveLength(1);
    expect(text).toContain('YOUR CHECK-IN TARGETDescribe breakfast on three days');
    expect(text).toContain('Put oats beside a bowl.');
    expect(text).toContain('After dinner on Sunday');
    expect(text).toContain('Choose fruit and curd.');
    expect(text).not.toContain('Build a repeatable breakfast');
    expect(text).not.toContain('Set out oats and a bowl');
    expect(text).not.toContain('Breakfast decided at the last minute');
    expect(text).not.toContain('One option prepared the night before');
    expect(text).toContain('Simple breakfast formula');
  });

  it('keeps food-group labels grounded in named foods without implying frequency or confirmed whole grains', async () => {
    const report = completeReport();
    report.foodGroups = [
      { key: 'wholeGrains', label: 'Whole grains and millets', status: 'present', observedFoods: ['multigrain bread', 'roti'], insight: 'Unsupported whole-grain assertion.' },
      { key: 'fruit', label: 'Fruit', status: 'limited', observedFoods: ['kiwi juice'], insight: 'Unsupported whole-fruit assertion.' },
      { key: 'dairy', label: 'Milk and curd', status: 'limited', observedFoods: [], insight: '' },
    ];
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />); });
    const text = renderedText(renderer);
    expect(text).toContain('Grain foods described');
    expect(text).toContain('Whole-grain content is unconfirmed for foods without ingredient details.');
    expect(text).toContain('Juice is named here; whole fruit is not described.');
    expect(text).toContain('Milk and curdNot enough detail');
    expect(text).not.toContain('Seen often');
    expect(text).not.toContain('Seen less often');
    expect(text).not.toContain('Unsupported whole-grain assertion.');
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Milk and curd. Not enough detail.').length).toBeGreaterThan(0);
  });

  it('keeps factual quantities and negation distinct while removing identical observations', async () => {
    const report = completeReport();
    const base = report.priorityInsights![0];
    report.priorityInsights = [
      { ...base, title: 'Breakfast evidence', observation: 'Protein was named in 2 breakfast entries this week.' },
      { ...base, title: 'Lunch evidence', observation: 'Protein was named in 5 lunch entries this week.', evidence: ['No protein was named in two dinner entries.'] },
    ];
    report.wins = [{ title: 'Dinner coverage', detail: 'Protein was named in two dinner entries.', evidence: 'Two descriptions are available.' }];
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />);
    });
    const text = renderedText(renderer);
    expect(text).toContain('Protein was named in 2 breakfast entries this week.');
    expect(text).toContain('Protein was named in 5 lunch entries this week.');
    await expandDetail(renderer, 'Read insight details: Lunch evidence');
    expect(renderedText(renderer)).toContain('No protein was named in two dinner entries.');
    expect(text).toContain('Protein was named in two dinner entries.');
    expect(text.match(/A repeatable option can reduce morning decisions\./g)).toHaveLength(1);
  });

  it('preserves original question indices and saved answers after unrelated questions are filtered', async () => {
    const report = completeReport();
    report.questionsForNextWeek = ['When do you usually train?', 'Which breakfast is easiest?'];
    report.questionResponses = [
      { questionIndex: 0, question: 'When do you usually train?', answer: 'Evenings' },
      { questionIndex: 1, question: 'Which breakfast is easiest?', answer: 'Oats and curd' },
    ];
    const save = jest.spyOn(dietDiaryService, 'submitDietReportResponses').mockResolvedValue({ ok: true, answers: [] });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />);
    });
    const input = renderer.root.findByType(TextInput);
    expect(input.props.value).toBe('Oats and curd');
    await ReactTestRenderer.act(() => input.props.onChangeText('Fruit and curd'));
    const button = renderer.root.findAll(node => node.props.accessibilityLabel === 'Save answers for the next diet report' && typeof node.props.onPress === 'function')[0];
    await ReactTestRenderer.act(() => button.props.onPress());
    expect(save).toHaveBeenCalledWith({ reportGeneratedAt: report.generatedAt, answers: [{ questionIndex: 1, answer: 'Fruit and curd' }] });
    expect(renderedText(renderer)).toContain('1 of 1 saved');
  });

  it('shows limited evidence and deterministic fallback provenance without implying a personalised review', async () => {
    const report = completeReport();
    report.generationMethod = 'data_summary';
    report.evidenceCoverage = { level: 'limited', summary: 'Two days support this review.', observedDays: 2, periodDays: 7, limitations: ['Several dinners were not described.'] };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />);
    });
    expect(renderedText(renderer)).toContain('Limited evidence');
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '2 days with detail').length).toBeGreaterThan(0);
    expect(renderedText(renderer).match(/Several dinners were not described\./g)).toHaveLength(1);
    expect(renderedText(renderer)).toContain('Diary summary · based on recorded data');
    expect(renderedText(renderer)).toContain('Personalised analysis is temporarily unavailable; this review uses saved diary data.');
  });

  it('counts unique described meals when available and labels legacy entry counts accurately', async () => {
    const report = completeReport();
    report.stats.describedMealMoments = 6;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />);
    });
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '6 described meals').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '9 described meals')).toHaveLength(0);
    delete report.stats.describedMealMoments;
    await ReactTestRenderer.act(() => renderer.update(<DietReportStory feedback={report} />));
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '9 food descriptions').length).toBeGreaterThan(0);
  });

  it('keeps long meal evidence readable while preserving access to the original excerpt', async () => {
    const report = completeReport();
    const evidence = `Monday breakfast: ${'oats, curd, fruit and seeds; '.repeat(15)}original final detail.`;
    report.priorityInsights![0].evidence = [evidence, 'Tuesday breakfast: toast.', 'Third item stays out of the short review.'];
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />);
    });
    expect(renderedText(renderer)).not.toContain('original final detail.');
    expect(renderedText(renderer)).not.toContain('Third item stays out');
    await expandDetail(renderer, 'Read insight details: Make breakfast easier');
    expect(renderedText(renderer)).toContain(evidence);
    expect(renderedText(renderer)).toContain('Third item stays out of the short review.');
    await expandDetail(renderer, 'Close insight details: Make breakfast easier');
    expect(renderedText(renderer)).not.toContain('original final detail.');
  });

  it('uses a concise dedicated state instead of generated report content when no meals were described', async () => {
    const report = completeReport();
    report.stats.describedEntries = 0;
    report.stats.describedDaysLogged = 0;
    report.stats.memoryEntries = 0;
    report.stats.photoEntries = 3;
    report.enrichmentScore = 5;
    const onLogMeal = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} onLogMeal={onLogMeal} />);
    });

    const text = renderedText(renderer);
    expect(renderer.root.findAll(node => node.props.testID === 'diet-report-no-evidence').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Diet report needs more meal detail').length).toBeGreaterThan(0);
    expect(text).toContain('Build a clearer food picture');
    expect(text).toContain('3 food photos saved. Add food names and sides so they count.');

    [
      'Lunch became more balanced',
      'The diary shows a repeatable lunch pattern and one clear opportunity at breakfast.',
      'Based on nine described meals across five days.',
      'Build a repeatable breakfast',
      'Choose one breakfast option.',
      'Protein appeared at lunch',
      'Breakfast had the least detail this week.',
      'Strong week',
      'Plants and fibre-rich foods',
      'Keep the change small enough to repeat.',
      'Build variety across the week',
      'Which breakfast is easiest?',
      'PATTERN SCORE',
      '/100',
      'REPORT ENRICHMENT',
      'REPORT EVIDENCE',
      '5%',
      '50%',
    ].forEach(value => expect(text).not.toContain(value));

    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Weekly report summary')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'link')).toHaveLength(0);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'progressbar')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.testID === 'weekly-nutrition-art')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.testID === 'diet-report-empty-art').length).toBeGreaterThan(0);
    const mealActions = renderer.root.findAll(node => node.props.accessibilityLabel === 'Log a meal and add food details');
    expect(mealActions.length).toBeGreaterThan(0);
    const mealAction = mealActions.find(node => node.props.onPress === onLogMeal);
    expect(mealAction).toBeDefined();
    await ReactTestRenderer.act(() => mealAction?.props.onPress());
    expect(onLogMeal).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['male', 'diet-report-empty-hero-male.jpg'],
    ['female', 'diet-report-empty-hero.jpg'],
    ['other', 'diet-report-empty-hero-neutral.jpg'],
  ])('matches the empty-report artwork to a %s profile', async (artworkGender, filename) => {
    const report = completeReport();
    report.stats.describedEntries = 0;
    report.stats.describedDaysLogged = 0;
    report.stats.memoryEntries = 0;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <DietReportStory feedback={report} artworkGender={artworkGender} />,
      );
    });

    const artwork = renderer.root.findByProps({ testID: 'diet-report-empty-art' });
    expect(String(artwork.props.source?.testUri || '')).toContain(filename);
  });

  it('keeps an archived report with no described meals concise and read-only', async () => {
    const report = completeReport();
    report.stats.describedEntries = 0;
    report.stats.describedDaysLogged = 0;
    report.stats.memoryEntries = 0;
    report.stats.photoEntries = 0;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} interactive={false} />);
    });

    const text = renderedText(renderer);
    expect(text).toContain('No report generated');
    expect(text).toContain('No described meals were available for this period.');
    expect(text).not.toContain('REPORT ENRICHMENT');
    expect(text).not.toContain('REPORT EVIDENCE');
    expect(text).not.toContain('PATTERN SCORE');
    expect(text).not.toContain('/100');
    expect(text).not.toContain('50%');
    expect(text).not.toContain('Lunch became more balanced');
    expect(text).not.toContain('Strong week');
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'progressbar')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'link')).toHaveLength(0);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.testID === 'diet-report-empty-art')).toHaveLength(0);
  });

  it('suppresses generated report content when an available overall score is explicitly zero', async () => {
    const report = completeReport();
    report.score = {
      ...report.score!,
      availability: 'available',
      overall: 0,
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} interactive={false} />);
    });

    const text = renderedText(renderer);
    expect(renderer.root.findAll(node => node.props.testID === 'diet-report-no-evidence').length).toBeGreaterThan(0);
    expect(text).toContain('No report generated');
    expect(text).toContain('This review did not produce a reliable score, so it was not published.');
    [
      'Lunch became more balanced',
      'The diary shows a repeatable lunch pattern and one clear opportunity at breakfast.',
      'PATTERN SCORE',
      'Strong week',
      'Based on nine described meals across five days.',
      'Build a repeatable breakfast',
      'Protein appeared at lunch',
      'Breakfast had the least detail this week.',
      'Keep the change small enough to repeat.',
      'Build variety across the week',
      '/100',
      'REPORT ENRICHMENT',
      'REPORT EVIDENCE',
      '50%',
    ].forEach(value => expect(text).not.toContain(value));
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Weekly report summary')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'progressbar')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'link')).toHaveLength(0);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('suppresses generated report content when the score reports insufficient evidence', async () => {
    const report = completeReport();
    report.score = {
      ...report.score!,
      availability: 'insufficientEvidence',
      overall: 78,
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} interactive={false} />);
    });

    const text = renderedText(renderer);
    expect(renderer.root.findAll(node => node.props.testID === 'diet-report-no-evidence').length).toBeGreaterThan(0);
    expect(text).toContain('No report generated');
    expect(text).toContain('This review did not produce a reliable score, so it was not published.');
    [
      'Lunch became more balanced',
      'The diary shows a repeatable lunch pattern and one clear opportunity at breakfast.',
      'PATTERN SCORE',
      'Strong week',
      'Based on nine described meals across five days.',
      'Build a repeatable breakfast',
      'Protein appeared at lunch',
      'Breakfast had the least detail this week.',
      'Keep the change small enough to repeat.',
      'Build variety across the week',
      '/100',
      'REPORT ENRICHMENT',
      'REPORT EVIDENCE',
      '50%',
    ].forEach(value => expect(text).not.toContain(value));
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Weekly report summary')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'progressbar')).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'link')).toHaveLength(0);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });
});

describe('Diet report navigation', () => {
  it('keeps icon-only Back and right-aligned History in a single row with accessible touch targets', async () => {
    const onBack = jest.fn();
    const onHistory = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportNavigationBar title="Diet report" backLabel="Back to food diary" onBack={onBack} onHistory={onHistory} />);
    });
    expect(renderedText(renderer)).toBe('Diet reportHistory');
    const header = renderer.root.findByProps({ testID: 'diet-report-navigation' });
    expect(StyleSheet.flatten(header.props.style)).toMatchObject({ flexDirection: 'row' });
    expect(StyleSheet.flatten(header.props.style).flexWrap).not.toBe('wrap');
    const back = renderer.root.findAll(node => node.props.accessibilityLabel === 'Back to food diary' && node.props.onPress)[0];
    const history = renderer.root.findAll(node => node.props.accessibilityLabel === 'See previous diet reports' && node.props.onPress)[0];
    expect(StyleSheet.flatten(back.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(history.props.style)).toMatchObject({ minHeight: 44, flexShrink: 0 });
    await ReactTestRenderer.act(() => back.props.onPress());
    await ReactTestRenderer.act(() => history.props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it('hides tabs while reading and restores the existing tab style on blur, back, and unmount', async () => {
    const listeners = new Map<string, () => void>();
    const navigation = {
      setOptions: jest.fn(),
      isFocused: jest.fn(() => true),
      addListener: jest.fn((event: string, callback: () => void) => {
        listeners.set(event, callback);
        return () => listeners.delete(event);
      }),
    };
    function Harness({ reading }: { reading: boolean }) {
      useDietReportTabBar(navigation as unknown as Parameters<typeof useDietReportTabBar>[0], reading);
      return null;
    }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<Harness reading />); });
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ tabBarStyle: hiddenTabBarStyle });
    await ReactTestRenderer.act(() => listeners.get('blur')?.());
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ tabBarStyle: appTabBarStyle });
    await ReactTestRenderer.act(() => listeners.get('focus')?.());
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ tabBarStyle: hiddenTabBarStyle });
    await ReactTestRenderer.act(() => renderer.update(<Harness reading={false} />));
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ tabBarStyle: appTabBarStyle });
    expect(listeners.size).toBe(0);
    await ReactTestRenderer.act(() => renderer.update(<Harness reading />));
    await ReactTestRenderer.act(() => renderer.unmount());
    expect(navigation.setOptions).toHaveBeenLastCalledWith({ tabBarStyle: appTabBarStyle });
    expect(listeners.size).toBe(0);
  });
});

describe('diet report enrichment', () => {
  it('formats the report card countdown as its secondary text', () => {
    expect(formatDaysToNextDietReport(1)).toBe('1 day to next report');
    expect(formatDaysToNextDietReport(7)).toBe('7 days to next report');
  });

  it('keeps a below-threshold pending state concise, actionable, and accessible', async () => {
    const feedback = pendingReport(49);
    expect(getDietReportEnrichmentState(feedback)).toMatchObject({
      available: true,
      score: 49,
      required: 50,
      remaining: 1,
      requirementMet: false,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <DietReportPendingState feedback={feedback} foodDetails={7} daysWithDetail={4} />,
      );
    });

    const text = renderedText(renderer);
    expect(text.match(/49%/g)).toHaveLength(1);
    expect(text.match(/50%/g)).toHaveLength(1);
    expect(text).toContain('Minimum 50%');
    expect(text).toContain('Add short meal notes across a few days so the report can identify useful patterns.');
    expect(text).toContain('1 point to go');
    expect(text.match(/calorie/gi)).toHaveLength(1);
    expect(text).not.toContain('calorie estimates');
    expect(text).not.toContain('Keep logging naturally');
    expect(text.match(/food details/gi)).toHaveLength(1);
    expect(text.match(/days with detail/gi)).toHaveLength(1);

    const progressbars = renderer.root.findAll(node => node.props.accessibilityRole === 'progressbar');
    expect(new Set(progressbars.map(node => node.props.accessibilityLabel))).toEqual(new Set(['Evidence for next diet report']));
    expect(progressbars.some(node => (
      node.props.accessibilityValue?.min === 0 &&
      node.props.accessibilityValue?.max === 100 &&
      node.props.accessibilityValue?.now === 49 &&
      node.props.accessibilityValue?.text === '49 percent. Minimum 50 percent. 1 percentage point remaining.'
    ))).toBe(true);
    expect(renderer.root.findAll(node => node.props.horizontal === true)).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'adjustable')).toHaveLength(0);
  });

  it('treats exactly 50 as eligible and remains compatible with a ready report payload', async () => {
    const feedback = completeReport();
    expect(getDietReportEnrichmentState(feedback)).toMatchObject({
      available: true,
      score: 50,
      required: 50,
      remaining: 0,
      requirementMet: true,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={feedback} />);
    });

    const text = renderedText(renderer);
    expect(text).toContain('Lunch became more balanced');
    expect(text).not.toContain('Reach 50% to unlock your report');
    expect(renderer.root.findAll(node => String(node.props.accessibilityLabel || '').startsWith('Diet report enrichment'))).toHaveLength(0);
  });

  it('does not invent an enrichment score when legacy or malformed data omits it', async () => {
    expect(getDietReportEnrichmentState(null)).toEqual({
      available: false,
      score: 0,
      required: 50,
      remaining: 50,
      requirementMet: false,
      progress: 0,
    });
    expect(getDietReportEnrichmentState({
      enrichmentScore: Number.NaN,
      requirements: { enrichment: Number.POSITIVE_INFINITY },
    })).toEqual({
      available: false,
      score: 0,
      required: 50,
      remaining: 50,
      requirementMet: false,
      progress: 0,
    });
    expect(getDietReportEnrichmentState({
      enrichmentScore: '49',
      requirements: { enrichment: '50' },
    } as unknown as Pick<DietCoachFeedback, 'enrichmentScore' | 'requirements'>)).toEqual({
      available: false,
      score: 0,
      required: 50,
      remaining: 50,
      requirementMet: false,
      progress: 0,
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <DietReportPendingState feedback={null} foodDetails={0} daysWithDetail={0} />,
      );
    });

    const text = renderedText(renderer);
    expect(text).toContain('Your report is getting ready');
    expect(text).toContain('Meal details are syncing. Your evidence score will appear shortly.');
    expect(text).toContain('Updates after meal details sync');
    expect(text.match(/50%/g)).toHaveLength(1);
    expect(text.match(/calorie/gi)).toHaveLength(1);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'progressbar')).toHaveLength(0);
  });
});

it('keeps the approved native tree when a model requests different presentation', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const report = completeReport();
  await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />); });
  const approved = JSON.stringify(renderer.toJSON());
  const modelPresentation = {
    ...report, sectionOrder: ['questions', 'ads'], template: { id: 'new-template', version: 999 },
    styles: { backgroundColor: 'green', height: 99999 }, imageUrl: 'https://example.test/untrusted.jpg',
    sections: [{ type: 'webview', html: '<h1>Replace the report</h1>' }],
  } as unknown as DietCoachFeedback;
  await ReactTestRenderer.act(() => { renderer.update(<DietReportStory feedback={modelPresentation} />); });
  expect(JSON.stringify(renderer.toJSON())).toEqual(approved);
  await ReactTestRenderer.act(() => renderer.unmount());
});

it('renders malformed section data using fixed criteria without invented scores', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const report = {
    ...completeReport(),
    priorityInsights: [null, { title: {}, observation: [] }], foodGroups: 'invalid',
    mealGuidance: [{ mealType: {}, pattern: [] }], questionsForNextWeek: [null, {}],
    nextWeek: { actionPlan: [null, { title: {}, steps: 'invalid' }], mealBuilder: 'invalid' },
    score: { overall: 40, availability: 'available', components: [
      { key: 'foodVariety', label: 'Injected criterion', score: 999, maxScore: 1000, insight: 'Do not show invalid scoring.' },
      null,
    ] },
  } as unknown as DietCoachFeedback;
  await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />); });
  const text = renderedText(renderer);
  expect(text).toContain('Food variety');
  expect(text).toContain('—of 20');
  expect(text).not.toContain('Injected criterion');
  expect(text).not.toContain('Do not show invalid scoring.');
  await ReactTestRenderer.act(() => renderer.unmount());
});
