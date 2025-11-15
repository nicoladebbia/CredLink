# @credlink/compliance

Compliance and regulatory features for CredLink platform.

## Overview

Provides compliance tools for content authenticity and provenance tracking:
- Audit logging
- Regulatory reporting
- Policy enforcement
- Chain of custody tracking

## Features

- ✅ GDPR compliance
- ✅ Audit trail generation
- ✅ Retention policies
- ✅ Export capabilities

## Usage

```typescript
import { ComplianceService } from '@credlink/compliance';

const compliance = new ComplianceService();
await compliance.logAccess(userId, resourceId);
const auditTrail = await compliance.generateAuditTrail(startDate, endDate);
```

## License

Proprietary - CredLink Platform
