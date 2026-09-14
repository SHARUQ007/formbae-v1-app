import React from 'react';
import { TouchableOpacity } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QuestionnaireFlow } from './QuestionnaireScreen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { FormInput } from '../../components/FormInput';
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
it('offers quick coach notes while preserving an editable answer', async () => {
  (fetchQuestionnaire as jest.Mock).mockResolvedValue({
    questions: [{
      id: 'injuries',
      title: 'Anything your coach should know?',
      subtitle: 'Share anything useful.',
      type: 'text',
      required: false,
    }],
    answers: {},
  });
  await render();
  const options = renderer.root.findAll(node => node.type === TouchableOpacity && node.props.accessibilityRole === 'checkbox');
  expect(options).toHaveLength(4);
  await act(async () => { await options[1].props.onPress(); });
  expect(renderer.root.findByType(FormInput).props.value).toBe('I have knee or back discomfort.');
  await act(async () => { await renderer.root.findByType(FormInput).props.onChangeText('Custom coach note'); });
  expect(renderer.root.findByType(FormInput).props.value).toBe('Custom coach note');
});
