# Build configuration for cross-platform static builds

# Go build settings
CGO_ENABLED=0
GOOS=linux
GOARCH=amd64

# Build flags for static linking
LDFLAGS=-ldflags="-s -w -extldflags '-static'"

# Output directory
OUTPUT_DIR=bin

# Binary name
BINARY_NAME=c2c

# Version info
VERSION=1.0.0
BUILD_TIME=$(shell date -u '+%Y-%m-%d_%H:%M:%S')
GIT_COMMIT=$(shell git rev-parse --short HEAD)

# Build targets
.PHONY: build build-all build-linux build-windows build-macos clean test

# Default build for current platform
build:
	@echo "Building for current platform..."
	@mkdir -p $(OUTPUT_DIR)
	go build $(LDFLAGS) -o $(OUTPUT_DIR)/$(BINARY_NAME) .

# Build for all platforms
build-all: build-linux build-windows build-macos
	@echo "All builds completed"

# Linux static build
build-linux:
	@echo "Building Linux x86_64 static binary..."
	@mkdir -p $(OUTPUT_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build $(LDFLAGS) \
		-o $(OUTPUT_DIR)/$(BINARY_NAME)-linux-amd64 .

# Windows build
build-windows:
	@echo "Building Windows x64 binary..."
	@mkdir -p $(OUTPUT_DIR)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build $(LDFLAGS) \
		-o $(OUTPUT_DIR)/$(BINARY_NAME)-windows-amd64.exe .

# macOS build
build-macos:
	@echo "Building macOS universal binary..."
	@mkdir -p $(OUTPUT_DIR)
	# Build for Intel
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) \
		-o $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-amd64 .
	# Build for Apple Silicon
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) \
		-o $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-arm64 .
	# Create universal binary
	lipo -create \
		$(OUTPUT_DIR)/$(BINARY_NAME)-darwin-amd64 \
		$(OUTPUT_DIR)/$(BINARY_NAME)-darwin-arm64 \
		-output $(OUTPUT_DIR)/$(BINARY_NAME)-darwin-universal

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf $(OUTPUT_DIR)

# Run tests
test:
	@echo "Running tests..."
	go test -v ./...

# Install dependencies
deps:
	@echo "Installing dependencies..."
	go mod download
	go mod tidy

# Release build with version info
release: build-all
	@echo "Creating release package..."
	@mkdir -p $(OUTPUT_DIR)/release
	@tar -czf $(OUTPUT_DIR)/release/c2c-v$(VERSION)-linux-amd64.tar.gz \
		-C $(OUTPUT_DIR) $(BINARY_NAME)-linux-amd64
	@cd $(OUTPUT_DIR) && zip -r release/c2c-v$(VERSION)-windows-amd64.zip \
		$(BINARY_NAME)-windows-amd64.exe
	@tar -czf $(OUTPUT_DIR)/release/c2c-v$(VERSION)-darwin-universal.tar.gz \
		-C $(OUTPUT_DIR) $(BINARY_NAME)-darwin-universal

# Development build with debug info
dev:
	@echo "Building development version..."
	@mkdir -p $(OUTPUT_DIR)
	go build -race -o $(OUTPUT_DIR)/$(BINARY_NAME)-dev .

# Install locally
install: build
	@echo "Installing $(BINARY_NAME) to /usr/local/bin..."
	sudo cp $(OUTPUT_DIR)/$(BINARY_NAME) /usr/local/bin/
