import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportArticleSource } from '../utils/reportReading';
import { clearReadingCache, loadReadingPage, uniqueReading, type ReadingPage } from '../services/readingFeedService';

export function useReadingFeed(seed: ReportArticleSource[], initialPage?: ReadingPage) {
  const [articles, setArticles] = useState(() => uniqueReading([...seed, ...(initialPage?.articles || [])]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [hasMore, setHasMore] = useState(initialPage ? initialPage.nextPage !== null : true);
  const nextPage = useRef<number | null>(initialPage ? initialPage.nextPage : 1);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  const loadMore = useCallback(async () => {
    if (request.current || nextPage.current === null || !mounted.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    try {
      const page = await loadReadingPage(nextPage.current, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setArticles(current => uniqueReading([...current, ...page.articles]));
      nextPage.current = page.nextPage;
      setHasMore(page.nextPage !== null);
    } catch {
      if (mounted.current && !controller.signal.aborted) setError(true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) setLoading(false);
      }
    }
  }, []);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setLoading(false);
    setRefreshError(false);
    clearReadingCache();
    try {
      const page = await loadReadingPage(1, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setArticles(uniqueReading(page.articles));
      nextPage.current = page.nextPage;
      setHasMore(page.nextPage !== null);
      setError(false);
    } catch {
      if (mounted.current && !controller.signal.aborted) setRefreshError(true);
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) setRefreshing(false);
      }
    }
  }, []);
  return { articles, loading, error, hasMore, loadMore, refresh, refreshing, refreshError };
}
