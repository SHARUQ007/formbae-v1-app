import type { ReportArticleSource } from '../utils/reportReading';

const ORIGIN = 'https://news.harvard.edu';
// Publisher taxonomy: food/nutrition, exercise, fitness, sleep, diet and wellness.
const TOPIC_TAGS = '53019,26015,26016,12820,13409,31478,10898,35699';
const PAGE_SIZE = 12;
export type ReadingPage = { articles: ReportArticleSource[]; nextPage: number | null };
const cache = new Map<string, ReadingPage>();
let cacheGeneration = 0;
let warming: { key: string; promise: Promise<ReadingPage> } | null = null;
const pageKey = (page: number) => `${new Date().toISOString().slice(0, 13)}:${page}`;
export function clearReadingCache() { cacheGeneration += 1; cache.clear(); warming = null; }
export function peekReadingPage(page: number) { return cache.get(pageKey(page)); }

/** Share startup's request with a preview opened before warm-up finishes. */
export function preloadReadingPage() {
  const key = pageKey(1);
  if (warming?.key === key) return warming.promise;
  const promise = loadReadingPage(1, new AbortController().signal);
  const entry = { key, promise };
  warming = entry;
  const cleanup = () => { if (warming === entry) warming = null; };
  promise.then(cleanup, cleanup);
  return promise;
}

export function readingUrlKey(url: string) {
  return url.replace(/[?#].*$/, '').replace(/\/+$/, '');
}

export function uniqueReading(articles: ReportArticleSource[]) {
  const seen = new Set<string>();
  return articles.filter(article => {
    const key = readingUrlKey(article.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function plainTitle(value: string) {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
    if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? entity;
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/\s+/g, ' ').trim();
}

/** Public publisher metadata only. Never send FormBae credentials to a publisher. */
export async function loadReadingPage(page: number, signal: AbortSignal): Promise<ReadingPage> {
  if (!Number.isInteger(page) || page < 1) throw new Error('Invalid reading page');
  const key = pageKey(page);
  const saved = cache.get(key);
  if (saved) return saved;
  if (warming?.key === key) return warming.promise;
  const generation = cacheGeneration;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  signal.addEventListener('abort', abort);
  const timer = setTimeout(abort, 12_000);
  try {
    const response = await fetch(`${ORIGIN}/wp-json/wp/v2/posts?per_page=${PAGE_SIZE}&page=${page}&categories=39644&tags=${TOPIC_TAGS}&orderby=date&order=desc&_embed=wp:featuredmedia&_fields=id,link,title,date,tags,_links,_embedded`, {
      signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' },
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      if (response.status === 400 && (payload as { code?: string })?.code === 'rest_post_invalid_page_number') return { articles: [], nextPage: null };
      throw new Error('The publisher could not load more articles.');
    }
    if (!Array.isArray(payload)) throw new Error('The publisher returned an unreadable list.');
    const articles = uniqueReading(payload.flatMap((post): ReportArticleSource[] => {
      if (!Number.isInteger(post?.id) || post.id <= 0 || typeof post?.link !== 'string' || !post.link.startsWith(`${ORIGIN}/`) || typeof post.title?.rendered !== 'string') return [];
      const title = plainTitle(post.title.rendered);
      if (!title || title.length > 500) return [];
      if (typeof post.date !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(post.date) || !Number.isFinite(Date.parse(post.date))) return [];
      const media = post._embedded?.['wp:featuredmedia']?.[0];
      const image = media?.media_details?.sizes?.medium_large?.source_url || media?.source_url;
      const tags = Array.isArray(post.tags) ? post.tags : [];
      const topic = tags.includes(31478) ? 'recovery' : tags.some((tag: number) => [12820, 13409].includes(tag)) ? 'training' : 'nutrition';
      return [{ id: `gazette-${post.id}`, url: post.link, title, publisher: 'Harvard Gazette', topic,
        imageUrl: typeof image === 'string' && image.startsWith(`${ORIGIN}/`) ? image : undefined,
        publishedAt: post.date.slice(0, 10) }];
    }));
    articles.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    const totalPages = Number(response.headers.get('X-WP-TotalPages'));
    const result = { articles, nextPage: payload.length < PAGE_SIZE || (totalPages > 0 && page >= totalPages) ? null : page + 1 };
    if (generation === cacheGeneration) cache.set(key, result);
    if (cache.size > 32) cache.delete(cache.keys().next().value!);
    return result;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
