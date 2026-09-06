import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { DietCoachFeedback } from '../../services/dietDiaryService';
import {
  DietReportPendingState,
  DietReportStory,
  getDietReportEnrichmentState,
} from './DietScreen';

function completeReport(): DietCoachFeedback {
  return {
    schemaVersion: 8,
    weekStartDate: '2026-08-24',
    weekEndDate: '2026-08-30',
    generatedAt: '2026-08-30T10:00:00.000Z',
    title: 'Weekly Diet Report',
    headline: 'Lunch became more balanced',
    summary: 'The diary shows a repeatable lunch pattern and one clear opportunity at breakfast.',
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
      confidence: 'medium',
      confidenceNote: 'Based on nine described meals across five days.',
      components: [
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
        nextStep: 'Prepare oats and fruit the night before.',
        evidence: ['Two breakfasts described'],
        confidence: 'medium',
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
    coachNote: 'Keep the change small enough to repeat.',
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

describe('DietReportStory', () => {
  it('renders the complete report as immediately readable static content', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={completeReport()} />);
    });

    const text = renderedText(renderer);
    [
      'Lunch became more balanced',
      'Based on nine described meals across five days.',
      'Build a repeatable breakfast',
      'Set out oats and a bowl',
      'Protein appeared at lunch',
      'Breakfast had the least detail this week.',
      'Lunch variety improved',
      'Lunch often paired dal with rice.',
      'Pulses and legumes',
      'Regular lunch protein supports the strength goal.',
      'Simple breakfast formula',
      'One option prepared the night before',
      'Plants and fibre-rich foods',
      'Keep the change small enough to repeat.',
      'A useful extra note',
      'Build variety across the week',
      'Several dinners were not described.',
      'Which breakfast is easiest?',
      'When do you usually train?',
    ].forEach(value => expect(text).toContain(value));

    expect(text).toContain('PATTERN SCORE');
    expect(text).toContain('+4 vs last report');
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Weekly report summary').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '5 days with detail').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '9 described meals').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === '10 meal moments').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.horizontal === true)).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.accessibilityRole === 'adjustable')).toHaveLength(0);
    expect(renderer.root.findAll(node => typeof node.props.accessibilityState?.expanded === 'boolean')).toHaveLength(0);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(2);
    expect(renderer.root.findAll(node => node.props.testID === 'weekly-nutrition-art').length).toBeGreaterThan(0);
  });

  it('deduplicates sources and disables unsafe URLs', async () => {
    const report = completeReport();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} interactive={false} />);
    });

    const text = renderedText(renderer);
    expect(text).not.toContain('Duplicate source should not render');
    const linkLabels = new Set(
      renderer.root
        .findAll(node => node.props.accessibilityRole === 'link')
        .map(node => node.props.accessibilityLabel)
        .filter(Boolean),
    );
    expect(linkLabels).toEqual(new Set(['Open Build variety across the week from World Health Organization']));
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'Open Build variety across the week from World Health Organization').length).toBeGreaterThan(0);

    const unsafeSource = renderer.root.findAll(node => node.props.accessibilityLabel === 'Unlinked reference, attributed to Reference publisher');
    expect(unsafeSource.length).toBeGreaterThan(0);
    expect(unsafeSource.some(node => node.props.disabled === true)).toBe(true);
    expect(unsafeSource.every(node => node.props.accessibilityRole === undefined)).toBe(true);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
    expect(renderer.root.findAll(node => node.props.testID === 'weekly-nutrition-art')).toHaveLength(0);
  });

  it('uses a concise dedicated state instead of generated report content when no meals were described', async () => {
    const report = completeReport();
    report.stats.describedEntries = 0;
    report.stats.describedDaysLogged = 0;
    report.stats.memoryEntries = 0;
    report.stats.photoEntries = 3;
    report.enrichmentScore = 5;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DietReportStory feedback={report} />);
    });

    const text = renderedText(renderer);
    expect(renderer.root.findAll(node => node.props.testID === 'diet-report-no-evidence').length).toBeGreaterThan(0);
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === 'No diet report generated').length).toBeGreaterThan(0);
    expect(text).toContain('No report generated');
    expect(text).toContain('3 food photos were saved, but no meal descriptions were available for a useful review.');

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

describe('diet report enrichment', () => {
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
