# Phase 13 Analytics - Production Dockerfile
# Multi-stage build for optimized production image with security hardening

# Build stage
FROM node:18-alpine AS builder

# CRITICAL: Security updates
RUN apk update && apk upgrade && \
    apk add --no-cache git && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies with security audit
RUN npm ci --audit && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage with security hardening
FROM node:18-alpine AS production

# CRITICAL: Install and configure security packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/* \
    && rm -rf /var/tmp/*

# CRITICAL: Create non-root user with no shell
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -D -H -s /sbin/nologin -u 1001 analytics

WORKDIR /app

# CRITICAL: Copy built application with proper permissions
COPY --from=builder --chown=analytics:nodejs /app/dist ./dist
COPY --from=builder --chown=analytics:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=analytics:nodejs /app/package*.json ./

# Create logs directory with restricted permissions
RUN mkdir -p logs && \
    chown analytics:nodejs logs && \
    chmod 750 logs

# CRITICAL: Remove setuid binaries
RUN find / -perm /6000 -type f -exec chmod a-s {} \; || true

# CRITICAL: Switch to non-root user
USER analytics

# CRITICAL: Health check with timeout and security
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f -s -o /dev/null -w '%{http_code}' http://localhost:3002/health | grep -q '^200$' || exit 1

# Expose port
EXPOSE 3002

# CRITICAL: Security labels
LABEL maintainer="security-team@c2pa.example.com" \
      version="1.0.0" \
      description="Phase 13 Analytics - Hardened Production Image" \
      security.scan="required"

# CRITICAL: Use dumb-init to handle signals properly and prevent zombie processes
ENTRYPOINT ["dumb-init", "--"]

# CRITICAL: Start the application with security flags
CMD ["node", "--no-deprecation", "--security", "--throw-deprecation", "dist/index.js"]
