/**
 * DatabaseRBAC Comprehensive Tests
 * Tests all RBAC functionality including persistence, performance, and edge cases
 */

import { DatabaseRBAC } from '../database-rbac.js';
import { Pool } from 'pg';
import { Subject, Action, Resource, Context } from '../types.js';

describe('DatabaseRBAC', () => {
    let pool: Pool;
    let rbac: DatabaseRBAC;
    let testDbName: string;

    beforeAll(async () => {
        // Create unique test database
        testDbName = `test_rbac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Connect to PostgreSQL (default postgres database for admin operations)
        const testDatabaseUrl = process.env.TEST_DATABASE_URL;
        if (!testDatabaseUrl) {
            throw new Error('TEST_DATABASE_URL environment variable is required for RBAC tests');
        }
        
        const adminPool = new Pool({
            connectionString: testDatabaseUrl,
            ssl: false
        });

        try {
            // Create test database
            await adminPool.query(`CREATE DATABASE "${testDbName}"`);
            console.log(`Created test database: ${testDbName}`);
        } catch (error) {
            console.warn('Test database already exists or cannot be created, using default');
            testDbName = 'postgres'; // Fallback to default database
        } finally {
            await adminPool.end();
        }

        // Connect to test database
        const testDatabaseUrl = process.env.TEST_DATABASE_URL;
        if (!testDatabaseUrl) {
            throw new Error('TEST_DATABASE_URL environment variable is required for RBAC tests');
        }
        
        // Replace database name in connection string
        const connectionUrl = testDatabaseUrl.replace(/\/[^/]*$/, `/${testDbName}`);
        
        pool = new Pool({
            connectionString: connectionUrl,
            ssl: false
        });

        // Setup test schema
        const schemaSql = `
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

            CREATE TABLE IF NOT EXISTS roles (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                role_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                version INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS permissions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                permission_id VARCHAR(50) UNIQUE NOT NULL,
                verb VARCHAR(50) NOT NULL,
                resource VARCHAR(50) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS role_permissions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(role_id, permission_id)
            );

            CREATE TABLE IF NOT EXISTS role_inheritance (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                parent_role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                child_role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(parent_role_id, child_role_id)
            );

            CREATE TABLE IF NOT EXISTS subject_roles (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                subject_id VARCHAR(100) NOT NULL,
                org_id VARCHAR(100) NOT NULL,
                role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                granted_by VARCHAR(100),
                expires_at TIMESTAMP WITH TIME ZONE,
                UNIQUE(subject_id, org_id, role_id)
            );

            CREATE TABLE IF NOT EXISTS rbac_audit_log (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                action VARCHAR(50) NOT NULL,
                subject_id VARCHAR(100),
                org_id VARCHAR(100),
                role_id VARCHAR(50),
                permission_id VARCHAR(50),
                performed_by VARCHAR(100),
                performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                metadata JSONB
            );

            CREATE INDEX IF NOT EXISTS idx_roles_role_id ON roles(role_id);
            CREATE INDEX IF NOT EXISTS idx_permissions_permission_id ON permissions(permission_id);
            CREATE INDEX IF NOT EXISTS idx_subject_roles_subject_org ON subject_roles(subject_id, org_id);
            CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
        `;

        await pool.query(schemaSql);
        rbac = new DatabaseRBAC(pool);
    });

    afterAll(async () => {
        await rbac.close();
        await pool.end();
        
        // Clean up test database if we created one
        if (testDbName !== 'postgres') {
            const adminPool = new Pool({
                connectionString: process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@localhost:5432/postgres',
                ssl: false
            });
            
            try {
                await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
                console.log(`Cleaned up test database: ${testDbName}`);
            } catch (error) {
                console.warn('Could not drop test database:', error.message);
            } finally {
                await adminPool.end();
            }
        }
    });

    beforeEach(async () => {
        // Clean tables before each test
        await pool.query('TRUNCATE TABLE rbac_audit_log, subject_roles, role_permissions, role_inheritance, permissions, roles CASCADE');
    });

    describe('Role Management', () => {
        test('stores and retrieves roles correctly', async () => {
            const role = {
                id: 'test_role',
                name: 'Test Role',
                description: 'A test role',
                permissions: [
                    { id: 'test_perm', verb: 'read', resource: 'test' }
                ]
            };

            await rbac.addRole(role);

            // Verify role was stored
            const result = await pool.query('SELECT * FROM roles WHERE role_id = $1', ['test_role']);
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].name).toBe('Test Role');
            expect(result.rows[0].description).toBe('A test role');

            // Verify permission was stored
            const permResult = await pool.query('SELECT * FROM permissions WHERE permission_id = $1', ['test_perm']);
            expect(permResult.rows).toHaveLength(1);
            expect(permResult.rows[0].verb).toBe('read');
            expect(permResult.rows[0].resource).toBe('test');

            // Verify role-permission link was created
            const linkResult = await pool.query(`
                SELECT rp.* FROM role_permissions rp
                JOIN roles r ON rp.role_id = r.id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE r.role_id = $1 AND p.permission_id = $2
            `, ['test_role', 'test_perm']);
            expect(linkResult.rows).toHaveLength(1);
        });

        test('handles role inheritance correctly', async () => {
            // Create parent role
            await rbac.addRole({
                id: 'parent_role',
                name: 'Parent Role',
                permissions: [
                    { id: 'parent_perm', verb: 'read', resource: 'parent' }
                ]
            });

            // Create child role with inheritance
            await rbac.addRole({
                id: 'child_role',
                name: 'Child Role',
                permissions: [
                    { id: 'child_perm', verb: 'write', resource: 'child' }
                ],
                inherits: ['parent_role']
            });

            // Verify inheritance was stored
            const inheritanceResult = await pool.query(`
                SELECT ri.* FROM role_inheritance ri
                JOIN roles parent ON ri.parent_role_id = parent.id
                JOIN roles child ON ri.child_role_id = child.id
                WHERE parent.role_id = $1 AND child.role_id = $2
            `, ['parent_role', 'child_role']);
            expect(inheritanceResult.rows).toHaveLength(1);
        });

        test('updates existing roles correctly', async () => {
            const role = {
                id: 'update_role',
                name: 'Original Name',
                description: 'Original description',
                permissions: [
                    { id: 'original_perm', verb: 'read', resource: 'original' }
                ]
            };

            await rbac.addRole(role);

            // Update role
            const updatedRole = {
                id: 'update_role',
                name: 'Updated Name',
                description: 'Updated description',
                permissions: [
                    { id: 'updated_perm', verb: 'write', resource: 'updated' }
                ]
            };

            await rbac.addRole(updatedRole);

            // Verify role was updated
            const result = await pool.query('SELECT * FROM roles WHERE role_id = $1', ['update_role']);
            expect(result.rows[0].name).toBe('Updated Name');
            expect(result.rows[0].description).toBe('Updated description');

            // Verify permission was updated
            const permResult = await pool.query('SELECT * FROM permissions WHERE permission_id = $1', ['updated_perm']);
            expect(permResult.rows).toHaveLength(1);
        });
    });

    describe('Permission Checking', () => {
        beforeEach(async () => {
            // Setup test data
            await rbac.addRole({
                id: 'admin',
                name: 'Admin',
                permissions: [
                    { id: 'admin_read', verb: 'read', resource: 'users' },
                    { id: 'admin_write', verb: 'write', resource: 'users' }
                ]
            });

            await rbac.addRole({
                id: 'viewer',
                name: 'Viewer',
                permissions: [
                    { id: 'viewer_read', verb: 'read', resource: 'documents' }
                ]
            });

            // Assign roles to test subject
            await rbac.assignRole('user123', 'org1', 'admin');
            await rbac.assignRole('user123', 'org1', 'viewer');
        });

        test('allows access with correct permissions', async () => {
            const subject: Subject = {
                user_id: 'user123',
                org_id: 'org1',
                roles: ['admin']
            };

            const action: Action = { verb: 'read', resource: 'users' };
            const resource: Resource = { type: 'users', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'req123',
                ip_address: '127.0.0.1'
            };

            const result = await rbac.check(subject, action, resource, context);
            expect(result.allow).toBe(true);
            expect(result.matched_role).toBe('admin');
            expect(result.matched_permission).toBe('admin_read');
        });

        test('denies access without permissions', async () => {
            const subject: Subject = {
                user_id: 'user123',
                org_id: 'org1',
                roles: ['viewer']
            };

            const action: Action = { verb: 'write', resource: 'users' };
            const resource: Resource = { type: 'users', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'req124'
            };

            const result = await rbac.check(subject, action, resource, context);
            expect(result.allow).toBe(false);
            expect(result.reason).toContain('Permission denied');
        });

        test('enforces organization boundaries', async () => {
            const subject: Subject = {
                user_id: 'user123',
                org_id: 'org1',
                roles: ['admin']
            };

            const action: Action = { verb: 'read', resource: 'users' };
            const resource: Resource = { type: 'users', org_id: 'org2' }; // Different org
            const context: Context = {
                timestamp: new Date(),
                request_id: 'req125'
            };

            const result = await rbac.check(subject, action, resource, context);
            expect(result.allow).toBe(false);
            expect(result.reason).toContain('Organization mismatch');
        });

        test('handles wildcard permissions correctly', async () => {
            await rbac.addRole({
                id: 'super_admin',
                name: 'Super Admin',
                permissions: [
                    { id: 'super_all', verb: '*', resource: '*' }
                ]
            });

            await rbac.assignRole('super_user', 'org1', 'super_admin');

            const subject: Subject = {
                user_id: 'super_user',
                org_id: 'org1',
                roles: ['super_admin']
            };

            const action: Action = { verb: 'delete', resource: 'anything' };
            const resource: Resource = { type: 'anything', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'req126'
            };

            const result = await rbac.check(subject, action, resource, context);
            expect(result.allow).toBe(true);
            expect(result.matched_role).toBe('super_admin');
        });
    });

    describe('Caching', () => {
        beforeEach(async () => {
            // Setup test data
            await rbac.addRole({
                id: 'cached_role',
                name: 'Cached Role',
                permissions: [
                    { id: 'cached_perm', verb: 'read', resource: 'cached' }
                ]
            });

            await rbac.assignRole('cached_user', 'org1', 'cached_role');
        });

        test('caches permission checks for performance', async () => {
            const subject: Subject = {
                user_id: 'cached_user',
                org_id: 'org1',
                roles: ['cached_role']
            };

            const action: Action = { verb: 'read', resource: 'cached' };
            const resource: Resource = { type: 'cached', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'cache_test'
            };

            // First call should hit database
            const startTime1 = Date.now();
            const result1 = await rbac.check(subject, action, resource, context);
            const duration1 = Date.now() - startTime1;

            // Second call should hit cache
            const startTime2 = Date.now();
            const result2 = await rbac.check(subject, action, resource, context);
            const duration2 = Date.now() - startTime2;

            expect(result1.allow).toBe(true);
            expect(result2.allow).toBe(true);
            expect(result2).toEqual(result1);
            
            // Cache should be faster (allowing some variance)
            expect(duration2).toBeLessThanOrEqual(duration1);
        });

        test('clears cache when roles are assigned/revoked', async () => {
            const subject: Subject = {
                user_id: 'cache_clear_user',
                org_id: 'org1',
                roles: []
            };

            const action: Action = { verb: 'read', resource: 'cached' };
            const resource: Resource = { type: 'cached', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'cache_clear_test'
            };

            // First check - should be denied
            const result1 = await rbac.check(subject, action, resource, context);
            expect(result1.allow).toBe(false);

            // Assign role
            await rbac.assignRole('cache_clear_user', 'org1', 'cached_role');
            subject.roles = ['cached_role'];

            // Second check - should be allowed (cache cleared)
            const result2 = await rbac.check(subject, action, resource, context);
            expect(result2.allow).toBe(true);
        });
    });

    describe('Role Assignment', () => {
        beforeEach(async () => {
            await rbac.addRole({
                id: 'assignable_role',
                name: 'Assignable Role',
                permissions: [
                    { id: 'assignable_perm', verb: 'read', resource: 'assignable' }
                ]
            });
        });

        test('assigns and revokes roles correctly', async () => {
            // Assign role
            await rbac.assignRole('assign_user', 'org1', 'assignable_role', 'admin');

            // Verify assignment
            const roles = await rbac.getSubjectRoles('assign_user', 'org1');
            expect(roles).toContain('assignable_role');

            // Verify database record
            const assignment = await pool.query(`
                SELECT * FROM subject_roles 
                WHERE subject_id = $1 AND org_id = $2
            `, ['assign_user', 'org1']);
            expect(assignment.rows).toHaveLength(1);
            expect(assignment.rows[0].granted_by).toBe('admin');

            // Revoke role
            await rbac.revokeRole('assign_user', 'org1', 'assignable_role', 'admin');

            // Verify revocation
            const rolesAfterRevoke = await rbac.getSubjectRoles('assign_user', 'org1');
            expect(rolesAfterRevoke).not.toContain('assignable_role');

            // Verify database record removed
            const assignmentAfterRevoke = await pool.query(`
                SELECT * FROM subject_roles 
                WHERE subject_id = $1 AND org_id = $2
            `, ['assign_user', 'org1']);
            expect(assignmentAfterRevoke.rows).toHaveLength(0);
        });

        test('handles role expiration correctly', async () => {
            const futureDate = new Date();
            futureDate.setHours(futureDate.getHours() + 1);

            // Assign role with expiration
            await rbac.assignRole('expire_user', 'org1', 'assignable_role', 'admin', futureDate);

            // Should be allowed (not expired yet)
            const roles = await rbac.getSubjectRoles('expire_user', 'org1');
            expect(roles).toContain('assignable_role');

            // Test with expired role
            const pastDate = new Date();
            pastDate.setHours(pastDate.getHours() - 1);

            await rbac.assignRole('expired_user', 'org1', 'assignable_role', 'admin', pastDate);

            const expiredRoles = await rbac.getSubjectRoles('expired_user', 'org1');
            expect(expiredRoles).not.toContain('assignable_role');
        });
    });

    describe('Audit Logging', () => {
        test('logs permission checks correctly', async () => {
            await rbac.addRole({
                id: 'audit_role',
                name: 'Audit Role',
                permissions: [
                    { id: 'audit_perm', verb: 'read', resource: 'audit' }
                ]
            });

            await rbac.assignRole('audit_user', 'org1', 'audit_role');

            const subject: Subject = {
                user_id: 'audit_user',
                org_id: 'org1',
                roles: ['audit_role']
            };

            const action: Action = { verb: 'read', resource: 'audit' };
            const resource: Resource = { type: 'audit', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'audit_test_123',
                ip_address: '192.168.1.1',
                user_agent: 'test-agent'
            };

            // Perform permission check
            await rbac.check(subject, action, resource, context);

            // Verify audit log entry
            const auditEntry = await pool.query(`
                SELECT * FROM rbac_audit_log 
                WHERE action = 'permission_check' AND subject_id = $1
                ORDER BY performed_at DESC LIMIT 1
            `, ['audit_user']);

            expect(auditEntry.rows).toHaveLength(1);
            expect(auditEntry.rows[0].subject_id).toBe('audit_user');
            expect(auditEntry.rows[0].org_id).toBe('org1');
            expect(auditEntry.rows[0].role_id).toBe('audit_role');
            expect(auditEntry.rows[0].permission_id).toBe('audit_perm');
            expect(auditEntry.rows[0].performed_by).toBe('audit_test_123');

            const metadata = auditEntry.rows[0].metadata;
            expect(metadata.action).toBe('read:audit');
            expect(metadata.resource).toBe('audit');
            expect(metadata.allowed).toBe(true);
            expect(metadata.ip_address).toBe('192.168.1.1');
            expect(metadata.user_agent).toBe('test-agent');
        });

        test('logs role changes correctly', async () => {
            await rbac.addRole({
                id: 'log_role',
                name: 'Log Role',
                permissions: [
                    { id: 'log_perm', verb: 'read', resource: 'log' }
                ]
            });

            // Assign role
            await rbac.assignRole('log_user', 'org1', 'log_role', 'test_admin');

            // Verify role assignment audit log
            const assignLog = await pool.query(`
                SELECT * FROM rbac_audit_log 
                WHERE action = 'role_assign' AND subject_id = $1
                ORDER BY performed_at DESC LIMIT 1
            `, ['log_user']);

            expect(assignLog.rows).toHaveLength(1);
            expect(assignLog.rows[0].role_id).toBe('log_role');
            expect(assignLog.rows[0].subject_id).toBe('log_user');
            expect(assignLog.rows[0].org_id).toBe('org1');
            expect(assignLog.rows[0].performed_by).toBe('test_admin');

            // Revoke role
            await rbac.revokeRole('log_user', 'org1', 'log_role', 'test_admin');

            // Verify role revocation audit log
            const revokeLog = await pool.query(`
                SELECT * FROM rbac_audit_log 
                WHERE action = 'role_revoke' AND subject_id = $1
                ORDER BY performed_at DESC LIMIT 1
            `, ['log_user']);

            expect(revokeLog.rows).toHaveLength(1);
            expect(revokeLog.rows[0].role_id).toBe('log_role');
            expect(revokeLog.rows[0].subject_id).toBe('log_user');
            expect(revokeLog.rows[0].org_id).toBe('org1');
            expect(revokeLog.rows[0].performed_by).toBe('test_admin');
        });
    });

    describe('Health Check', () => {
        test('returns healthy status when database is connected', async () => {
            const health = await rbac.healthCheck();
            
            expect(health.status).toBe('healthy');
            expect(health.details.database).toBe('connected');
            expect(health.details.totalRoles).toBeGreaterThanOrEqual(0);
            expect(health.details.cacheSize).toBeGreaterThanOrEqual(0);
            expect(health.details.cacheTTL).toBe(5 * 60 * 1000);
        });

        test('returns unhealthy status when database is disconnected', async () => {
            // Close the pool to simulate database disconnection
            await pool.end();
            
            const health = await rbac.healthCheck();
            
            expect(health.status).toBe('unhealthy');
            expect(health.details.database).toBe('disconnected');
            expect(health.details.error).toBeDefined();
        });
    });

    describe('Performance Tests', () => {
        beforeEach(async () => {
            // Setup performance test data
            for (let i = 0; i < 10; i++) {
                await rbac.addRole({
                    id: `perf_role_${i}`,
                    name: `Performance Role ${i}`,
                    permissions: [
                        { id: `perf_perm_${i}`, verb: 'read', resource: `perf_${i}` }
                    ]
                });
            }
        });

        test('permission checks complete within acceptable time', async () => {
            await rbac.assignRole('perf_user', 'org1', 'perf_role_5');

            const subject: Subject = {
                user_id: 'perf_user',
                org_id: 'org1',
                roles: ['perf_role_5']
            };

            const action: Action = { verb: 'read', resource: 'perf_5' };
            const resource: Resource = { type: 'perf_5', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'perf_test'
            };

            // Measure performance
            const startTime = Date.now();
            const result = await rbac.check(subject, action, resource, context);
            const duration = Date.now() - startTime;

            expect(result.allow).toBe(true);
            expect(duration).toBeLessThan(100); // Should complete in under 100ms
        });

        test('cached permission checks are significantly faster', async () => {
            await rbac.assignRole('cache_perf_user', 'org1', 'perf_role_3');

            const subject: Subject = {
                user_id: 'cache_perf_user',
                org_id: 'org1',
                roles: ['perf_role_3']
            };

            const action: Action = { verb: 'read', resource: 'perf_3' };
            const resource: Resource = { type: 'perf_3', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'cache_perf_test'
            };

            // First call (database)
            const startTime1 = Date.now();
            await rbac.check(subject, action, resource, context);
            const dbTime = Date.now() - startTime1;

            // Second call (cache)
            const startTime2 = Date.now();
            await rbac.check(subject, action, resource, context);
            const cacheTime = Date.now() - startTime2;

            // Cache should be significantly faster
            expect(cacheTime).toBeLessThan(dbTime * 0.5); // At least 50% faster
        });
    });

    describe('Error Handling', () => {
        test('handles invalid subjects gracefully', async () => {
            const invalidSubject = {} as Subject;
            const action: Action = { verb: 'read', resource: 'test' };
            const resource: Resource = { type: 'test', org_id: 'org1' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'error_test'
            };

            const result = await rbac.check(invalidSubject, action, resource, context);
            expect(result.allow).toBe(false);
            expect(result.reason).toContain('Invalid subject');
        });

        test('handles database errors gracefully', async () => {
            // Create a broken pool
            const brokenPool = new Pool({
                connectionString: 'postgresql://invalid:invalid@invalid:5432/invalid',
                ssl: false,
                connectionTimeoutMillis: 1000
            });

            const brokenRbac = new DatabaseRBAC(brokenPool);

            const subject: Subject = {
                user_id: 'test',
                org_id: 'test',
                roles: ['test']
            };

            const action: Action = { verb: 'read', resource: 'test' };
            const resource: Resource = { type: 'test', org_id: 'test' };
            const context: Context = {
                timestamp: new Date(),
                request_id: 'error_test'
            };

            const result = await brokenRbac.check(subject, action, resource, context);
            expect(result.allow).toBe(false);
            expect(result.reason).toContain('RBAC system error');

            await brokenRbac.close();
        });
    });
});
