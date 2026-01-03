/**
 * Raw bookmark structure from Karakeep API
 */
export interface KarakeepBookmark {
  id: string;
  createdAt: string;
  modifiedAt: string | null;
  title?: string;
  archived: boolean;
  favourited: boolean;
  taggingStatus: string | null;
  summarizationStatus: string | null;
  note?: string;
  summary?: string;
  source?: string;
  userId: string;
  content: {
    type: string;
    url?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    favicon?: string;
    htmlContent?: string | null;
    crawledAt?: string;
    text?: string;
    sourceUrl?: string;
    contentAssetId?: string | null;
  };
  tags: Array<{
    id: string;
    name: string;
    attachedBy: string;
  }>;
  assets: Array<{
    id: string;
    assetType: string;
    fileName: string | null;
  }>;
}

/**
 * Karakeep API response structure
 */
export interface KarakeepBookmarksResponse {
  bookmarks: KarakeepBookmark[];
  nextCursor: string | null;
}

/**
 * Internal bookmark representation
 */
export interface Bookmark {
  id: string;
  url: string;
  title?: string;
  summary?: string;
  createdAt: Date;
  archived: boolean;
  favourited: boolean;
  source?: string;
  note?: string;
  userId: string;
  content: {
    type: string;
    url?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    favicon?: string;
    htmlContent?: string | null;
    crawledAt?: string;
    text?: string;
    sourceUrl?: string;
    contentAssetId?: string | null;
  };
  tags: Array<{
    id: string;
    name: string;
    attachedBy: string;
  }>;
  assets: Array<{
    id: string;
    assetType: string;
    fileName: string | null;
  }>;
}

/**
 * Bookmark with priority score for sorting
 */
export interface ScoredBookmark extends Bookmark {
  score: number;
}

/**
 * Bookmark with AI-generated summary
 */
export interface SummarizedBookmark extends Bookmark {
  aiSummary: string;
  daysAgo: number;
  readTime: number;
}

/**
 * Tag cluster with synthesis
 */
export interface TagRoundup {
  tag: string;
  bookmarks: SummarizedBookmark[];
  synthesis: {
    overview: string;
    keyInsights: string[];
    standout: string;
  };
}

/**
 * Complete digest sections structure
 */
export interface DigestSections {
  recentlySaved: Bookmark[];
  buriedTreasure: Bookmark[];
  thisMonthLastYear: Bookmark[];
  tagRoundup: {
    tag: string;
    bookmarks: Bookmark[];
  } | null;
  randomPick: Bookmark | null;
  fromTheArchives: Bookmark | null;
  stats: {
    totalUnread: number;
    generatedAt: Date;
  };
}

/**
 * Summarized digest ready for email rendering
 */
export interface SummarizedDigest {
  recentlySaved: SummarizedBookmark[];
  buriedTreasure: SummarizedBookmark[];
  thisMonthLastYear: SummarizedBookmark[];
  tagRoundup: TagRoundup | null;
  randomPick: SummarizedBookmark | null;
  fromTheArchives: SummarizedBookmark | null;
  stats: {
    totalUnread: number;
    generatedAt: Date;
  };
}

/**
 * LLM provider interface for abstraction
 */
export interface LLMProvider {
  complete(prompt: string, maxTokens: number): Promise<string>;
}

/**
 * Single article summary response from LLM
 */
export interface ArticleSummaryResponse {
  summary: string;
}

/**
 * Topic cluster synthesis response from LLM
 */
export interface ClusterSynthesisResponse {
  overview: string;
  keyInsights: string[];
  standout: string;
}
