import { clearReadingCache, loadReadingPage, peekReadingPage, preloadReadingPage } from './readingFeedService';

const originalFetch = globalThis.fetch;
let day = 10;
beforeEach(() => {
  clearReadingCache();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 8, day++));
});

it('shares startup preloading with an early tab open and exposes the cached first page synchronously', async () => {
  let finish!: (value: Response) => void;
  globalThis.fetch = jest.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const preload = preloadReadingPage();
  const preview = loadReadingPage(1, new AbortController().signal);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(peekReadingPage(1)).toBeUndefined();
  finish(response([post(1)]));
  const page = await preload;
  expect(await preview).toBe(page);
  expect(peekReadingPage(1)).toBe(page);
  jest.setSystemTime(Date.now() + 60 * 60 * 1000);
  expect(peekReadingPage(1)).toBeUndefined();
});

it('lets the preview retry after a failed startup preload', async () => {
  globalThis.fetch = jest.fn().mockResolvedValueOnce(response({}, '', 503)).mockResolvedValueOnce(response([post(1)]));
  await expect(preloadReadingPage()).rejects.toThrow();
  expect(peekReadingPage(1)).toBeUndefined();
  expect((await loadReadingPage(1, new AbortController().signal)).articles).toHaveLength(1);
});

it('does not let a pending startup request refill a manually cleared cache', async () => {
  let finish!: (value: Response) => void;
  globalThis.fetch = jest.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const preload = preloadReadingPage();
  clearReadingCache();
  finish(response([post(1)]));
  await preload;
  expect(peekReadingPage(1)).toBeUndefined();
});
afterEach(() => { globalThis.fetch = originalFetch; jest.useRealTimers(); });
const post = (id: number) => ({ id, link: `https://news.harvard.edu/article-${id}/`, title: { rendered: 'Food &amp; movement &#8211; a guide' }, date: '2026-01-09T12:00:00' });
const response = (body: unknown, pages = '3', status = 200) => ({ ok: status === 200, status, json: async () => body, headers: { get: () => pages } } as unknown as Response);

it('loads actual publisher metadata, decodes titles and keeps app credentials out of the request', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue(response(Array.from({ length: 12 }, (_, i) => post(i + 1))));
  const page = await loadReadingPage(1, new AbortController().signal);
  expect(page.nextPage).toBe(2);
  expect(page.articles[0]).toMatchObject({ title: 'Food & movement – a guide', publishedAt: '2026-01-09', publisher: 'Harvard Gazette' });
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('page=1&'), expect.objectContaining({ credentials: 'omit', headers: { Accept: 'application/json' } }));
  await loadReadingPage(1, new AbortController().signal);
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

it('drops malformed and off-publisher entries and deduplicates article URLs', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue(response([post(1), post(1), { ...post(2), link: 'https://news.harvard.edu.evil.example/article' }, { ...post(3), title: null }, null]));
  const page = await loadReadingPage(1, new AbortController().signal);
  expect(page.articles).toHaveLength(1);
  expect(page.nextPage).toBeNull();
});

it('recognizes the final page and publisher pagination exhaustion', async () => {
  globalThis.fetch = jest.fn().mockResolvedValueOnce(response(Array.from({ length: 12 }, (_, i) => post(i + 1)), '1'))
    .mockResolvedValueOnce(response({ code: 'rest_post_invalid_page_number' }, '', 400));
  expect((await loadReadingPage(1, new AbortController().signal)).nextPage).toBeNull();
  expect(await loadReadingPage(2, new AbortController().signal)).toEqual({ articles: [], nextPage: null });
});

it('does not cache a failed response, so the same page can be retried', async () => {
  globalThis.fetch = jest.fn().mockResolvedValueOnce(response({}, '', 503)).mockResolvedValueOnce(response([post(1)]));
  await expect(loadReadingPage(1, new AbortController().signal)).rejects.toThrow();
  expect((await loadReadingPage(1, new AbortController().signal)).articles).toHaveLength(1);
});

it('aborts a stalled publisher request after the timeout', async () => {
  globalThis.fetch = jest.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const pending = loadReadingPage(1, new AbortController().signal);
  const rejected = pending.catch(error => error);
  await jest.advanceTimersByTimeAsync(12000);
  expect(await rejected).toEqual(new Error('Aborted'));
});

it('sorts by publication date and uses only valid publisher images and dated articles', async () => {
  const media = { _embedded: { 'wp:featuredmedia': [{ media_details: { sizes: { medium_large: { source_url: 'https://news.harvard.edu/photo.jpg?w=728' } } } }] } };
  globalThis.fetch = jest.fn().mockResolvedValue(response([
    post(1), { ...post(2), ...media, date: '2026-09-02T12:00:00', tags: [12820] },
    { ...post(3), date: 'bad-date' }, { ...post(4), ...media, _embedded: { 'wp:featuredmedia': [{ source_url: 'http://external.example/photo.jpg' }] } },
  ]));
  const page = await loadReadingPage(1, new AbortController().signal);
  expect(page.articles.map(article => article.id)).toEqual(['gazette-2', 'gazette-1', 'gazette-4']);
  expect(page.articles[0]).toMatchObject({ imageUrl: 'https://news.harvard.edu/photo.jpg?w=728', topic: 'training', publishedAt: '2026-09-02' });
  expect(page.articles[2].imageUrl).toBeUndefined();
  expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('orderby=date&order=desc'), expect.anything());
});
