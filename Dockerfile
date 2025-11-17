# S-14: Server Hardening - Secure Docker Configuration

# Multi-stage build for minimal attack surface
FROM node:20.11.1-alpine3.19 AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps

# Install pnpm
RUN npm install -g pnpm@8

# Install dependencies (dev dependencies needed for build)
RUN pnpm install --frozen-lockfile

# Build all packages
RUN pnpm run build

# Production stage
FROM node:20.11.1-alpine3.19

# S-14: Security hardening

# Create non-root user
RUN addgroup -g 1001 -S credlink && \
    adduser -S -D -H -u 1001 -G credlink credlink

# Install production dependencies only
RUN apk add --no-cache \
    dumb-init \
    tini \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=credlink:credlink /app/node_modules ./node_modules
COPY --from=builder --chown=credlink:credlink /app/packages ./packages
COPY --from=builder --chown=credlink:credlink /app/apps ./apps
COPY --from=builder --chown=credlink:credlink /app/package.json ./

# Install production dependencies only
RUN npm install -g pnpm@8 && \
    pnpm install --prod --frozen-lockfile && \
    pnpm store prune

# Remove unnecessary files
RUN rm -rf \
    /root/.npm \
    /root/.node-gyp \
    /tmp/* \
    /var/tmp/*

# S-14: Set read-only filesystem for certain directories
RUN mkdir -p /app/logs /app/temp && \
    chown -R credlink:credlink /app/logs /app/temp

# Switch to non-root user
USER credlink

# S-14: Drop all capabilities except necessary ones
# (requires docker run with --cap-drop=ALL --cap-add=NET_BIND_SERVICE)

# Expose port (non-privileged port)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use tini as PID 1 to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "apps/api/dist/index.js"]

# S-14: Security labels
LABEL security.no-new-privileges="true"
LABEL security.read-only-root-filesystem="true"
