import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QuestionnaireFlow } from './QuestionnaireScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { fetchQuestionnaire, submitQuestionnaire } from '../../services/questionnaireService';
import { loadQuestionnaireDraft } from '../../store/onboardingStore';

jest.mock('../../store/authStore', () => ({ useAuthStore: () => ({ user: { userId: 'member' } }) }));
jest.mock('../../services/questionnaireService', () => ({ fetchQuestionnaire: jest.fn(), submitQuestionnaire: jest.fn(), saveQuestionnaireDraft: jest.fn() }));
jest.mock('../../store/onboardingStore', () => ({ loadQuestionnaireDraft: jest.fn(), saveQuestionnaireDraft: jest.fn().mockResolvedValue(undefined), clearQuestionnaireDraft: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../services/activityService', () => ({ trackMobileInteraction: jest.fn() }));
let renderer: ReactTestRenderer;
const questions = [
  { id: 'goal', title: 'Your goal', type: 'single', options: [{ value: 'strength', label: 'Get stronger' }] },
  { id: 'location', title: 'Where will you train?', type: 'single', options: [{ value: 'home', label: 'At home' }] },
];
beforeEach(() => {
  jest.clearAllMocks();
  (loadQuestionnaireDraft as jest.Mock).mockResolvedValue({});
  (fetchQuestionnaire as jest.Mock).mockResolvedValue({ questions, answers: { goal: 'strength' } });
});
afterEach(() => act(() => renderer.unmount()));
async function render(onComplete = jest.fn()) {
  await act(async () => { renderer = create(<QuestionnaireFlow onComplete={onComplete} />); });
}
it('resumes the first missing answer from the authenticated account', async () => {
  await render();
  expect(loadQuestionnaireDraft).toHaveBeenCalledWith('member');
  expect(JSON.stringify(renderer.toJSON())).toContain('Where will you train?');
  expect(renderer.root.findByType(PrimaryButton).props.disabled).toBe(true);
});
it('a load failure offers retry instead of an endless loading screen', async () => {
  (fetchQuestionnaire as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await render();
  const retry = renderer.root.findAllByType(PrimaryButton).find(node => node.props.title === 'Retry')!;
  await act(async () => { await retry.props.onPress(); });
  expect(JSON.stringify(renderer.toJSON())).toContain('Where will you train?');
});
it('paid profile setup uses its completion callback without entering analysis or checkout', async () => {
  const complete = jest.fn();
  await render(complete);
  const radio = renderer.root.findAllByProps({ accessibilityRole: 'radio' })[0];
  await act(async () => { await radio.props.onPress(); });
  await act(async () => { await renderer.root.findByType(PrimaryButton).props.onPress(); });
  expect(submitQuestionnaire).toHaveBeenCalledWith({ goal: 'strength', location: 'home' });
  expect(complete).toHaveBeenCalledTimes(1);
});
