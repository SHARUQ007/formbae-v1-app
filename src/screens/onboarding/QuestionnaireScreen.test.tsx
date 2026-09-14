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

describe('exact measurements and preferred languages', () => {
  const measure = { id: 'p_height', title: 'What is your height?', type: 'number', unit: 'cm', min: 120, max: 230, placeholder: 'e.g. 172' };
  const languages = {
    id: 'languages', title: 'Which languages do you prefer?', type: 'multi', required: false,
    options: [{ value: 'English', label: 'English' }, { value: 'Malayalam', label: 'Malayalam' }],
  };
  const input = () => renderer.root.findByType(FormInput);
  const cta = () => renderer.root.findAllByType(PrimaryButton).find(node => node.props.title === 'Submit answers')!;

  it('keeps a measurement to digits and refuses one outside the range', async () => {
    (fetchQuestionnaire as jest.Mock).mockResolvedValue({ questions: [measure], answers: {} });
    await render();
    await act(async () => { await input().props.onChangeText('17a2cm'); });
    expect(input().props.value).toBe('172');

    await act(async () => { await input().props.onChangeText('900'); });
    await act(async () => { await cta().props.onPress(); });
    expect(submitQuestionnaire).not.toHaveBeenCalled();
    expect(input().props.error).toContain('between 120 and 230');
  });

  it('submits the exact figure once it is in range', async () => {
    (fetchQuestionnaire as jest.Mock).mockResolvedValue({ questions: [measure], answers: {} });
    (submitQuestionnaire as jest.Mock).mockResolvedValue({ ok: true });
    await render();
    await act(async () => { await input().props.onChangeText('172'); });
    await act(async () => { await cta().props.onPress(); });
    expect(submitQuestionnaire).toHaveBeenCalledWith({ p_height: '172' });
  });

  it('collects several languages into one answer and lets them be unpicked', async () => {
    (fetchQuestionnaire as jest.Mock).mockResolvedValue({ questions: [languages], answers: {} });
    (submitQuestionnaire as jest.Mock).mockResolvedValue({ ok: true });
    await render();
    const chip = (label: string) => renderer.root.findAll(node =>
      node.type === TouchableOpacity && node.props.accessibilityLabel === label)[0];
    await act(async () => { await chip('English').props.onPress(); });
    await act(async () => { await chip('Malayalam').props.onPress(); });
    await act(async () => { await cta().props.onPress(); });
    expect(submitQuestionnaire).toHaveBeenCalledWith({ languages: 'English, Malayalam' });
  });

  it('an optional language question does not block the continue button', async () => {
    (fetchQuestionnaire as jest.Mock).mockResolvedValue({ questions: [languages], answers: {} });
    await render();
    expect(cta().props.disabled).toBe(false);
  });
});
