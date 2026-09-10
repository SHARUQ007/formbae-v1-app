import AsyncStorage from '@react-native-async-storage/async-storage';

const draftKey = (userId: string) => `formbae_questionnaire_draft_v2:${userId}`;

export async function loadQuestionnaireDraft(userId: string): Promise<Record<string, string>> {
  if (!userId) return {};
  const raw = await AsyncStorage.getItem(draftKey(userId));
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string'));
  } catch { return {}; }
}

export async function saveQuestionnaireDraft(userId: string, answers: Record<string, string>) {
  if (userId) await AsyncStorage.setItem(draftKey(userId), JSON.stringify(answers));
}

export async function clearQuestionnaireDraft(userId: string) {
  if (userId) await AsyncStorage.removeItem(draftKey(userId));
}
