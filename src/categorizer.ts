import { getPriorityTags } from "./config.js";
import type { Bookmark, DigestSections, ScoredBookmark } from "./types.js";

const BURIED_TREASURE_DAYS = 30;
const BURIED_TREASURE_COUNT = 3;
const THIS_MONTH_LAST_YEAR_COUNT = 3;
const MAX_ITEMS_PER_SECTION = 5;
const MIN_TAG_ITEMS = 3;
const MIN_CONTENT_LENGTH = 200;
const RECENTLY_SAVED_COUNT = 3;
const RECENTLY_SAVED_DAYS = 30;

/**
 * Calculate priority score for a bookmark
 * Higher score = higher priority in digest
 */
function calculatePriorityScore(bookmark: Bookmark, now: Date): number {
  const ageInDays =
    (now.getTime() - bookmark.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Base score from age (logarithmic to prevent explosion)
  let score = Math.log(ageInDays + 1) * 10;

  // Boost for priority tags
  const priorityTags = getPriorityTags();
  const bookmarkTagsLower = bookmark.tags.map((t) => t.toLowerCase());

  if (priorityTags.some((pt) => bookmarkTagsLower.includes(pt))) {
    score += 20;
  }

  // Boost if has full content (more to summarize)
  if (bookmark.content && bookmark.content.length > 500) {
    score += 5;
  }

  // Boost for long-form content
  if (bookmark.content && bookmark.content.length > 2000) {
    score += 3;
  }

  return score;
}

/**
 * Get scored and sorted bookmarks
 */
function getScoreBookmarks(bookmarks: Bookmark[], now: Date): ScoredBookmark[] {
  return bookmarks
    .map((b) => ({
      ...b,
      score: calculatePriorityScore(b, now),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Build tag frequency map
 */
function buildTagFrequencyMap(
  bookmarks: Bookmark[]
): Map<string, Bookmark[]> {
  const tagMap = new Map<string, Bookmark[]>();

  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags) {
      const existing = tagMap.get(tag) || [];
      existing.push(bookmark);
      tagMap.set(tag, existing);
    }
  }

  return tagMap;
}

/**
 * Find a random qualifying tag with at least MIN_TAG_ITEMS bookmarks
 * Randomly selects from all qualifying tags to provide variety across digests
 */
function findTopTag(
  tagMap: Map<string, Bookmark[]>,
  usedIds: Set<string>
): { tag: string; bookmarks: Bookmark[] } | null {
  // Collect all qualifying tags (those with enough available bookmarks)
  const qualifyingTags: { tag: string; bookmarks: Bookmark[] }[] = [];

  for (const [tag, bookmarks] of tagMap) {
    // Filter out already-used bookmarks
    const available = bookmarks.filter((b) => !usedIds.has(b.id));

    if (available.length >= MIN_TAG_ITEMS) {
      qualifyingTags.push({
        tag,
        bookmarks: available.slice(0, MAX_ITEMS_PER_SECTION),
      });
    }
  }

  if (qualifyingTags.length === 0) {
    return null;
  }

  // Randomly select from qualifying tags
  const randomIndex = Math.floor(Math.random() * qualifyingTags.length);
  return qualifyingTags[randomIndex];
}

/**
 * Categorize bookmarks into digest sections
 */
export function categorize(
  bookmarks: Bookmark[],
  lastYearBookmarks: Bookmark[] = [],
  archivedBookmarks: Bookmark[] = []
): DigestSections {
  const now = new Date();
  const usedIds = new Set<string>();

  // Filter out bookmarks without sufficient content
  const validBookmarks = filterSufficientContent(bookmarks);
  const validLastYear = filterSufficientContent(lastYearBookmarks);
  const validArchived = filterSufficientContent(archivedBookmarks);

  // Recently Saved: 3 random unread from last 30 days
  const recentlySaved = getRecentlySaved(
    validBookmarks,
    RECENTLY_SAVED_DAYS,
    RECENTLY_SAVED_COUNT,
    now
  );
  recentlySaved.forEach((b) => usedIds.add(b.id));

  // Buried Treasure: 30+ days old, still unread
  const thirtyDaysAgo = new Date(
    now.getTime() - BURIED_TREASURE_DAYS * 24 * 60 * 60 * 1000
  );

  const buriedTreasure = validBookmarks
    .filter((b) => !usedIds.has(b.id) && b.createdAt < thirtyDaysAgo)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) // Oldest first
    .slice(0, BURIED_TREASURE_COUNT);

  buriedTreasure.forEach((b) => usedIds.add(b.id));

  // This Month Last Year
  const thisMonthLastYear = validLastYear.slice(0, THIS_MONTH_LAST_YEAR_COUNT);
  thisMonthLastYear.forEach((b) => usedIds.add(b.id));

  // Tag Roundup: Most popular tag with 3+ items
  const tagMap = buildTagFrequencyMap(validBookmarks);
  const tagRoundup = findTopTag(tagMap, usedIds);

  if (tagRoundup) {
    tagRoundup.bookmarks.forEach((b) => usedIds.add(b.id));
  }

  // Random Pick: Single random selection from remaining
  const remaining = validBookmarks.filter((b) => !usedIds.has(b.id));
  const randomPick =
    remaining.length > 0
      ? remaining[Math.floor(Math.random() * remaining.length)]
      : null;

  // From the Archives: Single random selection from archived items
  const fromTheArchives =
    validArchived.length > 0
      ? validArchived[Math.floor(Math.random() * validArchived.length)]
      : null;

  return {
    recentlySaved,
    buriedTreasure,
    thisMonthLastYear,
    tagRoundup,
    randomPick,
    fromTheArchives,
    stats: {
      totalUnread: validBookmarks.length,
      generatedAt: now,
    },
  };
}

/**
 * Calculate how many days ago a date was
 */
export function daysAgo(date: Date): number {
  const now = new Date();
  return Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
}

/**
 * Estimate reading time in minutes based on content length
 */
export function estimateReadTime(content?: string): number {
  if (!content) return 1;

  // Average reading speed: 200-250 words per minute
  // Assuming average word length of 5 characters
  const words = content.length / 5;
  const minutes = Math.ceil(words / 200);

  return Math.max(1, Math.min(minutes, 30)); // Clamp between 1-30 minutes
}

/**
 * Filter bookmarks with insufficient content for summarization
 * Checks both content and summary fields since the LLM uses a fallback chain
 */
export function filterSufficientContent(bookmarks: Bookmark[]): Bookmark[] {
  return bookmarks.filter((b) => {
    const contentLength = (b.content || "").length;
    const summaryLength = (b.summary || "").length;
    // Accept if either content or summary has sufficient length
    return contentLength >= MIN_CONTENT_LENGTH || summaryLength >= MIN_CONTENT_LENGTH;
  });
}

/**
 * Get random articles from the last N days
 */
function getRecentlySaved(
  bookmarks: Bookmark[],
  days: number,
  count: number,
  now: Date
): Bookmark[] {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const recent = bookmarks.filter((b) => b.createdAt >= cutoff);
  const shuffled = [...recent].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
