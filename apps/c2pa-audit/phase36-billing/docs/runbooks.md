# Phase 38 - Abuse Response Runbooks

## Verify-Flood Detection
**Trigger:** Rate limit threshold exceeded (>1000 req/min)
**Actions:**
1. Activate token bucket throttling
2. Switch abusive source to cache-only responses
3. Notify tenant via email + dashboard alert
4. VIP lane: No impact on paid tenants
5. Monitor cache freshness (RFC 9111 compliance)

## Billing Replay Attack
**Trigger:** Idempotency key collision detected
**Actions:**
1. Log correlation with request ID
2. Block duplicate request (409 Conflict)
3. Auto-generate dispute evidence bundle
4. Review pattern for systemic abuse
5. Update rate limits if needed

## Worker Header Injection
**Trigger:** Non-allowlisted header detected
**Actions:**
1. Block request immediately (400 Bad Request)
2. Deploy updated allowlist rule
3. Add regression test to pen-test suite
4. Monitor for similar patterns
5. Update security worker configuration

## Budget Cap Exceeded
**Trigger:** Tenant reaches daily spending limit
**Actions:**
1. Return 429 with budget exceeded message
2. Switch to read-only verify mode
3. Send automated budget alert
4. Log for financial review
5. Optional: Manual override for emergencies

## Signature Fraud Detection
**Trigger:** Invalid TSA token or claim signature
**Actions:**
1. Reject verification immediately
2. Invalidate associated certificates
3. Report to certificate authority
4. Preserve evidence in WORM storage
5. Coordinate with legal team

---
**Runbook Version:** 1.1  
**Effective Date:** 2025-11-03
