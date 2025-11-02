/**
 * RBAC Tests - ASVS V4 aligned authorization tests
 */

import { check, Subject, Action, Resource, Context, hasRole, can } from '../src/index';

describe('RBAC Core', () => {
  const mockContext: Context = {
    timestamp: new Date(),
    request_id: 'test_123'
  };

  const mockResource: Resource = {
    type: 'test',
    org_id: 'org_123'
  };

  describe('Org Admin Role', () => {
    const orgAdmin: Subject = {
      user_id: 'user_123',
      org_id: 'org_123',
      roles: ['org_admin']
    };

    it('should allow full access within organization', () => {
      const result = check(
        orgAdmin,
        { verb: 'create', resource: 'users' },
        mockResource,
        mockContext
      );

      expect(result.allow).toBe(true);
      expect(result.reason).toContain('Org Admin has full access');
    });

    it('should deny cross-organization access', () => {
      const result = check(
        orgAdmin,
        { verb: 'read', resource: 'users' },
        { type: 'users', org_id: 'other_org' },
        mockContext
      );

      expect(result.allow).toBe(false);
      expect(result.reason).toContain('Cross-organization access denied');
    });
  });

  describe('Auditor Role', () => {
    const auditor: Subject = {
      user_id: 'auditor_123',
      org_id: 'org_123',
      roles: ['auditor']
    };

    it('should allow read-only access to compliance data', () => {
      const result = check(
        auditor,
        { verb: 'read', resource: 'audit' },
        mockResource,
        mockContext
      );

      expect(result.allow).toBe(true);
      expect(result.reason).toContain('Auditor has read-only access');
    });

    it('should deny write operations', () => {
      const result = check(
        auditor,
        { verb: 'create', resource: 'users' },
        mockResource,
        mockContext
      );

      expect(result.allow).toBe(false);
      expect(result.reason).toContain('Auditor role cannot perform write operations');
    });
  });

  describe('Integrator Role', () => {
    const integrator: Subject = {
      user_id: 'integrator_123',
      org_id: 'org_123',
      roles: ['integrator'],
      api_key_id: 'key_123'
    };

    it('should allow API operations with key', () => {
      const result = check(
        integrator,
        { verb: 'execute', resource: 'sign', scope: 'sign:assets' },
        mockResource,
        mockContext
      );

      expect(result.allow).toBe(true);
      expect(result.reason).toContain('Integrator has scoped API access');
    });

    it('should deny operations without API key', () => {
      const integratorNoKey: Subject = {
        user_id: 'integrator_123',
        org_id: 'org_123',
        roles: ['integrator']
      };

      const result = check(
        integratorNoKey,
        { verb: 'execute', resource: 'sign' },
        mockResource,
        mockContext
      );

      expect(result.allow).toBe(false);
      expect(result.reason).toContain('Integrator role requires API key authentication');
    });
  });

  describe('Utility Functions', () => {
    const subject: Subject = {
      user_id: 'user_123',
      org_id: 'org_123',
      roles: ['org_admin', 'auditor']
    };

    it('should correctly identify role presence', () => {
      expect(hasRole(subject, 'org_admin')).toBe(true);
      expect(hasRole(subject, 'auditor')).toBe(true);
      expect(hasRole(subject, 'integrator')).toBe(false);
    });

    it('should correctly evaluate permissions', () => {
      expect(can(subject, 'create', 'users')).toBe(true);
      expect(can(subject, 'read', 'audit')).toBe(true);
      expect(can(subject, 'delete', 'users')).toBe(true);
    });
  });

  describe('Invalid Subjects', () => {
    it('should deny access for missing user_id', () => {
      const invalidSubject: Subject = {
        user_id: '',
        org_id: 'org_123',
        roles: ['org_admin']
      };

      const result = check(
        invalidSubject,
        { verb: 'read', resource: 'users' },
        mockResource,
        mockContext
      );

      expect(result.allow).toBe(false);
      expect(result.reason).toContain('Invalid subject');
    });

    it('should deny access for missing org_id', () => {
      const invalidSubject: Subject = {
        user_id: 'user_123',
        org_id: '',
        roles: ['org_admin']
      };

      const result = check(
        invalidSubject,
        { verb: 'read', resource: 'users' },
        mockResource,
        mockContext
      );

      expect(result.allow).toBe(false);
      expect(result.reason).toContain('Invalid subject');
    });
  });
});
