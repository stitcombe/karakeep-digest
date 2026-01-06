# Karakeep Digest

[![CI](https://github.com/stitcombe/karakeep-digest/actions/workflows/ci.yml/badge.svg)](https://github.com/stitcombe/karakeep-digest/actions/workflows/ci.yml)
[![Docker](https://github.com/stitcombe/karakeep-digest/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/stitcombe/karakeep-digest/pkgs/container/karakeep-digest)

Weekly AI-powered email digest of your saved bookmarks from [Karakeep](https://github.com/karakeep/karakeep).

## Features

- **Hot Off the Press**: 3 random unread items from the last 30 days
- **Buried Treasure**: 3 random unread items (30+ days old)
- **Throwback: One Year Ago**: Up to 3 historical bookmarks from the same month last year
- **Tag Roundup**: AI-synthesized summary of a randomly selected tag cluster
- **Random Pick**: A surprise bookmark selection
- **From the Archives**: A random archived bookmark to resurface

Each item includes an AI-generated summary.

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm (or npm/yarn)
- Karakeep instance with API access
- Anthropic API key (or local Ollama)
- SMTP server for sending emails

### Installation

```bash
# Clone the repository
git clone https://github.com/stitcombe/karakeep-digest.git
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

**Docker (pre-built image):**

```bash
# Pull the image
docker pull ghcr.io/stitcombe/karakeep-digest:latest

# Single run
docker compose -f docker-compose.image.yml run --rm karakeep-digest

# Daemon mode (scheduled)
RUN_MODE=daemon docker compose -f docker-compose.image.yml up -d
```

**Docker (build from source):**

```bash
# Single run
docker compose run --rm karakeep-digest

# Daemon mode (scheduled)
RUN_MODE=daemon docker compose up -d
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
├── .github/
│   └── workflows/
│       ├── ci.yml              # PR checks (typecheck, build, security)
│       └── docker-publish.yml  # Build & publish container to ghcr.io
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
├── docker-compose.yml        # Build from source
├── docker-compose.image.yml  # Use pre-built image
├── Dockerfile
└── package.json
```

## Container Images

Pre-built multi-architecture images (amd64/arm64) are available from GitHub Container Registry:

```bash
# Latest release
docker pull ghcr.io/stitcombe/karakeep-digest:latest

# Specific version
docker pull ghcr.io/stitcombe/karakeep-digest:1.0.0
```

Images are signed with [cosign](https://github.com/sigstore/cosign). Verify signatures:

```bash
cosign verify ghcr.io/stitcombe/karakeep-digest:latest \
  --certificate-identity-regexp="https://github.com/stitcombe/karakeep-digest" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

## License

MIT
