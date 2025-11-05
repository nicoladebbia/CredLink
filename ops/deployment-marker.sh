#!/usr/bin/env bash
# Deployment Marker - Phase 46
# Emits deployment markers for incident correlation
#
# Usage: ./deployment-marker.sh --sha <sha> --env <prod|staging>

set -euo pipefail

# Parse arguments
SHA=""
ENV=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --sha)
      SHA="$2"
      shift 2
      ;;
    --env)
      ENV="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ -z "$SHA" ] || [ -z "$ENV" ]; then
  echo "Usage: $0 --sha <sha> --env <prod|staging>"
  exit 1
fi

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BUILD_ID="${GITHUB_RUN_ID:-local}"

echo "📍 Recording deployment marker"
echo "   SHA: $SHA"
echo "   Environment: $ENV"
echo "   Timestamp: $TIMESTAMP"
echo ""

# Create marker file
MARKER_FILE=".artifacts/deployments/${ENV}-${SHA}.json"
mkdir -p "$(dirname "$MARKER_FILE")"

cat > "$MARKER_FILE" <<EOF
{
  "sha": "$SHA",
  "environment": "$ENV",
  "timestamp": "$TIMESTAMP",
  "build_id": "$BUILD_ID",
  "deployed_by": "${GITHUB_ACTOR:-$(whoami)}",
  "workflow": "${GITHUB_WORKFLOW:-manual}"
}
EOF

echo "✅ Deployment marker saved to $MARKER_FILE"

# Send to monitoring (if configured)
if [ -n "${DATADOG_API_KEY:-}" ]; then
  echo "📊 Sending marker to Datadog..."
  curl -X POST "https://api.datadoghq.com/api/v1/events" \
    -H "DD-API-KEY: $DATADOG_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"Deployment: $ENV\",
      \"text\": \"Deployed version $SHA to $ENV\",
      \"tags\": [\"deployment\", \"environment:$ENV\", \"sha:$SHA\"],
      \"alert_type\": \"info\"
    }" || echo "⚠️  Failed to send to Datadog (non-blocking)"
fi

if [ -n "${NEW_RELIC_API_KEY:-}" ]; then
  echo "📊 Sending marker to New Relic..."
  curl -X POST "https://api.newrelic.com/v2/applications/${NEW_RELIC_APP_ID}/deployments.json" \
    -H "X-Api-Key: $NEW_RELIC_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"deployment\": {
        \"revision\": \"$SHA\",
        \"changelog\": \"Deployment to $ENV\",
        \"description\": \"Phase 46 deployment\",
        \"user\": \"${GITHUB_ACTOR:-$(whoami)}\"
      }
    }" || echo "⚠️  Failed to send to New Relic (non-blocking)"
fi

echo "🎉 Deployment marker complete"
