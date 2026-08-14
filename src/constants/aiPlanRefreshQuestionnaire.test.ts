import {
  AI_PLAN_REFRESH_QUESTIONS,
  emptyAiPlanRefreshAnswers,
  isAiPlanRefreshComplete,
  sanitizeAiPlanRefreshAnswers,
} from './aiPlanRefreshQuestionnaire';

describe('AI plan refresh questionnaire', () => {
  it('sanitizes corrupt persisted draft values', () => {
    const answers = sanitizeAiPlanRefreshAnswers({
      completionPattern: 'Completed most workouts',
      recovery: 42,
      unknown: 'ignored',
    });

    expect(answers.completionPattern).toBe('Completed most workouts');
    expect(answers.recovery).toBe('');
    expect('unknown' in answers).toBe(false);
  });

  it('requires details when an Other option is selected', () => {
    const question = AI_PLAN_REFRESH_QUESTIONS.find(item => item.key === 'recovery');
    expect(question).toBeDefined();
    const answers = {
      ...emptyAiPlanRefreshAnswers,
      recovery: 'Other / add detail',
    };

    expect(isAiPlanRefreshComplete(answers, [question!])).toBe(false);
    expect(
      isAiPlanRefreshComplete(
        { ...answers, recoveryNotes: 'Shoulder felt tight after pressing.' },
        [question!],
      ),
    ).toBe(true);
  });
});
