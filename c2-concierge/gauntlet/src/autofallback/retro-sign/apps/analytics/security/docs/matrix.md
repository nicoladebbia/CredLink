# Phase 16 - Adversarial Lab v1 Security Matrix

## Attack Corpus → Expected Behavior → Specification References

This matrix documents each attack case, its expected behavior, and the underlying specifications that mandate these responses.

---

## 01_malformed_jumbf_len

**Attack**: JUMBF box with inconsistent length field  
**Expected Decision**: DESTROYED  
**Expected Code**: C2PA_JUMBF_LEN  
**User Copy**: "This file's Content Credentials are broken: Malformed JUMBF length"  
**Specification**: ISO/IEC 19566-5 (JUMBF box syntax is normative)  
**Rationale**: Box length inconsistency violates JUMBF format specification and indicates corruption or malicious manipulation

---

## 02_recursive_ingredients_cycle

**Attack**: Ingredient reference creates a cycle (self-reference or loop)  
**Expected Decision**: DESTROYED  
**Expected Code**: CYCLE_DETECTED  
**User Copy**: "This file's Content Credentials are broken: Ingredient cycle detected"  
**Specification**: C2PA 2.2 Specification (ingredients must form acyclic graph)  
**Rationale**: Cycles break provenance chain integrity and create infinite loops during verification

---

## 03_remote_manifest_mixed_content

**Attack**: HTTPS page loads HTTP manifest (mixed content)  
**Expected Decision**: BLOCKED  
**Expected Code**: MIXED_CONTENT_BLOCK  
**User Copy**: "For safety, this request was blocked: Mixed content not allowed"  
**Specification**: MDN Web Docs - Mixed Content  
**Rationale**: Mixed content creates security downgrade attacks and violates secure browsing standards

---

## 04_html_in_claimsGenerator

**Attack**: HTML/JavaScript content in claimsGenerator field  
**Expected Decision**: VALID (sanitized)  
**Expected Code**: UI_SANITIZED  
**User Copy**: "Provenance verified" (HTML escaped)  
**Specification**: OWASP XSS Prevention Cheat Sheet  
**Rationale**: HTML should be escaped for display but not break valid signatures

---

## 05_tsa_future_timestamp

**Attack**: TSA timestamp is in the future or has excessive skew  
**Expected Decision**: DEGRADED  
**Expected Code**: TIMESTAMP_SKEW  
**User Copy**: "Verified with limitations: Timestamp appears to be from the future"  
**Specification**: RFC 3161 (Time-Stamp Protocol)  
**Rationale**: Future timestamps indicate clock skew or manipulation but don't invalidate signatures

---

## 06_dangling_remote_uri_404

**Attack**: Remote manifest URI returns 404 Not Found  
**Expected Decision**: DEGRADED  
**Expected Code**: REMOTE_404  
**User Copy**: "Verified with limitations: Remote manifest not available"  
**Specification**: C2PA 2.2 (remote manifest handling)  
**Rationale**: Missing remote manifests reduce completeness but don't invalidate core claims

---

## 07_conflicting_lineage_parents

**Attack**: Manifest has multiple parent ingredients with incompatible claim hashes  
**Expected Decision**: DESTROYED  
**Expected Code**: LINEAGE_CONFLICT  
**User Copy**: "This file's Content Credentials are broken: Conflicting lineage detected"  
**Specification**: C2PA 2.2 (lineage integrity requirements)  
**Rationale**: Conflicting lineage breaks provenance chain integrity

---

## 08_overlong_utf8_in_json

**Attack**: JSON contains overlong UTF-8 sequences or invalid encoding  
**Expected Decision**: DESTROYED  
**Expected Code**: UTF8_INVALID  
**User Copy**: "This file's Content Credentials are broken: Invalid text encoding"  
**Specification**: RFC 8259 (JSON specification)  
**Rationale**: Invalid UTF-8 violates JSON specification and indicates corruption

---

## 09_mime_sniff_html_disguised_as_json

**Attack**: Server returns text/html for manifest endpoint  
**Expected Decision**: BLOCKED  
**Expected Code**: MIME_REJECTED  
**User Copy**: "For safety, this request was blocked: Invalid content type"  
**Specification**: MDN Web Docs - X-Content-Type-Options: nosniff  
**Rationale**: MIME sniffing attacks can execute malicious content

---

## 10_redirect_cross_scheme

**Attack**: HTTPS→HTTP redirect chain or >3 redirects  
**Expected Decision**: BLOCKED  
**Expected Code**: REDIRECT_DOWNGRADE  
**User Copy**: "For safety, this request was blocked: Insecure redirect detected"  
**Specification**: MDN Web Docs - Mixed Content and Redirect Security  
**Rationale**: Cross-scheme redirects enable security downgrade attacks

---

## 11_uleb_length_overflow

**Attack**: ULEB/varint length fields overflow or are inconsistent  
**Expected Decision**: DESTROYED  
**Expected Code**: LEN_OVERFLOW  
**User Copy**: "This file's Content Credentials are broken: Invalid length encoding"  
**Specification**: C2PA 2.2 (binary format specifications)  
**Rationale**: Length overflow indicates corruption or buffer overflow attacks

---

## 12_json_bomb_deep_nesting

**Attack**: JSON with extreme nesting depth or expansion attacks  
**Expected Decision**: BLOCKED  
**Expected Code**: JSON_RESOURCE_LIMIT  
**User Copy**: "For safety, this request was blocked: JSON too complex"  
**Specification**: Parser security best practices  
**Rationale**: Deep nesting can cause denial-of-service via stack overflow

---

## Security Invariants Matrix

| Invariant | Implementation | Specification | Test Coverage |
|-----------|----------------|----------------|---------------|
| CSP with nonces | `security-invariants.ts` | MDN CSP | ✅ CSP header tests |
| SRI on badge | `security-invariants.ts` | MDN SRI | ✅ SRI header tests |
| X-Content-Type-Options | `security-invariants.ts` | MDN nosniff | ✅ MIME blocking tests |
| Strict Content-Type | `security-invariants.ts` | C2PA spec | ✅ Content validation |
| Referrer-Policy | `security-invariants.ts` | MDN Referrer | ✅ Referrer tests |
| No eval/innerHTML | `adversarial.test.ts` | OWASP XSS | ✅ Badge XSS tests |
| Parser limits | `security-invariants.ts` | Security best practices | ✅ Limit validation |

---

## Decision Codes Reference

| Code | Decision | Description |
|------|----------|-------------|
| OK | VALID | Provenance verified successfully |
| DEGRADED_REMOTE_STALE | DEGRADED | Remote manifest is stale but usable |
| C2PA_JUMBF_LEN | DESTROYED | JUMBF length field inconsistency |
| CYCLE_DETECTED | DESTROYED | Ingredient reference cycle |
| MIXED_CONTENT_BLOCK | BLOCKED | Mixed content (HTTPS→HTTP) |
| MIME_REJECTED | BLOCKED | Invalid MIME type for manifest |
| TIMESTAMP_SKEW | DEGRADED | TSA timestamp skew detected |
| UTF8_INVALID | DESTROYED | Invalid UTF-8 encoding |
| REDIRECT_DOWNGRADE | BLOCKED | Insecure redirect detected |
| LINEAGE_CONFLICT | DESTROYED | Conflicting lineage parents |
| JSON_RESOURCE_LIMIT | BLOCKED | JSON exceeds resource limits |
| REMOTE_404 | DEGRADED | Remote manifest not found |
| UI_SANITIZED | VALID | HTML content sanitized for display |

---

## Test Execution Requirements

### Deterministic Outcomes
- Each attack must return the exact same decision and code on every run
- User copy must contain expected snippet for validation
- Incident logging must match expected assertions

### CI Integration
- `security:c2pa-attacks` job runs full corpus nightly and on PR
- Two consecutive green runs required before release
- Failures block releases until resolved

### Coverage Requirements
- All 12 attack cases must pass
- XSS tests must show zero innerHTML sinks
- CSP headers must be present on all responses
- Parser limits must be enforced

---

## Specification References

1. **ISO/IEC 19566-5** - JUMBF (JPEG Universal Metadata Box Format)
2. **C2PA 2.2 Specification** - Content Authenticity Initiative
3. **RFC 3161** - Time-Stamp Protocol (TSA)
4. **RFC 8259** - JavaScript Object Notation (JSON)
5. **MDN Web Docs** - Web Security Standards
6. **OWASP XSS Prevention** - Cross-Site Scripting Prevention
7. **W3C CSP Specification** - Content Security Policy

---

## Version Control

- Attack artifacts are immutable once committed
- Changing expectations requires security sign-off
- All changes must pass full test suite
- Version tags track security baseline updates
