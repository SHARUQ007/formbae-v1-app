export type AiPlanRefreshKey =
  | 'completionPattern'
  | 'missedSpecificDays'
  | 'missedSpecificDayReason'
  | 'missedSpecificDayDetails'
  | 'repeatedSkipPattern'
  | 'repeatedSkipReason'
  | 'repeatedSkipDetails'
  | 'temporaryDisruption'
  | 'temporaryDisruptionDetails'
  | 'nextTwoWeeksOutlook'
  | 'nextTwoWeeksDetails'
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

export type AiPlanRefreshContext = {
  missedDays?: Array<{ dayNumber: string; focus: string }>;
  repeatedMissedFocuses?: string[];
};

export const emptyAiPlanRefreshAnswers: AiPlanRefreshAnswers = {
  completionPattern: '',
  missedSpecificDays: '',
  missedSpecificDayReason: '',
  missedSpecificDayDetails: '',
  repeatedSkipPattern: '',
  repeatedSkipReason: '',
  repeatedSkipDetails: '',
  temporaryDisruption: '',
  temporaryDisruptionDetails: '',
  nextTwoWeeksOutlook: '',
  nextTwoWeeksDetails: '',
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

export function sanitizeAiPlanRefreshAnswers(value: unknown): AiPlanRefreshAnswers {
  if (!value || typeof value !== 'object') return { ...emptyAiPlanRefreshAnswers };
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(emptyAiPlanRefreshAnswers).map((key) => [
      key,
      typeof source[key] === 'string' ? source[key] : '',
    ]),
  ) as AiPlanRefreshAnswers;
}

const MISSED_REASON_OPTIONS = [
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
];

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
    options: MISSED_REASON_OPTIONS,
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
      'Other / add detail',
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

export function buildAiPlanRefreshQuestions(context: AiPlanRefreshContext = {}) {
  const missedDays = (context.missedDays || []).filter((day) => day.dayNumber || day.focus).slice(0, 8);
  const repeatedMissedFocuses = (context.repeatedMissedFocuses || []).filter(Boolean).slice(0, 5);
  const questions: AiPlanRefreshQuestion[] = [AI_PLAN_REFRESH_QUESTIONS[0]];

  if (missedDays.length) {
    questions.push({
      key: 'missedSpecificDays',
      title: 'Which planned days were hardest to complete?',
      detail: 'We noticed these plan days were not marked complete. Pick the ones that were actually a problem.',
      multiple: true,
      options: [
        'None of these',
        ...missedDays.map((day) => `Day ${day.dayNumber} - ${day.focus || 'Workout'}`),
      ],
    });
    questions.push({
      key: 'missedSpecificDayReason',
      title: 'Why were those days missed?',
      detail: 'This helps the next plan change the exact days or workout style that broke down.',
      multiple: true,
      notesKey: 'missedSpecificDayDetails',
      notesPlaceholder: 'Add the exact day, workout, exercise, time issue, pain area, or equipment problem.',
      options: MISSED_REASON_OPTIONS,
    });
  }

  if (repeatedMissedFocuses.length) {
    questions.push({
      key: 'repeatedSkipPattern',
      title: 'We noticed a pattern in missed workouts.',
      detail: 'These workout types appeared in your missed days. Pick what felt accurate.',
      multiple: true,
      options: [
        'No clear pattern',
        ...repeatedMissedFocuses.map((focus) => `${focus} workouts were hard to finish`),
      ],
    });
    questions.push({
      key: 'repeatedSkipReason',
      title: 'What should change for that pattern?',
      detail: 'The next plan can replace, simplify, shorten, move, or progress those workouts differently.',
      multiple: true,
      notesKey: 'repeatedSkipDetails',
      notesPlaceholder: 'Example: lower-body days are too long, cardio feels boring, upper body hurts shoulder, etc.',
      options: [
        'Make it shorter',
        'Make it easier',
        'Change exercise selection',
        'Move it to another day',
        'Add more coaching cues',
        'Replace with quick version',
        'Keep it but progress slower',
        'Other',
      ],
    });
  }

  questions.push(...AI_PLAN_REFRESH_QUESTIONS.slice(1));
  questions.splice(1, 0,
    {
      key: 'temporaryDisruption',
      title: 'Was anything temporary affecting last block?',
      detail: 'Travel, sickness, work pressure, or family events should be noted without automatically changing the whole next plan.',
      notesKey: 'temporaryDisruptionDetails',
      notesPlaceholder: 'Example: traveled for 5 days, was sick, work deadline, no gym access, family event.',
      options: [
        'No, it was my normal routine',
        'Travel',
        'Sick or recovering',
        'Work or exams',
        'Family or personal event',
        'No equipment access',
        'Sleep or stress spike',
        'Other temporary reason',
      ],
    },
    {
      key: 'nextTwoWeeksOutlook',
      title: 'How will the next two weeks look?',
      detail: "This is more important than last week's miss. Pick what the next plan should be built around.",
      notesKey: 'nextTwoWeeksDetails',
      notesPlaceholder: 'Mention travel dates, days available, gym access, time per session, illness/recovery, or schedule changes.',
      options: [
        'Normal routine',
        'More time than usual',
        'Less time than usual',
        'Traveling',
        'Busy or unpredictable',
        'Recovering from sickness or pain',
        'Mostly home workouts',
        'Mostly gym workouts',
        'Other / add detail',
      ],
    },
  );
  return questions;
}

export function splitRefreshSelections(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function toggleRefreshSelection(currentValue: string, option: string, multiple?: boolean) {
  if (!multiple) return option;
  const isNoneOption = option === 'None' || option === 'None of these' || option === 'No clear pattern';
  if (isNoneOption) return currentValue === option ? '' : option;
  const current = splitRefreshSelections(currentValue).filter((entry) => entry !== 'None' && entry !== 'None of these' && entry !== 'No clear pattern');
  return current.includes(option)
    ? current.filter((entry) => entry !== option).join(', ')
    : [...current, option].join(', ');
}

export function isAiPlanRefreshComplete(answers: AiPlanRefreshAnswers, questions = AI_PLAN_REFRESH_QUESTIONS) {
  return questions.every((question) => {
    const answer = answers[question.key]?.trim();
    if (!answer) return false;
    const needsDetail = Boolean(
      question.notesKey &&
        splitRefreshSelections(answer).some(option => /other/i.test(option)),
    );
    return !needsDetail || Boolean(answers[question.notesKey!]?.trim());
  });
}

export function buildAiPlanRefreshPayload(answers: AiPlanRefreshAnswers): Record<string, string> {
  const currentPriority =
    'CURRENT TWO-WEEK CHECK-IN HAS TOP PRIORITY. If these answers conflict with onboarding/profile/old feedback, follow these latest answers while keeping safety constraints.';
  return {
    currentActivity: `Biweekly completion pattern: ${answers.completionPattern}. Temporary disruption last block: ${answers.temporaryDisruption}. ${answers.temporaryDisruptionDetails}. Next two weeks outlook: ${answers.nextTwoWeeksOutlook}. ${answers.nextTwoWeeksDetails}. Specific plan days missed or problematic: ${answers.missedSpecificDays}. Repeated skipped pattern: ${answers.repeatedSkipPattern}. Specific workout types missed: ${answers.missedWorkoutTypes}.`,
    intensity: answers.difficulty,
    trainingDays: answers.schedule,
    recovery: answers.recovery,
    limitations: `${answers.recovery}. Recovery notes: ${answers.recoveryNotes}. Reasons specific days were missed: ${answers.missedSpecificDayReason}. ${answers.missedSpecificDayDetails}. Reasons workout types were missed: ${answers.missedReason}. ${answers.missedReasonDetails}. Repeated-pattern reason: ${answers.repeatedSkipReason}. ${answers.repeatedSkipDetails}.`,
    focusAreas: answers.nextFocus,
    preferredExercises: `Keep or emphasize anything consistent with: ${answers.nextFocus}. Additional improvement request: ${answers.improvementNotes}. ${answers.improvementDetails}.`,
    dislikedExercises: `Reduce, replace, or simplify workout days/types/exercises the user skipped: ${answers.missedSpecificDays}; ${answers.missedWorkoutTypes}; ${answers.repeatedSkipPattern}. Reasons: ${answers.missedSpecificDayReason}; ${answers.missedReason}; ${answers.repeatedSkipReason}. ${answers.missedReasonDetails} ${answers.repeatedSkipDetails}.`,
    coachingStyle: 'Biweekly AI plan refresh. Be practical, concise, progressive, and fit both the web and mobile workout views.',
    accountabilityPreference: answers.improvementNotes,
    biweeklyCompletionPattern: answers.completionPattern,
    biweeklyMissedSpecificDays: answers.missedSpecificDays,
    biweeklyMissedSpecificDayReason: answers.missedSpecificDayReason,
    biweeklyMissedSpecificDayDetails: answers.missedSpecificDayDetails,
    biweeklyRepeatedSkipPattern: answers.repeatedSkipPattern,
    biweeklyRepeatedSkipReason: answers.repeatedSkipReason,
    biweeklyRepeatedSkipDetails: answers.repeatedSkipDetails,
    biweeklyTemporaryDisruption: answers.temporaryDisruption,
    biweeklyTemporaryDisruptionDetails: answers.temporaryDisruptionDetails,
    biweeklyNextTwoWeeksOutlook: answers.nextTwoWeeksOutlook,
    biweeklyNextTwoWeeksDetails: answers.nextTwoWeeksDetails,
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
    currentAnswersPriority: `${currentPriority} Do not overcorrect for missed workouts caused by temporary travel, sickness, or one-off life events unless the user's nextTwoWeeksOutlook says that constraint will continue. Build primarily for the next two weeks.`,
  };
}
