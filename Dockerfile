FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source files
COPY . .

# Build TypeScript
RUN pnpm build

# Production image
FROM node:22-alpine

WORKDIR /app

# Install tzdata for timezone support
RUN apk add --no-cache tzdata

RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

# Copy built files and assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/prompts ./prompts

# Set default environment
ENV NODE_ENV=production
ENV RUN_MODE=cli
ENV TZ=UTC

# Run the digest
CMD ["node", "dist/index.js"]
