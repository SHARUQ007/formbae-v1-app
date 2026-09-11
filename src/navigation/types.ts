import type { NavigatorScreenParams } from '@react-navigation/native';
import type { WorkoutDayDetail } from '../types/api';

export type RootStackParamList = {
  Splash: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Onboarding: { screen?: keyof OnboardingStackParamList } | undefined;
  PaidTransition: { screen?: keyof PaidStackParamList } | undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Renewal: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: { mode?: 'login' | 'signup'; reduceMotion?: boolean; mobile?: string };
};

export type OnboardingStackParamList = {
  SetupWelcome: undefined;
  Questionnaire: undefined;
  AnalysisLoading: undefined;
  AnalysisReport: undefined;
  TrainerMatch: undefined;
  PaymentRequired: undefined;
};

export type PaidStackParamList = {
  ProfileSetup: undefined;
  PaymentSync: undefined;
  PaidWelcome: undefined;
  FindingTrainer: undefined;
  PlanPreparing: undefined;
};

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
