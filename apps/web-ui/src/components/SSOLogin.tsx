/**
 * SSO Login Component
 * Displays available SSO providers and initiates authentication
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, ArrowRight, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface SSOProvider {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
}

export function SSOLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [providers, setProviders] = useState<SSOProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const orgId = searchParams.get('org') || 'default-org';
  const returnUrl = searchParams.get('return') || '/dashboard';
  const errorParam = searchParams.get('error');
  const token = searchParams.get('token');

  useEffect(() => {
    // Check for authentication errors
    if (errorParam) {
      setError(getErrorMessage(errorParam));
    }

    // Check for successful authentication
    if (token) {
      localStorage.setItem('credlink_token', token);
      setSuccess('Authentication successful! Redirecting...');
      setTimeout(() => navigate(returnUrl), 1500);
      return;
    }

    loadProviders();
  }, [errorParam, token]);

  const loadProviders = async () => {
    try {
      const response = await fetch(`${API_URL}/auth/sso/providers/${orgId}`);
      const data = await response.json();
      setProviders(data.providers || []);
    } catch (error) {
      console.error('Failed to load SSO providers:', error);
      setError('Failed to load SSO providers');
    }
  };

  const initiateSSO = async (providerName: string) => {
    setLoading(true);
    setSelectedProvider(providerName);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/sso/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          providerName,
          returnUrl
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate SSO');
      }

      // Redirect to SSO provider
      window.location.href = `${API_URL}${data.redirectUrl}`;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setSelectedProvider(null);
    }
  };

  const getErrorMessage = (errorCode: string): string => {
    const messages: Record<string, string> = {
      'saml_failed': 'SAML authentication failed. Please try again.',
      'saml_callback_failed': 'SAML callback failed. Please contact your administrator.',
      'oauth_failed': 'OAuth authentication failed. Please try again.',
      'oauth_callback_failed': 'OAuth callback failed. Please contact your administrator.',
      'google_failed': 'Google authentication failed. Please try again.',
      'google_callback_failed': 'Google callback failed. Please contact your administrator.',
      'azure_failed': 'Azure AD authentication failed. Please try again.',
      'azure_callback_failed': 'Azure AD callback failed. Please contact your administrator.',
      'authentication_failed': 'Authentication failed. Please try again or contact support.'
    };
    return messages[errorCode] || 'An unknown error occurred';
  };

  const getProviderIcon = (type: string): string => {
    const icons: Record<string, string> = {
      'saml': '🔐',
      'google': '🔵',
      'azure-ad': '🔷',
      'okta': '⭕',
      'onelogin': '🔑',
      'oauth2': '🔓'
    };
    return icons[type] || '🔑';
  };

  const getProviderColor = (type: string): string => {
    const colors: Record<string, string> = {
      'google': '#4285f4',
      'azure-ad': '#0078d4',
      'okta': '#007dc1',
      'saml': '#2563eb',
      'oauth2': '#6366f1'
    };
    return colors[type] || '#2563eb';
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      padding: '24px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        maxWidth: '480px',
        width: '100%',
        padding: '48px'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <Shield style={{ width: '32px', height: '32px', color: 'white' }} />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
            Enterprise Sign In
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px' }}>
            Sign in with your organization's SSO provider
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div style={{
            padding: '16px',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <CheckCircle style={{ width: '20px', height: '20px', color: '#16a34a', flexShrink: 0 }} />
            <span style={{ color: '#166534', fontSize: '14px', fontWeight: '500' }}>{success}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div style={{
            padding: '16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <AlertCircle style={{ width: '20px', height: '20px', color: '#dc2626', flexShrink: 0 }} />
            <span style={{ color: '#991b1b', fontSize: '14px' }}>{error}</span>
          </div>
        )}

        {/* SSO Providers */}
        {providers.length === 0 && !loading && !success ? (
          <div style={{
            padding: '32px',
            textAlign: 'center',
            background: '#f8fafc',
            borderRadius: '8px',
            border: '2px dashed #cbd5e1'
          }}>
            <AlertCircle style={{ width: '32px', height: '32px', color: '#94a3b8', margin: '0 auto 12px' }} />
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>
              No SSO providers configured for this organization
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                padding: '10px 20px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px'
              }}
            >
              Use Standard Login
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {providers.map(provider => (
              <button
                key={provider.id}
                onClick={() => initiateSSO(provider.name)}
                disabled={loading}
                style={{
                  padding: '16px 20px',
                  background: loading && selectedProvider === provider.name ? '#f1f5f9' : 'white',
                  border: `2px solid ${getProviderColor(provider.type)}`,
                  borderRadius: '12px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  transition: 'all 0.2s',
                  opacity: loading && selectedProvider !== provider.name ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ fontSize: '32px' }}>{getProviderIcon(provider.type)}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '2px' }}>
                    {provider.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Sign in with {provider.type.toUpperCase()}
                  </div>
                </div>
                {loading && selectedProvider === provider.name ? (
                  <Loader2 style={{ width: '20px', height: '20px', color: getProviderColor(provider.type), animation: 'spin 1s linear infinite' }} />
                ) : (
                  <ArrowRight style={{ width: '20px', height: '20px', color: getProviderColor(provider.type) }} />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Divider */}
        {providers.length > 0 && (
          <div style={{ margin: '32px 0', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
          </div>
        )}

        {/* Standard Login Link */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563eb',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Use email and password instead
          </button>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>
            Protected by enterprise-grade security
          </p>
        </div>
      </div>
    </div>
  );
}
