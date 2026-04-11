/**
 * Social media search link builders.
 * We generate deep-link search URLs — no scraping to avoid ToS violations.
 * If a video URL is explicitly provided by the user, it can be passed to AI for transcript.
 */

export function buildTikTokSearchUrl(query: string): string {
  return `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
}

export function buildInstagramHashtagUrl(placeName: string): string {
  const tag = placeName.replace(/\s+/g, "").toLowerCase();
  return `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`;
}

export function buildInstagramSearchUrl(query: string): string {
  return `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`;
}

export function buildYouTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/**
 * Generate all social links for a restaurant or place.
 */
export function buildSocialLinks(
  name: string,
  city: string
): {
  tiktok_search_link: string;
  ig_search_link: string;
  youtube_search_link: string;
} {
  const query = `${name} ${city}`;
  return {
    tiktok_search_link: buildTikTokSearchUrl(query),
    ig_search_link: buildInstagramSearchUrl(query),
    youtube_search_link: buildYouTubeSearchUrl(query),
  };
}

/**
 * Check if a URL is a video URL (TikTok / IG Reel / YouTube).
 * If true, it should be passed to AI for transcript extraction.
 */
export function isVideoUrl(url: string): boolean {
  return (
    url.includes("tiktok.com/@") ||
    url.includes("instagram.com/reel/") ||
    url.includes("youtube.com/watch") ||
    url.includes("youtu.be/")
  );
}
