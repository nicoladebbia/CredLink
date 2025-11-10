/**
 * SCIM Core Package - RFC 7643/7644 Schema Implementation
 * Implements SCIM 2.0 for user provisioning (create/disable only)
 */

export interface SCIMResource {
  schemas: string[];
  id: string;
  externalId?: string;
  meta?: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
    version?: string;
  };
}

export interface SCIMUser extends SCIMResource {
  userName: string;
  name?: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
    middleName?: string;
    honorificPrefix?: string;
    honorificSuffix?: string;
  };
  displayName?: string;
  nickName?: string;
  profileUrl?: string;
  title?: string;
  userType?: string;
  preferredLanguage?: string;
  locale?: string;
  timezone?: string;
  active?: boolean;
  password?: string;
  emails?: SCIMEmail[];
  phoneNumbers?: SCIMPhoneNumber[];
  ims?: SCIMIm[];
  photos?: SCIMPhoto[];
  addresses?: SCIMAddress[];
  groups?: SCIMReference[];
  entitlements?: SCIMReference[];
  roles?: SCIMReference[];
  x509Certificates?: SCIMX509Certificate[];
}

export interface SCIMEmail {
  value: string;
  type?: 'work' | 'home' | 'other';
  primary?: boolean;
  display?: string;
}

export interface SCIMPhoneNumber {
  value: string;
  type?: 'work' | 'home' | 'mobile' | 'fax' | 'pager' | 'other';
  primary?: boolean;
}

export interface SCIMIm {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface SCIMPhoto {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface SCIMAddress {
  formatted?: string;
  streetAddress?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  type?: 'work' | 'home' | 'other';
}

export interface SCIMReference {
  value: string;
  display?: string;
  type?: string;
  primary?: boolean;
}

export interface SCIMX509Certificate {
  value: string;
  primary?: boolean;
}

export interface SCIMGroup extends SCIMResource {
  displayName: string;
  members?: SCIMReference[];
}

export interface SCIMServiceProviderConfig {
  schemas: string[];
  patch: {
    supported: boolean;
  };
  bulk: {
    supported: boolean;
    maxOperations: number;
    maxPayloadSize: number;
  };
  filter: {
    supported: boolean;
    maxResults: number;
  };
  changePassword: {
    supported: boolean;
  };
  sort: {
    supported: boolean;
  };
  etag: {
    supported: boolean;
  };
  authenticationSchemes?: SCIMAuthenticationScheme[];
}

export interface SCIMAuthenticationScheme {
  type: string;
  name: string;
  description: string;
}

export interface SCIMListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface SCIMError {
  schemas: string[];
  detail: string;
  status: number;
  scimType?: string;
}

/**
 * SCIM Operations Handler
 */
export class SCIMHandler {
  private users: Map<string, SCIMUser> = new Map();
  private groups: Map<string, SCIMGroup> = new Map();

  /**
   * Create a new user
   */
  async createUser(user: Omit<SCIMUser, 'id' | 'meta' | 'schemas'>): Promise<SCIMUser> {
    const id = `user_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    
    const scimUser: SCIMUser = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id,
      meta: {
        resourceType: 'User',
        created: now,
        lastModified: now,
        location: `/scim/v2/Users/${id}`
      },
      ...user
    };

    this.users.set(id, scimUser);
    return scimUser;
  }

  /**
   * Get user by ID
   */
  async getUser(id: string): Promise<SCIMUser | null> {
    return this.users.get(id) || null;
  }

  /**
   * Update user (replace entire user)
   */
  async updateUser(id: string, user: Partial<SCIMUser>): Promise<SCIMUser | null> {
    const existing = this.users.get(id);
    if (!existing) {
      return null;
    }

    const updated: SCIMUser = {
      ...existing,
      ...user,
      meta: {
        ...existing.meta,
        resourceType: existing.meta?.resourceType || 'User',
        created: existing.meta?.created || new Date().toISOString(),
        lastModified: new Date().toISOString(),
        location: existing.meta?.location || `/scim/v2/Users/${id}`
      }
    };

    this.users.set(id, updated);
    return updated;
  }

  /**
   * Patch user (partial update - for deprovision)
   */
  async patchUser(id: string, operations: SCIMPatchOperation[]): Promise<SCIMUser | null> {
    const existing = this.users.get(id);
    if (!existing) {
      return null;
    }

    let updated = { ...existing };

    for (const op of operations) {
      switch (op.op) {
        case 'replace':
          if (op.path === 'active') {
            updated.active = op.value;
          }
          break;
        case 'add':
          // Handle add operations
          break;
        case 'remove':
          // Handle remove operations
          break;
      }
    }

    updated.meta!.lastModified = new Date().toISOString();
    this.users.set(id, updated);
    return updated;
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  /**
   * List users with filtering
   */
  async listUsers(filter?: string, startIndex = 1, count = 50): Promise<SCIMListResponse<SCIMUser>> {
    let users = Array.from(this.users.values());

    // Simple filter implementation (would be more sophisticated in production)
    if (filter) {
      if (filter.includes('userName eq')) {
        const match = filter.match(/userName eq "([^"]+)"/);
        if (match) {
          const userName = match[1];
          users = users.filter(u => u.userName === userName);
        }
      }
    }

    const totalResults = users.length;
    const start = Math.max(1, startIndex) - 1;
    const end = start + Math.min(count, users.length - start);
    const paginatedUsers = users.slice(start, end);

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults,
      startIndex: startIndex,
      itemsPerPage: paginatedUsers.length,
      Resources: paginatedUsers
    };
  }

  /**
   * Get service provider configuration
   */
  async getServiceProviderConfig(): Promise<SCIMServiceProviderConfig> {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: {
        supported: true
      },
      bulk: {
        supported: false,
        maxOperations: 0,
        maxPayloadSize: 0
      },
      filter: {
        supported: true,
        maxResults: 50
      },
      changePassword: {
        supported: false
      },
      sort: {
        supported: false
      },
      etag: {
        supported: false
      },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description: 'Authentication using a Bearer Token'
        }
      ]
    };
  }

  /**
   * Get resource types
   */
  async getResourceTypes(): Promise<SCIMListResponse<any>> {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: '/Users',
          description: 'User Account',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User'
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'Group',
          name: 'Group',
          endpoint: '/Groups',
          description: 'Group',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:Group'
        }
      ]
    };
  }

  /**
   * Get schemas
   */
  async getSchemas(): Promise<SCIMListResponse<any>> {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      startIndex: 1,
      itemsPerPage: 2,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          id: 'urn:ietf:params:scim:schemas:core:2.0:User',
          name: 'User',
          description: 'User Schema'
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
          name: 'Group',
          description: 'Group Schema'
        }
      ]
    };
  }
}

export interface SCIMPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: any;
}

/**
 * SCIM Validation
 */
export class SCIMValidator {
  static validateUser(user: any): string[] {
    const errors: string[] = [];

    if (!user.userName) {
      errors.push('userName is required');
    }

    if (user.emails) {
      if (!Array.isArray(user.emails)) {
        errors.push('emails must be an array');
      } else {
        user.emails.forEach((email: any, index: number) => {
          if (!email.value) {
            errors.push(`emails[${index}].value is required`);
          }
        });
      }
    }

    return errors;
  }

  static validatePatchOperation(op: any): string[] {
    const errors: string[] = [];

    if (!['add', 'remove', 'replace'].includes(op.op)) {
      errors.push('Invalid operation: must be add, remove, or replace');
    }

    if (op.op === 'replace' && !op.path) {
      errors.push('replace operation requires path');
    }

    if (op.op === 'replace' && op.value === undefined) {
      errors.push('replace operation requires value');
    }

    return errors;
  }
}

// Export singleton instance
export const scimHandler = new SCIMHandler();
