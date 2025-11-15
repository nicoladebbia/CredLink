/**
 * RBAC Tests
 * Comprehensive test suite for role-based access control
 */

import { check, addRole, getRole, getAllRoles, hasRole, hasAnyRole, hasAllRoles } from './rbac';
import { Subject, Action, Resource, Context, Role } from './types';

describe('RBAC System', () => {
  // Test fixtures
  const createSubject = (roles: string[], org_id = 'org_test'): Subject => ({
    user_id: 'user_test',
    org_id,
    roles
  });

  const createAction = (verb: string, resource: string): Action => ({
    verb,
    resource
  });

  const createResource = (type: string, org_id = 'org_test'): Resource => ({
    type,
    org_id
  });

  const createContext = (): Context => ({
    timestamp: new Date(),
    request_id: 'test_req_123'
  });

  describe('check function', () => {
    describe('super_admin role', () => {
      it('should allow all actions for super_admin', () => {
        const subject = createSubject(['super_admin']);
        const action = createAction('delete', 'everything');
        const resource = createResource('everything');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
        expect(result.matched_role).toBe('super_admin');
      });
    });

    describe('org_admin role', () => {
      it('should allow key creation for org_admin', () => {
        const subject = createSubject(['org_admin']);
        const action = createAction('create', 'keys');
        const resource = createResource('keys');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
        expect(result.matched_role).toBe('org_admin');
      });

      it('should allow policy updates for org_admin', () => {
        const subject = createSubject(['org_admin']);
        const action = createAction('update', 'policies');
        const resource = createResource('policies');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
      });

      it('should allow signing for org_admin', () => {
        const subject = createSubject(['org_admin']);
        const action = createAction('execute', 'sign');
        const resource = createResource('sign');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
      });
    });

    describe('developer role', () => {
      it('should allow signing for developer', () => {
        const subject = createSubject(['developer']);
        const action = createAction('execute', 'sign');
        const resource = createResource('sign');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
        expect(result.matched_role).toBe('developer');
      });

      it('should allow verification for developer', () => {
        const subject = createSubject(['developer']);
        const action = createAction('execute', 'verify');
        const resource = createResource('verify');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
      });

      it('should allow reading keys for developer', () => {
        const subject = createSubject(['developer']);
        const action = createAction('read', 'keys');
        const resource = createResource('keys');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
      });

      it('should deny key creation for developer', () => {
        const subject = createSubject(['developer']);
        const action = createAction('create', 'keys');
        const resource = createResource('keys');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(false);
        expect(result.reason).toContain('Permission denied');
      });
    });

    describe('auditor role', () => {
      it('should allow reading audit logs for auditor', () => {
        const subject = createSubject(['auditor']);
        const action = createAction('read', 'audit');
        const resource = createResource('audit');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
        expect(result.matched_role).toBe('auditor');
      });

      it('should deny signing for auditor', () => {
        const subject = createSubject(['auditor']);
        const action = createAction('execute', 'sign');
        const resource = createResource('sign');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(false);
      });
    });

    describe('viewer role', () => {
      it('should allow verification for viewer', () => {
        const subject = createSubject(['viewer']);
        const action = createAction('execute', 'verify');
        const resource = createResource('verify');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
      });

      it('should deny signing for viewer', () => {
        const subject = createSubject(['viewer']);
        const action = createAction('execute', 'sign');
        const resource = createResource('sign');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(false);
      });
    });

    describe('organization isolation', () => {
      it('should deny access to resources from different organization', () => {
        const subject = createSubject(['org_admin'], 'org_1');
        const action = createAction('read', 'keys');
        const resource = createResource('keys', 'org_2');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(false);
        expect(result.reason).toContain('Organization mismatch');
      });

      it('should allow access to resources from same organization', () => {
        const subject = createSubject(['org_admin'], 'org_1');
        const action = createAction('read', 'keys');
        const resource = createResource('keys', 'org_1');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
      });
    });

    describe('input validation', () => {
      it('should deny access for subject with no roles', () => {
        const subject = createSubject([]);
        const action = createAction('read', 'anything');
        const resource = createResource('anything');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(false);
        expect(result.reason).toContain('No roles assigned');
      });

      it('should deny access for invalid subject', () => {
        const subject = { user_id: '', org_id: '', roles: [] } as Subject;
        const action = createAction('read', 'anything');
        const resource = createResource('anything');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(false);
        expect(result.reason).toContain('Invalid');
      });

      it('should deny access for invalid action', () => {
        const subject = createSubject(['developer']);
        const action = { verb: '', resource: '' } as Action;
        const resource = createResource('anything');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(false);
        expect(result.reason).toContain('Invalid action');
      });
    });

    describe('multiple roles', () => {
      it('should grant access if any role has permission', () => {
        const subject = createSubject(['viewer', 'developer']);
        const action = createAction('execute', 'sign');
        const resource = createResource('sign');
        const context = createContext();

        const result = check(subject, action, resource, context);

        expect(result.allow).toBe(true);
        expect(result.matched_role).toBe('developer');
      });
    });
  });

  describe('custom roles', () => {
    it('should allow adding a custom role', () => {
      const customRole: Role = {
        id: 'custom_test_role',
        name: 'Custom Test Role',
        permissions: [
          { id: 'custom_perm', verb: 'custom_verb', resource: 'custom_resource' }
        ]
      };

      addRole(customRole);

      const retrievedRole = getRole('custom_test_role');
      expect(retrievedRole).toBeDefined();
      expect(retrievedRole?.name).toBe('Custom Test Role');
    });

    it('should allow using a custom role for permission checks', () => {
      const customRole: Role = {
        id: 'moderator',
        name: 'Moderator',
        permissions: [
          { id: 'mod_delete', verb: 'delete', resource: 'comments' }
        ]
      };

      addRole(customRole);

      const subject = createSubject(['moderator']);
      const action = createAction('delete', 'comments');
      const resource = createResource('comments');
      const context = createContext();

      const result = check(subject, action, resource, context);

      expect(result.allow).toBe(true);
      expect(result.matched_role).toBe('moderator');
    });

    it('should reject invalid role ID format', () => {
      const invalidRole: Role = {
        id: 'invalid-role-with-dashes!',
        name: 'Invalid Role',
        permissions: []
      };

      expect(() => addRole(invalidRole)).toThrow('Invalid role ID');
    });

    it('should support role inheritance', () => {
      const baseRole: Role = {
        id: 'base_tester',
        name: 'Base Tester',
        permissions: [
          { id: 'base_perm', verb: 'read', resource: 'tests' }
        ]
      };

      const extendedRole: Role = {
        id: 'extended_tester',
        name: 'Extended Tester',
        permissions: [
          { id: 'extended_perm', verb: 'write', resource: 'tests' }
        ],
        inherits: ['base_tester']
      };

      addRole(baseRole);
      addRole(extendedRole);

      const subject = createSubject(['extended_tester']);
      const action = createAction('read', 'tests');
      const resource = createResource('tests');
      const context = createContext();

      const result = check(subject, action, resource, context);

      expect(result.allow).toBe(true);
      expect(result.matched_role).toBe('base_tester');
    });
  });

  describe('role helper functions', () => {
    describe('hasRole', () => {
      it('should return true if subject has the role', () => {
        const subject = createSubject(['developer', 'auditor']);
        expect(hasRole(subject, 'developer')).toBe(true);
      });

      it('should return false if subject does not have the role', () => {
        const subject = createSubject(['developer']);
        expect(hasRole(subject, 'org_admin')).toBe(false);
      });
    });

    describe('hasAnyRole', () => {
      it('should return true if subject has any of the roles', () => {
        const subject = createSubject(['developer']);
        expect(hasAnyRole(subject, ['org_admin', 'developer'])).toBe(true);
      });

      it('should return false if subject has none of the roles', () => {
        const subject = createSubject(['viewer']);
        expect(hasAnyRole(subject, ['org_admin', 'developer'])).toBe(false);
      });
    });

    describe('hasAllRoles', () => {
      it('should return true if subject has all of the roles', () => {
        const subject = createSubject(['developer', 'auditor']);
        expect(hasAllRoles(subject, ['developer', 'auditor'])).toBe(true);
      });

      it('should return false if subject is missing any role', () => {
        const subject = createSubject(['developer']);
        expect(hasAllRoles(subject, ['developer', 'auditor'])).toBe(false);
      });
    });
  });

  describe('getAllRoles', () => {
    it('should return all available roles', () => {
      const roles = getAllRoles();
      expect(roles.length).toBeGreaterThan(0);
      
      const roleIds = roles.map(r => r.id);
      expect(roleIds).toContain('super_admin');
      expect(roleIds).toContain('org_admin');
      expect(roleIds).toContain('developer');
      expect(roleIds).toContain('auditor');
      expect(roleIds).toContain('viewer');
    });
  });
});
