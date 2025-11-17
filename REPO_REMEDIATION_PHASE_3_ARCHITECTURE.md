# CredLink Remediation Phase 3: Architecture & Performance
## Steps 23-36 (93.8 → 98.8/100)

---

### Step 23: Extract Bounded Contexts

**Owner**: Architecture Lead  
**Effort**: 3 days  
**Risk**: High (major refactoring)  
**Blocked By**: Steps 0-22  
**Blocks**: Step 24

**Rationale**: Current monolithic structure mixes concerns. Evidence:
- `apps/api/src/` contains authentication, storage, validation, and business logic mixed together
- No clear domain boundaries between C2PA operations, authentication, and storage
- Tight coupling makes testing and maintenance difficult

**Prerequisites**:
- All tests passing from Phase 2
- Domain boundaries identified
- Migration strategy documented

**Implementation**:

**1. Domain Structure Definition**:
```typescript
// domains/c2pa/src/C2PADomain.ts
export interface C2PAOperationRequest {
    imageData: Buffer;
    customAssertions?: Record<string, any>;
    clientId: string;
    orgId: string;
}

export interface C2PAOperationResult {
    signedImage: Buffer;
    proofUri: string;
    manifest: C2PAManifest;
    metadata: OperationMetadata;
}

export interface OperationMetadata {
    operationId: string;
    timestamp: Date;
    processingTime: number;
    algorithm: string;
}

export class C2PADomain {
    private signingService: SigningService;
    private verificationService: VerificationService;
    private manifestService: ManifestService;

    constructor(
        signingService: SigningService,
        verificationService: VerificationService,
        manifestService: ManifestService
    ) {
        this.signingService = signingService;
        this.verificationService = verificationService;
        this.manifestService = manifestService;
    }

    async signImage(request: C2PAOperationRequest): Promise<C2PAOperationResult> {
        const startTime = Date.now();
        const operationId = randomUUID();

        try {
            // Domain-specific validation
            this.validateC2PARequest(request);

            // Create manifest
            const manifest = await this.manifestService.createManifest(request);

            // Sign the image
            const signedImage = await this.signingService.sign(request.imageData, manifest);

            // Generate proof URI
            const proofUri = await this.generateProofUri(operationId);

            const result: C2PAOperationResult = {
                signedImage,
                proofUri,
                manifest,
                metadata: {
                    operationId,
                    timestamp: new Date(),
                    processingTime: Date.now() - startTime,
                    algorithm: 'c2pa-rsa-2048'
                }
            };

            // Emit domain event
            await this.emitC2PAEvent('image_signed', result);

            return result;

        } catch (error) {
            await this.emitC2PAEvent('signing_failed', {
                operationId,
                error: error.message,
                clientId: request.clientId
            });
            throw error;
        }
    }

    async verifyImage(imageData: Buffer): Promise<VerificationResult> {
        // Domain-specific verification logic
        const manifest = await this.manifestService.extractManifest(imageData);
        const verification = await this.verificationService.verify(imageData, manifest);
        
        return {
            isValid: verification.signatureValid && verification.certificateValid,
            confidence: this.calculateConfidence(verification),
            details: verification
        };
    }

    private validateC2PARequest(request: C2PAOperationRequest): void {
        if (!request.imageData || request.imageData.length === 0) {
            throw new ValidationError('Image data is required');
        }

        if (!request.clientId || !request.orgId) {
            throw new ValidationError('Client and organization identifiers are required');
        }
    }

    private async generateProofUri(operationId: string): Promise<string> {
        const proofDomain = process.env.PROOF_URI_DOMAIN || 'https://proofs.credlink.com';
        return `${proofDomain}/${operationId}`;
    }

    private async emitC2PAEvent(eventType: string, data: any): Promise<void> {
        // Domain event emission
        console.log(`C2PA Event: ${eventType}`, data);
    }

    private calculateConfidence(verification: any): number {
        // Domain-specific confidence calculation
        let confidence = 0;

        if (verification.signatureValid) confidence += 40;
        if (verification.certificateValid) confidence += 30;
        if (verification.manifestIntegrity) confidence += 20;
        if (verification.timestampValid) confidence += 10;

        return confidence;
    }
}
```

**2. Authentication Domain**:
```typescript
// domains/authentication/src/AuthenticationDomain.ts
export interface AuthenticationRequest {
    apiKey: string;
    context: RequestContext;
}

export interface AuthenticationResult {
    isValid: boolean;
    clientId?: string;
    permissions?: string[];
    metadata?: AuthMetadata;
}

export interface AuthMetadata {
    keyId: string;
    keyVersion: number;
    expiresAt: Date;
    lastUsedAt: Date;
}

export class AuthenticationDomain {
    private apiKeyService: ApiKeyService;
    private rbacService: RBACService;
    private sessionService: SessionService;

    constructor(
        apiKeyService: ApiKeyService,
        rbacService: RBACService,
        sessionService: SessionService
    ) {
        this.apiKeyService = apiKeyService;
        this.rbacService = rbacService;
        this.sessionService = sessionService;
    }

    async authenticate(request: AuthenticationRequest): Promise<AuthenticationResult> {
        try {
            // Validate API key
            const keyRecord = await this.apiKeyService.validateKey(request.apiKey);
            if (!keyRecord) {
                return { isValid: false };
            }

            // Get user permissions
            const permissions = await this.rbacService.getUserPermissions(
                keyRecord.clientId,
                request.context.orgId
            );

            // Create session
            const session = await this.sessionService.createSession(keyRecord, request.context);

            return {
                isValid: true,
                clientId: keyRecord.clientId,
                permissions,
                metadata: {
                    keyId: keyRecord.keyId,
                    keyVersion: keyRecord.version,
                    expiresAt: keyRecord.expiresAt,
                    lastUsedAt: new Date()
                }
            };

        } catch (error) {
            console.error('Authentication domain error:', error);
            return { isValid: false };
        }
    }

    async authorize(clientId: string, action: string, resource: string, orgId: string): Promise<boolean> {
        return this.rbacService.checkPermission(clientId, action, resource, orgId);
    }

    async revokeSession(sessionId: string): Promise<void> {
        await this.sessionService.revokeSession(sessionId);
    }
}
```

**3. Storage Domain**:
```typescript
// domains/storage/src/StorageDomain.ts
export interface StorageRequest {
    data: any;
    key: string;
    metadata?: Record<string, any>;
    encryptionRequired?: boolean;
}

export interface StorageResult {
    success: boolean;
    uri?: string;
    metadata?: StorageMetadata;
}

export interface StorageMetadata {
    size: number;
    hash: string;
    createdAt: Date;
    backend: string;
}

export class StorageDomain {
    private backends: Map<string, StorageBackend>;
    private encryption: EncryptionService;
    private metrics: StorageMetrics;

    constructor(
        backends: StorageBackend[],
        encryption: EncryptionService,
        metrics: StorageMetrics
    ) {
        this.backends = new Map();
        backends.forEach(backend => {
            this.backends.set(backend.name, backend);
        });
        this.encryption = encryption;
        this.metrics = metrics;
    }

    async store(request: StorageRequest): Promise<StorageResult> {
        const startTime = Date.now();

        try {
            // Select optimal backend
            const backend = this.selectBackend(request);
            
            // Encrypt if required
            let dataToStore = request.data;
            if (request.encryptionRequired) {
                dataToStore = await this.encryption.encrypt(JSON.stringify(request.data));
            }

            // Store data
            const result = await backend.store({
                key: request.key,
                data: dataToStore,
                metadata: {
                    ...request.metadata,
                    encrypted: request.encryptionRequired || false,
                    size: JSON.stringify(dataToStore).length
                }
            });

            const metadata: StorageMetadata = {
                size: JSON.stringify(request.data).length,
                hash: this.calculateHash(request.data),
                createdAt: new Date(),
                backend: backend.name
            };

            // Record metrics
            this.metrics.recordStorage({
                backend: backend.name,
                operation: 'store',
                duration: Date.now() - startTime,
                size: metadata.size,
                success: true
            });

            return {
                success: true,
                uri: result.uri,
                metadata
            };

        } catch (error) {
            this.metrics.recordStorage({
                backend: 'unknown',
                operation: 'store',
                duration: Date.now() - startTime,
                size: 0,
                success: false,
                error: error.message
            });

            return { success: false };
        }
    }

    async retrieve(key: string): Promise<any> {
        const startTime = Date.now();

        try {
            // Try backends in order of preference
            for (const [name, backend] of this.backends.entries()) {
                try {
                    const result = await backend.retrieve(key);
                    
                    if (result) {
                        // Decrypt if needed
                        let data = result.data;
                        if (result.metadata?.encrypted) {
                            data = JSON.parse(await this.encryption.decrypt(data));
                        }

                        this.metrics.recordStorage({
                            backend: name,
                            operation: 'retrieve',
                            duration: Date.now() - startTime,
                            size: JSON.stringify(data).length,
                            success: true
                        });

                        return data;
                    }
                } catch (error) {
                    // Try next backend
                    continue;
                }
            }

            throw new Error('Data not found in any backend');

        } catch (error) {
            this.metrics.recordStorage({
                backend: 'unknown',
                operation: 'retrieve',
                duration: Date.now() - startTime,
                size: 0,
                success: false,
                error: error.message
            });
            throw error;
        }
    }

    private selectBackend(request: StorageRequest): StorageBackend {
        // Backend selection logic based on data size, availability, etc.
        const dataSize = JSON.stringify(request.data).length;
        
        if (dataSize < 1024 * 1024) { // < 1MB
            return this.backends.get('memory') || this.backends.get('filesystem')!;
        } else if (dataSize < 100 * 1024 * 1024) { // < 100MB
            return this.backends.get('filesystem') || this.backends.get('s3')!;
        } else {
            return this.backends.get('s3')!;
        }
    }

    private calculateHash(data: any): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    }
}
```

**4. Application Service Layer**:
```typescript
// apps/api/src/application/ImageSigningService.ts
import { C2PADomain } from '../../domains/c2pa/src/C2PADomain.js';
import { AuthenticationDomain } from '../../domains/authentication/src/AuthenticationDomain.js';
import { StorageDomain } from '../../domains/storage/src/StorageDomain.js';

export class ImageSigningService {
    constructor(
        private c2paDomain: C2PADomain,
        private authDomain: AuthenticationDomain,
        private storageDomain: StorageDomain
    ) {}

    async signImage(request: ImageSigningRequest): Promise<ImageSigningResponse> {
        // 1. Authenticate and authorize
        const authResult = await this.authDomain.authenticate({
            apiKey: request.apiKey,
            context: {
                orgId: request.orgId,
                ip: request.ip,
                userAgent: request.userAgent
            }
        });

        if (!authResult.isValid) {
            throw new UnauthorizedError('Authentication failed');
        }

        const authorized = await this.authDomain.authorize(
            authResult.clientId!,
            'create',
            'sign',
            request.orgId
        );

        if (!authorized) {
            throw new ForbiddenError('Insufficient permissions for image signing');
        }

        // 2. Process through C2PA domain
        const c2paResult = await this.c2paDomain.signImage({
            imageData: request.imageData,
            customAssertions: request.customAssertions,
            clientId: authResult.clientId!,
            orgId: request.orgId
        });

        // 3. Store proof
        const storageResult = await this.storageDomain.store({
            data: {
                manifest: c2paResult.manifest,
                metadata: c2paResult.metadata
            },
            key: c2paResult.metadata.operationId,
            encryptionRequired: true,
            metadata: {
                clientId: authResult.clientId,
                orgId: request.orgId,
                operationType: 'sign'
            }
        });

        if (!storageResult.success) {
            throw new StorageError('Failed to store proof data');
        }

        return {
            signedImage: c2paResult.signedImage,
            proofUri: c2paResult.proofUri,
            storageUri: storageResult.uri,
            metadata: c2paResult.metadata
        };
    }
}
```

**5. Updated Route Handlers**:
```typescript
// apps/api/src/routes/sign-domain.ts
import { Router } from 'express';
import { ImageSigningService } from '../application/ImageSigningService.js';
import { ValidationService } from '../services/validation-service.js';

const router = Router();

export function createDomainSignRouter(
    signingService: ImageSigningService,
    validationService: ValidationService
): Router {
    router.post('/', upload.single('image'), async (req, res, next) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: 'No file uploaded',
                    message: 'Please provide an image file for signing'
                });
            }

            // Validate input
            const validationResult = await validationService.validateImage(
                req.file.buffer,
                req.file.mimetype
            );

            if (!validationResult.isValid) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: validationResult.errors
                });
            }

            // Sanitize custom assertions
            const sanitizedAssertions = validationService.sanitizeCustomAssertions(
                req.body.customAssertions
            );

            // Process through application service
            const result = await signingService.signImage({
                imageData: req.file.buffer,
                customAssertions: sanitizedAssertions.sanitized,
                apiKey: req.get('Authorization')?.replace('Bearer ', '') || req.get('X-API-Key') || '',
                orgId: req.headers['x-org-id'] as string,
                ip: req.ip,
                userAgent: req.get('User-Agent') || ''
            });

            res.set('X-Proof-Uri', result.proofUri);
            res.set('X-Storage-Uri', result.storageUri);
            res.send(result.signedImage);

        } catch (error) {
            next(error);
        }
    });

    return router;
}
```

**Tests to Add**:
```typescript
// domains/c2pa/src/__tests__/C2PADomain.test.ts
import { C2PADomain } from '../C2PADomain';

describe('C2PADomain', () => {
    let c2paDomain: C2PADomain;
    let mockSigningService: any;
    let mockVerificationService: any;
    let mockManifestService: any;

    beforeEach(() => {
        mockSigningService = {
            sign: jest.fn()
        };
        mockVerificationService = {
            verify: jest.fn()
        };
        mockManifestService = {
            createManifest: jest.fn(),
            extractManifest: jest.fn()
        };

        c2paDomain = new C2PADomain(
            mockSigningService,
            mockVerificationService,
            mockManifestService
        );
    });

    test('signs image with valid request', async () => {
        const request = {
            imageData: Buffer.from('test-image-data'),
            customAssertions: { test: 'value' },
            clientId: 'client123',
            orgId: 'org1'
        };

        const mockManifest = { claim_generator: 'test', format: 'c2pa' };
        const mockSignedImage = Buffer.from('signed-image-data');

        mockManifestService.createManifest.mockResolvedValue(mockManifest);
        mockSigningService.sign.mockResolvedValue(mockSignedImage);

        const result = await c2paDomain.signImage(request);

        expect(result.signedImage).toBe(mockSignedImage);
        expect(result.proofUri).toMatch(/^https:\/\/proofs\.credlink\.com\//);
        expect(result.manifest).toBe(mockManifest);
        expect(result.metadata.operationId).toBeDefined();
        expect(result.metadata.processingTime).toBeGreaterThan(0);
    });

    test('validates request parameters', async () => {
        const invalidRequest = {
            imageData: Buffer.alloc(0),
            customAssertions: {},
            clientId: '',
            orgId: ''
        };

        await expect(c2paDomain.signImage(invalidRequest)).rejects.toThrow('Image data is required');
    });
});
```

**Migration Strategy**:
```typescript
// scripts/migrate-to-domains.ts
import { execSync } from 'child_process';

async function migrateToDomains(): Promise<void> {
    console.log('Migrating to domain-driven architecture...');

    // Step 1: Create domain directories
    execSync('mkdir -p domains/{c2pa,authentication,storage,shared}/src', { stdio: 'inherit' });

    // Step 2: Move existing code to domains
    console.log('Moving C2PA logic to domain...');
    execSync('cp apps/api/src/services/c2pa-service.ts domains/c2pa/src/', { stdio: 'inherit' });
    
    console.log('Moving authentication logic to domain...');
    execSync('cp apps/api/src/middleware/auth.ts domains/authentication/src/', { stdio: 'inherit' });
    
    console.log('Moving storage logic to domain...');
    execSync('cp apps/api/src/services/proof-storage.ts domains/storage/src/', { stdio: 'inherit' });

    // Step 3: Update imports
    console.log('Updating imports...');
    execSync('find apps/api/src -name "*.ts" -exec sed -i "" "s|../services/c2pa-service|../../domains/c2pa/src|g" {} +', { stdio: 'inherit' });

    // Step 4: Run tests to verify migration
    console.log('Running migration verification tests...');
    execSync('pnpm test --testPathPattern=migration', { stdio: 'inherit' });

    console.log('✅ Domain migration completed successfully');
}

migrateToDomains().catch(console.error);
```

**Validation**:
- [ ] Domain boundaries clearly defined
- [ ] No circular dependencies between domains
- [ ] Application services coordinate domains properly
- [ ] Route handlers use application services
- [ ] All tests pass after migration
- [ ] Performance impact < 10%
- [ ] Code organization improved
- [ ] Domain logic isolated and testable

**Artifacts**:
- Commit: "refactor(architecture): extract bounded contexts with DDD [CRED-013]"
- PR: #023-domain-extraction
- Tag: architecture-ddd-v1.0.0
- Changelog: "### Architecture\n- Extracted bounded contexts for C2PA, Authentication, and Storage\n- Implemented application service layer\n- Improved separation of concerns and testability"

**Rollback**:
```bash
git revert HEAD
# Restore monolithic structure
```

**Score Impact**: +1.0 (Architecture: 10→11, Maintainability: 12→13)  
**New Score**: 94.8/100

---

[Continue with Steps 24-36...]
