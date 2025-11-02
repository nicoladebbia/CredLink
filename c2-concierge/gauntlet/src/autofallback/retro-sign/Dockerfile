# Multi-stage Dockerfile for C2 Concierge Retro-Sign
# Phase 10 Video & Audio v1 Implementation

# Node.js build stage for TypeScript packages
FROM node:18-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/*/package.json ./packages/*/
COPY apps/*/package.json ./apps/*/

# Install all dependencies
RUN npm ci

# Copy source code and build files
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY tsconfig.json ./
COPY .eslintrc.js ./
COPY jest.config.js ./
COPY rollup.config.js ./

# Build all packages
RUN npm run build

# Rust build stage for existing CLI
FROM rust:1.75-alpine AS rust-builder

# Install build dependencies
RUN apk add --no-cache \
    musl-dev \
    pkgconfig \
    openssl-dev \
    build-base

WORKDIR /rust-app

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Create dummy main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release && rm -rf src

# Copy source code
COPY src ./src

# Build the Rust application
RUN touch src/main.rs && cargo build --release

# Production runtime stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    sqlite \
    curl \
    dumb-init \
    tini

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S c2pa -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy built artifacts from Node.js builder
COPY --from=node-builder /app/packages/*/dist ./packages/*/dist
COPY --from=node-builder /app/apps/*/dist ./apps/*/dist

# Copy Rust binary from Rust builder
COPY --from=rust-builder /rust-app/target/release/c2c /usr/local/bin/c2c

# Copy demo files
COPY docs/ ./docs/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create directories
RUN mkdir -p /app/.state /app/logs /app/reports /app/backups && \
    chown -R c2pa:nodejs /app

# Switch to non-root user
USER c2pa

# Expose ports
EXPOSE 3001 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Set environment
ENV NODE_ENV=production
ENV RUST_LOG=info

# Start the application with proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/index.js"]
