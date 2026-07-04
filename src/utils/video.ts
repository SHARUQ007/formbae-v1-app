/**
 * Normalizes a stored video URL/key into a YouTube video id / URL pair.
 * Backend videos store either a full URL or a YouTube video key.
 */
export function getYouTubeVideoId(rawUrl: string): string | null {
  const url = (rawUrl || '').trim();
  if (!url) return null;

  const patterns = [
    /youtube\.com\/shorts\/([^?&/]+)/i,
    /youtube\.com\/watch\?(?:.*&)?v=([^?&/]+)/i,
    /youtube\.com\/embed\/([^?&/]+)/i,
    /youtube\.com\/live\/([^?&/]+)/i,
    /youtube-nocookie\.com\/embed\/([^?&/]+)/i,
    /youtu\.be\/([^?&/]+)/i,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  // Bare 11-char key
  if (/^[\w-]{11}$/.test(url)) {
    return url;
  }

  return null;
}

export function getYoutubeEmbedUrl(rawUrl: string): string | null {
  const videoId = getYouTubeVideoId(rawUrl);
  if (!videoId) return null;
  const params = [
    'playsinline=1',
    'enablejsapi=1',
    'controls=1',
    'rel=0',
    'modestbranding=1',
    'iv_load_policy=3',
    'autoplay=0',
    'origin=https%3A%2F%2Fformbae.in',
  ];
  return `https://www.youtube.com/embed/${videoId}?${params.join('&')}`;
}

export function getYoutubeWatchUrl(rawUrl: string): string | null {
  const videoId = getYouTubeVideoId(rawUrl);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function getYoutubeThumbnailUrl(rawUrl: string): string | null {
  const videoId = getYouTubeVideoId(rawUrl);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

export function isPlayableVideo(rawUrl: string): boolean {
  return getYoutubeEmbedUrl(rawUrl) !== null;
}
