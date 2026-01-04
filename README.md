# Karakeep Digest

Weekly AI-powered email digest of your saved bookmarks from [Karakeep](https://github.com/karakeep/karakeep).

## Features

- **Quick Scan**: Top 5 prioritized items based on age and tags
- **Buried Treasure**: Items saved 30+ days ago that you haven't read
- **This Month Last Year**: Historical bookmarks from the same month last year
- **Tag Roundup**: AI-synthesized summary of your most active tag cluster
- **Random Pick**: A surprise selection to encourage discovery

Each item includes an AI-generated summary and "why it matters" insight.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- Karakeep instance with API access
- Anthropic API key (or local Ollama)
- SMTP server for sending emails

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/karakeep-digest.git
cd karakeep-digest

# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your settings
```

### Configuration

Edit `.env` with your settings:

```bash
# Karakeep
KARAKEEP_URL=https://karakeep.yourdomain.com
KARAKEEP_API_KEY=your_api_key

# LLM (choose one)
ANTHROPIC_API_KEY=sk-ant-...
# OR
OLLAMA_URL=http://localhost:11434

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=user
SMTP_PASS=pass

# Email
EMAIL_FROM=digest@yourdomain.com
EMAIL_TO=you@example.com
```

### Running

**Development (single run):**

```bash
pnpm dev
```

**Production (build and run):**

```bash
pnpm build
pnpm start
```

**Docker:**

```bash
# Single run
docker compose run --rm karakeep-digest

# Daemon mode (scheduled)
docker compose up -d
```

## Scheduling

### Using cron (recommended for single-server)

Add to crontab (`crontab -e`):

```bash
# Run every Sunday at 8am
0 8 * * 0 cd /path/to/karakeep-digest && pnpm start
```

### Using Docker daemon mode

Set in `.env` or `docker-compose.yml`:

```bash
RUN_MODE=daemon
CRON_SCHEDULE=0 8 * * 0
```

Then run:

```bash
docker compose up -d
```

## Customization

### Priority Tags

Boost certain tags in the Quick Scan section:

```bash
PRIORITY_TAGS=important,work,reference
```

### Using Local LLM (Ollama)

Instead of Anthropic, use a local Ollama instance:

```bash
# Remove/comment out Anthropic key
# ANTHROPIC_API_KEY=...

# Add Ollama config
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

Start Ollama:

```bash
ollama serve
ollama pull llama3
```

## Project Structure

```
karakeep-digest/
├── src/
│   ├── index.ts         # Entry point, orchestration
│   ├── karakeep.ts      # Karakeep API client
│   ├── categorizer.ts   # Section logic, scoring
│   ├── summarizer.ts    # LLM summarization
│   ├── email.ts         # Email rendering, sending
│   ├── config.ts        # Configuration loading
│   └── types.ts         # TypeScript interfaces
├── templates/
│   └── digest.html      # Handlebars email template
├── prompts/
│   ├── single-article.txt    # Individual summary prompt
│   └── topic-cluster.txt     # Cluster synthesis prompt
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## License

MIT
