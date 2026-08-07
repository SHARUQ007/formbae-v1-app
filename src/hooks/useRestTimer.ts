import { AppState } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

type TimerState = {
  running: boolean;
  remaining: number;
  total: number;
};

export function useRestTimer(onComplete?: () => void) {
  const [state, setState] = useState<TimerState>({ running: false, remaining: 0, total: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const endsAtRef = useRef<number | null>(null);
  onCompleteRef.current = onComplete;

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (!endsAtRef.current) return;
    const remaining = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
    if (remaining <= 0) {
      clear();
      endsAtRef.current = null;
      setState((prev) => ({ running: false, remaining: 0, total: prev.total }));
      onCompleteRef.current?.();
      return;
    }
    setState((prev) => ({ ...prev, running: true, remaining }));
  }, [clear]);

  const start = useCallback(
    (seconds: number) => {
      clear();
      const total = Math.max(1, Math.round(seconds));
      endsAtRef.current = Date.now() + total * 1000;
      setState({ running: true, remaining: total, total });
      intervalRef.current = setInterval(tick, 1000);
    },
    [clear, tick],
  );

  const stop = useCallback(() => {
    clear();
    endsAtRef.current = null;
    setState((prev) => ({ ...prev, running: false, remaining: 0 }));
  }, [clear]);

  const addTime = useCallback((seconds: number) => {
    if (!endsAtRef.current) return;
    endsAtRef.current += seconds * 1000;
    setState((prev) => ({
      ...prev,
      remaining: Math.max(0, Math.ceil((endsAtRef.current! - Date.now()) / 1000)),
      total: prev.total + seconds,
    }));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') tick();
    });
    return () => {
      subscription.remove();
      clear();
    };
  }, [clear, tick]);

  return { ...state, start, stop, addTime };
}
