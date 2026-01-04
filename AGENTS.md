# AGENTS.md

This file provides guidance to LLM Agents when working with code in this repository.

## Project Overview

Karakeep Digest is a Node.js/TypeScript application that generates weekly AI-powered email digests of saved bookmarks from a Karakeep instance. It fetches unread bookmarks, categorizes them into meaningful sections, generates AI summaries using Claude or Ollama, and sends formatted HTML emails.

## Commands

```bash
# Development (single execution)
pnpm dev

# Build TypeScript
pnpm build

# Production (runs compiled JS)
pnpm start

# Type checking only
pnpm typecheck
```

## Architecture

### Data Flow

1. **Fetch** (`karakeep.ts`) - Retrieves bookmarks from Karakeep API with pagination and retry logic
2. **Categorize** (`categorizer.ts`) - Sorts bookmarks into digest sections using priority scoring
3. **Summarize** (`summarizer.ts`) - Generates AI summaries via Anthropic Claude or local Ollama
4. **Render & Send** (`email.ts`) - Renders Handlebars template and sends via SMTP

### Digest Sections

- **Recently Saved**: 3 random unread items from last 30 days
- **Buried Treasure**: 3 oldest unread items (30+ days old)
- **This Month Last Year**: Up to 3 historical bookmarks from same month previous year
- **Tag Roundup**: Randomly selected tag with 3+ items, includes AI synthesis
- **Random Pick**: Single random discovery item
- **From the Archives**: Single random archived bookmark

### LLM Provider Abstraction

The `LLMProvider` interface in `summarizer.ts` allows switching between:

- `AnthropicProvider` - Uses Claude API (claude-sonnet-4-20250514)
- `OllamaProvider` - Uses local Ollama instance

Provider selection is automatic based on which API key/URL is configured.

### Key Files

- `src/index.ts` - Entry point, orchestrates CLI vs daemon mode
- `src/types.ts` - All TypeScript interfaces
- `src/config.ts` - Environment variable loading with Zod validation
- `prompts/*.txt` - LLM prompt templates with `{{PLACEHOLDER}}` substitution
- `templates/digest.html` - Handlebars email template

## Configuration

Required environment variables (see `.env.example`):

- `KARAKEEP_URL`, `KARAKEEP_API_KEY` - Karakeep instance
- `ANTHROPIC_API_KEY` or `OLLAMA_URL` - LLM provider (one required)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - Email sending
- `EMAIL_FROM`, `EMAIL_TO` - Email addresses

Optional:

- `RUN_MODE=daemon` - Run as scheduled service instead of one-shot
- `CRON_SCHEDULE` - Cron expression for daemon mode (default: `0 8 * * 0`)
- `PRIORITY_TAGS` - Comma-separated tags to boost in scoring

## Code Patterns

### ES Modules

Project uses ES modules (`"type": "module"` in package.json). All imports require `.js` extension:

```typescript
import { config } from "./config.js";
```

### Concurrency Control

`mapWithConcurrency()` in `summarizer.ts` limits parallel LLM requests to prevent rate limiting (default: 5 concurrent).

### Content Filtering

`filterSufficientContent()` in `categorizer.ts` excludes bookmarks with less than 200 characters of content/summary to ensure quality summaries.
