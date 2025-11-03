# Phase 21.8 Disaster Recovery Runbooks
# Exact Procedures for Manual Cutover, TSA Outage, and Bucket Drift Incidents

## Runbook 1: Manual Cutover Procedure

### Overview
Manual failover from ENAM to WEUR when automatic failover fails or human intervention is required.

### Prerequisites
- Access to Cloudflare dashboard and API
- Admin access to Kubernetes clusters
- Monitoring dashboard access
- Communication channels established

### Trigger Conditions
- Automatic failover not working after 10 minutes
- Load balancer stuck in unhealthy state
- Manual maintenance window planned
- Critical security incident requiring immediate isolation

### Step-by-Step Procedure

#### Phase 1: Assessment (0-5 minutes)

```bash
#!/bin/bash
# manual-cutover-assessment.sh
set -euo pipefail

CUTOVER_ID="manual-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/var/log/cutover-${CUTOVER_ID}.log"

echo "=== Manual Cutover Assessment ===" | tee -a "$LOG_FILE"
echo "Cutover ID: $CUTOVER_ID" | tee -a "$LOG_FILE"

# Check current status
echo "1. Checking load balancer status..." | tee -a "$LOG_FILE"
LB_STATUS=$(cloudflare lb get c2-concierge-lb --json)
CURRENT_POOL=$(echo "$LB_STATUS" | jq -r '.default_pools[0]')
echo "Current pool: $CURRENT_POOL" | tee -a "$LOG_FILE"

# Check health of primary region
echo "2. Checking ENAM region health..." | tee -a "$LOG_FILE"
ENAM_HEALTH=$(curl -s --connect-timeout 5 "https://api-enam.c2-concierge.com/healthz" || echo "failed")
echo "ENAM health: $ENAM_HEALTH" | tee -a "$LOG_FILE"

# Check health of standby region
echo "3. Checking WEUR region health..." | tee -a "$LOG_FILE"
WEUR_HEALTH=$(curl -s --connect-timeout 5 "https://api-weur.c2-concierge.com/healthz" || echo "failed")
echo "WEUR health: $WEUR_HEALTH" | tee -a "$LOG_FILE"

# Determine if cutover is necessary
if [[ "$ENAM_HEALTH" == "ok" ]] && [[ "$CURRENT_POOL" == "pool-enam-primary" ]]; then
  echo "WARNING: Primary region appears healthy - confirm cutover necessity" | tee -a "$LOG_FILE"
  read -p "Continue with cutover? (yes/no): " confirm
  if [[ "$confirm" != "yes" ]]; then
    echo "Cutover cancelled" | tee -a "$LOG_FILE"
    exit 0
  fi
fi

echo "Assessment complete - proceeding with cutover" | tee -a "$LOG_FILE"
```

#### Phase 2: Pre-Cutover Preparation (5-10 minutes)

```bash
#!/bin/bash
# manual-cutover-prep.sh
set -euo pipefail

echo "=== Pre-Cutover Preparation ===" | tee -a "$LOG_FILE"

# 1. Pause background jobs to prevent split-brain
echo "1. Pausing background jobs..." | tee -a "$LOG_FILE"
curl -s -X POST "https://api.c2-concierge.com/admin/jobs/pause" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "manual_cutover"}' | tee -a "$LOG_FILE"

# 2. Take leadership snapshot
echo "2. Capturing leadership state..." | tee -a "$LOG_FILE"
LEADER_STATUS=$(curl -s "https://api.c2-concierge.com/admin/leader/status")
echo "$LEADER_STATUS" | jq '.' > "/tmp/leader-snapshot-${CUTOVER_ID}.json"

# 3. Verify replication queue is processed
echo "3. Processing replication queue..." | tee -a "$LOG_FILE"
QUEUE_PROCESS=$(curl -s -X POST "https://api.c2-concierge.com/admin/replication/process" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "Queue process result: $QUEUE_PROCESS" | tee -a "$LOG_FILE"

# 4. Notify stakeholders
echo "4. Sending notifications..." | tee -a "$LOG_FILE"
SLACK_WEBHOOK="$SLACK_INCIDENT_WEBHOOK"
curl -s -X POST "$SLACK_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🚨 MANUAL CUTOVER INITIATED",
    "attachments": [{
      "color": "warning",
      "fields": [
        {"title": "Cutover ID", "value": "'$CUTOVER_ID'", "short": true},
        {"title": "From", "value": "ENAM", "short": true},
        {"title": "To", "value": "WEUR", "short": true},
        {"title": "Reason", "value": "Manual intervention required", "short": false}
      ]
    }]
  }' | tee -a "$LOG_FILE"

echo "Preparation complete" | tee -a "$LOG_FILE"
```

#### Phase 3: Execute Cutover (10-15 minutes)

```bash
#!/bin/bash
# manual-cutover-execute.sh
set -euo pipefail

echo "=== Executing Manual Cutover ===" | tee -a "$LOG_FILE"
CUTOVER_START=$(date +%s)

# 1. Update Cloudflare Load Balancer
echo "1. Updating load balancer pools..." | tee -a "$LOG_FILE"
cloudflare lb update c2-concierge-lb \
  --default-pools="pool-weur-standby" \
  --fallback-pools="pool-enam-primary" \
  --steering-policy="random" | tee -a "$LOG_FILE"

# Verify load balancer update
echo "2. Verifying load balancer update..." | tee -a "$LOG_FILE"
sleep 10
NEW_POOL=$(cloudflare lb get c2-concierge-lb --json | jq -r '.default_pools[0]')
if [[ "$NEW_POOL" != "pool-weur-standby" ]]; then
  echo "ERROR: Load balancer update failed" | tee -a "$LOG_FILE"
  exit 1
fi
echo "Load balancer updated successfully" | tee -a "$LOG_FILE"

# 3. Force leader transfer to WEUR
echo "3. Transferring leadership to WEUR..." | tee -a "$LOG_FILE"
LEADER_TRANSFER=$(curl -s -X POST "https://api.c2-concierge.com/admin/leader/transfer" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"new_leader_id": "weur-instance-1", "region": "weur"}')
echo "Leader transfer result: $LEADER_TRANSFER" | tee -a "$LOG_FILE"

# 4. Resume background jobs in new region
echo "4. Resuming background jobs..." | tee -a "$LOG_FILE"
curl -s -X POST "https://api.c2-concierge.com/admin/jobs/resume" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "cutover_complete"}' | tee -a "$LOG_FILE"

# 5. Validate service functionality
echo "5. Validating service functionality..." | tee -a "$LOG_FILE"

# Test sign API
SIGN_TEST=$(curl -s -X POST "https://api.c2-concierge.com/sign" \
  -H "Content-Type: application/json" \
  -d '{"manifest": "cutover-test", "tenant_id": "test"}')
if echo "$SIGN_TEST" | jq -e '.manifest_hash' > /dev/null; then
  echo "✓ Sign API working" | tee -a "$LOG_FILE"
else
  echo "✗ Sign API failed" | tee -a "$LOG_FILE"
fi

# Test verify API
VERIFY_TEST=$(curl -s -X POST "https://api.c2-concierge.com/verify" \
  -H "Content-Type: application/json" \
  -d '{"manifest_hash": "test-hash", "tenant_id": "test"}')
if echo "$VERIFY_TEST" | jq -e '.valid' > /dev/null; then
  echo "✓ Verify API working" | tee -a "$LOG_FILE"
else
  echo "✗ Verify API failed" | tee -a "$LOG_FILE"
fi

CUTOVER_END=$(date +%s)
CUTOVER_DURATION=$((CUTOVER_END - CUTOVER_START))

echo "Cutover completed in ${CUTOVER_DURATION} seconds" | tee -a "$LOG_FILE"

# 6. Update status page
echo "6. Updating status page..." | tee -a "$LOG_FILE"
curl -s -X POST "$STATUS_PAGE_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{
    "incident": {
      "name": "Manual Cutover to WEUR",
      "status": "resolved",
      "impact": "minor",
      "body": "Manual cutover completed successfully. Services now running in WEUR region."
    }
  }' | tee -a "$LOG_FILE"

echo "Manual cutover execution complete" | tee -a "$LOG_FILE"
```

#### Phase 4: Post-Cutover Validation (15-20 minutes)

```bash
#!/bin/bash
# manual-cutover-validate.sh
set -euo pipefail

echo "=== Post-Cutover Validation ===" | tee -a "$LOG_FILE"

# 1. Check all services are healthy
echo "1. Service health check..." | tee -a "$LOG_FILE"
SERVICES=("api-gateway" "sign-service" "verify-service" "edge-relay")
ALL_HEALTHY=true

for service in "${SERVICES[@]}"; do
  HEALTH=$(curl -s "https://api.c2-concierge.com/health/$service" || echo "unhealthy")
  if [[ "$HEALTH" == "ok" ]]; then
    echo "✓ $service healthy" | tee -a "$LOG_FILE"
  else
    echo "✗ $service unhealthy" | tee -a "$LOG_FILE"
    ALL_HEALTHY=false
  fi
done

# 2. Verify data consistency
echo "2. Data consistency check..." | tee -a "$LOG_FILE"
CONSISTENCY_CHECK=$(curl -s -X POST "https://api.c2-concierge.com/admin/consistency/check" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
CONSISTENCY_RESULT=$(echo "$CONSISTENCY_CHECK" | jq -r '.result // "failed"')
echo "Consistency check: $CONSISTENCY_RESULT" | tee -a "$LOG_FILE"

# 3. Monitor replication lag
echo "3. Replication lag check..." | tee -a "$LOG_FILE"
REPLICATION_LAG=$(curl -s "https://api.c2-concierge.com/status" | jq -r '.storage.replication_lag_seconds')
echo "Replication lag: ${REPLICATION_LAG} seconds" | tee -a "$LOG_FILE"

if [[ $REPLICATION_LAG -gt 300 ]]; then
  echo "WARNING: High replication lag detected" | tee -a "$LOG_FILE"
fi

# 4. Final notification
echo "4. Sending completion notification..." | tee -a "$LOG_FILE"
STATUS="success"
if [[ "$ALL_HEALTHY" != "true" ]] || [[ "$CONSISTENCY_RESULT" != "passed" ]]; then
  STATUS="partial"
fi

curl -s -X POST "$SLACK_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "✅ MANUAL CUTOVER COMPLETED",
    "attachments": [{
      "color": "'$([[ "$STATUS" == "success" ]] && echo "good" || echo "warning")'",
      "fields": [
        {"title": "Cutover ID", "value": "'$CUTOVER_ID'", "short": true},
        {"title": "Duration", "value": "'$CUTOVER_DURATION' seconds", "short": true},
        {"title": "Status", "value": "'$STATUS'", "short": true},
        {"title": "Replication Lag", "value": "'$REPLICATION_LAG' seconds", "short": true}
      ]
    }]
  }' | tee -a "$LOG_FILE"

echo "Post-cutover validation complete" | tee -a "$LOG_FILE"
```

### Rollback Procedure

If cutover fails and needs to be rolled back:

```bash
#!/bin/bash
# manual-cutover-rollback.sh
set -euo pipefail

echo "=== Manual Cutover Rollback ===" | tee -a "$LOG_FILE"

# 1. Pause jobs in current region
curl -s -X POST "https://api.c2-concierge.com/admin/jobs/pause" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "rollback_initiated"}'

# 2. Switch load balancer back to primary
cloudflare lb update c2-concierge-lb \
  --default-pools="pool-enam-primary" \
  --fallback-pools="pool-weur-standby"

# 3. Transfer leadership back to ENAM
curl -s -X POST "https://api.c2-concierge.com/admin/leader/transfer" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"new_leader_id": "enam-instance-1", "region": "enam"}'

# 4. Resume jobs in ENAM
curl -s -X POST "https://api.c2-concierge.com/admin/jobs/resume" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "rollback_complete"}'

echo "Rollback completed" | tee -a "$LOG_FILE"
```

---

## Runbook 2: TSA (Timestamp Authority) Outage

### Overview
Handle TSA service outage while maintaining manifest signing and verification capabilities.

### Trigger Conditions
- TSA service health checks failing
- High error rates (>5%) on TSA endpoints
- TSA response times >2 seconds
- Manual TSA maintenance required

### Step-by-Step Procedure

#### Phase 1: Impact Assessment (0-5 minutes)

```bash
#!/bin/bash
# tsa-outage-assessment.sh
set -euo pipefail

OUTAGE_ID="tsa-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/var/log/tsa-outage-${OUTAGE_ID}.log"

echo "=== TSA Outage Assessment ===" | tee -a "$LOG_FILE"
echo "Outage ID: $OUTAGE_ID" | tee -a "$LOG_FILE"

# Check TSA service health
echo "1. Checking TSA service health..." | tee -a "$LOG_FILE"
TSA_HEALTH=$(curl -s --connect-timeout 5 "https://tsa.c2-concierge.com/health" || echo "failed")
echo "TSA health: $TSA_HEALTH" | tee -a "$LOG_FILE"

# Check TSA response times
echo "2. Measuring TSA response times..." | tee -a "$LOG_FILE"
TSA_LATENCY=$(curl -s -o /dev/null -w "%{time_total}" "https://tsa.c2-concierge.com/timestamp" || echo "timeout")
echo "TSA latency: ${TSA_LATENCY}s" | tee -a "$LOG_FILE"

# Check TSA error rates
echo "3. Checking TSA error rates..." | tee -a "$LOG_FILE"
TSA_METRICS=$(curl -s "https://api.c2-concierge.com/metrics/tsa" || echo "{}")
ERROR_RATE=$(echo "$TSA_METRICS" | jq -r '.error_rate_percentage // 0')
echo "TSA error rate: ${ERROR_RATE}%" | tee -a "$LOG_FILE"

# Determine outage severity
SEVERITY="low"
if [[ "$TSA_HEALTH" == "failed" ]] || [[ $(echo "$TSA_LATENCY > 2.0" | bc -l) -eq 1 ]]; then
  SEVERITY="high"
elif [[ $(echo "$ERROR_RATE > 5.0" | bc -l) -eq 1 ]]; then
  SEVERITY="medium"
fi

echo "Outage severity: $SEVERITY" | tee -a "$LOG_FILE"
```

#### Phase 2: Activate Fallback TSA (5-15 minutes)

```bash
#!/bin/bash
# tsa-activate-fallback.sh
set -euo pipefail

echo "=== Activating Fallback TSA ===" | tee -a "$LOG_FILE"

# 1. Enable fallback TSA configuration
echo "1. Enabling fallback TSA..." | tee -a "$LOG_FILE"
curl -s -X POST "https://api.c2-concierge.com/admin/tsa/fallback/enable" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "tsa_outage", "severity": "'$SEVERITY'"}' | tee -a "$LOG_FILE"

# 2. Update service configuration
echo "2. Updating service configuration..." | tee -a "$LOG_FILE"
kubectl patch configmap c2-concierge-config -n c2-concierge \
  --patch '{"data":{"tsa_fallback_enabled":"true","tsa_primary_url":"https://tsa-backup.c2-concierge.com"}}'

# 3. Restart affected services
echo "3. Restarting sign service..." | tee -a "$LOG_FILE"
kubectl rollout restart deployment/sign-service -n c2-concierge

# Wait for restart
kubectl rollout status deployment/sign-service -n c2-concierge --timeout=300s

# 4. Validate fallback TSA is working
echo "4. Validating fallback TSA..." | tee -a "$LOG_FILE"
FALLBACK_TEST=$(curl -s -X POST "https://api.c2-concierge.com/sign" \
  -H "Content-Type: application/json" \
  -d '{"manifest": "tsa-fallback-test", "tenant_id": "test"}')

if echo "$FALLBACK_TEST" | jq -e '.timestamp' > /dev/null; then
  echo "✓ Fallback TSA working" | tee -a "$LOG_FILE"
else
  echo "✗ Fallback TSA failed" | tee -a "$LOG_FILE"
  exit 1
fi

echo "Fallback TSA activated successfully" | tee -a "$LOG_FILE"
```

#### Phase 3: Monitor and Maintain (15-60 minutes)

```bash
#!/bin/bash
# tsa-monitor-fallback.sh
set -euo pipefail

echo "=== Monitoring Fallback TSA ===" | tee -a "$LOG_FILE"

# Monitor for 45 minutes
for i in {1..9}; do
  echo "Check $i/9..." | tee -a "$LOG_FILE"
  
  # Check fallback TSA health
  FALLBACK_HEALTH=$(curl -s "https://tsa-backup.c2-concierge.com/health" || echo "failed")
  echo "Fallback TSA health: $FALLBACK_HEALTH" | tee -a "$LOG_FILE"
  
  # Check signing performance
  SIGN_LATENCY=$(curl -s -o /dev/null -w "%{time_total}" "https://api.c2-concierge.com/sign" \
    -X POST -H "Content-Type: application/json" -d '{"manifest": "monitor-test", "tenant_id": "test"}')
  echo "Sign latency: ${SIGN_LATENCY}s" | tee -a "$LOG_FILE"
  
  # Check error rates
  CURRENT_ERROR_RATE=$(curl -s "https://api.c2-concierge.com/metrics/tsa" | jq -r '.error_rate_percentage // 0')
  echo "Current error rate: ${CURRENT_ERROR_RATE}%" | tee -a "$LOG_FILE"
  
  # Alert if performance degrades
  if [[ $(echo "$SIGN_LATENCY > 1.0" | bc -l) -eq 1 ]] || [[ $(echo "$CURRENT_ERROR_RATE > 2.0" | bc -l) -eq 1 ]]; then
    echo "WARNING: Performance degradation detected" | tee -a "$LOG_FILE"
    curl -s -X POST "$SLACK_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d '{
        "text": "⚠️ TSA FALLBACK PERFORMANCE DEGRADATION",
        "attachments": [{
          "color": "warning",
          "fields": [
            {"title": "Sign Latency", "value": "'$SIGN_LATENCY's", "short": true},
            {"title": "Error Rate", "value": "'$CURRENT_ERROR_RATE'%", "short": true}
          ]
        }]
      }'
  fi
  
  sleep 300  # 5 minutes between checks
done

echo "Fallback TSA monitoring complete" | tee -a "$LOG_FILE"
```

#### Phase 4: Recovery to Primary TSA (60+ minutes)

```bash
#!/bin/bash
# tsa-recovery.sh
set -euo pipefail

echo "=== Recovering to Primary TSA ===" | tee -a "$LOG_FILE"

# 1. Check primary TSA health
echo "1. Checking primary TSA health..." | tee -a "$LOG_FILE"
PRIMARY_HEALTH=$(curl -s "https://tsa.c2-concierge.com/health" || echo "failed")
if [[ "$PRIMARY_HEALTH" != "ok" ]]; then
  echo "Primary TSA still unhealthy - extending fallback" | tee -a "$LOG_FILE"
  exit 0
fi

# 2. Test primary TSA performance
echo "2. Testing primary TSA performance..." | tee -a "$LOG_FILE"
PRIMARY_LATENCY=$(curl -s -o /dev/null -w "%{time_total}" "https://tsa.c2-concierge.com/timestamp")
echo "Primary TSA latency: ${PRIMARY_LATENCY}s" | tee -a "$LOG_FILE"

if [[ $(echo "$PRIMARY_LATENCY > 0.5" | bc -l) -eq 1 ]]; then
  echo "Primary TSA performance still degraded" | tee -a "$LOG_FILE"
  exit 0
fi

# 3. Switch back to primary TSA
echo "3. Switching back to primary TSA..." | tee -a "$LOG_FILE"
curl -s -X POST "https://api.c2-concierge.com/admin/tsa/fallback/disable" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "primary_recovered"}' | tee -a "$LOG_FILE"

# 4. Update configuration
kubectl patch configmap c2-concierge-config -n c2-concierge \
  --patch '{"data":{"tsa_fallback_enabled":"false","tsa_primary_url":"https://tsa.c2-concierge.com"}}'

# 5. Restart services
kubectl rollout restart deployment/sign-service -n c2-concierge
kubectl rollout status deployment/sign-service -n c2-concierge --timeout=300s

# 6. Validate recovery
RECOVERY_TEST=$(curl -s -X POST "https://api.c2-concierge.com/sign" \
  -H "Content-Type: application/json" \
  -d '{"manifest": "recovery-test", "tenant_id": "test"}')

if echo "$RECOVERY_TEST" | jq -e '.timestamp' > /dev/null; then
  echo "✓ Primary TSA recovered" | tee -a "$LOG_FILE"
else
  echo "✗ Primary TSA recovery failed - re-enabling fallback" | tee -a "$LOG_FILE"
  # Re-enable fallback
  curl -s -X POST "https://api.c2-concierge.com/admin/tsa/fallback/enable" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason": "recovery_failed"}'
  exit 1
fi

echo "TSA recovery complete" | tee -a "$LOG_FILE"
```

---

## Runbook 3: Bucket Drift Incident

### Overview
Handle data inconsistency between primary and secondary R2 buckets.

### Trigger Conditions
- Consistency sweep detects >0.1% mismatches
- Replication lag >10 minutes
- Manual consistency check failures
- Customer reports of missing/inconsistent manifests

### Step-by-Step Procedure

#### Phase 1: Incident Assessment (0-10 minutes)

```bash
#!/bin/bash
# bucket-drift-assessment.sh
set -euo pipefail

DRIFT_ID="drift-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/var/log/bucket-drift-${DRIFT_ID}.log"

echo "=== Bucket Drift Assessment ===" | tee -a "$LOG_FILE"
echo "Drift ID: $DRIFT_ID" | tee -a "$LOG_FILE"

# 1. Run immediate consistency check
echo "1. Running consistency check..." | tee -a "$LOG_FILE"
CONSISTENCY_CHECK=$(curl -s -X POST "https://api.c2-concierge.com/admin/consistency/check" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sample_size": 1000, "auto_repair": false}')

MISMATCH_COUNT=$(echo "$CONSISTENCY_CHECK" | jq -r '.mismatched_count // 0')
MISMATCH_PERCENTAGE=$(echo "$CONSISTENCY_CHECK" | jq -r '.mismatch_percentage // 0')
echo "Mismatches found: $MISMATCH_COUNT (${MISMATCH_PERCENTAGE}%)" | tee -a "$LOG_FILE"

# 2. Check replication queue
echo "2. Checking replication queue..." | tee -a "$LOG_FILE"
QUEUE_STATUS=$(curl -s "https://api.c2-concierge.com/admin/replication/queue/status")
QUEUE_DEPTH=$(echo "$QUEUE_STATUS" | jq -r '.pending_count // 0')
echo "Queue depth: $QUEUE_DEPTH" | tee -a "$LOG_FILE"

# 3. Check replication lag
echo "3. Checking replication lag..." | tee -a "$LOG_FILE"
REPLICATION_LAG=$(curl -s "https://api.c2-concierge.com/status" | jq -r '.storage.replication_lag_seconds')
echo "Replication lag: ${REPLICATION_LAG} seconds" | tee -a "$LOG_FILE"

# 4. Determine incident severity
SEVERITY="low"
if [[ $(echo "$MISMATCH_PERCENTAGE > 1.0" | bc -l) -eq 1 ]] || [[ $QUEUE_DEPTH -gt 1000 ]]; then
  SEVERITY="critical"
elif [[ $(echo "$MISMATCH_PERCENTAGE > 0.5" | bc -l) -eq 1 ]] || [[ $QUEUE_DEPTH -gt 500 ]]; then
  SEVERITY="high"
elif [[ $(echo "$MISMATCH_PERCENTAGE > 0.1" | bc -l) -eq 1 ]] || [[ $REPLICATION_LAG -gt 600 ]]; then
  SEVERITY="medium"
fi

echo "Incident severity: $SEVERITY" | tee -a "$LOG_FILE"
```

#### Phase 2: Immediate Containment (10-20 minutes)

```bash
#!/bin/bash
# bucket-drift-contain.sh
set -euo pipefail

echo "=== Bucket Drift Containment ===" | tee -a "$LOG_FILE"

# 1. Pause writes to affected buckets if severity is high/critical
if [[ "$SEVERITY" == "high" ]] || [[ "$SEVERITY" == "critical" ]]; then
  echo "1. Pausing writes to prevent further drift..." | tee -a "$LOG_FILE"
  curl -s -X POST "https://api.c2-concierge.com/admin/storage/pause-writes" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason": "bucket_drift_containment"}' | tee -a "$LOG_FILE"
fi

# 2. Process replication queue aggressively
echo "2. Processing replication queue..." | tee -a "$LOG_FILE"
for i in {1..5}; do
  echo "Processing attempt $i..." | tee -a "$LOG_FILE"
  PROCESS_RESULT=$(curl -s -X POST "https://api.c2-concierge.com/admin/replication/process" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"batch_size": 100}')
  
  PROCESSED=$(echo "$PROCESS_RESULT" | jq -r '.processed_count // 0')
  echo "Processed $PROCESSED items" | tee -a "$LOG_FILE"
  
  if [[ $PROCESSED -eq 0 ]]; then
    break
  fi
  
  sleep 30
done

# 3. Enable read-only mode for consistency checks
echo "3. Enabling read-only mode..." | tee -a "$LOG_FILE"
curl -s -X POST "https://api.c2-concierge.com/admin/storage/readonly" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "consistency_check"}' | tee -a "$LOG_FILE"

echo "Containment measures applied" | tee -a "$LOG_FILE"
```

#### Phase 3: Data Repair (20-60 minutes)

```bash
#!/bin/bash
# bucket-drift-repair.sh
set -euo pipefail

echo "=== Bucket Drift Repair ===" | tee -a "$LOG_FILE"

# 1. Run comprehensive consistency check with auto-repair
echo "1. Running comprehensive consistency check..." | tee -a "$LOG_FILE"
COMPREHENSIVE_CHECK=$(curl -s -X POST "https://api.c2-concierge.com/admin/consistency/check" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sample_size": 10000, "auto_repair": true, "repair_strategy": "primary_wins"}')

REPAIRED_COUNT=$(echo "$COMPREHENSIVE_CHECK" | jq -r '.auto_repaired_count // 0')
REMAINING_MISMATCHES=$(echo "$COMPREHENSIVE_CHECK" | jq -r '.mismatched_count // 0')
echo "Auto-repaired: $REPAIRED_COUNT, Remaining: $REMAINING_MISMATCHES" | tee -a "$LOG_FILE"

# 2. Manual repair for remaining mismatches
if [[ $REMAINING_MISMATCHES -gt 0 ]]; then
  echo "2. Performing manual repair..." | tee -a "$LOG_FILE"
  
  # Get list of mismatched manifests
  MISMATCHES=$(echo "$COMPREHENSIVE_CHECK" | jq -r '.mismatches[].hash')
  
  for hash in $MISMATCHES; do
    echo "Repairing manifest: $hash" | tee -a "$LOG_FILE"
    
    REPAIR_RESULT=$(curl -s -X POST "https://api.c2-concierge.com/admin/manifest/repair" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"hash\": \"$hash\", \"source\": \"primary\"}")
    
    if echo "$REPAIR_RESULT" | jq -e '.success' > /dev/null; then
      echo "✓ Repaired: $hash" | tee -a "$LOG_FILE"
    else
      echo "✗ Repair failed: $hash" | tee -a "$LOG_FILE"
    fi
  done
fi

# 3. Final consistency verification
echo "3. Final consistency verification..." | tee -a "$LOG_FILE"
FINAL_CHECK=$(curl -s -X POST "https://api.c2-concierge.com/admin/consistency/check" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sample_size": 5000, "auto_repair": false}')

FINAL_MISMATCHES=$(echo "$FINAL_CHECK" | jq -r '.mismatched_count // 0')
FINAL_PERCENTAGE=$(echo "$FINAL_CHECK" | jq -r '.mismatch_percentage // 0')

echo "Final verification: $FINAL_MISMATCHES mismatches (${FINAL_PERCENTAGE}%)" | tee -a "$LOG_FILE"

if [[ $(echo "$FINAL_PERCENTAGE < 0.01" | bc -l) -eq 1 ]]; then
  echo "✓ Consistency restored to acceptable level" | tee -a "$LOG_FILE"
else
  echo "✗ Consistency still below threshold" | tee -a "$LOG_FILE"
fi
```

#### Phase 4: Service Recovery (60-75 minutes)

```bash
#!/bin/bash
# bucket-drift-recovery.sh
set -euo pipefail

echo "=== Bucket Drift Recovery ===" | tee -a "$LOG_FILE"

# 1. Disable read-only mode
echo "1. Disabling read-only mode..." | tee -a "$LOG_FILE"
curl -s -X POST "https://api.c2-concierge.com/admin/storage/readwrite" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "drift_repaired"}' | tee -a "$LOG_FILE"

# 2. Resume writes if paused
if [[ "$SEVERITY" == "high" ]] || [[ "$SEVERITY" == "critical" ]]; then
  echo "2. Resuming writes..." | tee -a "$LOG_FILE"
  curl -s -X POST "https://api.c2-concierge.com/admin/storage/resume-writes" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason": "drift_repaired"}' | tee -a "$LOG_FILE"
fi

# 3. Validate end-to-end functionality
echo "3. Validating service functionality..." | tee -a "$LOG_FILE"

# Test manifest storage and retrieval
TEST_HASH="drift-recovery-$(date +%s)"
TEST_DATA='{"test": "bucket-drift-recovery", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'

STORE_RESPONSE=$(curl -s -X PUT "https://api.c2-concierge.com/manifest/$TEST_HASH" \
  -H "Content-Type: application/json" \
  -d "$TEST_DATA")

if echo "$STORE_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✓ Manifest storage working" | tee -a "$LOG_FILE"
else
  echo "✗ Manifest storage failed" | tee -a "$LOG_FILE"
fi

# Wait for replication
sleep 30

RETRIEVE_RESPONSE=$(curl -s "https://api.c2-concierge.com/manifest/$TEST_HASH")
if echo "$RETRIEVE_RESPONSE" | jq -e '.test' > /dev/null; then
  echo "✓ Manifest retrieval working" | tee -a "$LOG_FILE"
else
  echo "✗ Manifest retrieval failed" | tee -a "$LOG_FILE"
fi

# 4. Update monitoring thresholds
echo "4. Updating monitoring thresholds..." | tee -a "$LOG_FILE"
curl -s -X POST "https://api.c2-concierge.com/admin/monitoring/thresholds" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "consistency_mismatch_threshold": 0.01,
    "replication_lag_threshold": 300,
    "queue_depth_threshold": 100
  }' | tee -a "$LOG_FILE"

echo "Bucket drift recovery complete" | tee -a "$LOG_FILE"
```

### Post-Incident Actions

```bash
#!/bin/bash
# bucket-drift-post-incident.sh
set -euo pipefail

echo "=== Post-Incident Actions ===" | tee -a "$LOG_FILE"

# 1. Generate incident report
echo "1. Generating incident report..." | tee -a "$LOG_FILE"
cat > "/tmp/incident-report-${DRIFT_ID}.json" << EOF
{
  "incident_id": "$DRIFT_ID",
  "type": "bucket_drift",
  "severity": "$SEVERITY",
  "timeline": {
    "detected": "$(date -d @$(cat /proc/uptime | cut -d' ' -f1) +%Y-%m-%dT%H:%M:%SZ)",
    "contained": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "repaired": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "recovered": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  },
  "metrics": {
    "initial_mismatches": $MISMATCH_COUNT,
    "initial_percentage": $MISMATCH_PERCENTAGE,
    "auto_repaired": $REPAIRED_COUNT,
    "final_mismatches": $FINAL_MISMATCHES,
    "final_percentage": $FINAL_PERCENTAGE,
    "max_replication_lag": $REPLICATION_LAG,
    "max_queue_depth": $QUEUE_DEPTH
  },
  "actions_taken": [
    "Paused writes to prevent further drift",
    "Aggressively processed replication queue",
    "Enabled read-only mode for consistency checks",
    "Performed auto-repair with primary-wins strategy",
    "Manual repair of remaining mismatches",
    "Validated end-to-end functionality",
    "Updated monitoring thresholds"
  ],
  "lessons_learned": [
    "Early detection critical for minimizing drift",
    "Auto-repair effective for most mismatches",
    "Write pauses prevent escalation",
    "Monitoring thresholds need adjustment"
  ]
}
EOF

# 2. Schedule follow-up consistency checks
echo "2. Scheduling follow-up checks..." | tee -a "$LOG_FILE"
for i in {1..24}; do
  echo "0 $(($i * 2)) * * * /usr/local/bin/consistency-check.sh" | crontab -
done

# 3. Update runbooks based on findings
echo "3. Runbook improvements identified..." | tee -a "$LOG_FILE"
echo "- Consider lowering consistency check interval" | tee -a "$LOG_FILE"
echo "- Implement progressive write throttling" | tee -a "$LOG_FILE"
echo "- Add real-time drift detection alerts" | tee -a "$LOG_FILE"

echo "Post-incident actions complete" | tee -a "$LOG_FILE"
echo "Incident report: /tmp/incident-report-${DRIFT_ID}.json" | tee -a "$LOG_FILE"
```

---

## Emergency Contacts and Escalation

### Primary Contacts
- **On-Call Engineer**: +1-555-0123
- **Engineering Lead**: +1-555-0124
- **Infrastructure Lead**: +1-555-0125

### Escalation Criteria
- **Immediate**: Multiple regions down, data loss suspected
- **Within 30 minutes**: Single region down, high error rates
- **Within 2 hours**: Performance degradation, customer impact

### Communication Channels
- **Incident Channel**: #incidents-c2-concierge
- **Status Page**: status.c2-concierge.com
- **Customer Notification**: automated for high/critical severity

### Runbook Maintenance
- Review quarterly after GameDays
- Update after any major incident
- Test procedures monthly
- Maintain version control in Git repository
