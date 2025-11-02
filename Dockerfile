# C2 Concierge Multi-Stage Docker Build
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/acceptance/package.json ./packages/acceptance/
COPY packages/policy/package.json ./packages/policy/
COPY packages/utils/package.json ./packages/utils/
COPY apps/edge-worker/package.json ./apps/edge-worker/
COPY sandboxes/strip-happy/package.json ./sandboxes/strip-happy/
COPY sandboxes/preserve-embed/package.json ./sandboxes/preserve-embed/
COPY sandboxes/remote-only/package.json ./sandboxes/remote-only/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder

# Copy source code
COPY . .

# Build all packages
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Install pnpm
RUN npm install -g pnpm

# Install ImageMagick for sandbox operations
RUN apk add --no-cache imagemagick

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S c2concierge -u 1001

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/acceptance/dist ./packages/acceptance/dist
COPY --from=builder /app/packages/policy/dist ./packages/policy/dist
COPY --from=builder /app/packages/utils/dist ./packages/utils/dist
COPY --from=builder /app/apps/edge-worker/dist ./apps/edge-worker/dist

# Copy production dependencies
COPY package.json pnpm-lock.yaml ./
COPY packages/acceptance/package.json ./packages/acceptance/
COPY packages/policy/package.json ./packages/policy/
COPY packages/utils/package.json ./packages/utils/
COPY apps/edge-worker/package.json ./apps/edge-worker/

RUN pnpm install --frozen-lockfile --prod

# Copy scripts and configs
COPY scripts ./scripts
COPY .env.example ./.env.example

# Create artifacts directory
RUN mkdir -p .artifacts/logs .artifacts/acceptance fixtures

# Change ownership
RUN chown -R c2concierge:nodejs /app
USER c2concierge

# Expose sandbox ports
EXPOSE 4101 4102 4103

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4101/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Default command
CMD ["pnpm", "bootstrap"]
