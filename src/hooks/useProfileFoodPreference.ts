import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { loadProfileSettingsCached, peekProfileSettingsCached } from '../services/preloadService';

export function useProfileFoodPreference() {
  const [preference, setPreference] = useState(() => peekProfileSettingsCached()?.profile?.dietPref || '');
  useFocusEffect(useCallback(() => {
    let active = true;
    setPreference(peekProfileSettingsCached()?.profile?.dietPref || '');
    loadProfileSettingsCached()
      .then(settings => { if (active) setPreference(settings.profile?.dietPref || ''); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []));
  return preference;
}
