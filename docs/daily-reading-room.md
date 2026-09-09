# Accountability reading room

Accountability shows only the first three latest publisher articles. It no longer
rotates evergreen guides or uses the report artwork library. “Read more” opens a
full-screen reading room with a vertical, paginated feed. Back returns to the
same Accountability view; closing an article preserves the feed position.

## Source and freshness

The public source is Harvard Gazette's WordPress API:
`https://news.harvard.edu/wp-json/wp/v2/posts`.
Requests select Health (category 39644) and the publisher's food/nutrition,
exercise, fitness, sleep, diet, and wellness tags (53019, 26015, 26016, 12820,
13409, 31478, 10898, 35699). Results are ordered by publication date descending,
12 per page. The latest three matching articles on 10 September 2026 were
published September 2, August 26 and August 25. “Latest” means latest in this
publisher's selected topics, not necessarily articles published today.

Titles, original publication dates, links and embedded featured-image metadata
are fetched directly. No article bodies are copied. Images come from the
publisher; repeated cover URLs are shown only once per list and missing/failed
images use a text card. App-owned stock images are not substituted.

`readingFeedService.ts` validates dated entries and publisher URLs, decodes title
entities, deduplicates articles, enforces a 12-second timeout, and caches successful
pages by UTC hour (bounded to 32 entries). Public requests carry no app credentials
or cookies. The preview reloads at local midnight and after foregrounding on a new
day. Pull-to-refresh in the full reading room clears cached pages and reloads.
Errors provide retry; no old curated content is silently substituted.

Refreshing keeps existing cards mounted until a replacement page succeeds. If
refresh fails, the current stories and pagination remain usable, with an inline
retry notice. A refresh cancels pending pagination so late responses cannot mix
old and new pages. First-load placeholders are static, with no shimmer or gradient.

App startup preloads the first publisher page and the first three article images
in the background without delaying the splash. My day reads the current-hour
cache synchronously, so warmed cards render on the first frame and on return
visits. Opening My day during warm-up shares that request. A failed preload
remains retryable; expired pages are fetched again using the normal preview flow.

## Reading and pagination

The vertical page loads more near the end and deduplicates overlapping pages.
It stops explicitly at the publisher's last page. Articles open in the original
publisher WebView with browser fallback. At an article's end, “Keep reading” in
the reading room uses the same live feed without the old guide seeds. Report
source links and their optional curated guides remain supported separately.

The reader shows page-scroll progress, source sharing, browser access, and a retry
for failed pages or terminated web renderers. A failed image request does not
replace the whole article with an error. Suggestions reuse the warm first page;
reaching the end reveals a compact Keep reading action instead of shrinking the
article automatically. Readers can expand or dismiss suggestions, open another
story, and return to the previous article. Closing the reader keeps the feed
mounted in its original position. Publisher pages retain their original design.

Tests cover the three-card limit, vertical pagination, article opening/back,
retry, midnight and foreground refresh, image deduplication/failure, publication
ordering and metadata validation, request cancellation, and reader continuation.
