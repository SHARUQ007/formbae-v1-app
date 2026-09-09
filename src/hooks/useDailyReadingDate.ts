import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localReadingDate } from '../utils/dailyReading';

export function useDailyReadingDate() {
  const [dateKey, setDateKey] = useState(localReadingDate);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setDateKey(localReadingDate(now));
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    refresh();
    // Native timers pause in the background. Recheck the local date on return,
    // including after travel or a device clock change.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return dateKey;
}
