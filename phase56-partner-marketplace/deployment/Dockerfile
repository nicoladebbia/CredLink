# Phase 56 Partner Marketplace - Production Dockerfile

FROM node:18-alpine AS builder

# Create non-root user for build stage
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Install build dependencies with security fixes
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    && apk del --purge \
    python3-dev \
    libffi-dev \
    openssl-dev \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies with security audit
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force && \
    rm -rf ~/.npm

# Copy application code with proper permissions
COPY --chown=nodejs:nodejs . .

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine

# Install security updates
RUN apk update && \
    apk upgrade && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    curl \
    tini \
    dumb-init \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Create necessary directories with restricted permissions
RUN mkdir -p /app/logs /app/uploads /app/temp && \
    chown -R nodejs:nodejs /app && \
    chmod 750 /app/logs /app/uploads /app/temp && \
    chmod 640 /app/package*.json

# Switch to non-root user
USER nodejs

# Add security labels
LABEL maintainer="C2 Concierge, Inc." \
      version="1.2.0" \
      description="C2The Partner Marketplace - Production hardened container" \
      security.scan="enabled"

# Expose port
EXPOSE 3001

# Health check with timeout and security
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use tini for proper signal handling with security
ENTRYPOINT ["/sbin/tini", "--"]

# Start application with security considerations
CMD ["node", "--max-old-space-size=1024", "--security-revert=CVE-2021-44832", "dist/server.js"]
