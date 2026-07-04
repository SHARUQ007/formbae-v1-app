import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/apiClient';

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
};

/**
 * Standardized data-fetching state machine used across screens for
 * consistent loading / error / retry / pull-to-refresh behavior.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
    refreshing: false,
  });
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    setState((prev) => ({
      ...prev,
      loading: mode === 'initial' ? true : prev.loading,
      refreshing: mode === 'refresh',
      error: null,
    }));
    try {
      const data = await fnRef.current();
      if (!mounted.current) return;
      setState({ data, loading: false, error: null, refreshing: false });
    } catch (error) {
      if (!mounted.current) return;
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.';
      setState((prev) => ({ ...prev, loading: false, refreshing: false, error: message }));
    }
  }, []);

  useEffect(() => {
    run('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run('initial'), [run]);
  const refresh = useCallback(() => run('refresh'), [run]);
  const setData = useCallback((updater: (prev: T | null) => T | null) => {
    setState((prev) => ({ ...prev, data: updater(prev.data) }));
  }, []);

  return { ...state, reload, refresh, setData };
}
