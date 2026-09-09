export type OnboardingStatus =
  | 'not_started'
  | 'questionnaire_started'
  | 'questionnaire_completed'
  | 'analysis_ready'
  | 'payment_pending'
  | 'subscription_expired'
  | 'paid'
  | 'trainer_assigned'
  | 'plan_ready'
  | 'active';

export type RecommendedNextScreen =
  | 'welcome'
  | 'questionnaire'
  | 'analysis_report'
  | 'payment'
  | 'payment_sync'
  | 'renewal'
  | 'paid_welcome'
  | 'plan_preparing'
  | 'trainer_match'
  | 'finding_trainer'
  | 'home';

export type UserStatus = {
  userId: string;
  isAuthenticated: boolean;
  phone?: string;
  email?: string;
  name?: string;
  hasPaid: boolean;
  paymentStatus: 'none' | 'pending' | 'paid' | 'failed' | 'refunded';
  questionnaireCompleted: boolean;
  analysisReady: boolean;
  trainerAssigned: boolean;
  planReady: boolean;
  onboardingStatus: OnboardingStatus;
  recommendedNextScreen: RecommendedNextScreen;
  subscription?: {
    state: 'active' | 'grace' | 'expired' | 'open';
    premiumEndDate: string;
    graceEndDate: string;
    graceDaysRemaining: number;
    gracePeriodDays: number;
  };
};

export type SessionUser = {
  userId: string;
  name: string;
  mobile: string;
  trainerId: string;
};

export type LoginResponse = {
  token: string;
  user: SessionUser;
  status: UserStatus;
};

export type MobileQuestion = {
  id: string;
  title: string;
  subtitle?: string;
  type: 'single' | 'text';
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
};

export type AnalysisReport = {
  goalSummary: string;
  startingPoint: string;
  workoutDirection: string;
  weeklySchedule: string;
  locationSuitability: string;
  trainerType: string;
  budgetRecommendation: string;
  bmi: number;
  bmiPosition?: number;
  goalWeight: number;
  readinessScore: number;
  goal?: string;
  blocker?: string;
  cause?: string;
  cadence?: string;
  workoutStyle?: string;
  identity?: string;
  activity?: string;
  diet?: string;
  trainerMonths?: number;
  trainerCadence?: string;
  trainerReason?: string;
  projectionStartScore?: number;
  projectionTargetScore?: number;
  scores: {
    activity: number;
    consistency: number;
    progression: number;
    recovery: number;
    nutrition: number;
  };
  projectionData: Array<{ week: string; score: number; note: string }>;
  recommendedTrainer: TrainerRecommendation;
  nextStepCta: string;
};

export type TrainerRecommendation = {
  trainerId?: string;
  name: string;
  gender: string;
  photoUrl: string;
  coachType: string;
  description: string;
  why: string;
  expertise: string;
  bestSuitedGoal: string;
  budgetFit: string;
  badge: string;
};

export type PaymentPlan = {
  planId: string;
  planName: string;
  amount: number;
  planDuration?: string;
  label?: string;
  paywallId?: string;
  flowSlug?: string;
  billing?: 'one_time' | 'recurring';
  recurringLabel?: string;
};

export type TrainerKind = 'human' | 'ai';

export type TodayPayload = {
  plan?: {
    planId: string;
    trainerId?: string;
    title: string;
    createdAt?: string;
    weekStartDate?: string;
    days?: PlanDay[];
  };
  messages?: Message[];
  workoutLogs?: WorkoutLog[];
  progress?: ProgressSummary;
  assignedTrainer?: TrainerInfo;
};

export type AiPlanRefresh = {
  due: boolean;
  intervalDays: number;
  planAgeDays: number;
  planId: string;
  trainerId: string;
  trainerName: string;
  isAiTrainer: boolean;
  allowance: {
    used: number;
    limit: number;
    remaining: number;
    allowed: boolean;
  };
  build?: {
    status?: 'requested' | 'building' | 'completed' | 'failed';
    planId?: string;
    newPlanId?: string;
    requestedAt?: string;
    completedAt?: string;
    failedAt?: string;
    error?: string;
  };
};

export type PlanDay = {
  planDayId: string;
  dayNumber: string;
  focus: string;
  notes: string;
  exercises?: PlanExercise[];
  completed?: boolean;
};

export type UserPlanSummary = {
  planId: string;
  title?: string;
  trainerName?: string;
  status?: string;
  isActive?: boolean;
  weekStartDate?: string;
  createdAt?: string;
  days?: PlanDay[];
};

export type PlanExercise = {
  exerciseId: string;
  exerciseName: string;
  sets: string;
  reps: string;
  restSec: string;
  notes: string;
  workoutMode: string;
  completed?: boolean;
};

export type Message = {
  messageId: string;
  userId: string;
  planId: string;
  senderRole: string;
  text: string;
  createdAt: string;
};

export type WorkoutLog = {
  logId: string;
  planDayId: string;
  completedFlag: string;
};

export type ProgressSummary = {
  userId: string;
  adherencePct: number;
  completed: number;
  planned: number;
  standardCompletedThisWeek?: number;
  quickCompletedThisWeek?: number;
  currentStreak: number;
  bestStreak: number;
  completionHistory?: Array<{
    date: string;
    planId: string;
    planDayId: string;
    workoutMode: 'standard' | 'quick' | string;
  }>;
  bodyTrend?: Array<{ entryId?: string; date: string; createdAt?: string; weight: number; chest?: number; waist?: number; biceps?: number }>;
  weeklyReview?: WeeklyProgressReview;
  trophies?: TrophySummary;
  bodyForecast?: BodyForecast;
};

export type BodyForecast = {
  generationPending?: boolean;
  status: 'insufficient' | 'pending' | 'ready';
  generatedAt: string;
  nextInDays: number;
  summary: string;
  confidence: 'low' | 'medium';
  source: 'ai' | 'trend' | 'none';
  metrics: Partial<Record<'weight' | 'waist' | 'chest' | 'biceps', Array<{ date: string; value: number }>>>;
};

export type TrophySummary = {
  score: number;
  change: number;
  safeZone: number;
  nextMilestone: number;
  pointsToNext: number;
  workoutCount: number;
  starCount: number;
  currentStreak: number;
  breakdown: {
    workouts: number;
    stars: number;
    streakAchievement: number;
    streakMomentum: number;
    weeklyPace: number;
    foodPace: number;
  };
};

export type TrophyLeaderboard = {
  leaders: Array<{ rank: number; displayName: string; score: number; isCurrentUser: boolean }>;
  currentUser?: { rank: number; displayName: string; score: number; isCurrentUser: boolean } | null;
  participantCount: number;
};

export type TrophyInvite = { code: string; shareUrl: string };

export type AccountabilityCommitment = {
  date: string;
  status: 'active' | 'completed' | 'skipped';
  targetKind: 'workout' | 'diet' | 'refresh' | 'progress' | string;
  targetId: string;
  title: string;
  committedAt: string;
  completedAt: string;
};

export type AccountabilitySummary = {
  today?: AccountabilityCommitment | null;
  streak: number;
  keptCount: number;
  commitmentCount: number;
};

export type AccountabilityBaeSummary = {
  status: 'locked' | 'inactive' | 'waiting' | 'matched';
  preference: 'male' | 'female' | 'friend' | '';
  inviteCode: string;
  access?: {
    unlocked: boolean;
    override: 'default' | 'unlocked' | 'locked';
    trophyScore: number;
    trophyThreshold: number;
    trophiesRemaining: number;
  };
  partner?: { userId: string; displayName: string } | null;
  challenge?: {
    id: string;
    title: string;
    prompt: string;
    icon: string;
    date: string;
    dueLabel: string;
  } | null;
  youSubmitted?: boolean;
  partnerSubmitted?: boolean;
  bothSubmitted?: boolean;
  yourProofUrl?: string;
  partnerProofUrl?: string;
};

export type ReportEvidenceCoverage = {
  level: 'limited' | 'partial' | 'broad';
  summary: string;
  observedDays: number;
  periodDays: number;
  limitations: string[];
};

export type WeeklyProgressReportSnapshot = {
  schemaVersion?: number;
  reportKind?: 'weekly';
  generationMethod?: 'ai' | 'data_summary';
  evidenceCoverage?: ReportEvidenceCoverage;
  headline?: string;
  summary?: string;
  weekSummary?: string;
  highlights?: Array<{ title: string; evidence: string; whyItMatters: string }>;
  keyFindings?: Array<{ id?: string; domain: string; title: string; insight: string; whyItMatters?: string; benefit?: string; riskIfUnchanged?: string; evidence?: string[]; evidenceIds?: string[] }>;
  domains?: Array<{ key: string; title: string; status: 'strong' | 'building' | 'attention' | 'insufficient'; summary: string; evidence?: string[]; actions?: string[] }>;
  actionPlan?: Array<{ id?: string; priority: number; domain: string; title: string; why: string; benefit?: string; riskIfUnchanged?: string; cue?: string; steps?: string[]; fallback?: string; successMeasure?: string; sourceFindingId?: string; evidenceIds?: string[] }>;
  watchouts?: Array<{ title: string; reason: string; response: string }>;
  evidenceBasis?: Array<{ id: string; title: string; url: string; publisher?: string; description?: string; topic?: 'nutrition' | 'training' | 'recovery' | 'habits' }>;
  metrics?: {
    momentumScore: number;
    momentumLabel: string;
    dimensions: Array<{ key: string; label: string; value: number; status: 'strong' | 'building' | 'attention' }>;
    dailyActivity: Array<{ date: string; label: string; workouts: number; foodLogs: number }>;
    workoutFocus: Array<{ label: string; count: number }>;
    feedbackSignals: Array<{ label: string; count: number }>;
    bodyChanges: Array<{ key: string; label: string; unit: string; start: number; current: number; change: number; sampleCount?: number; startDate?: string; endDate?: string }>;
    coverage?: {
      activeDays: number;
      workoutDays: number;
      foodDays: number;
      totalSignals: number;
    };
    weeklyDeltas?: Array<{
      key: string;
      label: string;
      current: number;
      previous: number;
      change: number;
      unit: '' | 'pp' | 'days' | 'pts';
    }>;
    trainingSummary?: {
      planned: number;
      completed: number;
      remaining: number;
      standardSessions: number;
      quickSessions: number;
      ratedSessions: number;
      ratingCoveragePct: number;
    };
    nutritionSummary?: {
      foodLogs: number;
      daysLogged: number;
      averageLogsPerDay: number;
      patternScore: number | null;
      enrichmentScore: number;
    };
  };
  period?: { start: string; end: string };
  reportStats?: {
    workoutsCompleted: number;
    workoutsPlanned: number;
    adherencePct: number;
    currentStreak: number;
    mealsLogged: number;
    dietDaysLogged: number;
    describedDaysLogged?: number;
    describedEntries?: number;
    workoutFeedbackCount: number;
    ratedSessionCount?: number;
    checkInCount: number;
    bodyLogCount: number;
    standardWorkoutsCompleted?: number;
    quickWorkoutsCompleted?: number;
    dietEnrichmentScore?: number;
    dietPatternScore?: number | null;
  };
  wins?: string[];
  workoutInsight?: string;
  workoutRecommendation?: string;
  nutritionInsight?: string;
  nutritionRecommendation?: string;
  nextFocusTitle?: string;
  nextFocusReason?: string;
  nextFocusDomain?: 'workout' | 'diet' | 'body';
  stats?: {
    workoutsCompleted: number;
    workoutsPlanned: number;
    adherencePct: number;
    currentStreak: number;
    mealsLogged: number;
    dietDaysLogged: number;
    describedDaysLogged?: number;
    describedEntries?: number;
    workoutFeedbackCount: number;
    ratedSessionCount?: number;
    checkInCount: number;
    bodyLogCount: number;
    standardWorkoutsCompleted?: number;
    quickWorkoutsCompleted?: number;
  };
};

export type WeeklyProgressReview = WeeklyProgressReportSnapshot & {
  generationPending?: boolean;
  nextReviewAt?: string;
  cycleState?: 'collecting' | 'scheduled' | 'preparing' | 'retry_wait';
  cycleStats?: WeeklyProgressReview['stats'];
  cyclePeriod?: { start: string; end: string };
  lastCycleStatus?: 'generated' | 'insufficient_activity' | null;
  generatedForUserId: string;
  status: 'pending' | 'ready';
  weekStartDate: string;
  generatedAt: string;
  nextInDays: number;
  requirements?: { workouts: number; meals: number };
  history?: Array<{
    reportId: string;
    generatedAt: string;
    weekStartDate?: string;
    report: WeeklyProgressReportSnapshot;
  }>;
  stats: {
    workoutsCompleted: number;
    workoutsPlanned: number;
    adherencePct: number;
    currentStreak: number;
    mealsLogged: number;
    dietDaysLogged: number;
    describedDaysLogged?: number;
    describedEntries?: number;
    workoutFeedbackCount: number;
    ratedSessionCount?: number;
    checkInCount: number;
    bodyLogCount: number;
  };
  nutritionRecommendation?: string;
  nextFocusTitle?: string;
  nextFocusReason?: string;
  nextFocusDomain?: 'workout' | 'diet' | 'body';
};

export type TrainerInfo = {
  userId: string;
  name: string;
  trainerPhotoUrl?: string;
  trainerDescription?: string;
  trainerGender?: string;
};

export type CoachChangeKind = 'none' | 'initial' | 'swap' | 'upgrade';

export type CoachOption = {
  trainerId: string;
  name: string;
  gender: string;
  photoUrl: string;
  expertise: string;
  description: string;
  detailedDescription: string;
  languages: string[];
  monthlyFee: string;
  tier: string;
  trainerKind?: TrainerKind | string;
  trainerPersona?: string;
  availableSlotCount: number;
  nextSlotAt: string;
  changeKind: CoachChangeKind;
  blockedUntil: string;
  requiresUpgrade: boolean;
  canSelect: boolean;
  reason: string;
  upgradeAmountPaise: number;
  paywallId: string;
};

export type CoachHubPayload = {
  currentTrainer: CoachOption | null;
  trainers: CoachOption[];
  access: {
    accessibleTrainerTier: string;
    currentTrainerTier: string;
    trainerAccessLabel: string;
    trainerAccessRemainingWeeks: number;
    swapLockedUntil: string;
    upgradeLockedUntil: string;
  };
};

export type CheckIn = {
  checkInId: string;
  date: string;
  weight: string;
  workoutCompletion: string;
  energyLevel: string;
  difficultyLevel: string;
  notes: string;
};

export type LegalLinks = {
  privacyPolicyUrl: string;
  termsUrl: string;
  refundPolicyUrl: string;
  supportEmail: string;
  supportUrl: string;
  fitnessDisclaimer: string;
};

export type WorkoutExerciseDetail = {
  exerciseId: string;
  exerciseName: string;
  sets: string;
  reps: string;
  restSec: string;
  notes: string;
  videoUrl: string;
  order: string;
  alternatives?: WorkoutExerciseAlternative[];
};

export type WorkoutExerciseAlternative = {
  exerciseName: string;
  sets?: string;
  reps?: string;
  restSec?: string;
  notes?: string;
  videoId?: string;
  videoUrl?: string;
};

export type WorkoutDayDetail = {
  planId: string;
  planTitle: string;
  planDayId: string;
  dayNumber: string;
  focus: string;
  notes: string;
  workoutMode: 'standard' | 'quick';
  dayComplete: boolean;
  exercises: WorkoutExerciseDetail[];
};
