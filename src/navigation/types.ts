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
  Home: undefined;
  Workouts: undefined;
  Diet: undefined;
  Progress: undefined;
  Trainer: undefined;
  Profile: undefined;
};

export type WorkoutStackParamList = {
  WorkoutList: undefined;
  WorkoutDetail: { planDayId: string; title: string; mode?: 'standard' | 'quick' };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  Legal: undefined;
  DeleteAccount: undefined;
};
