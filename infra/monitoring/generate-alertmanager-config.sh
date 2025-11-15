#!/bin/bash
#
# Generate AlertManager configuration from template and environment variables
#
# Usage:
#   ./generate-alertmanager-config.sh
#
# Required environment variables:
#   - SLACK_WEBHOOK_URL
#   - SMTP_USERNAME
#   - SMTP_PASSWORD
#
# Optional:
#   - ALERTMANAGER_CONFIG_OUTPUT (default: alertmanager.yml)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${SCRIPT_DIR}/alertmanager.yml.template"
OUTPUT_FILE="${ALERTMANAGER_CONFIG_OUTPUT:-${SCRIPT_DIR}/alertmanager.yml}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================"
echo "AlertManager Config Generator"
echo "================================"
echo ""

# Check if template exists
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo -e "${RED}ERROR: Template file not found: $TEMPLATE_FILE${NC}"
    exit 1
fi

# Check required environment variables
MISSING_VARS=()

if [ -z "$SLACK_WEBHOOK_URL" ]; then
    MISSING_VARS+=("SLACK_WEBHOOK_URL")
fi

if [ -z "$SMTP_USERNAME" ]; then
    MISSING_VARS+=("SMTP_USERNAME")
fi

if [ -z "$SMTP_PASSWORD" ]; then
    MISSING_VARS+=("SMTP_PASSWORD")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}ERROR: Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "Set them in your environment or .env file:"
    echo ""
    echo "  export SLACK_WEBHOOK_URL='https://hooks.slack.com/services/YOUR/WEBHOOK/URL'"
    echo "  export SMTP_USERNAME='your-email@gmail.com'"
    echo "  export SMTP_PASSWORD='your-app-password'"
    echo ""
    exit 1
fi

# Validate Slack webhook URL format
if [[ ! "$SLACK_WEBHOOK_URL" =~ ^https://hooks\.slack\.com/services/ ]]; then
    echo -e "${YELLOW}WARNING: SLACK_WEBHOOK_URL doesn't look like a valid Slack webhook URL${NC}"
    echo "Expected format: https://hooks.slack.com/services/..."
    echo "Continuing anyway..."
    echo ""
fi

echo "Generating AlertManager configuration..."
echo "  Template: $TEMPLATE_FILE"
echo "  Output: $OUTPUT_FILE"
echo ""

# Use envsubst to substitute environment variables
# If envsubst is not available, use sed as fallback
if command -v envsubst &> /dev/null; then
    envsubst < "$TEMPLATE_FILE" > "$OUTPUT_FILE"
else
    echo -e "${YELLOW}WARNING: envsubst not found, using sed as fallback${NC}"
    sed -e "s|\${SLACK_WEBHOOK_URL}|${SLACK_WEBHOOK_URL}|g" \
        -e "s|\${SMTP_USERNAME}|${SMTP_USERNAME}|g" \
        -e "s|\${SMTP_PASSWORD}|${SMTP_PASSWORD}|g" \
        "$TEMPLATE_FILE" > "$OUTPUT_FILE"
fi

echo -e "${GREEN}✓ Configuration generated successfully!${NC}"
echo ""
echo "Validating configuration with amtool (if available)..."

if command -v amtool &> /dev/null; then
    if amtool check-config "$OUTPUT_FILE"; then
        echo -e "${GREEN}✓ Configuration is valid!${NC}"
    else
        echo -e "${RED}✗ Configuration validation failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ amtool not found, skipping validation${NC}"
    echo "Install amtool to validate config: go install github.com/prometheus/alertmanager/cmd/amtool@latest"
fi

echo ""
echo "Next steps:"
echo "  1. Review the generated config: cat $OUTPUT_FILE"
echo "  2. Restart AlertManager: docker-compose restart alertmanager"
echo ""
