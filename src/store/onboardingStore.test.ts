import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadQuestionnaireDraft, saveQuestionnaireDraft, clearQuestionnaireDraft } from './onboardingStore';

afterEach(() => AsyncStorage.clear());
test('drafts stay with their account when switching users', async () => {
  await saveQuestionnaireDraft('a', { p_age: '25-34' });
  await saveQuestionnaireDraft('b', { p_age: '55+' });
  expect(await loadQuestionnaireDraft('a')).toEqual({ p_age: '25-34' });
  await clearQuestionnaireDraft('a');
  expect(await loadQuestionnaireDraft('a')).toEqual({});
  expect(await loadQuestionnaireDraft('b')).toEqual({ p_age: '55+' });
});
test('unscoped legacy and malformed drafts are not used for another account', async () => {
  await AsyncStorage.setItem('formbae_questionnaire_draft', '{"p_age":"55+"}');
  expect(await loadQuestionnaireDraft('new-account')).toEqual({});
  await AsyncStorage.setItem('formbae_questionnaire_draft_v2:a', '[]');
  expect(await loadQuestionnaireDraft('a')).toEqual({});
});
