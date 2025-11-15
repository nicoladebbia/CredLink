# @credlink/rbac

Enterprise Role-Based Access Control (RBAC) system for the CredLink platform.

## Features

- **Comprehensive Role System**: Built-in roles with hierarchical permissions
- **Fine-grained Permissions**: Control access at the action + resource level
- **Wildcard Support**: Use `*` for verb or resource to match all
- **Role Inheritance**: Roles can inherit permissions from other roles
- **Organization Isolation**: Ensures users can only access resources within their organization
- **Type-safe**: Full TypeScript support with comprehensive types

## Installation

```bash
pnpm add @credlink/rbac
```

## Built-in Roles

- **super_admin**: Full system access
- **org_admin**: Full organization access
- **org_manager**: Manage organization resources
- **developer**: API access for signing and verification
- **auditor**: Read-only access to audit logs and compliance
- **viewer**: Read-only access to verification
- **service_account**: Automated service access

## Usage

### Basic Permission Check

```typescript
import { check, Subject, Action, Resource, Context } from '@credlink/rbac';

const subject: Subject = {
  user_id: 'user_123',
  org_id: 'org_456',
  roles: ['developer']
};

const action: Action = {
  verb: 'execute',
  resource: 'sign'
};

const resource: Resource = {
  type: 'sign',
  org_id: 'org_456'
};

const context: Context = {
  timestamp: new Date(),
  request_id: 'req_789'
};

const result = check(subject, action, resource, context);

if (result.allow) {
  console.log('Permission granted:', result.reason);
} else {
  console.log('Permission denied:', result.reason);
}
```

### Custom Roles

```typescript
import { addRole, Role } from '@credlink/rbac';

const customRole: Role = {
  id: 'content_moderator',
  name: 'Content Moderator',
  description: 'Can moderate content and verify signatures',
  permissions: [
    { id: 'mod_verify', verb: 'execute', resource: 'verify' },
    { id: 'mod_audit', verb: 'read', resource: 'audit' }
  ]
};

addRole(customRole);
```

### Role Inheritance

```typescript
const seniorDeveloper: Role = {
  id: 'senior_developer',
  name: 'Senior Developer',
  description: 'Developer with additional permissions',
  permissions: [
    { id: 'senior_dev_keys', verb: 'create', resource: 'keys' }
  ],
  inherits: ['developer'] // Inherits all developer permissions
};

addRole(seniorDeveloper);
```

### Helper Functions

```typescript
import { hasRole, hasAnyRole, hasAllRoles } from '@credlink/rbac';

// Check if subject has a specific role
if (hasRole(subject, 'org_admin')) {
  console.log('User is an admin');
}

// Check if subject has any of the specified roles
if (hasAnyRole(subject, ['org_admin', 'org_manager'])) {
  console.log('User has management access');
}

// Check if subject has all of the specified roles
if (hasAllRoles(subject, ['developer', 'auditor'])) {
  console.log('User has both developer and auditor roles');
}
```

## Permission Model

Permissions are defined with:
- **verb**: The action being performed (e.g., `create`, `read`, `update`, `delete`, `execute`)
- **resource**: The resource type being accessed (e.g., `keys`, `policies`, `sign`, `verify`)

Special wildcard `*` can be used for either verb or resource to match all.

## Security Features

- Input validation to prevent injection attacks
- Organization isolation to prevent cross-organization access
- Role ID validation (alphanumeric and underscores only)
- Comprehensive audit trail support via context

## API Reference

### Types

- `Subject`: Entity performing the action
- `Action`: Operation being performed
- `Resource`: Target of the action
- `Context`: Additional context for authorization
- `CheckResult`: Result of permission check
- `Role`: Role definition
- `Permission`: Permission definition

### Functions

- `check(subject, action, resource, context)`: Check if action is allowed
- `addRole(role)`: Add a custom role
- `getRole(roleId)`: Get role by ID
- `getAllRoles()`: Get all available roles
- `hasRole(subject, roleId)`: Check if subject has a role
- `hasAnyRole(subject, roleIds)`: Check if subject has any of the roles
- `hasAllRoles(subject, roleIds)`: Check if subject has all of the roles

## License

MIT
