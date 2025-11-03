/**
 * Admin UI - Enterprise Controls Management
 * Utilitarian interface for SSO, policies, audit, and flags
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/cloudflare-workers';
import { check, Subject } from '@c2/rbac';

const app = new Hono();

// Mock authentication
async function authenticateAdmin(c: any): Promise<Subject | null> {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  if (token === 'mock-admin-token') {
    return {
      user_id: 'admin_123',
      org_id: 'org_123',
      roles: ['org_admin'],
      ip_address: c.req.header('CF-Connecting-IP')
    };
  }

  return null;
}

/**
 * HTML Templates
 */

function layout(title: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - C2 Concierge Admin</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      .status-badge { @apply px-2 py-1 text-xs rounded-full; }
      .status-green { @apply bg-green-100 text-green-800; }
      .status-amber { @apply bg-amber-100 text-amber-800; }
      .status-red { @apply bg-red-100 text-red-800; }
    </style>
</head>
<body class="bg-gray-50">
    <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <div class="flex items-center">
                    <h1 class="text-xl font-semibold text-gray-900">C2 Concierge Admin</h1>
                </div>
                <div class="flex items-center space-x-4">
                    <a href="/admin" class="text-gray-600 hover:text-gray-900">Dashboard</a>
                    <a href="/admin/sso" class="text-gray-600 hover:text-gray-900">SSO</a>
                    <a href="/admin/policies" class="text-gray-600 hover:text-gray-900">Policies</a>
                    <a href="/admin/audit" class="text-gray-600 hover:text-gray-900">Audit</a>
                    <a href="/admin/flags" class="text-gray-600 hover:text-gray-900">Flags</a>
                </div>
            </div>
        </div>
    </nav>
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        ${content}
    </main>
</body>
</html>`;
}

function dashboardPage(): string {
  return layout('Dashboard', `
    <div class="px-4 py-6 sm:px-0">
        <div class="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Enterprise Controls Dashboard</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-sm font-medium text-gray-500">SSO Status</h3>
                    <div class="mt-2 flex items-center">
                        <span class="status-badge status-green">Active</span>
                        <span class="ml-2 text-sm text-gray-600">OIDC</span>
                    </div>
                </div>
                
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-sm font-medium text-gray-500">SCIM Sync</h3>
                    <div class="mt-2 flex items-center">
                        <span class="status-badge status-green">Enabled</span>
                        <span class="ml-2 text-sm text-gray-600">Last: 2m ago</span>
                    </div>
                </div>
                
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-sm font-medium text-gray-500">Audit Log</h3>
                    <div class="mt-2 flex items-center">
                        <span class="status-badge status-green">Healthy</span>
                        <span class="ml-2 text-sm text-gray-600">1,247 records</span>
                    </div>
                </div>
                
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-sm font-medium text-gray-500">API Keys</h3>
                    <div class="mt-2 flex items-center">
                        <span class="status-badge status-amber">3 Active</span>
                        <span class="ml-2 text-sm text-gray-600">2 expiring</span>
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
                    <div class="space-y-3">
                        <div class="flex items-center text-sm">
                            <span class="text-gray-500">10:45 AM</span>
                            <span class="ml-4">User login via OIDC</span>
                            <span class="ml-auto text-green-600">✓</span>
                        </div>
                        <div class="flex items-center text-sm">
                            <span class="text-gray-500">10:32 AM</span>
                            <span class="ml-4">API key created</span>
                            <span class="ml-auto text-amber-600">!</span>
                        </div>
                        <div class="flex items-center text-sm">
                            <span class="text-gray-500">10:15 AM</span>
                            <span class="ml-4">Policy updated</span>
                            <span class="ml-auto text-blue-600">i</span>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Security Alerts</h3>
                    <div class="space-y-3">
                        <div class="p-3 bg-amber-50 border border-amber-200 rounded">
                            <p class="text-sm text-amber-800">2 API keys expire in 7 days</p>
                        </div>
                        <div class="p-3 bg-blue-50 border border-blue-200 rounded">
                            <p class="text-sm text-blue-800">New beta feature available: HSM Key Custody</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  `);
}

function ssoPage(): string {
  return layout('SSO Configuration', `
    <div class="px-4 py-6 sm:px-0">
        <div class="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">SSO Configuration</h2>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">OIDC Configuration</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Status</label>
                            <div class="mt-1">
                                <span class="status-badge status-green">Configured</span>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Issuer</label>
                            <input type="text" value="https://login.microsoftonline.com/tenant/v2.0" 
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" readonly>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Client ID</label>
                            <input type="text" value="********-****-****-****-************" 
                                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" readonly>
                        </div>
                        <button class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">
                            Reconfigure OIDC
                        </button>
                    </div>
                </div>
                
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">SAML Configuration</h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Status</label>
                            <div class="mt-1">
                                <span class="status-badge status-amber">Not Configured</span>
                            </div>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">SP Metadata</label>
                            <textarea class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" rows="4" 
                                      placeholder="Paste IdP metadata XML here..."></textarea>
                        </div>
                        <button class="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700">
                            Configure SAML
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="mt-6 bg-white p-6 rounded-lg shadow">
                <h3 class="text-lg font-medium text-gray-900 mb-4">Role Mapping</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Admin Group</label>
                        <input type="text" value="c2-admins" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Integrator Group</label>
                        <input type="text" value="c2-integrators" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Auditor Group</label>
                        <input type="text" value="c2-auditors" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                </div>
            </div>
        </div>
    </div>
  `);
}

function policiesPage(): string {
  return layout('Policies', `
    <div class="px-4 py-6 sm:px-0">
        <div class="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Organization Policies</h2>
            
            <div class="bg-white shadow rounded-lg">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approver</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">keys.generate</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Max 10 keys</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">org_admin</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="status-badge status-green">Active</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button class="text-blue-600 hover:text-blue-900">Edit</button>
                            </td>
                        </tr>
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">keys.rotate</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Business hours only</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">org_admin</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="status-badge status-green">Active</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button class="text-blue-600 hover:text-blue-900">Edit</button>
                            </td>
                        </tr>
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">sign.assets</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Approved origins</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="status-badge status-green">Active</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button class="text-blue-600 hover:text-blue-900">Edit</button>
                            </td>
                        </tr>
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">anchor.enable</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Requires approval</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">org_admin</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="status-badge status-amber">Disabled</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button class="text-amber-600 hover:text-amber-900">Enable</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div class="mt-6 flex justify-between">
                <button class="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">
                    Export Policies (CSV)
                </button>
                <button class="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">
                    Add New Policy
                </button>
            </div>
        </div>
    </div>
  `);
}

function auditPage(): string {
  return layout('Audit Log', `
    <div class="px-4 py-6 sm:px-0">
        <div class="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Audit Log</h2>
            
            <div class="bg-white p-4 rounded-lg shadow mb-6">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700">From Date</label>
                        <input type="date" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">To Date</label>
                        <input type="date" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">Action</label>
                        <select class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                            <option>All Actions</option>
                            <option>user.login</option>
                            <option>keys.generate</option>
                            <option>sign.assets</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700">User</label>
                        <input type="text" placeholder="User ID or email" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                    </div>
                </div>
                <div class="mt-4 flex space-x-4">
                    <button class="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700">
                        Filter
                    </button>
                    <button class="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700">
                        Export CSV
                    </button>
                    <button class="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700">
                        Verify Integrity
                    </button>
                </div>
            </div>
            
            <div class="bg-white shadow rounded-lg">
                <div class="px-6 py-4 border-b border-gray-200">
                    <p class="text-sm text-gray-700">
                        Showing <span class="font-medium">1</span> to <span class="font-medium">50</span> of 
                        <span class="font-medium">1,247</span> results
                    </p>
                </div>
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hash</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">2025-11-02 10:45:32Z</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">admin@company.com</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">user.login</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">session</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">203.0.113.10</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">a1b2c3...</td>
                        </tr>
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">2025-11-02 10:32:15Z</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">system</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">keys.create</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">api_key_456</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">203.0.113.10</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">d4e5f6...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  `);
}

function flagsPage(): string {
  return layout('Feature Flags', `
    <div class="px-4 py-6 sm:px-0">
        <div class="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <h2 class="text-2xl font-bold text-gray-900 mb-6">Feature Flags</h2>
            
            <div class="bg-white shadow rounded-lg">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flag</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Environments</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div>
                                    <div class="text-sm font-medium text-gray-900">Key Custody HSM</div>
                                    <div class="text-sm text-gray-500">beta-key-custody-hsm</div>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500">Hardware Security Module support for key custody</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="status-badge status-amber">Beta</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">dev, staging</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">org_admin</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button class="text-blue-600 hover:text-blue-900">Configure</button>
                            </td>
                        </tr>
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div>
                                    <div class="text-sm font-medium text-gray-900">TSA Anchoring</div>
                                    <div class="text-sm text-gray-500">beta-tsa-anchoring</div>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500">RFC3161 Time Stamp Authority anchoring</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="status-badge status-amber">Beta</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">dev, staging</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">org_admin</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button class="text-blue-600 hover:text-blue-900">Configure</button>
                            </td>
                        </tr>
                        <tr class="bg-blue-50">
                            <td class="px-6 py-4 whitespace-nowrap">
                                <div>
                                    <div class="text-sm font-medium text-gray-900">Enhanced Audit</div>
                                    <div class="text-sm text-gray-500">pilot-org-enhanced-audit</div>
                                </div>
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500">Enhanced audit logging with detailed chain of custody</td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                <span class="status-badge status-green">Pilot</span>
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">all</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">org_admin</td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <button class="text-green-600 hover:text-green-900">Manage</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 class="text-sm font-medium text-blue-800 mb-2">Beta Feature Program</h3>
                <p class="text-sm text-blue-700">
                    Beta features are available in development and staging environments. 
                    Contact your account manager to enable beta features in production.
                </p>
            </div>
        </div>
    </div>
  `);
}

/**
 * Routes
 */

// Authentication middleware
app.use('/admin/*', async (c, next) => {
  const subject = await authenticateAdmin(c);
  if (!subject) {
    return c.redirect('/login');
  }
  await next();
});

// Dashboard
app.get('/admin', (c) => {
  return c.html(dashboardPage());
});

// SSO Configuration
app.get('/admin/sso', (c) => {
  return c.html(ssoPage());
});

// Policies
app.get('/admin/policies', (c) => {
  return c.html(policiesPage());
});

// Audit Log
app.get('/admin/audit', (c) => {
  return c.html(auditPage());
});

// Feature Flags
app.get('/admin/flags', (c) => {
  return c.html(flagsPage());
});

export default app;
