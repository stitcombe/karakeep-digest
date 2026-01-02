# Karakeep Digest Implementation Plan

Weekly AI-powered email digest of your saved bookmarks.

## Overview

This plan outlines the step-by-step implementation of Karakeep Digest, a Node.js/TypeScript application that:
1. Fetches unread bookmarks from a Karakeep instance
2. Categorizes them into meaningful digest sections
3. Generates AI-powered summaries using Claude or Ollama
4. Sends a formatted weekly email digest

---

## Phase 1: Project Setup

### Step 1.1: Initialize Node.js Project

Create the project structure and install dependencies.

```bash
pnpm init
```

**Dependencies to install:**
- `typescript` - Type safety
- `@anthropic-ai/sdk` - Claude API client
- `nodemailer` - Email sending
- `handlebars` - Email templating
- `node-cron` - Scheduling (optional)
- `dotenv` - Environment configuration
- `zod` - Schema validation

**Dev dependencies:**
- `tsx` - TypeScript execution
- `@types/node`, `@types/nodemailer`

### Step 1.2: Create Directory Structure

```
karakeep-digest/
├── src/
│   ├── index.ts
│   ├── karakeep.ts
│   ├── categorizer.ts
│   ├── summarizer.ts
│   ├── email.ts
│   ├── config.ts
│   └── types.ts
├── templates/
│   └── digest.html
├── prompts/
│   ├── single-article.txt
│   └── topic-cluster.txt
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

### Step 1.3: Configure TypeScript

Create `tsconfig.json` with:
- ES2022 target
- NodeNext module resolution
- Strict type checking
- Output to `dist/` directory

### Step 1.4: Create Configuration Module

**File:** `src/config.ts`

Create a centralized configuration module that:
- Loads environment variables via `dotenv`
- Validates required variables with Zod
- Exports typed configuration object
- Supports both Anthropic and Ollama modes

**Environment variables:**
| Variable | Required | Description |
|----------|----------|-------------|
| `KARAKEEP_URL` | Yes | Base URL of Karakeep instance |
| `KARAKEEP_API_KEY` | Yes | API key for authentication |
| `ANTHROPIC_API_KEY` | No* | Claude API key |
| `OLLAMA_URL` | No* | Ollama server URL |
| `OLLAMA_MODEL` | No | Model name (default: llama3) |
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP server port |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password |
| `EMAIL_FROM` | Yes | Sender email address |
| `EMAIL_TO` | Yes | Recipient email address |
| `PRIORITY_TAGS` | No | Comma-separated priority tags |

*One of ANTHROPIC_API_KEY or OLLAMA_URL is required

---

## Phase 2: Core Types

### Step 2.1: Define Type Interfaces

**File:** `src/types.ts`

```typescript
// Raw bookmark from Karakeep API
interface KarakeepBookmark {
  id: string;
  url: string;
  title: string;
  content?: string;
  summary?: string;
  tags: Array<{ id: string; name: string }>;
  createdAt: string;
  archived: boolean;
}

// Internal bookmark representation
interface Bookmark {
  id: string;
  url: string;
  title: string;
  content?: string;
  summary?: string;
  tags: string[];
  createdAt: Date;
  archived: boolean;
  source: string;  // Extracted domain
}

// Scored bookmark for prioritization
interface ScoredBookmark extends Bookmark {
  score: number;
}

// Summarized bookmark ready for email
interface SummarizedBookmark extends Bookmark {
  aiSummary: string;
  whyItMatters: string;
  daysAgo: number;
}

// Tag cluster with synthesis
interface TagRoundup {
  tag: string;
  bookmarks: SummarizedBookmark[];
  synthesis: string;
}

// Complete digest structure
interface DigestSections {
  quickScan: SummarizedBookmark[];
  buriedTreasure: SummarizedBookmark[];
  thisMonthLastYear: SummarizedBookmark[];
  tagRoundup: TagRoundup | null;
  randomPick: SummarizedBookmark | null;
  stats: {
    totalUnread: number;
    generatedAt: Date;
  };
}
```

---

## Phase 3: Karakeep API Client

### Step 3.1: Implement API Client

**File:** `src/karakeep.ts`

Implement functions to interact with the Karakeep API:

#### `fetchBookmarks(options)`
- Fetch bookmarks with optional filters
- Handle pagination (Karakeep uses cursor-based pagination)
- Transform API response to internal `Bookmark` type
- Extract source domain from URL

**API Endpoint:** `GET /api/v1/bookmarks`

**Query Parameters:**
- `archived` - boolean filter
- `limit` - items per page (max 100)
- `cursor` - pagination cursor

**Headers:**
- `Authorization: Bearer {API_KEY}`

#### `fetchBookmarksFromDateRange(start, end)`
- Fetch all bookmarks, then filter by `createdAt` in range
- Used for "This Month Last Year" feature
- Cache results to avoid repeated API calls

#### `transformBookmark(raw)`
- Convert API response to internal format
- Parse dates from ISO strings
- Extract tag names from tag objects
- Extract domain from URL for source display

**Error Handling:**
- Retry on 5xx errors with exponential backoff
- Throw descriptive errors on 4xx
- Handle rate limiting (429) with retry-after header

---

## Phase 4: Categorization Logic

### Step 4.1: Implement Priority Scoring

**File:** `src/categorizer.ts`

#### `calculatePriorityScore(bookmark, now)`

Score bookmarks based on:

| Factor | Weight | Logic |
|--------|--------|-------|
| Age | Base | `log(ageInDays + 1) * 10` |
| Priority tags | +20 | Matches any priority tag |
| Has content | +5 | Full content available |
| Long-form | +3 | Content > 2000 chars |

Returns numeric score for sorting.

### Step 4.2: Implement Section Categorization

#### `categorize(bookmarks)`

**Quick Scan Section:**
- Score all bookmarks
- Sort by score descending
- Take top 5

**Buried Treasure Section:**
- Filter: `createdAt < 30 days ago`
- Sort by age descending
- Take top 5 (oldest unread)

**This Month Last Year:**
- Calculate date range: same month, previous year
- Filter bookmarks by that range
- Take up to 5

**Tag Roundup:**
- Build tag frequency map
- Find tag with most bookmarks (minimum 3)
- Take up to 5 bookmarks for that tag
- Exclude already-used bookmarks from other sections

**Random Pick:**
- Select random bookmark not in other sections
- Provides discovery element

### Step 4.3: Handle Edge Cases

- Empty bookmark list: Return empty sections with stats
- No qualifying buried treasure: Section is empty array
- No qualifying tag roundup: Section is null
- All bookmarks used: Random pick is null

---

## Phase 5: LLM Summarization

### Step 5.1: Create Prompt Templates

**File:** `prompts/single-article.txt`
```
Summarize this article in 2 sentences for a busy technical reader.

Title: {{TITLE}}
Content: {{CONTENT}}

Format your response EXACTLY as JSON:
{"summary": "...", "whyItMatters": "..."}

- summary: One sentence (max 25 words) capturing the core insight
- whyItMatters: One sentence (max 20 words) on relevance or action

Be direct, no fluff. Valid JSON only.
```

**File:** `prompts/topic-cluster.txt`
```
Synthesize {{COUNT}} articles tagged "{{TAG}}" into a cohesive summary.

Articles:
{{ARTICLES}}

Format as JSON:
{
  "overview": "2-3 sentences on common themes",
  "keyInsights": ["insight1", "insight2", "insight3"],
  "standout": "Which article is most worth reading and why (1 sentence)"
}

Be concise. Valid JSON only.
```

### Step 5.2: Implement Summarization Module

**File:** `src/summarizer.ts`

#### LLM Provider Abstraction

```typescript
interface LLMProvider {
  complete(prompt: string, maxTokens: number): Promise<string>;
}

class AnthropicProvider implements LLMProvider { ... }
class OllamaProvider implements LLMProvider { ... }
```

Factory function selects provider based on config.

#### `summarizeArticle(bookmark)`
- Load single-article prompt template
- Substitute title and content
- Call LLM with 300 token limit
- Parse JSON response
- Return summary and whyItMatters

#### `synthesizeCluster(tag, bookmarks)`
- Load topic-cluster prompt template
- Combine bookmarks into single context
- Call LLM with 500 token limit
- Parse JSON response
- Return synthesis object

#### `summarizeSections(sections)`
- Process all sections in parallel where possible
- Rate limit API calls (max 5 concurrent)
- Track token usage for cost estimation
- Return fully summarized sections

**Error Handling:**
- Retry on API errors (3 attempts)
- Fallback to Karakeep's summary if LLM fails
- Log failures without breaking digest

### Step 5.3: Content Truncation

- Limit content to 4000 tokens for summarization
- Prefer beginning + end if truncating
- Include title even if content missing

---

## Phase 6: Email Generation

### Step 6.1: Create Email Template

**File:** `templates/digest.html`

Use Handlebars template with:
- Responsive email CSS (inline styles)
- Section headers with emoji indicators
- Linked article titles
- Source and timing metadata
- Unsubscribe placeholder

**Sections:**
1. Header: "Your Weekly Digest" + stats
2. Quick Scan: Top 5 prioritized items
3. Buried Treasure: 30+ day old items
4. This Month Last Year: Historical items
5. Tag Roundup: Clustered by topic
6. Random Pick: Single discovery item
7. Footer: Link to Karakeep

### Step 6.2: Implement Email Module

**File:** `src/email.ts`

#### `renderDigest(sections)`
- Load Handlebars template
- Register date formatting helpers
- Compile and render to HTML string
- Generate plain text version for multipart

#### `sendDigest(html, plainText)`
- Create nodemailer transport with SMTP config
- Set from/to addresses
- Send multipart email (HTML + plain text)
- Return message ID for logging

#### Helper Functions
- `formatDate(date)`: "January 2, 2026"
- `formatDaysAgo(date)`: "15 days ago"
- `extractDomain(url)`: "example.com"
- `estimateReadTime(content)`: "5 min read"

---

## Phase 7: Main Orchestration

### Step 7.1: Implement Entry Point

**File:** `src/index.ts`

```typescript
async function main() {
  console.log('Starting Karakeep Digest...');

  // 1. Fetch bookmarks
  const bookmarks = await fetchBookmarks({ archived: false });
  console.log(`Fetched ${bookmarks.length} unread bookmarks`);

  if (bookmarks.length === 0) {
    console.log('No unread bookmarks, skipping digest');
    return;
  }

  // 2. Fetch historical bookmarks for "this month last year"
  const lastYearBookmarks = await fetchBookmarksFromDateRange(
    getLastYearMonthStart(),
    getLastYearMonthEnd()
  );

  // 3. Categorize
  const sections = categorize(bookmarks, lastYearBookmarks);

  // 4. Summarize with LLM
  const summarized = await summarizeSections(sections);

  // 5. Render and send email
  const { html, plainText } = renderDigest(summarized);
  const messageId = await sendDigest(html, plainText);

  console.log(`Digest sent successfully: ${messageId}`);
}
```

### Step 7.2: Add Scheduling Support

Two modes:

**CLI Mode (for cron):**
```typescript
main().catch(err => {
  console.error('Digest failed:', err);
  process.exit(1);
});
```

**Daemon Mode (for container):**
```typescript
import cron from 'node-cron';

const schedule = process.env.CRON_SCHEDULE || '0 8 * * 0';
cron.schedule(schedule, () => {
  main().catch(console.error);
});
console.log(`Scheduled digest: ${schedule}`);
```

Select mode via `RUN_MODE` environment variable.

---

## Phase 8: Docker Setup

### Step 8.1: Create Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

CMD ["node", "dist/index.js"]
```

### Step 8.2: Create docker-compose.yml

```yaml
services:
  karakeep-digest:
    build: .
    env_file: .env
    restart: unless-stopped
    environment:
      - RUN_MODE=daemon
      - CRON_SCHEDULE=0 8 * * 0

  # Optional: local LLM
  ollama:
    image: ollama/ollama
    volumes:
      - ollama_data:/root/.ollama
    profiles:
      - local-llm

volumes:
  ollama_data:
```

### Step 8.3: Create .env.example

Document all environment variables with examples.

---

## Phase 9: Testing & Documentation

### Step 9.1: Add Basic Tests

Create test files for critical modules:
- `src/__tests__/categorizer.test.ts` - Priority scoring, section building
- `src/__tests__/summarizer.test.ts` - Prompt template loading, JSON parsing

Use Vitest for testing.

### Step 9.2: Create README.md

Document:
- Quick start guide
- Configuration options
- Deployment methods (Docker, cron)
- LLM provider options
- Customization (priority tags, sections)

---

## Implementation Order

| Step | File(s) | Dependencies | Estimated Complexity |
|------|---------|--------------|---------------------|
| 1 | Project setup, package.json | None | Low |
| 2 | tsconfig.json, .gitignore | Step 1 | Low |
| 3 | src/types.ts | Step 2 | Low |
| 4 | src/config.ts | Step 3 | Low |
| 5 | src/karakeep.ts | Steps 3-4 | Medium |
| 6 | src/categorizer.ts | Steps 3-5 | Medium |
| 7 | prompts/*.txt | None | Low |
| 8 | src/summarizer.ts | Steps 4, 7 | Medium |
| 9 | templates/digest.html | None | Medium |
| 10 | src/email.ts | Steps 4, 9 | Medium |
| 11 | src/index.ts | Steps 5-10 | Low |
| 12 | Dockerfile, docker-compose.yml | Step 11 | Low |
| 13 | README.md, .env.example | All | Low |

---

## Acceptance Criteria

- [ ] Successfully fetches bookmarks from Karakeep API
- [ ] Correctly categorizes bookmarks into 5 sections
- [ ] Generates AI summaries for Quick Scan items
- [ ] Synthesizes Tag Roundup cluster
- [ ] Renders readable HTML email
- [ ] Sends email via SMTP
- [ ] Runs on schedule in Docker container
- [ ] Falls back gracefully if LLM unavailable
- [ ] Handles empty bookmark list
- [ ] Logs progress and errors clearly

---

## Future Enhancements (Out of Scope)

- Track "digested" state separately from "archived"
- Web UI for configuration
- Multiple digest profiles
- Click tracking
- Reading time estimates
- Unsubscribe/snooze specific items
