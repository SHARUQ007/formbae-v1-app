import type { NavigatorScreenParams } from '@react-navigation/native';
import type { WorkoutDayDetail } from '../types/api';

export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;
  Onboarding: { screen?: keyof OnboardingStackParamList } | undefined;
  PaidTransition: { screen?: keyof PaidStackParamList } | undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: { mode?: 'login' | 'signup' };
};

export type OnboardingStackParamList = {
  Questionnaire: undefined;
  AnalysisLoading: undefined;
  AnalysisReport: undefined;
  TrainerMatch: undefined;
  PaymentRequired: undefined;
};

export type PaidStackParamList = {
  PaymentSync: undefined;
  PaidWelcome: undefined;
  FindingTrainer: undefined;
  PlanPreparing: undefined;
};

export type MainTabParamList = {
  Workouts: NavigatorScreenParams<WorkoutStackParamList> | undefined;
  Diet: { action?: 'camera'; requestId?: number; mealType?: 'Breakfast' | 'Lunch' | 'Evening' | 'Dinner' } | undefined;
  Action: undefined;
  Progress: { action?: 'overview' | 'logBody'; requestId?: number } | undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type WorkoutStackParamList = {
  WorkoutList: undefined;
  Coach: undefined;
  PlanRefresh: undefined;
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
  Trainer: undefined;
  Legal: undefined;
  DeleteAccount: undefined;
};
