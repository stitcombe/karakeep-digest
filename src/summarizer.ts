import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { config, getLLMProvider } from "./config.js";
import { daysAgo, estimateReadTime } from "./categorizer.js";
import { fetchBookmarkContent } from "./karakeep.js";
import type {
  ArticleSummaryResponse,
  Bookmark,
  ClusterSynthesisResponse,
  DigestSections,
  LLMProvider,
  SummarizedBookmark,
  SummarizedDigest,
  TagRoundup,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");

// Rate limiting: max concurrent requests
const MAX_CONCURRENT = 5;
const CONTENT_MAX_LENGTH = 8000; // Truncate long content

/**
 * Load prompt template from file
 */
function loadPrompt(name: string): string {
  const path = join(PROMPTS_DIR, `${name}.txt`);
  return readFileSync(path, "utf-8");
}

/**
 * Anthropic/Claude LLM provider
 */
class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  async complete(prompt: string, maxTokens: number): Promise<string> {
    const response = await this.client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type === "text") {
      return content.text;
    }

    throw new Error("Unexpected response type from Anthropic");
  }
}

/**
 * Ollama local LLM provider
 */
class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = config.ollamaUrl!;
    this.model = config.ollamaModel;
  }

  async complete(prompt: string, _maxTokens: number): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }
}

/**
 * Create LLM provider based on configuration
 */
function createProvider(): LLMProvider {
  const provider = getLLMProvider();

  if (provider === "anthropic") {
    return new AnthropicProvider();
  }

  return new OllamaProvider();
}

/**
 * Truncate content to max length, preferring beginning and end
 */
function truncateContent(content: string): string {
  if (content.length <= CONTENT_MAX_LENGTH) {
    return content;
  }

  const halfLength = Math.floor(CONTENT_MAX_LENGTH / 2) - 50;
  const start = content.slice(0, halfLength);
  const end = content.slice(-halfLength);

  return `${start}\n\n[... content truncated ...]\n\n${end}`;
}

/**
 * Parse JSON from LLM response, handling potential markdown wrapping
 */
function parseJsonResponse<T>(response: string): T {
  // Remove potential markdown code block wrapping
  let cleaned = response.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  return JSON.parse(cleaned) as T;
}

/**
 * Summarize a single article
 */
async function summarizeArticle(
  provider: LLMProvider,
  bookmark: Bookmark
): Promise<ArticleSummaryResponse> {
  const promptTemplate = loadPrompt("single-article");
  const contentText = bookmark.content?.htmlContent || bookmark.content?.text || "";
  const content = truncateContent(
    contentText || bookmark.summary || bookmark.title || ""
  );

  const prompt = promptTemplate
    .replace("{{TITLE}}", bookmark.title || "Untitled")
    .replace("{{CONTENT}}", content);

  try {
    const response = await provider.complete(prompt, 300);
    return parseJsonResponse<ArticleSummaryResponse>(response);
  } catch (error) {
    console.warn(
      `Failed to summarize article "${bookmark.title}":`,
      (error as Error).message
    );

    // Fallback to existing summary or title
    return {
      summary: bookmark.summary || bookmark.title || "No summary available",
    };
  }
}

/**
 * Synthesize a cluster of articles with the same tag
 */
async function synthesizeCluster(
  provider: LLMProvider,
  tag: string,
  bookmarks: Bookmark[]
): Promise<ClusterSynthesisResponse> {
  const promptTemplate = loadPrompt("topic-cluster");

  const articles = bookmarks
    .map((b) => {
      const contentText = b.content?.htmlContent || b.content?.text || "";
      return `## ${b.title || "Untitled"}\n${truncateContent(contentText || b.summary || "")}`;
    })
    .join("\n\n---\n\n");

  const prompt = promptTemplate
    .replace("{{COUNT}}", String(bookmarks.length))
    .replace("{{TAG}}", tag)
    .replace("{{ARTICLES}}", articles);

  try {
    const response = await provider.complete(prompt, 500);
    return parseJsonResponse<ClusterSynthesisResponse>(response);
  } catch (error) {
    console.warn(
      `Failed to synthesize cluster "${tag}":`,
      (error as Error).message
    );

    // Fallback synthesis
    return {
      overview: `A collection of ${bookmarks.length} articles about ${tag}.`,
      keyInsights: bookmarks.slice(0, 3).map((b) => b.title || "Untitled"),
      standout: `Check out "${bookmarks[0]?.title || "the first article"}" first.`,
    };
  }
}

/**
 * Convert Bookmark to SummarizedBookmark with AI summary
 */
async function toSummarizedBookmark(
  provider: LLMProvider,
  bookmark: Bookmark
): Promise<SummarizedBookmark> {
  const summary = await summarizeArticle(provider, bookmark);

  // Fetch actual content from Karakeep asset for accurate read time
  const fetchedContent = await fetchBookmarkContent(bookmark);
  const rawContent = fetchedContent || bookmark.content?.htmlContent || bookmark.content?.text;

  // Only calculate read time if we have content, otherwise set to 0 (will be hidden in template)
  const readTime = rawContent ? estimateReadTime(rawContent) : 0;

  return {
    ...bookmark,
    aiSummary: summary.summary,
    daysAgo: daysAgo(bookmark.createdAt),
    readTime,
  };
}

/**
 * Process array with concurrency limit
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items.entries()];

  async function worker() {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;

      const [index, item] = entry;
      results[index] = await fn(item);
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

/**
 * Summarize all sections of the digest
 */
export async function summarizeSections(
  sections: DigestSections
): Promise<SummarizedDigest> {
  console.log("Generating AI summaries...");
  const provider = createProvider();

  // Summarize Recently Saved items
  console.log(
    `  Summarizing ${sections.recentlySaved.length} Recently Saved items`
  );
  const recentlySaved = await mapWithConcurrency(
    sections.recentlySaved,
    (b) => toSummarizedBookmark(provider, b),
    MAX_CONCURRENT
  );

  // Summarize Buried Treasure items
  console.log(
    `  Summarizing ${sections.buriedTreasure.length} Buried Treasure items`
  );
  const buriedTreasure = await mapWithConcurrency(
    sections.buriedTreasure,
    (b) => toSummarizedBookmark(provider, b),
    MAX_CONCURRENT
  );

  // Summarize This Month Last Year items
  console.log(
    `  Summarizing ${sections.thisMonthLastYear.length} historical items`
  );
  const thisMonthLastYear = await mapWithConcurrency(
    sections.thisMonthLastYear,
    (b) => toSummarizedBookmark(provider, b),
    MAX_CONCURRENT
  );

  // Process Tag Roundup with synthesis
  let tagRoundup: TagRoundup | null = null;
  if (sections.tagRoundup) {
    console.log(
      `  Synthesizing ${sections.tagRoundup.bookmarks.length} items for "${sections.tagRoundup.tag}" roundup`
    );

    const summarizedBookmarks = await mapWithConcurrency(
      sections.tagRoundup.bookmarks,
      (b) => toSummarizedBookmark(provider, b),
      MAX_CONCURRENT
    );

    const synthesis = await synthesizeCluster(
      provider,
      sections.tagRoundup.tag,
      sections.tagRoundup.bookmarks
    );

    tagRoundup = {
      tag: sections.tagRoundup.tag,
      bookmarks: summarizedBookmarks,
      synthesis,
    };
  }

  // Summarize Random Pick
  let randomPick: SummarizedBookmark | null = null;
  if (sections.randomPick) {
    console.log("  Summarizing random pick");
    randomPick = await toSummarizedBookmark(provider, sections.randomPick);
  }

  // Summarize From the Archives
  let fromTheArchives: SummarizedBookmark | null = null;
  if (sections.fromTheArchives) {
    console.log("  Summarizing archive pick");
    fromTheArchives = await toSummarizedBookmark(
      provider,
      sections.fromTheArchives
    );
  }

  console.log("AI summarization complete");

  return {
    recentlySaved,
    buriedTreasure,
    thisMonthLastYear,
    tagRoundup,
    randomPick,
    fromTheArchives,
    stats: sections.stats,
  };
}
