export type CareerFeedItem = {
  title: string;
  url: string;
  description: string;
  details?: string;
  published_at: string | null;
  categories: string[];
};

export type CareerFeedResponse = {
  source?: string;
  source_url?: string;
  updated_at?: string;
  items?: CareerFeedItem[];
  notice?: string;
  error?: string;
};

export const CAREER_FEED_CACHE_KEY = "group13:career-feed:kenya:v2";
const ALLOWED_LISTING_HOSTS = new Set([
  "ngojobsinafrica.com",
  "www.ngojobsinafrica.com",
]);

function validFeedItem(value: unknown): value is CareerFeedItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== "string" || !item.title.trim() || typeof item.url !== "string") return false;
  try {
    const url = new URL(item.url);
    if (url.protocol !== "https:" || !ALLOWED_LISTING_HOSTS.has(url.hostname)) return false;
  } catch {
    return false;
  }
  return typeof item.description === "string" &&
    (item.details === undefined || (typeof item.details === "string" && item.details.length <= 12_000)) &&
    (item.published_at === null || typeof item.published_at === "string") &&
    Array.isArray(item.categories) && item.categories.every((category) => typeof category === "string");
}

export function normalizeCareerFeed(value: unknown): CareerFeedResponse | null {
  if (!value || typeof value !== "object") return null;
  const feed = value as Record<string, unknown>;
  if (!Array.isArray(feed.items) || !feed.items.every(validFeedItem)) return null;
  return {
    source: typeof feed.source === "string" ? feed.source : "Kenya-focused opportunities feed",
    ...(typeof feed.source_url === "string" ? { source_url: feed.source_url } : {}),
    updated_at: typeof feed.updated_at === "string" && !Number.isNaN(Date.parse(feed.updated_at)) ? feed.updated_at : new Date(0).toISOString(),
    items: feed.items,
    notice: typeof feed.notice === "string" ? feed.notice : "",
  };
}

export function readCareerFeedCache(storage?: Pick<Storage, "getItem">): CareerFeedResponse | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(CAREER_FEED_CACHE_KEY);
    return serialized ? normalizeCareerFeed(JSON.parse(serialized)) : null;
  } catch {
    return null;
  }
}

export function writeCareerFeedCache(feed: CareerFeedResponse, storage?: Pick<Storage, "setItem">): void {
  if (!storage || !feed.items) return;
  try {
    storage.setItem(CAREER_FEED_CACHE_KEY, JSON.stringify(feed));
  } catch {
    // A full or disabled browser storage area must not block live feed rendering.
  }
}

export async function careerFeedErrorMessage(error: unknown): Promise<string> {
  const baseMessage = error instanceof Error ? error.message : "Could not refresh current opportunities.";
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : undefined;
  if (context && typeof context === "object" && "clone" in context && typeof (context as { clone?: unknown }).clone === "function") {
    const response = context as Response;
    try {
      const payload = await response.clone().json() as { error?: unknown };
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
    } catch {
      // A proxy/gateway may return non-JSON; the HTTP status below is still useful.
    }
    if (!response.ok) return `The Career opportunities service returned HTTP ${response.status}. Please try refreshing later.`;
  }
  if (/edge function returned a non-2xx status code/i.test(baseMessage)) {
    return "The Career opportunities service returned an unsuccessful HTTP response, but its error details were unavailable. Please refresh in a few minutes.";
  }
  return baseMessage;
}
