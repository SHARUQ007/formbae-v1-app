import type { NavigatorScreenParams } from '@react-navigation/native';

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
  Diet: { action?: 'camera'; requestId?: number; mealType?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' } | undefined;
  Action: undefined;
  Progress: undefined;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type WorkoutVideoItem = {
  id: string;
  title: string;
  subtitle?: string;
  videoUrl: string;
};

export type WorkoutStackParamList = {
  WorkoutList: undefined;
  Coach: undefined;
  PlanRefresh: undefined;
  WorkoutSummary: { planDayId: string; title: string; mode?: 'standard' | 'quick' };
  WorkoutDetail: { planDayId: string; title: string; mode?: 'standard' | 'quick' };
  WorkoutVideo: { title: string; subtitle?: string; videoUrl: string; videos?: WorkoutVideoItem[]; initialIndex?: number };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  Trainer: undefined;
  Legal: undefined;
  DeleteAccount: undefined;
};
