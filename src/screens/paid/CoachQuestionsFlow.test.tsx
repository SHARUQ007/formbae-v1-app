import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CoachQuestionsScreen } from './CoachQuestionsScreen';
import { FindingTrainerScreen } from './FindingTrainerScreen';
import { PlanPreparingScreen } from './PlanPreparingScreen';
import { PaidWelcomeScreen } from './PaidWelcomeScreen';
import { SetupOverview } from '../../components/SetupOverview';
import { createOnboardingPlan, fetchOnboardingPlanState } from '../../services/onboardingService';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { fetchCoachQuestions, saveCoachQuestions } from '../../services/onboardingService';
import { changeCoach, fetchCoachHub } from '../../services/trainerService';

jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/onboardingService', () => ({
  fetchCoachQuestions: jest.fn(), saveCoachQuestions: jest.fn(),
  createOnboardingPlan: jest.fn(), fetchOnboardingPlanState: jest.fn(),
}));
jest.mock('../../services/apiClient', () => ({ ApiError: class ApiError extends Error { status = 0; } }));
jest.mock('../../services/trainerService', () => ({ fetchCoachHub: jest.fn(), changeCoach: jest.fn() }));
jest.mock('../../services/paymentService', () => ({ runNativeCheckout: jest.fn() }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));

const questions = [
  { id: 'goalReason', title: 'Why does this goal matter?', type: 'text' as const },
  { id: 'intensity', title: 'How hard should sessions feel?', type: 'single' as const, options: [
    { value: 'gentle', label: 'Gentle' }, { value: 'hard', label: 'Hard, push me' },
  ] },
];

let renderer: ReactTestRenderer;
const refreshStatus = jest.fn();
const navigation = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  refreshStatus.mockResolvedValue({ hasPaid: true, questionnaireCompleted: true, trainerAssigned: true, planReady: false });
  (useAuthStore as jest.Mock).mockReturnValue({ user: {}, status: {}, refreshStatus });
  (fetchCoachQuestions as jest.Mock).mockResolvedValue({ questions, answers: {}, completed: false, required: true });
  (saveCoachQuestions as jest.Mock).mockResolvedValue({ ok: true, completed: true });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

const render = async () => { await act(async () => { renderer = create(<CoachQuestionsScreen navigation={navigation as never} route={{ name: 'CoachQuestions', key: 'q' } as never} />); }); };
const cta = () => renderer.root.findAllByType(PrimaryButton).slice(-1)[0];
const texts = () => renderer.root
  .findAll(node => typeof node.type === 'string' && node.type.includes('Text'))
  .map(node => node.children.map(child => (typeof child === 'string' ? child : '')).join(''));
const option = (label: string) => renderer.root.findAll(node => node.props.accessibilityLabel === label)[0];

it('the plan cannot be built until every question is answered', async () => {
  await render();
  expect(texts()).toContain('Why does this goal matter?');
  expect(cta().props.disabled).toBe(true);

  const input = renderer.root.findAll(node => typeof node.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText('I want to keep up with my kids'); });
  expect(cta().props.disabled).toBe(false);
  expect(cta().props.title).toBe('Continue');

  await act(async () => { await cta().props.onPress(); });
  expect(saveCoachQuestions).not.toHaveBeenCalled();
  expect(cta().props.title).toBe('Build my plan');
  expect(cta().props.disabled).toBe(true);
});

it('answers are saved and the flow moves on only once', async () => {
  await render();
  const input = renderer.root.findAll(node => typeof node.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText('To keep up with my kids'); });
  await act(async () => { await cta().props.onPress(); });
  await act(async () => { option('Hard, push me').props.onPress(); });
  await act(async () => { await cta().props.onPress(); });

  expect(saveCoachQuestions).toHaveBeenCalledWith({ goalReason: 'To keep up with my kids', intensity: 'hard' });
  // Straight into building, rather than back to the checklist they came from.
  expect(navigation.replace).toHaveBeenCalledWith('PlanPreparing', { autoStart: true });
});

it('a part-answered questionnaire resumes where it was left', async () => {
  (fetchCoachQuestions as jest.Mock).mockResolvedValue({ questions, answers: { goalReason: 'Already said' }, completed: false, required: true });
  await render();
  expect(texts()).toContain('How hard should sessions feel?');
});

it('choosing an AI coach goes to its questions, not straight to the plan', async () => {
  const ava = {
    trainerId: 'ava', name: 'Ava', gender: '', photoUrl: '', expertise: 'AI Trainer', description: '', detailedDescription: '',
    languages: [], monthlyFee: '0', trainerKind: 'ai', availableSlotCount: 0, nextSlotAt: '', changeKind: 'swap' as const,
    blockedUntil: '', canSelect: true, includedInMembership: true, reason: '', upgradeAmountPaise: 0, paywallId: '',
  };
  (fetchCoachHub as jest.Mock).mockResolvedValue({ currentTrainer: null, trainers: [ava], access: {} });
  refreshStatus.mockResolvedValue({ ...{ hasPaid: true, questionnaireCompleted: true, trainerAssigned: true, planReady: false }, coachQuestionsRequired: true, coachQuestionsCompleted: false });
  await act(async () => { renderer = create(<FindingTrainerScreen navigation={navigation as never} route={{ name: 'FindingTrainer', key: 'c' } as never} />); });
  const card = renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Ava,'))[0];
  await act(async () => { card.props.onPress(); });
  const continueCta = renderer.root.findAllByType(PrimaryButton).find(node => node.props.title === 'Continue with this coach')!;
  await act(async () => { await continueCta.props.onPress(); });

  expect(changeCoach).toHaveBeenCalledWith('ava');
  expect(navigation.replace).toHaveBeenCalledWith('CoachQuestions');
});

describe('nothing reaches plan building with the questions unanswered', () => {
  const pending = {
    hasPaid: true, questionnaireCompleted: true, trainerAssigned: true, planReady: false,
    coachQuestionsRequired: true, coachQuestionsCompleted: false,
  };

  it('the setup screen sends them to the questions, not to plan building', async () => {
    refreshStatus.mockResolvedValue(pending);
    (useAuthStore as jest.Mock).mockReturnValue({ status: pending, refreshStatus });
    await act(async () => { renderer = create(<PaidWelcomeScreen navigation={navigation as never} route={{ name: 'PaidWelcome', key: 'w' } as never} />); });
    const overview = renderer.root.findByType(SetupOverview);
    expect(overview.props.action).toBe('Answer my coach’s questions');
    await act(async () => { await overview.props.onContinue(); });
    expect(navigation.navigate).toHaveBeenCalledWith('CoachQuestions');
    expect(createOnboardingPlan).not.toHaveBeenCalled();
  });

  it('opening plan building directly bounces to the questions', async () => {
    refreshStatus.mockResolvedValue(pending);
    (useAuthStore as jest.Mock).mockReturnValue({ status: pending, refreshStatus });
    (fetchOnboardingPlanState as jest.Mock).mockResolvedValue({ status: 'idle' });
    await act(async () => { renderer = create(<PlanPreparingScreen navigation={navigation as never} route={{ name: 'PlanPreparing', key: 'p' } as never} />); });
    const build = renderer.root.findAllByType(PrimaryButton).slice(-1)[0];
    await act(async () => { await build.props.onPress(); });
    expect(createOnboardingPlan).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('CoachQuestions');
  });
});

describe('a status payload that says nothing still cannot reach plan building', () => {
  // An older backend sends no coachQuestions flags; the coach endpoint is the source of truth.
  const silent = { hasPaid: true, questionnaireCompleted: true, trainerAssigned: true, planReady: false };

  beforeEach(() => {
    refreshStatus.mockResolvedValue(silent);
    (useAuthStore as jest.Mock).mockReturnValue({ status: silent, refreshStatus });
    (fetchOnboardingPlanState as jest.Mock).mockResolvedValue({ status: 'idle' });
    (fetchCoachQuestions as jest.Mock).mockResolvedValue({ questions, answers: {}, completed: false, required: true });
  });

  it('opening the screen goes straight to the questions', async () => {
    await act(async () => { renderer = create(<PlanPreparingScreen navigation={navigation as never} route={{ name: 'PlanPreparing', key: 'p' } as never} />); });
    expect(navigation.replace).toHaveBeenCalledWith('CoachQuestions');
    expect(createOnboardingPlan).not.toHaveBeenCalled();
  });

  it('a coach with nothing outstanding is left to build as before', async () => {
    (fetchCoachQuestions as jest.Mock).mockResolvedValue({ questions, answers: {}, completed: true, required: true });
    (createOnboardingPlan as jest.Mock).mockResolvedValue({ status: 'completed' });
    await act(async () => { renderer = create(<PlanPreparingScreen navigation={navigation as never} route={{ name: 'PlanPreparing', key: 'p' } as never} />); });
    expect(navigation.replace).not.toHaveBeenCalledWith('CoachQuestions');
    const build = renderer.root.findAllByType(PrimaryButton).slice(-1)[0];
    await act(async () => { await build.props.onPress(); });
    expect(createOnboardingPlan).toHaveBeenCalled();
  });

  it('an unreachable coach endpoint does not block a human coach', async () => {
    (fetchCoachQuestions as jest.Mock).mockRejectedValue(new Error('offline'));
    (createOnboardingPlan as jest.Mock).mockResolvedValue({ status: 'completed' });
    await act(async () => { renderer = create(<PlanPreparingScreen navigation={navigation as never} route={{ name: 'PlanPreparing', key: 'p' } as never} />); });
    const build = renderer.root.findAllByType(PrimaryButton).slice(-1)[0];
    await act(async () => { await build.props.onPress(); });
    expect(navigation.replace).not.toHaveBeenCalledWith('CoachQuestions');
    expect(createOnboardingPlan).toHaveBeenCalled();
  });
});

describe('answering the way the web does', () => {
  const rich = [
    { id: 'equipment', title: 'What equipment can you use?', type: 'multi' as const, required: true,
      options: [
        { value: 'Dumbbells at home', label: 'Dumbbells at home' },
        { value: 'Resistance bands', label: 'Resistance bands' },
        { value: 'Full gym access', label: 'Full gym access' },
      ],
      allowNotes: true, notesPlaceholder: 'e.g. treadmill' },
    { id: 'preferredTime', title: 'When do you prefer to train?', type: 'single' as const, required: false,
      options: [{ value: 'Morning', label: 'Morning' }, { value: 'Evening', label: 'Evening' }] },
  ];

  beforeEach(() => {
    (fetchCoachQuestions as jest.Mock).mockResolvedValue({ questions: rich, answers: {}, completed: false, required: true });
  });

  const notesField = () => renderer.root.findAll(node => typeof node.props.onChangeText === 'function').slice(-1)[0];

  it('several options can be picked, and unpicked, on one question', async () => {
    await render();
    await act(async () => { option('Dumbbells at home').props.onPress(); });
    await act(async () => { option('Full gym access').props.onPress(); });
    expect(option('Dumbbells at home').props.accessibilityState).toEqual({ checked: true });

    await act(async () => { option('Dumbbells at home').props.onPress(); });
    expect(option('Dumbbells at home').props.accessibilityState).toEqual({ checked: false });
    expect(option('Full gym access').props.accessibilityState).toEqual({ checked: true });
  });

  it('free text is kept alongside the options, not instead of them', async () => {
    await render();
    await act(async () => { option('Resistance bands').props.onPress(); });
    await act(async () => { notesField().props.onChangeText('a treadmill'); });
    // Toggling another option must not lose what they typed.
    await act(async () => { option('Full gym access').props.onPress(); });
    await act(async () => { await cta().props.onPress(); });
    await act(async () => { await cta().props.onPress(); });

    expect(saveCoachQuestions).toHaveBeenCalledWith(expect.objectContaining({
      equipment: 'Resistance bands, Full gym access, a treadmill',
    }));
  });

  it('an optional question can be skipped', async () => {
    await render();
    await act(async () => { option('Dumbbells at home').props.onPress(); });
    await act(async () => { await cta().props.onPress(); });
    // Last question, so the button submits; the point is it is not blocked by a blank answer.
    expect(cta().props.title).toBe('Build my plan');
    expect(cta().props.disabled).toBe(false);
    await act(async () => { await cta().props.onPress(); });
    expect(saveCoachQuestions).toHaveBeenCalledWith({ equipment: 'Dumbbells at home' });
  });

  it('an optional question mid-flow offers a skip', async () => {
    (fetchCoachQuestions as jest.Mock).mockResolvedValue({
      questions: [rich[1], rich[0]], answers: {}, completed: false, required: true,
    });
    await render();
    expect(cta().props.title).toBe('Skip');
    await act(async () => { await cta().props.onPress(); });
    expect(cta().props.title).toBe('Build my plan');
    expect(cta().props.disabled).toBe(true);
  });

  it('picking one answer on a single question replaces the last', async () => {
    await render();
    await act(async () => { option('Dumbbells at home').props.onPress(); });
    await act(async () => { await cta().props.onPress(); });
    await act(async () => { option('Morning').props.onPress(); });
    await act(async () => { option('Evening').props.onPress(); });
    expect(option('Morning').props.accessibilityState).toEqual({ selected: false });
    await act(async () => { await cta().props.onPress(); });
    expect(saveCoachQuestions).toHaveBeenCalledWith(expect.objectContaining({ preferredTime: 'Evening' }));
  });
});

describe('finishing the questionnaire lands in a building plan', () => {
  const done = { hasPaid: true, questionnaireCompleted: true, trainerAssigned: true, planReady: false };

  it('plan building starts on arrival rather than asking again', async () => {
    (useAuthStore as jest.Mock).mockReturnValue({ status: done, refreshStatus });
    refreshStatus.mockResolvedValue(done);
    (fetchCoachQuestions as jest.Mock).mockResolvedValue({ questions, answers: {}, completed: true, required: true });
    (fetchOnboardingPlanState as jest.Mock).mockResolvedValue({ status: 'idle' });
    (createOnboardingPlan as jest.Mock).mockResolvedValue({ status: 'completed' });

    await act(async () => {
      renderer = create(
        <PlanPreparingScreen
          navigation={navigation as never}
          route={{ name: 'PlanPreparing', key: 'p', params: { autoStart: true } } as never}
        />,
      );
    });
    expect(createOnboardingPlan).toHaveBeenCalledTimes(1);
  });

  it('arriving without that instruction still waits to be asked', async () => {
    (useAuthStore as jest.Mock).mockReturnValue({ status: done, refreshStatus });
    refreshStatus.mockResolvedValue(done);
    (fetchCoachQuestions as jest.Mock).mockResolvedValue({ questions, answers: {}, completed: true, required: true });
    (fetchOnboardingPlanState as jest.Mock).mockResolvedValue({ status: 'idle' });

    await act(async () => {
      renderer = create(<PlanPreparingScreen navigation={navigation as never} route={{ name: 'PlanPreparing', key: 'p' } as never} />);
    });
    expect(createOnboardingPlan).not.toHaveBeenCalled();
  });
});
