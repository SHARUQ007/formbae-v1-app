import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CoachQuestionsScreen } from './CoachQuestionsScreen';
import { FindingTrainerScreen } from './FindingTrainerScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { fetchCoachQuestions, saveCoachQuestions } from '../../services/onboardingService';
import { changeCoach, fetchCoachHub } from '../../services/trainerService';

jest.mock('../../store/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../services/onboardingService', () => ({ fetchCoachQuestions: jest.fn(), saveCoachQuestions: jest.fn() }));
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
  refreshStatus.mockResolvedValue({ recommendedNextScreen: 'plan_preparing' });
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
  expect(navigation.replace).toHaveBeenCalledWith('PlanPreparing');
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
  refreshStatus.mockResolvedValue({ recommendedNextScreen: 'coach_questions' });
  await act(async () => { renderer = create(<FindingTrainerScreen navigation={navigation as never} route={{ name: 'FindingTrainer', key: 'c' } as never} />); });
  const card = renderer.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Ava,'))[0];
  await act(async () => { card.props.onPress(); });
  const continueCta = renderer.root.findAllByType(PrimaryButton).find(node => node.props.title === 'Continue with this coach')!;
  await act(async () => { await continueCta.props.onPress(); });

  expect(changeCoach).toHaveBeenCalledWith('ava');
  expect(navigation.replace).toHaveBeenCalledWith('CoachQuestions');
});
