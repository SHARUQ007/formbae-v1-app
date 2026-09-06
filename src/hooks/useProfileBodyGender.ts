import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  loadProfileSettingsCached,
  peekProfileSettingsCached,
} from '../services/preloadService';
import { resolveBodyGender } from '../utils/weeklyMuscles';

export function useProfileBodyGender() {
  const [gender, setGender] = useState(() =>
    resolveBodyGender(peekProfileSettingsCached()?.profile?.gender),
  );

  useFocusEffect(useCallback(() => {
    let active = true;
    const cachedSettings = peekProfileSettingsCached();
    if (cachedSettings) {
      setGender(resolveBodyGender(cachedSettings.profile?.gender));
    }

    loadProfileSettingsCached()
      .then((settings) => {
        if (active) setGender(resolveBodyGender(settings.profile?.gender));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []));

  return gender;
}
