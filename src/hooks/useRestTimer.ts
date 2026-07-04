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
  onCompleteRef.current = onComplete;

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (seconds: number) => {
      clear();
      const total = Math.max(1, Math.round(seconds));
      setState({ running: true, remaining: total, total });
      intervalRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.remaining <= 1) {
            clear();
            onCompleteRef.current?.();
            return { running: false, remaining: 0, total: prev.total };
          }
          return { ...prev, remaining: prev.remaining - 1 };
        });
      }, 1000);
    },
    [clear],
  );

  const stop = useCallback(() => {
    clear();
    setState((prev) => ({ ...prev, running: false, remaining: 0 }));
  }, [clear]);

  const addTime = useCallback((seconds: number) => {
    setState((prev) => ({ ...prev, remaining: Math.max(0, prev.remaining + seconds), total: prev.total + seconds }));
  }, []);

  useEffect(() => clear, [clear]);

  return { ...state, start, stop, addTime };
}
