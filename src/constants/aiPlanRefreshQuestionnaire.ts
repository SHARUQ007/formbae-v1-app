export type AiPlanRefreshKey =
  | 'completionPattern'
  | 'missedWorkoutTypes'
  | 'missedReason'
  | 'missedReasonDetails'
  | 'difficulty'
  | 'recovery'
  | 'recoveryNotes'
  | 'schedule'
  | 'nextFocus'
  | 'improvementNotes'
  | 'improvementDetails';

export type AiPlanRefreshAnswers = Record<AiPlanRefreshKey, string>;

export type AiPlanRefreshQuestion = {
  key: AiPlanRefreshKey;
  title: string;
  detail: string;
  options: string[];
  multiple?: boolean;
  notesKey?: AiPlanRefreshKey;
  notesPlaceholder?: string;
};

export const emptyAiPlanRefreshAnswers: AiPlanRefreshAnswers = {
  completionPattern: '',
  missedWorkoutTypes: '',
  missedReason: '',
  missedReasonDetails: '',
  difficulty: '',
  recovery: '',
  recoveryNotes: '',
  schedule: '',
  nextFocus: '',
  improvementNotes: '',
  improvementDetails: '',
};

export const AI_PLAN_REFRESH_QUESTIONS: AiPlanRefreshQuestion[] = [
  {
    key: 'completionPattern',
    title: 'How did the last two weeks go?',
    detail: 'Pick the pattern that best matches what actually happened.',
    options: [
      'Completed most workouts',
      'Skipped full workouts',
      'Did quick workouts instead of standard',
      'Skipped strength days',
      'Skipped cardio or conditioning',
      'Skipped mobility or recovery',
      'Barely trained',
    ],
  },
  {
    key: 'missedWorkoutTypes',
    title: 'Which workouts did you not do?',
    detail: 'This tells Ava what to redesign or replace.',
    multiple: true,
    options: [
      'None',
      'Upper body',
      'Lower body',
      'Full body',
      'Cardio or conditioning',
      'Core',
      'Mobility or recovery',
      'Quick workouts',
      'Long workouts',
    ],
  },
  {
    key: 'missedReason',
    title: 'Why did you miss them?',
    detail: 'Choose every reason that matters so the next plan removes the real blocker.',
    multiple: true,
    notesKey: 'missedReasonDetails',
    notesPlaceholder: 'Add any specific reason, exercise, day, equipment issue, or schedule problem.',
    options: [
      'No time',
      'Too hard',
      'Too easy or boring',
      'Pain or discomfort',
      'Low energy or poor sleep',
      'Equipment unavailable',
      'Did not understand exercises',
      'Travel or work',
      'Lost motivation',
      'Other',
    ],
  },
  {
    key: 'difficulty',
    title: 'How should the intensity change?',
    detail: 'This calibrates volume, rest, exercise selection, and progression.',
    options: [
      'Keep it similar',
      'Make it easier',
      'Make it harder',
      'Reduce volume',
      'Increase volume slowly',
      'Use longer rests',
      'Use shorter workouts',
    ],
  },
  {
    key: 'recovery',
    title: 'How is your body recovering?',
    detail: 'Pain, soreness, sleep, and stress should change the next two-week block.',
    notesKey: 'recoveryNotes',
    notesPlaceholder: 'Mention pain areas, fatigue, soreness, sleep, stress, or movements to avoid.',
    options: [
      'Recovered well',
      'Some soreness but manageable',
      'Too sore or fatigued',
      'Joint pain',
      'Low sleep or high stress',
      'Need lower impact',
    ],
  },
  {
    key: 'schedule',
    title: 'What schedule can you follow now?',
    detail: 'The next plan should fit the time you can realistically give.',
    options: [
      '2 days / 20-30 min',
      '3 days / 30-40 min',
      '4 days / 40-50 min',
      '5 days / 45-60 min',
      'Keep the same schedule',
      'Need shorter workouts',
    ],
  },
  {
    key: 'nextFocus',
    title: 'What should the next plan focus on?',
    detail: 'Pick the outcome that matters most for the coming two weeks.',
    options: [
      'Consistency',
      'Fat loss and toning',
      'Strength',
      'Muscle gain',
      'Stamina',
      'Mobility and pain-aware training',
      'Posture and core',
      'Same focus',
    ],
  },
  {
    key: 'improvementNotes',
    title: 'Anything else to improve?',
    detail: 'Add the nuance the options missed. This answer gets high priority.',
    notesKey: 'improvementDetails',
    notesPlaceholder: 'Exercises to keep or avoid, trainer tone, equipment, schedule, motivation, or anything that would make the plan easier to follow.',
    options: [
      'No other changes',
      'Need more variety',
      'Need simpler exercises',
      'Need more coaching cues',
      'Need less equipment',
      'Need more challenge',
      'Other',
    ],
  },
];

export function splitRefreshSelections(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function toggleRefreshSelection(currentValue: string, option: string, multiple?: boolean) {
  if (!multiple) return option;
  if (option === 'None') return currentValue === 'None' ? '' : 'None';
  const current = splitRefreshSelections(currentValue).filter((entry) => entry !== 'None');
  return current.includes(option)
    ? current.filter((entry) => entry !== option).join(', ')
    : [...current, option].join(', ');
}

export function isAiPlanRefreshComplete(answers: AiPlanRefreshAnswers) {
  return AI_PLAN_REFRESH_QUESTIONS.every((question) => Boolean(answers[question.key]?.trim()));
}

export function buildAiPlanRefreshPayload(answers: AiPlanRefreshAnswers): Record<string, string> {
  const currentPriority =
    'CURRENT TWO-WEEK CHECK-IN HAS TOP PRIORITY. If these answers conflict with onboarding/profile/old feedback, follow these latest answers while keeping safety constraints.';
  return {
    currentActivity: `Biweekly completion pattern: ${answers.completionPattern}. Specific workout types missed: ${answers.missedWorkoutTypes}.`,
    intensity: answers.difficulty,
    trainingDays: answers.schedule,
    recovery: answers.recovery,
    limitations: `${answers.recovery}. Recovery notes: ${answers.recoveryNotes}. Reasons workouts were missed: ${answers.missedReason}. Missed-workout detail: ${answers.missedReasonDetails}.`,
    focusAreas: answers.nextFocus,
    preferredExercises: `Keep or emphasize anything consistent with: ${answers.nextFocus}. Additional improvement request: ${answers.improvementNotes}. ${answers.improvementDetails}.`,
    dislikedExercises: `Reduce, replace, or simplify workout types/exercises the user skipped: ${answers.missedWorkoutTypes}. Reasons: ${answers.missedReason}. ${answers.missedReasonDetails}.`,
    coachingStyle: 'Biweekly AI plan refresh. Be practical, concise, progressive, and fit both the web and mobile workout views.',
    accountabilityPreference: answers.improvementNotes,
    biweeklyCompletionPattern: answers.completionPattern,
    biweeklySkippedWorkoutTypes: answers.missedWorkoutTypes,
    biweeklyMissedReason: answers.missedReason,
    biweeklyMissedReasonDetails: answers.missedReasonDetails,
    biweeklyDifficultyAdjustment: answers.difficulty,
    biweeklyRecoveryStatus: answers.recovery,
    biweeklyRecoveryNotes: answers.recoveryNotes,
    biweeklySchedule: answers.schedule,
    biweeklyNextFocus: answers.nextFocus,
    biweeklyImprovementNotes: answers.improvementNotes,
    biweeklyImprovementDetails: answers.improvementDetails,
    currentAnswersPriority: currentPriority,
  };
}
