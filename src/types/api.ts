export type OnboardingStatus =
  | 'not_started'
  | 'questionnaire_started'
  | 'questionnaire_completed'
  | 'analysis_ready'
  | 'payment_pending'
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
  goalWeight: number;
  readinessScore: number;
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
};

export type TodayPayload = {
  plan?: {
    planId: string;
    title: string;
    days?: PlanDay[];
  };
  messages?: Message[];
  workoutLogs?: WorkoutLog[];
  progress?: ProgressSummary;
  assignedTrainer?: TrainerInfo;
};

export type PlanDay = {
  planDayId: string;
  dayNumber: string;
  focus: string;
  notes: string;
  exercises?: PlanExercise[];
  completed?: boolean;
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
  adherencePct: number;
  completed: number;
  planned: number;
  currentStreak: number;
  bestStreak: number;
  bodyTrend?: Array<{ date: string; weight: number }>;
};

export type TrainerInfo = {
  userId: string;
  name: string;
  trainerPhotoUrl?: string;
  trainerDescription?: string;
  trainerGender?: string;
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
