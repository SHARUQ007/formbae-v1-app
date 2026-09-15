import type { NavigatorScreenParams } from '@react-navigation/native';
import type { AnalysisReport, RecommendedNextScreen, WorkoutDayDetail, WorkoutHistoryEntry } from '../types/api';

export type RootStackParamList = {
  Splash: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Onboarding: { screen?: keyof OnboardingStackParamList } | undefined;
  PaidTransition: { screen?: keyof PaidStackParamList } | undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Renewal: undefined;
  SubscriptionSuccess: { planName: string; nextScreen?: RecommendedNextScreen; renewal?: boolean };
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: { mode?: 'login' | 'signup'; reduceMotion?: boolean; mobile?: string };
  /** `sessionId` stands in for the Firebase confirmation, which cannot travel in params. */
  VerifyOtp: {
    mobile: string;
    sessionId: string;
    mode?: 'login' | 'signup';
    name?: string;
    reduceMotion?: boolean;
  };
};

export type OnboardingStackParamList = {
  SetupWelcome: undefined;
  Questionnaire: undefined;
  AnalysisLoading: { answers?: Record<string, string> } | undefined;
  AnalysisReport: { report: AnalysisReport; answers: Record<string, string> } | undefined;
  TrainerMatch: undefined;
  PaymentRequired: undefined;
  GiftPlanDetails: { planId: string };
};

export type PaidStackParamList = {
  ProfileSetup: undefined;
  PaymentSync: undefined;
  GiftedMembership: undefined;
  PaidWelcome: undefined;
  FindingTrainer: undefined;
  CoachQuestions: undefined;
  CoachUpgrade: { trainerId: string };
  CoachUnlocked: { trainerId: string };
  /** autoStart begins the build straight away, for a step that already asked to build. */
  PlanPreparing: { autoStart?: boolean } | undefined;
};

/** Paid routes the app can land on directly — the ones that need no params. */
export type PaidEntryRoute = Exclude<keyof PaidStackParamList, 'CoachUpgrade' | 'CoachUnlocked'>;

export type MainTabParamList = {
  Workouts: NavigatorScreenParams<WorkoutStackParamList> | undefined;
  Diet: { action?: 'camera' | 'log'; requestId?: number; mealType?: 'Breakfast' | 'Lunch' | 'Evening' | 'Dinner' } | undefined;
  Action: undefined;
  Progress: NavigatorScreenParams<ProgressStackParamList> | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type ProgressStackParamList = {
  ProgressMain: { action?: 'overview' | 'logBody'; requestId?: number } | undefined;
  ProgressReport: undefined;
  ProgressReportHistory: undefined;
  TrophyDetails: { openInfo?: boolean } | undefined;
};

export type CoachScreenParams = {
  initialView?: 'about' | 'browse' | 'detail';
  trainerId?: string;
};

export type WorkoutStackParamList = {
  WorkoutHistory: undefined;
  WorkoutHistoryDetail: { session: WorkoutHistoryEntry };
  WorkoutList: {
    pendingPlanBuild?: {
      planId: string;
      trainerName: string;
      requestedAt: number;
    };
  } | undefined;
  Coach: CoachScreenParams | undefined;
  PlanRefresh: { retryFailedBuild?: boolean } | undefined;
  WorkoutSummary: { planDayId: string; title: string; mode?: 'standard' | 'quick'; initialDetail?: WorkoutDayDetail };
  WorkoutDetail: { planDayId: string; title: string; mode?: 'standard' | 'quick'; initialDetail?: WorkoutDayDetail };
  WorkoutVideo: {
    title: string;
    subtitle?: string;
    videoUrl: string;
    planDayId: string;
    workoutMode: 'standard' | 'quick';
    exerciseId?: string;
    exerciseName: string;
    order?: string;
    focus?: string;
  };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  GymPicker: undefined;
  Trainer: CoachScreenParams | undefined;
  Legal: undefined;
  DeleteAccount: undefined;
};
