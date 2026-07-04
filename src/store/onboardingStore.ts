import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY = 'formbae_questionnaire_draft';

export async function loadQuestionnaireDraft(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveQuestionnaireDraft(answers: Record<string, string>) {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
}

export async function clearQuestionnaireDraft() {
  await AsyncStorage.removeItem(DRAFT_KEY);
}
