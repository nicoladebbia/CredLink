# Status Page Configuration for Phase 21 DR

**Purpose**: Public communication of service status during DR events with pre-written templates and automated updates.

## Status Page Components

### Core Services
- **Sign API**: Manifest signing and timestamp anchoring
- **Verify API**: Provenance verification service  
- **Edge Relay**: Zero-CORS manifest fetch relay
- **R2-ENAM**: Primary manifest storage (Eastern North America)
- **R2-WEUR**: Standby manifest storage (Western Europe)
- **TSA Service**: RFC 3161 timestamp authority

### Metrics Displayed
- **Current Status**: Operational/Degraded/Outage
- **RPO Compliance**: Minutes of evidence at risk
- **RTO Compliance**: Time to recovery progress
- **Regional Health**: Primary/Standby region status
- **Replication Lag**: Seconds behind primary

## Incident Templates

### Template 1: Regional Degradation
```
**INCIDENT**: Regional Service Degradation - ENAM
**STARTED**: {timestamp}
**IMPACT**: Some customers may experience slower signing/verification
**STATUS**: We're experiencing performance issues in our Eastern North America region. 
Traffic has been automatically routed to our Western Europe standby region.
RPO: {current_rpo} minutes (target: ≤5)
RTO: Recovery in progress (target: ≤15)
**NEXT UPDATE**: {timestamp + 30 minutes}
```

### Template 2: Regional Outage
```
**INCIDENT**: Regional Service Outage - ENAM  
**STARTED**: {timestamp}
**IMPACT**: Signing and verification services unavailable from primary region
**STATUS**: Eastern North America region is experiencing a complete outage. 
All traffic has been failed over to Western Europe region.
Services are operating with reduced capacity.
RPO: {current_rpo} minutes (target: ≤5)
RTO: {recovery_progress}% complete (target: ≤15)
**ACTIONS**: Engineers are working to restore primary region services.
**NEXT UPDATE**: {timestamp + 15 minutes}
```

### Template 3: TSA Outage
```
**INCIDENT**: Timestamp Authority Service Issues
**STARTED**: {timestamp}  
**IMPACT**: Signing operations may experience delays
**STATUS**: Our timestamp authority provider is experiencing issues. 
Manifest signing continues with queued timestamps.
Verification of existing manifests remains unaffected.
RPO: No impact (manifests stored safely)
RTO: No impact (verification operational)
**ACTIONS**: Anchoring jobs paused until TSA service restored.
**NEXT UPDATE**: {timestamp + 60 minutes}
```

### Template 4: Data Consistency Issue
```
**INCIDENT**: Manifest Consistency Investigation
**STARTED**: {timestamp}
**IMPACT**: Some verification requests may fail
**STATUS**: We've detected potential inconsistencies between regional storage. 
Strict replication mode enabled while we investigate.
Some operations may experience increased latency.
RPO: 0 minutes (strict mode active)
RTO: Investigation in progress
**ACTIONS**: Consistency sweeps running at increased frequency.
**NEXT UPDATE**: {timestamp + 45 minutes}
```

### Template 5: Resolved
```
**RESOLVED**: {incident_title}
**STARTED**: {start_timestamp}
**RESOLVED**: {resolution_timestamp}
**DURATION**: {duration}
**SUMMARY**: {brief_summary_of_resolution}
**IMPACT**: {final_impact_assessment}
**POSTMORTEM**: Link to detailed postmortem will be published within 24 hours.
```

## Automated Status Updates

### Health Check Integration
```typescript
interface HealthStatus {
  service: string;
  status: 'operational' | 'degraded' | 'outage';
  rpo_minutes: number;
  rto_minutes: number;
  last_check: string;
  region: 'enam' | 'weur' | 'global';
}

// Auto-update triggers
if (healthCheckFailure('primary-region')) {
  updateStatusPage('regional-outage', {
    region: 'ENAM',
    rpo: calculateCurrentRPO(),
    rto: calculateRecoveryProgress()
  });
}
```

### RPO/RTO Monitoring
```typescript
// Real-time RPO calculation
function calculateCurrentRPO(): number {
  const primaryManifests = getManifestCount('enam', last_5_minutes);
  const standbyManifests = getManifestCount('weur', last_5_minutes);
  return Math.max(0, primaryManifests - standbyManifests) * avg_manifest_size;
}

// RTO progress tracking  
function calculateRecoveryProgress(): number {
  const incidentStart = getIncidentStartTime();
  const sloRestoreTime = getSLORestoreTime();
  const currentTime = new Date();
  
  const elapsedMinutes = (currentTime - incidentStart) / 60000;
  const targetRTO = 15;
  
  return Math.min(100, (elapsedMinutes / targetRTO) * 100);
}
```

## Status Page Architecture

### Data Sources
- **Health Check Endpoints**: /healthz, /readyz from all services
- **Cloudflare Load Balancer**: Pool health and traffic distribution
- **R2 Storage**: Bucket health and replication metrics
- **Durable Objects**: Leader election and job status
- **Monitoring Systems**: Latency, error rates, queue depths

### Update Frequency
- **Operational Status**: Every 5 minutes
- **Degraded Status**: Every 2 minutes  
- **Outage Status**: Every 1 minute
- **During Incidents**: Every 30 seconds

### Notification Channels
- **Status Page**: Public web interface
- **Email Digest**: Hourly summary during incidents
- **Webhook Updates**: Real-time push to monitoring systems
- **RSS Feed**: Machine-readable status updates

## Status Page Endpoints

### Public Status API
```typescript
// GET /api/v1/status
{
  "overall_status": "operational",
  "services": {
    "sign_api": {"status": "operational", "region": "enam"},
    "verify_api": {"status": "operational", "region": "enam"}, 
    "edge_relay": {"status": "operational", "region": "global"},
    "r2_enam": {"status": "operational", "replication_lag": 12},
    "r2_weur": {"status": "operational", "replication_lag": 0},
    "tsa_service": {"status": "operational", "queue_depth": 0}
  },
  "metrics": {
    "rpo_minutes": 0.2,
    "rto_minutes": 0,
    "uptime_24h": 99.98,
    "incidents_last_24h": 0
  },
  "active_incidents": []
}
```

### Historical Status API
```typescript
// GET /api/v1/status/history?days=30
{
  "period": "30_days",
  "uptime_percentage": 99.95,
  "incident_count": 2,
  "rpo_compliance": 98.2,  // % of time with RPO ≤ 5min
  "rto_compliance": 96.8,  // % of incidents with RTO ≤ 15min
  "incidents": [
    {
      "id": "inc_20251102_001",
      "title": "Regional Degradation - ENAM",
      "start": "2025-11-02T14:30:00Z",
      "end": "2025-11-02T14:42:00Z", 
      "duration_minutes": 12,
      "impact": "degraded",
      "rpo_peak": 3.2,
      "rto_actual": 12
    }
  ]
}
```

## Status Page Deployment

### Cloudflare Worker Implementation
```typescript
// status-page-worker/src/index.ts
import { StatusPage } from './status-page';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/v1/status') {
      return Response.json(await StatusPage.getCurrentStatus(env));
    }
    
    if (url.pathname === '/api/v1/status/history') {
      const days = parseInt(url.searchParams.get('days') || '7');
      return Response.json(await StatusPage.getHistory(env, days));
    }
    
    // Serve static status page
    return env.ASSETS.fetch(request);
  }
};
```

### Environment Configuration
```toml
# wrangler.toml
name = "c2-status-page"
compatibility_date = "2025-11-02"

[vars]
STATUS_PAGE_URL = "https://status.CredLink.com"
INCIDENT_WEBHOOK = "https://hooks.slack.com/..."
MONITORING_API = "https://monitoring.CredLink.com"

[[kv_namespaces]]
binding = "STATUS_KV"
id = "status-page-data"

[[r2_buckets]]
binding = "STATUS_ASSETS"
bucket_name = "c2-status-page-assets"
```

## Status Page Testing

### Game Day Validation
- [ ] Status page updates automatically during regional failover
- [ ] RPO/RTO metrics display accurate real-time data
- [ ] Incident templates populate with correct values
- [ ] Historical data persists through DR events
- [ ] Public API returns consistent data during incidents

### Performance Requirements
- **Page Load**: <2 seconds initial load
- **API Response**: <500ms for status endpoints
- **Update Latency**: <30 seconds from health change to status update
- **Availability**: 99.9% uptime (separate from main services)

---

**Next Steps**: 
1. Deploy status page worker to Cloudflare
2. Configure health check integrations
3. Test incident templates during Game Day
4. Establish notification workflows
5. Document status page runbooks for incident commanders
