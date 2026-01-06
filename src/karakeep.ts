import { config } from "./config.js";
import type { Bookmark, KarakeepBookmark, KarakeepBookmarksResponse } from "./types.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Extract domain from URL for source display
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * Transform Karakeep API bookmark to internal format
 */
function transformBookmark(raw: KarakeepBookmark): Bookmark {
  const url = raw.content?.url || "";
  const title = raw.title || raw.content?.title || raw.content?.url || "Untitled";

  return {
    id: raw.id,
    url,
    title,
    content: raw.content,
    summary: raw.summary || raw.content?.description,
    tags: raw.tags,
    createdAt: new Date(raw.createdAt),
    archived: raw.archived,
    favourited: raw.favourited,
    source: extractDomain(url),
    note: raw.note,
    userId: raw.userId,
    assets: raw.assets,
  };
}

/**
 * Make API request with retry logic
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.karakeepUrl}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${config.karakeepApiKey}`,
    "Content-Type": "application/json",
    ...options.headers,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 429) {
        // Rate limited - check for Retry-After header
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
        console.warn(`Rate limited, retrying after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`API error ${response.status}: ${body.slice(0, 200)}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error as Error;

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * 2 ** (attempt - 1);
        console.warn(
          `Request failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms:`,
          (error as Error).message
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Unknown error during API request");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchBookmarksOptions {
  archived?: boolean;
  limit?: number;
}

/**
 * Fetch the content asset for a bookmark (the actual crawled HTML/text)
 * Returns the content as a string, or null if not available
 */
export async function fetchBookmarkContent(bookmark: Bookmark): Promise<string | null> {
  const assetId = bookmark.content?.contentAssetId;

  // If htmlContent is already available, use it
  if (bookmark.content?.htmlContent) {
    return bookmark.content.htmlContent;
  }

  // If no asset ID, no content to fetch
  if (!assetId) {
    return null;
  }

  try {
    const url = `${config.karakeepUrl}/api/v1/assets/${assetId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.karakeepApiKey}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    // The asset endpoint returns the raw content
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Fetch all bookmarks from Karakeep with pagination
 */
export async function fetchBookmarks(options: FetchBookmarksOptions = {}): Promise<Bookmark[]> {
  const { archived = false, limit } = options;
  const bookmarks: Bookmark[] = [];
  let cursor: string | null = null;
  const pageSize = 100;

  do {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));

    if (archived !== undefined) {
      params.set("archived", String(archived));
    }

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await apiRequest<KarakeepBookmarksResponse>(
      `/api/v1/bookmarks?${params.toString()}`
    );

    for (const raw of response.bookmarks) {
      bookmarks.push(transformBookmark(raw));

      if (limit && bookmarks.length >= limit) {
        return bookmarks.slice(0, limit);
      }
    }

    cursor = response.nextCursor;
  } while (cursor);

  return bookmarks;
}

/**
 * Fetch bookmarks created within a date range
 * Used for "This Month Last Year" feature
 */
export async function fetchBookmarksFromDateRange(start: Date, end: Date): Promise<Bookmark[]> {
  // Karakeep API doesn't support date range filtering directly,
  // so we fetch all and filter client-side
  const allBookmarks = await fetchBookmarks({ archived: false });

  return allBookmarks.filter((bookmark) => {
    return bookmark.createdAt >= start && bookmark.createdAt <= end;
  });
}

/**
 * Get date range for "this month last year"
 */
export function getLastYearDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  const month = now.getMonth();

  const start = new Date(lastYear, month, 1);
  const end = new Date(lastYear, month + 1, 0, 23, 59, 59, 999);

  return { start, end };
}

/**
 * Fetch bookmarks from this month last year
 */
export async function fetchThisMonthLastYear(): Promise<Bookmark[]> {
  const { start, end } = getLastYearDateRange();

  // For this, we need all bookmarks including archived
  const allBookmarks = await fetchBookmarks({});

  return allBookmarks.filter((bookmark) => {
    return bookmark.createdAt >= start && bookmark.createdAt <= end;
  });
}

/**
 * Fetch archived bookmarks for "From the Archives" feature
 */
export async function fetchArchivedBookmarks(): Promise<Bookmark[]> {
  return fetchBookmarks({ archived: true });
}
