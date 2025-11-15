#!/bin/sh
# AlertManager Entrypoint Script
# Processes alertmanager.yml.template with environment variables

set -e

echo "Processing AlertManager configuration template..."

# Check required environment variables
if [ -z "$SLACK_WEBHOOK_URL" ]; then
    echo "ERROR: SLACK_WEBHOOK_URL environment variable is not set"
    exit 1
fi

# Process template with envsubst
envsubst < /etc/alertmanager/alertmanager.yml.template > /etc/alertmanager/alertmanager.yml

echo "AlertManager configuration generated successfully"

# Start AlertManager
exec /bin/alertmanager "$@"
