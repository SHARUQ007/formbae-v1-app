import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { hasWorkoutStarted, loadWorkoutProgress } from '../store/workoutStore';

export function useWorkoutStarted(planDayId?: string) {
  const [saved, setSaved] = useState({ planDayId: '', started: false });
  useFocusEffect(useCallback(() => {
    let active = true;
    if (planDayId) {
      loadWorkoutProgress(planDayId).then(progress => {
        if (active) setSaved({ planDayId, started: hasWorkoutStarted(progress) });
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [planDayId]));
  return saved.planDayId === planDayId && saved.started;
}
