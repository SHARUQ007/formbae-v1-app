/**
 * Normalizes a stored video URL/key into a YouTube embed URL for WebView playback.
 * Backend videos store either a full URL or a youtube video key.
 */
export function getYoutubeEmbedUrl(rawUrl: string): string | null {
  const url = (rawUrl || '').trim();
  if (!url) return null;

  // Already an embed URL
  if (url.includes('youtube.com/embed/')) return url;

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return `https://www.youtube.com/embed/${match[1]}?rel=0&playsinline=1`;
    }
  }

  // Bare 11-char key
  if (/^[\w-]{11}$/.test(url)) {
    return `https://www.youtube.com/embed/${url}?rel=0&playsinline=1`;
  }

  return null;
}

export function isPlayableVideo(rawUrl: string): boolean {
  return getYoutubeEmbedUrl(rawUrl) !== null;
}
