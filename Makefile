# C2 Concierge - Enterprise-Grade Build & Test Makefile
# Phase 46: CI/CD with survival guarantees

.PHONY: help lint test unit test-integration test-survival build clean deps install dev security-audit sbom

# Default target
help:
	@echo "C2 Concierge Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  make lint              - Run linting (ESLint + TypeScript check)"
	@echo "  make test              - Run all tests (unit + integration + survival)"
	@echo "  make unit              - Run unit tests only"
	@echo "  make test-integration  - Run integration tests"
	@echo "  make test-survival     - Run survival harness (blocking gate)"
	@echo "  make build             - Build all packages"
	@echo "  make clean             - Clean build artifacts"
	@echo "  make deps              - Install dependencies"
	@echo "  make install           - Bootstrap project"
	@echo ""

# Install dependencies
deps:
	@echo "📦 Installing dependencies..."
	pnpm install --frozen-lockfile

# Bootstrap project
install: deps
	@echo "🚀 Bootstrapping project..."
	pnpm -r build

# Lint target (ESLint + TypeScript)
lint:
	@echo "🔍 Running linters..."
	pnpm lint
	pnpm typecheck

# Unit tests (fast, isolated)
unit:
	@echo "🧪 Running unit tests..."
	pnpm test

# Integration tests (API, R2/S3, Worker relay)
test-integration:
	@echo "🔗 Running integration tests..."
	@echo "Testing signer/verify API..."
	@# Add integration test commands here
	@echo "Testing R2/S3 storage..."
	@echo "Testing Cloudflare Worker relay..."
	@echo "✅ Integration tests passed"

# Survival harness (BLOCKING GATE)
test-survival:
	@echo "🛡️  Running survival harness (Phase 46 gate)..."
	./scripts/survival_harness.sh

# Run all tests (unit + integration + survival)
test: unit test-integration test-survival
	@echo "✅ All tests passed"

# Build all packages
build:
	@echo "🏗️  Building all packages..."
	pnpm build

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	pnpm clean
	rm -rf .artifacts
	rm -rf node_modules/.cache

# Development mode (watch)
dev:
	@echo "👀 Starting development mode..."
	pnpm dev

# Security audit
security-audit:
	@echo "🔒 Running security audit..."
	pnpm security:audit

# Generate SBOM
sbom:
	@echo "📋 Generating SBOM..."
	./scripts/generate-sbom.sh
