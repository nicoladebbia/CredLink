/**
 * Enterprise SSO Configuration UI
 * Admin interface for configuring SAML, OAuth, Azure AD, Google SSO
 */

import { useState, useEffect } from 'react';
import { 
  Shield, Plus, Settings, Trash2, CheckCircle, XCircle, 
  Key, Users, Activity, AlertCircle, Copy, Eye, EyeOff,
  RefreshCw, Download, Upload
} from 'lucide-react';

interface SSOProvider {
  id: string;
  name: string;
  type: 'saml' | 'oauth2' | 'google' | 'azure-ad' | 'okta' | 'onelogin';
  enabled: boolean;
  jitProvisioning: boolean;
  scimEnabled: boolean;
  enforceSso: boolean;
  sessionLifetimeHours: number;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
}

interface AuditLog {
  id: string;
  eventType: string;
  eventStatus: string;
  eventMessage: string;
  userEmail?: string;
  providerName?: string;
  createdAt: string;
}

export function SSOConfiguration() {
  const [providers, setProviders] = useState<SSOProvider[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<SSOProvider | null>(null);
  const [activeTab, setActiveTab] = useState<'providers' | 'audit' | 'sessions' | 'scim'>('providers');
  const [loading, setLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const orgId = 'default-org'; // Get from auth context

  useEffect(() => {
    loadProviders();
    loadAuditLogs();
    loadActiveSessions();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/sso/providers?orgId=${orgId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('credlink_token')}`
        }
      });
      const data = await response.json();
      setProviders(data.providers || []);
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/sso/audit-logs?orgId=${orgId}&limit=50`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('credlink_token')}`
        }
      });
      const data = await response.json();
      setAuditLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    }
  };

  const loadActiveSessions = async () => {
    try {
      const response = await fetch(`${API_URL}/admin/sso/sessions?orgId=${orgId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('credlink_token')}`
        }
      });
      const data = await response.json();
      setActiveSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const testProvider = async (providerId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/admin/sso/providers/${providerId}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('credlink_token')}`
        }
      });
      const data = await response.json();
      
      if (data.valid) {
        alert('✅ Provider configuration is valid!');
      } else {
        alert(`❌ Configuration errors:\n${data.errors.join('\n')}`);
      }
    } catch (error) {
      alert('Failed to test provider');
    } finally {
      setLoading(false);
    }
  };

  const deleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this SSO provider?')) return;

    try {
      await fetch(`${API_URL}/admin/sso/providers/${providerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('credlink_token')}`
        }
      });
      loadProviders();
    } catch (error) {
      alert('Failed to delete provider');
    }
  };

  const revokeSession = async (sessionId: string) => {
    if (!confirm('Revoke this SSO session?')) return;

    try {
      await fetch(`${API_URL}/admin/sso/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('credlink_token')}`
        }
      });
      loadActiveSessions();
    } catch (error) {
      alert('Failed to revoke session');
    }
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'saml': return '🔐';
      case 'google': return '🔵';
      case 'azure-ad': return '🔷';
      case 'okta': return '⭕';
      default: return '🔑';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'failure': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <Shield style={{ width: '32px', height: '32px', color: '#2563eb' }} />
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
            Enterprise SSO Configuration
          </h1>
        </div>
        <p style={{ color: '#64748b', fontSize: '16px' }}>
          Configure SAML 2.0, OAuth 2.0, Azure AD, and Google Workspace SSO for your organization
        </p>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '2px solid #e2e8f0', marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '32px' }}>
          {[
            { id: 'providers', label: 'SSO Providers', icon: Shield },
            { id: 'audit', label: 'Audit Logs', icon: Activity },
            { id: 'sessions', label: 'Active Sessions', icon: Users },
            { id: 'scim', label: 'SCIM Provisioning', icon: RefreshCw }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 0',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: activeTab === tab.id ? '#2563eb' : '#64748b',
                borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                marginBottom: '-2px',
                fontWeight: activeTab === tab.id ? '600' : '400',
                fontSize: '14px'
              }}
            >
              <tab.icon style={{ width: '18px', height: '18px' }} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Providers Tab */}
      {activeTab === 'providers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              Configured Providers ({providers.length})
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '10px 20px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              <Plus style={{ width: '18px', height: '18px' }} />
              Add SSO Provider
            </button>
          </div>

          {providers.length === 0 ? (
            <div style={{
              padding: '48px',
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '2px dashed #cbd5e1'
            }}>
              <Shield style={{ width: '48px', height: '48px', color: '#94a3b8', margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                No SSO Providers Configured
              </h3>
              <p style={{ color: '#64748b', marginBottom: '24px' }}>
                Add your first SSO provider to enable enterprise authentication
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  padding: '10px 20px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Get Started
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '24px' }}>
              {providers.map(provider => (
                <div
                  key={provider.id}
                  style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '24px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '32px' }}>{getProviderIcon(provider.type)}</span>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>
                          {provider.name}
                        </h3>
                        <span style={{
                          fontSize: '12px',
                          padding: '4px 8px',
                          background: '#f1f5f9',
                          borderRadius: '4px',
                          color: '#475569',
                          fontWeight: '500'
                        }}>
                          {provider.type.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: provider.enabled ? '#10b981' : '#ef4444'
                    }} />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {provider.jitProvisioning && (
                        <span style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          background: '#dbeafe',
                          color: '#1e40af',
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          JIT Provisioning
                        </span>
                      )}
                      {provider.scimEnabled && (
                        <span style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          background: '#dcfce7',
                          color: '#166534',
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          SCIM 2.0
                        </span>
                      )}
                      {provider.enforceSso && (
                        <span style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          SSO Enforced
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                    <div style={{ marginBottom: '4px' }}>
                      Session: {provider.sessionLifetimeHours}h
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      Updated: {new Date(provider.updatedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => testProvider(provider.id)}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#475569'
                      }}
                    >
                      <CheckCircle style={{ width: '14px', height: '14px' }} />
                      Test
                    </button>
                    <button
                      onClick={() => setSelectedProvider(provider)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#475569'
                      }}
                    >
                      <Settings style={{ width: '14px', height: '14px' }} />
                      Edit
                    </button>
                    <button
                      onClick={() => deleteProvider(provider.id)}
                      style={{
                        padding: '8px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#dc2626'
                      }}
                    >
                      <Trash2 style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audit Logs Tab */}
      {activeTab === 'audit' && (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '24px' }}>
            SSO Audit Logs
          </h2>
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Timestamp</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Event</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>User</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Provider</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#0f172a', fontWeight: '500' }}>
                      {log.eventType}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={getStatusColor(log.eventStatus)} style={{ fontSize: '13px', fontWeight: '500' }}>
                        {log.eventStatus}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {log.userEmail || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {log.providerName || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {log.eventMessage}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Active Sessions Tab */}
      {activeTab === 'sessions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              Active SSO Sessions ({activeSessions.length})
            </h2>
            <button
              onClick={loadActiveSessions}
              style={{
                padding: '8px 16px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: '500',
                color: '#475569'
              }}
            >
              <RefreshCw style={{ width: '14px', height: '14px' }} />
              Refresh
            </button>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>User</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Provider</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Method</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Login Time</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Expires</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#475569' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions.map(session => (
                  <tr key={session.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{session.userName}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{session.userEmail}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {session.providerName}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {session.authMethod}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {new Date(session.authTime).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>
                      {new Date(session.expiresAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => revokeSession(session.sessionId)}
                        style={{
                          padding: '6px 12px',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#dc2626'
                        }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SCIM Tab */}
      {activeTab === 'scim' && (
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
            SCIM 2.0 User Provisioning
          </h2>
          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <AlertCircle style={{ width: '20px', height: '20px', color: '#2563eb', flexShrink: 0 }} />
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af', margin: '0 0 4px 0' }}>
                  SCIM Endpoint Configuration
                </h3>
                <p style={{ fontSize: '13px', color: '#1e40af', margin: 0 }}>
                  Configure your IdP to use: <code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: '4px' }}>
                    {API_URL}/scim/v2
                  </code>
                </p>
              </div>
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>
              Provisioned Users
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              Users automatically provisioned via SCIM will appear here. Configure SCIM in your SSO provider settings.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
