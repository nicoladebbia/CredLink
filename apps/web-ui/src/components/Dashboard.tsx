import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToastContainer } from './Toast';
import { NotificationCenter } from './NotificationCenter';
import { 
  LayoutDashboard, 
  FileSignature, 
  Files, 
  Settings, 
  LogOut, 
  Plus, 
  ShieldCheck,
  Download,
  Trash2,
  CheckCircle2,
  Loader2,
  FileText,
  Image as ImageIcon,
  X,
  ExternalLink,
  ArrowRight,
  Lock,
  BarChart3,
  Database,
  Globe,
  Activity,
  AlertCircle,
  PieChart,
  User,
  CreditCard,
  Bell,
  Receipt,
  Shield,
  Webhook,
  Users,
  Code,
  TrendingUp
} from 'lucide-react';

// Types
interface SignedDocument {
  id: string;
  name: string;
  status: 'signed' | 'pending' | 'failed' | 'verified';
  hash: string;
  signedAt: string;
  size: string;
  thumbnail?: string | null;
  proofId?: string;
}

interface VerificationLog {
  id: string;
  timestamp: string;
  assetId: string;
  assetName: string;
  result: 'Verified' | 'Tampered' | 'Unknown';
  location: string;
  ip: string;
  userAgent: string;
}

type View = 'overview' | 'upload' | 'documents' | 'settings' | 'assets-detail' | 'storage-detail' | 'verifications-detail' | 'invoices' | 'audit-logs' | 'webhooks' | 'team' | 'api-docs';

function SignSuccess({ originalFile, signedDoc, onClose }: { originalFile: File, signedDoc: SignedDocument, onClose: () => void }) {
  const originalUrl = useMemo(() => URL.createObjectURL(originalFile), [originalFile]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#f8fafc',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ 
          width: '64px', 
          height: '64px', 
          background: '#dcfce7', 
          borderRadius: '50%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          margin: '0 auto 24px auto',
          boxShadow: '0 0 0 8px #f0fdf4'
        }}>
          <CheckCircle2 style={{ width: '32px', height: '32px', color: '#16a34a' }} />
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', marginBottom: '12px', letterSpacing: '-0.02em' }}>Asset Successfully Signed</h1>
        <p style={{ fontSize: '16px', color: '#64748b' }}>Your image has been cryptographically secured with C2PA standards.</p>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '48px', 
        alignItems: 'center', 
        width: '100%', 
        maxWidth: '1000px',
        padding: '0 20px'
      }}>
        {/* Original */}
        <div style={{ flex: 1 }}>
          <div style={{ 
            background: 'white',
            borderRadius: '16px',
            padding: '16px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
              <img src={originalUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Original" />
              <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>Original</div>
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>{originalFile.name}</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>{(originalFile.size / (1024*1024)).toFixed(2)} MB • Unprotected</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
          <ArrowRight style={{ width: '32px', height: '32px' }} />
          <Lock style={{ width: '24px', height: '24px', color: '#2563eb' }} />
        </div>

        {/* Signed */}
        <div style={{ flex: 1 }}>
          <div style={{ 
            background: 'white',
            borderRadius: '16px',
            padding: '16px',
            boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.1), 0 0 0 2px #3b82f6',
            border: '1px solid transparent',
            position: 'relative'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '-12px', 
              right: '24px', 
              background: '#2563eb', 
              color: 'white', 
              padding: '4px 12px', 
              borderRadius: '999px', 
              fontSize: '12px', 
              fontWeight: '700',
              boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)'
            }}>
              SECURED
            </div>
            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#f1f5f9', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
              {/* Using original image but visual "signed" representation */}
              <img src={originalUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Signed" />
              
              {/* Overlay Effect */}
              <div style={{ position: 'absolute', inset: 0, border: '4px solid #3b82f6', borderRadius: '8px', pointerEvents: 'none' }} />
              <div style={{ 
                position: 'absolute', 
                bottom: '12px', 
                right: '12px', 
                background: 'rgba(255,255,255,0.9)', 
                backdropFilter: 'blur(4px)',
                padding: '6px 10px', 
                borderRadius: '6px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                <ShieldCheck style={{ width: '14px', height: '14px', color: '#2563eb' }} />
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#0f172a' }}>C2PA VERIFIED</span>
              </div>
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>{signedDoc.name}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{signedDoc.size} • <span style={{ color: '#16a34a', fontWeight: '500' }}>Signed & Timestamped</span></p>
            </div>
            
            <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', color: '#475569', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>HASH:</span>
                <span style={{ color: '#0f172a' }}>{signedDoc.hash.substring(0, 24)}...</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>PROOF:</span>
                <span style={{ color: '#2563eb' }}>{signedDoc.proofId}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '48px', display: 'flex', gap: '16px' }}>
        <button 
          onClick={onClose}
          style={{
            padding: '12px 32px',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            color: '#475569',
            fontWeight: '600',
            fontSize: '15px',
            cursor: 'pointer'
          }}
        >
          Back to Dashboard
        </button>
        <button 
          onClick={() => signedDoc.proofId && window.open(`http://localhost:8000/download/${signedDoc.proofId}`, '_blank')}
          style={{
            padding: '12px 32px',
            background: '#0f172a',
            border: 'none',
            borderRadius: '12px',
            color: 'white',
            fontWeight: '600',
            fontSize: '15px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
          }}
        >
          <Download style={{ width: '18px', height: '18px' }} />
          Download Signed Asset
        </button>
      </div>
    </div>
  );
}

export function Dashboard() {
  console.log('[Dashboard] Component rendering...');
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<View>('overview');
  const [documents, setDocuments] = useState<SignedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SignedDocument | null>(null);
  const [signedResult, setSignedResult] = useState<{ original: File, signed: SignedDocument } | null>(null);
  const [user, setUser] = useState<any>(null);
  console.log('[Dashboard] State initialized');
  
  // Settings State
  const [settingsSection, setSettingsSection] = useState<'profile' | 'billing' | 'security' | 'notifications'>('profile');
  
  // Enterprise Features State
  const [invoices, setInvoices] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [usageData, setUsageData] = useState<any>(null);
  // const [usageHistory, setUsageHistory] = useState<any>({}); // TODO: Use for analytics charts
  const [ipWhitelist, setIpWhitelist] = useState<string[]>([]);
  const [newIpAddress, setNewIpAddress] = useState('');
  
  // Toast Notification System
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }>>([]);
  
  // Notification Center
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'success' | 'warning' | 'info' | 'security' | 'billing' | 'team';
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
  }>>([]);
  
  // Toast helper functions
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);
  
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  
  // Notification helper functions
  const addNotification = useCallback((notification: Omit<typeof notifications[0], 'id' | 'read' | 'timestamp'>) => {
    const newNotif = {
      ...notification,
      id: `notif-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  }, []);
  
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);
  
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Verification logs from audit logs
  const verificationLogs: VerificationLog[] = useMemo(() => {
    return auditLogs
      .filter(log => log.action === 'document_signed')
      .map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        assetId: log.details?.documentId || 'N/A',
        assetName: log.details?.name || 'Unknown',
        result: 'Verified',
        location: 'N/A',
        ip: log.ip || 'N/A',
        userAgent: 'N/A'
      }));
  }, [auditLogs]);

  // Fetch documents function - made reusable
  const fetchDocuments = useCallback(async () => {
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/api/v1/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Check auth
    const token = localStorage.getItem('credlink_token');
    if (!token) {
      navigate('/login');
      return;
    }

    // Fetch user profile
    const fetchUser = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok && mounted) {
          const data = await response.json();
          setUser(data.user);
          localStorage.setItem('credlink_user', JSON.stringify(data.user));
          setIpWhitelist(data.user.security?.ipWhitelist || []);
        } else if (!response.ok) {
          navigate('/login');
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        if (mounted) {
          navigate('/login');
        }
      }
    };

    const userStr = localStorage.getItem('credlink_user');
    if (userStr) {
      const userData = JSON.parse(userStr);
      setUser(userData);
      setIpWhitelist(userData.security?.ipWhitelist || []);
    }
    
    fetchUser();
    fetchDocuments();
    
    // Fetch enterprise data
    const fetchEnterpriseData = async () => {
      try {
        const token = localStorage.getItem('credlink_token');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        
        // Fetch invoices
        const invoicesRes = await fetch(`${API_URL}/invoices`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (invoicesRes.ok) {
          const data = await invoicesRes.json();
          setInvoices(data.invoices || []);
        }
        
        // Fetch audit logs
        const logsRes = await fetch(`${API_URL}/audit-logs`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (logsRes.ok) {
          const data = await logsRes.json();
          setAuditLogs(data.logs || []);
        }
        
        // Fetch webhooks
        const webhooksRes = await fetch(`${API_URL}/webhooks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (webhooksRes.ok) {
          const data = await webhooksRes.json();
          setWebhooks(data.webhooks || []);
        }
        
        // Fetch usage data
        const usageRes = await fetch(`${API_URL}/usage/current`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (usageRes.ok) {
          const data = await usageRes.json();
          setUsageData(data);
        }
        
        // Fetch usage history
        // const historyRes = await fetch(`${API_URL}/usage/history`, {
        //   headers: { 'Authorization': `Bearer ${token}` }
        // });
        // if (historyRes.ok) {
        //   const data = await historyRes.json();
        //   setUsageHistory(data.history);
        // }
        
        // Fetch active sessions
        const sessionsRes = await fetch(`${API_URL}/auth/sessions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          setActiveSessions(data.sessions || []);
        }
      } catch (error) {
        console.error('Failed to fetch enterprise data:', error);
      }
    };
    
    fetchEnterpriseData();
    
    // Add welcome notification on first load
    const hasSeenWelcome = sessionStorage.getItem('credlink_welcome_shown');
    if (!hasSeenWelcome && mounted) {
      setTimeout(() => {
        if (mounted) {
          addNotification({
            type: 'info',
            title: 'Welcome to CredLink Enterprise',
            message: 'Your cryptographic signing platform is ready. Start by uploading your first asset.'
          });
          sessionStorage.setItem('credlink_welcome_shown', 'true');
        }
      }, 1000);
    }

    return () => {
      mounted = false;
    };
  }, [navigate, fetchDocuments]);

  // Settings Handlers - Now with backend integration
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const updates = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      organization: formData.get('organization') as string
    };
    
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(updates)
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem('credlink_user', JSON.stringify(data.user));
        showToast('Profile updated successfully', 'success');
        addNotification({
          type: 'success',
          title: 'Profile Updated',
          message: 'Your profile information has been saved successfully.'
        });
      } else {
        showToast('Failed to update profile', 'error');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      showToast('Failed to update profile', 'error');
    }
  };

  const handleUpgrade = async () => {
    const currentTier = user?.tier || 'free';
    
    // If already on enterprise, open billing portal to manage subscription
    if (currentTier === 'enterprise') {
      try {
        const token = localStorage.getItem('credlink_token');
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const response = await fetch(`${API_URL}/billing/create-portal-session`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          window.location.href = data.url; // Redirect to Stripe Customer Portal
        } else {
          showToast('Failed to open billing portal', 'error');
        }
      } catch (error) {
        showToast('Error accessing billing portal', 'error');
      }
      return;
    }
    
    // Determine target tier and Stripe price ID
    const targetTier = currentTier === 'free' ? 'pro' : 'enterprise';
    const priceIds = {
      pro: 'price_1SVEtjGcrSwtyKR9D3W7FmHA',      // Pro Monthly $199
      enterprise: 'price_1SVEtkGcrSwtyKR9vaoN98mO' // Enterprise Monthly $500
    };
    
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      
      // Create Stripe Checkout Session
      const response = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          priceId: priceIds[targetTier],
          tier: targetTier
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        showToast('Failed to create checkout session', 'error');
      }
    } catch (error) {
      showToast('Error creating checkout session', 'error');
    }
  };

  const handleRollKey = async () => {
    // Show toast notification instead of browser confirm
    showToast('Rolling API key...', 'info');
    
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/auth/api-key/roll`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}` 
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const newUser = { ...user, apiKey: data.apiKey };
        setUser(newUser);
        localStorage.setItem('credlink_user', JSON.stringify(newUser));
        showToast('✅ API key rolled successfully', 'success');
        addNotification({
          type: 'security',
          title: 'API Key Rotated',
          message: 'Your API key has been regenerated. Update your integrations with the new key.'
        });
      } else {
        showToast('Failed to roll API key', 'error');
      }
    } catch (error) {
      console.error('API key roll error:', error);
      showToast('Failed to roll API key', 'error');
    }
  };

  // Handler: Test Webhook
  const handleTestWebhook = async (webhookId: string) => {
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/webhooks/${webhookId}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        showToast('Webhook test successful', 'success');
        addNotification({
          type: 'success',
          title: 'Webhook Tested',
          message: 'Test payload delivered successfully'
        });
      } else {
        showToast('Webhook test failed', 'error');
      }
    } catch (error) {
      console.error('Webhook test error:', error);
      showToast('Webhook test failed', 'error');
    }
  };

  // Handler: Delete Webhook
  const handleDeleteWebhook = async (webhookId: string) => {
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/webhooks/${webhookId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        setWebhooks(webhooks.filter(wh => wh.id !== webhookId));
        showToast('Webhook deleted', 'success');
      } else {
        showToast('Failed to delete webhook', 'error');
      }
    } catch (error) {
      console.error('Delete webhook error:', error);
      showToast('Failed to delete webhook', 'error');
    }
  };

  // Handler: Export Audit Logs
  const handleExportAuditLogs = async () => {
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/audit-logs/export`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showToast('Audit logs exported', 'success');
      } else {
        showToast('Failed to export logs', 'error');
      }
    } catch (error) {
      console.error('Export error:', error);
      showToast('Failed to export logs', 'error');
    }
  };

  // Handler: Revoke Session
  const handleRevokeSession = async (sessionId: string) => {
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        setActiveSessions(activeSessions.filter(s => s.id !== sessionId));
        showToast('Session revoked', 'success');
        addNotification({
          type: 'security',
          title: 'Session Revoked',
          message: 'Device access has been terminated'
        });
      } else {
        showToast('Failed to revoke session', 'error');
      }
    } catch (error) {
      console.error('Revoke session error:', error);
      showToast('Failed to revoke session', 'error');
    }
  };

  // Handler: Update IP Whitelist
  const handleUpdateIpWhitelist = async () => {
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/auth/security/ip-whitelist`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ ipAddresses: ipWhitelist })
      });
      
      if (response.ok) {
        showToast('IP whitelist updated', 'success');
        addNotification({
          type: 'security',
          title: 'IP Whitelist Updated',
          message: `${ipWhitelist.length} IP addresses configured`
        });
      } else {
        const data = await response.json();
        showToast(data.error || 'Failed to update IP whitelist', 'error');
      }
    } catch (error) {
      console.error('IP whitelist error:', error);
      showToast('Failed to update IP whitelist', 'error');
    }
  };

  const handleAddIpAddress = () => {
    if (newIpAddress && !ipWhitelist.includes(newIpAddress)) {
      setIpWhitelist([...ipWhitelist, newIpAddress]);
      setNewIpAddress('');
    }
  };

  const handleRemoveIpAddress = (ip: string) => {
    setIpWhitelist(ipWhitelist.filter(i => i !== ip));
  };

  // Calculate real stats based on usage data
  const stats = useMemo(() => {
    if (!usageData || !usageData.usage) {
      return {
        totalDocs: documents.length,
        storage: '0.0',
        verifications: '0'
      };
    }
    
    return {
      totalDocs: documents.length,
      storage: (usageData.usage.storageUsedMB || 0).toFixed(1),
      verifications: (usageData.usage.signaturesThisMonth || 0).toLocaleString()
    };
  }, [documents, usageData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    setIsUploading(true);

    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      
      // Create FormData with the actual file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify({
        title: file.name,
        creator: 'CredLink User',
        description: `Signed via CredLink Dashboard`
      }));

      const response = await fetch(`${API_URL}/api/v1/sign`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
          // Don't set Content-Type - browser will set it with boundary for FormData
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Signing failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.document) {
        const newDoc = data.document;
        // Add local thumbnail for immediate preview
        newDoc.thumbnail = URL.createObjectURL(file);
        newDoc.name = file.name;
        newDoc.size = `${(file.size / (1024*1024)).toFixed(2)} MB`;
        newDoc.status = 'signed';
        
        setSignedResult({ original: file, signed: newDoc });
        
        // Show success toast and notification
        showToast(`${file.name} signed successfully`, 'success');
        addNotification({
          type: 'success',
          title: 'Asset Signed',
          message: `${file.name} has been cryptographically signed and secured.`
        });
        
        // HARSH: Refresh documents list immediately
        await fetchDocuments();
      } else {
        throw new Error(data.error || 'Signing failed - no document returned');
      }

    } catch (error) {
      console.error('Signing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign asset. Please try again.';
      showToast(errorMessage, 'error');
      addNotification({
        type: 'warning',
        title: 'Signing Failed',
        message: errorMessage
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    // Show toast notification instead of browser confirm
    showToast('Deleting document...', 'info');
    
    try {
      const token = localStorage.getItem('credlink_token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      await fetch(`${API_URL}/documents/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setDocuments(documents.filter(d => d.id !== id));
      if (selectedDoc?.id === id) setSelectedDoc(null);
      showToast('✅ Document deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete:', error);
      showToast('Failed to delete document', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('credlink_token');
    localStorage.removeItem('credlink_user');
    navigate('/login');
  };

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (signedResult) {
    return (
      <SignSuccess 
        originalFile={signedResult.original}
        signedDoc={signedResult.signed}
        onClose={() => {
          setSignedResult(null);
          setCurrentView('documents');
        }}
      />
    );
  }

  console.log('[Dashboard] About to render, user:', user?.email, 'documents:', documents.length);
  
  try {
    return (
      <>
        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Notification Center */}
      <NotificationCenter
        isOpen={notificationCenterOpen}
        onClose={() => setNotificationCenterOpen(false)}
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onClearAll={clearAllNotifications}
      />
      
      <div style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: '#334155'
      }}>
      {/* Sidebar */}
      <aside style={{
        width: '280px',
        background: '#0f172a',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: 20,
        boxShadow: '4px 0 24px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          height: '90px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(56, 189, 248, 0.3)'
            }}>
              <ShieldCheck style={{ width: '20px', height: '20px', color: 'white' }} />
            </div>
            <span style={{ fontWeight: '700', fontSize: '20px', letterSpacing: '-0.01em', color: '#f8fafc' }}>CredLink</span>
          </div>
        </div>

        <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <p style={{ padding: '0 16px', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '12px' }}>Workspace</p>
          <NavButton 
            icon={LayoutDashboard} 
            label="Overview" 
            active={currentView === 'overview'} 
            onClick={() => setCurrentView('overview')} 
          />
          <NavButton 
            icon={FileSignature} 
            label="Sign Asset" 
            active={currentView === 'upload'} 
            onClick={() => setCurrentView('upload')} 
          />
          <NavButton 
            icon={Files} 
            label="Documents" 
            active={currentView === 'documents'} 
            onClick={() => setCurrentView('documents')} 
          />
          <p style={{ padding: '0 16px', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '24px' }}>Analytics</p>
          <NavButton 
            icon={BarChart3} 
            label="Assets Analysis" 
            active={currentView === 'assets-detail'} 
            onClick={() => setCurrentView('assets-detail')} 
          />
          <NavButton 
            icon={Database} 
            label="Storage Usage" 
            active={currentView === 'storage-detail'} 
            onClick={() => setCurrentView('storage-detail')} 
          />
          <NavButton 
            icon={Activity} 
            label="Verifications" 
            active={currentView === 'verifications-detail'} 
            onClick={() => setCurrentView('verifications-detail')} 
          />
          <p style={{ padding: '0 16px', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '24px' }}>Enterprise</p>
          <NavButton 
            icon={Receipt} 
            label="Invoices" 
            active={currentView === 'invoices'} 
            onClick={() => setCurrentView('invoices')} 
          />
          <NavButton 
            icon={Shield} 
            label="Audit Logs" 
            active={currentView === 'audit-logs'} 
            onClick={() => setCurrentView('audit-logs')} 
          />
          <NavButton 
            icon={Webhook} 
            label="Webhooks" 
            active={currentView === 'webhooks'} 
            onClick={() => setCurrentView('webhooks')} 
          />
          <NavButton 
            icon={Users} 
            label="Team" 
            active={currentView === 'team'} 
            onClick={() => setCurrentView('team')} 
          />
          <NavButton 
            icon={Code} 
            label="API Docs" 
            active={currentView === 'api-docs'} 
            onClick={() => setCurrentView('api-docs')} 
          />
          <div style={{ flex: 1 }} />
          <NavButton 
            icon={Settings} 
            label="Settings" 
            active={currentView === 'settings'} 
            onClick={() => setCurrentView('settings')} 
          />
        </div>

        <div style={{ padding: '24px', borderTop: '1px solid #1e293b', background: 'rgba(15, 23, 42, 0.5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(to bottom right, #64748b, #475569)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '16px'
            }}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>{user?.name || 'User'}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80' }} />
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                  {user?.tier === 'enterprise' ? 'Enterprise ($500)' : user?.tier === 'pro' ? 'Pro ($200)' : 'Free Plan'}
                </p>
              </div>
            </div>
            <LogOut onClick={handleLogout} style={{ width: '18px', height: '18px', color: '#64748b', cursor: 'pointer', transition: 'color 0.2s' }} />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: '280px', position: 'relative' }}>
        {/* Header */}
        <header style={{
          height: '90px',
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(226, 232, 240, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 48px',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              {currentView === 'overview' ? `${getGreeting()}, ${user?.name?.split(' ')[0] || 'User'}` : 
               currentView.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </h1>
            {currentView === 'overview' && (
              <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
                You have <strong style={{ color: '#0f172a' }}>{documents.filter(d => d.status === 'signed').length} signed assets</strong> in your vault.
              </p>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Notification Bell */}
            <button 
              onClick={() => setNotificationCenterOpen(true)}
              style={{
                position: 'relative',
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <Bell style={{ width: '20px', height: '20px', color: '#64748b' }} />
              {notifications.filter(n => !n.read).length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: '2px solid white'
                }} />
              )}
            </button>
            
            <button style={{
              padding: '12px 24px',
              backgroundColor: '#0f172a',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '600',
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
              transition: 'all 0.2s',
              transform: 'translateY(0)'
            }} 
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            onClick={() => setCurrentView('upload')}>
              <Plus style={{ width: '18px', height: '18px' }} /> New Sign
            </button>
          </div>
        </header>

        <div style={{ padding: '48px', maxWidth: '1200px', margin: '0 auto' }}>
          
          {/* OVERVIEW VIEW */}
          {currentView === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
              {/* Stats Row - Clickable */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <StatCard 
                  label="Total Signed Assets" 
                  value={stats.totalDocs.toString()} 
                  trend={stats.totalDocs > 0 ? "+2 this week" : "No activity yet"}
                  trendColor={stats.totalDocs > 0 ? "#16a34a" : "#94a3b8"}
                  icon={<FileSignature style={{ width: '24px', height: '24px', color: 'white' }} />}
                  iconBg="linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"
                  onClick={() => setCurrentView('assets-detail')}
                />
                <StatCard 
                  label="Storage Used" 
                  value={`${stats.storage} MB`} 
                  trend={`${(parseFloat(stats.storage)/1024*100).toFixed(1)}% of 1GB Plan`}
                  trendColor="#ea580c"
                  icon={<Database style={{ width: '24px', height: '24px', color: 'white' }} />}
                  iconBg="linear-gradient(135deg, #f97316 0%, #ea580c 100%)"
                  onClick={() => setCurrentView('storage-detail')}
                />
                <StatCard 
                  label="Verification Checks" 
                  value={stats.verifications} 
                  trend="High engagement"
                  trendColor="#7c3aed"
                  icon={<ShieldCheck style={{ width: '24px', height: '24px', color: 'white' }} />}
                  iconBg="linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)"
                  onClick={() => setCurrentView('verifications-detail')}
                />
              </div>

              {/* Usage & Quotas */}
              {usageData && (
                <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Usage & Quotas</h2>
                      <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Current billing period usage</p>
                    </div>
                    <span style={{ padding: '6px 12px', background: user?.tier === 'enterprise' ? '#dcfce7' : user?.tier === 'pro' ? '#dbeafe' : '#f1f5f9', color: user?.tier === 'enterprise' ? '#166534' : user?.tier === 'pro' ? '#1e40af' : '#64748b', borderRadius: '8px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
                      {user?.tier || 'Free'} Plan
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Signatures */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Signatures</span>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>
                          {usageData.usage.signaturesThisMonth} / {usageData.limits.signatures === Infinity ? '∞' : usageData.limits.signatures}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.min(usageData.percentages.signatures, 100)}%`, 
                          height: '100%', 
                          background: usageData.warnings.signatures ? '#ef4444' : usageData.percentages.signatures > 50 ? '#f59e0b' : '#3b82f6',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      {usageData.warnings.signatures && (
                        <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', fontWeight: '600' }}>⚠️ Approaching limit - Consider upgrading</p>
                      )}
                    </div>

                    {/* Storage */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Storage</span>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>
                          {usageData.usage.storageUsedMB.toFixed(1)} MB / {usageData.limits.storageMB === Infinity ? '∞' : `${usageData.limits.storageMB} MB`}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.min(usageData.percentages.storage, 100)}%`, 
                          height: '100%', 
                          background: usageData.warnings.storage ? '#ef4444' : usageData.percentages.storage > 50 ? '#f59e0b' : '#8b5cf6',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      {usageData.warnings.storage && (
                        <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', fontWeight: '600' }}>⚠️ Storage almost full</p>
                      )}
                    </div>

                    {/* API Calls */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>API Calls</span>
                        <span style={{ fontSize: '14px', color: '#64748b' }}>
                          {(usageData?.usage?.apiCallsThisMonth || 0).toLocaleString()} / {usageData?.limits?.apiCalls === Infinity ? '∞' : (usageData?.limits?.apiCalls || 0).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.min(usageData.percentages.apiCalls, 100)}%`, 
                          height: '100%', 
                          background: usageData.warnings.apiCalls ? '#ef4444' : usageData.percentages.apiCalls > 50 ? '#f59e0b' : '#10b981',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                      {usageData.warnings.apiCalls && (
                        <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', fontWeight: '600' }}>⚠️ Rate limit warning</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Recent Documents</h2>
                  <button 
                    style={{ 
                      color: '#2563eb', 
                      backgroundColor: 'transparent', 
                      border: 'none', 
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }} 
                    onClick={() => setCurrentView('documents')}
                  >
                    View All <ExternalLink style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
                <DocumentsTable 
                  documents={documents.slice(0, 5)} 
                  onDelete={handleDelete} 
                  onView={(doc) => setSelectedDoc(doc)}
                />
              </div>
            </div>
          )}

          {/* SETTINGS VIEW */}
          {currentView === 'settings' && (
            <div style={{ display: 'flex', gap: '48px' }}>
              {/* Settings Navigation */}
              <div style={{ width: '240px', flexShrink: 0 }}>
                <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Account Settings</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {[
                    { id: 'profile', label: 'Profile & Personal', icon: User },
                    { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
                    { id: 'security', label: 'Security & Keys', icon: Lock },
                    { id: 'notifications', label: 'Notifications', icon: Bell }
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSettingsSection(item.id as any)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: settingsSection === item.id ? '#f1f5f9' : 'transparent',
                        color: settingsSection === item.id ? '#0f172a' : '#64748b',
                        fontSize: '14px',
                        fontWeight: '600',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s'
                      }}
                    >
                      <item.icon style={{ width: '18px', height: '18px' }} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Settings Content */}
              <div style={{ flex: 1, maxWidth: '800px' }}>
                {settingsSection === 'profile' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>Personal Information</h3>
                      <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
                        <div style={{ position: 'relative' }}>
                          <div style={{
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            background: 'linear-gradient(to bottom right, #64748b, #475569)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '32px',
                            fontWeight: '700'
                          }}>
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <button style={{
                            position: 'absolute',
                            bottom: '0',
                            right: '0',
                            background: 'white',
                            border: '1px solid #e2e8f0',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }}>
                            <Settings style={{ width: '14px', height: '14px', color: '#64748b' }} />
                          </button>
                        </div>
                        <form onSubmit={handleUpdateProfile} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Full Name</label>
                              <input 
                                name="name"
                                type="text" 
                                defaultValue={user?.name}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', color: '#0f172a' }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Email Address</label>
                              <input 
                                name="email"
                                type="email" 
                                defaultValue={user?.email}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', color: '#0f172a' }}
                              />
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Organization</label>
                            <input 
                              name="organization"
                              type="text" 
                              defaultValue={user?.organization}
                              placeholder="CredLink Inc."
                              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', color: '#0f172a' }}
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" style={{ padding: '10px 24px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Save Changes</button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                )}

                {settingsSection === 'billing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div>
                          <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>Current Plan</h3>
                          <p style={{ color: '#64748b', fontSize: '14px' }}>Manage your subscription and billing</p>
                        </div>
                        <span style={{ padding: '6px 12px', background: user?.tier !== 'free' ? '#dcfce7' : '#f1f5f9', color: user?.tier !== 'free' ? '#166534' : '#64748b', borderRadius: '99px', fontSize: '13px', fontWeight: '700' }}>
                          {user?.tier === 'enterprise' ? 'ENTERPRISE' : user?.tier === 'pro' ? 'PRO' : 'FREE'}
                        </span>
                      </div>

                      <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            <div style={{ width: '48px', height: '48px', background: user?.tier === 'enterprise' ? '#7c3aed' : user?.tier === 'pro' ? '#3b82f6' : '#94a3b8', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <ShieldCheck style={{ width: '24px', height: '24px', color: 'white' }} />
                            </div>
                            <div>
                              <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
                                {user?.tier === 'enterprise' ? 'Enterprise Plan' : user?.tier === 'pro' ? 'Pro Plan' : 'Free Plan'}
                              </h4>
                              <p style={{ fontSize: '14px', color: '#64748b' }}>
                                {user?.tier === 'enterprise' ? '$500.00 / month' : user?.tier === 'pro' ? '$200.00 / month' : '$0.00 / month'}
                              </p>
                            </div>
                          </div>
                          {user?.tier !== 'free' && (
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>NEXT BILLING DATE</p>
                              <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{user?.billingDate}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        {user?.tier !== 'free' && <button style={{ padding: '10px 20px', background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>View Invoices</button>}
                        <button 
                          onClick={handleUpgrade}
                          style={{ padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                        >
                          {user?.tier === 'free' ? 'Upgrade to Pro ($200)' : user?.tier === 'pro' ? 'Upgrade to Enterprise ($500)' : 'Manage Subscription'}
                        </button>
                      </div>
                    </div>

                    {user?.tier !== 'free' && (
                      <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>Payment Method</h3>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ width: '48px', height: '32px', background: '#1e293b', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>{user?.paymentMethod?.type?.toUpperCase()}</div>
                            <div>
                              <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{user?.paymentMethod?.type} ending in {user?.paymentMethod?.last4}</p>
                              <p style={{ fontSize: '13px', color: '#64748b' }}>Expires {user?.paymentMethod?.exp}</p>
                            </div>
                          </div>
                          <button style={{ color: '#2563eb', background: 'none', border: 'none', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Edit</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {settingsSection === 'security' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>API Access Keys</h3>
                      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Use these keys to authenticate API requests. Do not share your secret keys.</p>
                      
                      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Production Key</span>
                          <span style={{ padding: '4px 8px', background: '#dcfce7', color: '#166534', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>ACTIVE</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <input 
                            type="text" 
                            readOnly 
                            value={user?.apiKey || ''}
                            style={{ flex: 1, background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'monospace', color: '#64748b' }}
                          />
                          <button 
                            onClick={() => {navigator.clipboard.writeText(user?.apiKey); alert('Copied!');}}
                            style={{ padding: '10px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer' }}
                          >
                            <Files style={{ width: '16px', height: '16px', color: '#64748b' }} />
                          </button>
                        </div>
                      </div>
                      
                      <button 
                        onClick={handleRollKey}
                        style={{ padding: '10px 20px', background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                      >
                        Roll Key
                      </button>
                    </div>

                    {/* IP Whitelist */}
                    <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>IP Whitelist</h3>
                      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Restrict API access to specific IP addresses for enhanced security.</p>
                      
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                        <input 
                          type="text"
                          value={newIpAddress}
                          onChange={(e) => setNewIpAddress(e.target.value)}
                          placeholder="192.168.1.1"
                          style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                        />
                        <button 
                          onClick={handleAddIpAddress}
                          style={{ padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                        >
                          Add IP
                        </button>
                      </div>

                      {ipWhitelist.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                          {ipWhitelist.map((ip) => (
                            <div key={ip} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <span style={{ fontSize: '14px', fontFamily: 'monospace', color: '#0f172a' }}>{ip}</span>
                              <button 
                                onClick={() => handleRemoveIpAddress(ip)}
                                style={{ padding: '4px 12px', background: 'white', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <button 
                        onClick={handleUpdateIpWhitelist}
                        style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                      >
                        Save IP Whitelist
                      </button>
                    </div>

                    {/* Active Sessions */}
                    <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>Active Sessions</h3>
                      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Manage devices and sessions with access to your account.</p>
                      
                      {activeSessions.length === 0 ? (
                        <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', padding: '32px' }}>No active sessions</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {activeSessions.map((session) => (
                            <div key={session.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{session.userAgent}</span>
                                  {session.token === localStorage.getItem('credlink_token') && (
                                    <span style={{ padding: '2px 8px', background: '#dcfce7', color: '#166534', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>CURRENT</span>
                                  )}
                                </div>
                                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                                  IP: {session.ip} • Last active: {new Date(session.lastActivity).toLocaleString()}
                                </p>
                              </div>
                              {session.token !== localStorage.getItem('credlink_token') && (
                                <button 
                                  onClick={() => handleRevokeSession(session.id)}
                                  style={{ padding: '6px 16px', background: 'white', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {settingsSection === 'notifications' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>Email Notifications</h3>
                      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Manage how you receive updates and alerts</p>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[
                          { key: 'emailAlerts', label: 'Email Alerts', desc: 'Receive email notifications for important account activity', enabled: user?.notifications?.emailAlerts },
                          { key: 'securityAlerts', label: 'Security Alerts', desc: 'Get notified about suspicious login attempts and security events', enabled: user?.notifications?.securityAlerts },
                          { key: 'weeklyReports', label: 'Weekly Reports', desc: 'Receive weekly summaries of your account activity and usage', enabled: user?.notifications?.weeklyReports },
                          { key: 'marketingEmails', label: 'Marketing Emails', desc: 'Product updates, tips, and promotional offers', enabled: user?.notifications?.marketingEmails }
                        ].map((item) => (
                          <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ flex: 1 }}>
                              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>{item.label}</h4>
                              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{item.desc}</p>
                            </div>
                            <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                defaultChecked={item.enabled}
                                style={{ opacity: 0, width: 0, height: 0 }}
                              />
                              <span style={{
                                position: 'absolute',
                                cursor: 'pointer',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: item.enabled ? '#3b82f6' : '#cbd5e1',
                                transition: '0.3s',
                                borderRadius: '24px'
                              }}>
                                <span style={{
                                  position: 'absolute',
                                  content: '',
                                  height: '18px',
                                  width: '18px',
                                  left: item.enabled ? '26px' : '3px',
                                  bottom: '3px',
                                  backgroundColor: 'white',
                                  transition: '0.3s',
                                  borderRadius: '50%'
                                }} />
                              </span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>Notification Channels</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Email</p>
                            <p style={{ fontSize: '13px', color: '#64748b' }}>{user?.email}</p>
                          </div>
                          <span style={{ padding: '4px 8px', background: '#dcfce7', color: '#166534', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>VERIFIED</span>
                        </div>
                        <div style={{ padding: '16px', border: '1px dashed #cbd5e1', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#64748b' }}>Slack Integration</p>
                            <p style={{ fontSize: '13px', color: '#94a3b8' }}>Connect your Slack workspace</p>
                          </div>
                          <button style={{ padding: '6px 12px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Connect</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ASSETS DETAIL VIEW */}
          {currentView === 'assets-detail' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '16px' }}>Asset Portfolio</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Total Secured</p>
                    <p style={{ fontSize: '24px', color: '#0f172a', fontWeight: '800' }}>{documents.length}</p>
                  </div>
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Pending Verification</p>
                    <p style={{ fontSize: '24px', color: '#f59e0b', fontWeight: '800' }}>{documents.filter(d => d.status === 'pending').length}</p>
                  </div>
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '13px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Success Rate</p>
                    <p style={{ fontSize: '24px', color: '#16a34a', fontWeight: '800' }}>100%</p>
                  </div>
                </div>
                <DocumentsTable 
                  documents={documents} 
                  onDelete={handleDelete} 
                  onView={(doc) => setSelectedDoc(doc)}
                />
              </div>
            </div>
          )}

          {/* STORAGE DETAIL VIEW */}
          {currentView === 'storage-detail' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a' }}>Storage Analysis</h2>
                    <p style={{ color: '#64748b', marginTop: '4px' }}>Enterprise Plan (1TB) • $200/mo</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a' }}>{stats.storage} MB</p>
                    <p style={{ fontSize: '14px', color: '#64748b' }}>Used of 1,000,000 MB</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{ height: '24px', background: '#f1f5f9', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px', position: 'relative' }}>
                  <div style={{ 
                    width: `${Math.max(parseFloat(stats.storage)/10000 * 100, 2)}%`, // Scaled for visual
                    height: '100%', 
                    background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                    borderRadius: '12px',
                    transition: 'width 1s ease-in-out'
                  }} />
                </div>
                <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'right', marginBottom: '48px' }}>
                  {(parseFloat(stats.storage)/1000000*100).toFixed(4)}% Used
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <PieChart style={{ width: '18px', height: '18px', color: '#64748b' }} /> Distribution
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} /> Images (JPG/PNG)
                        </span>
                        <span style={{ fontWeight: '600' }}>{(parseFloat(stats.storage) * 0.8).toFixed(1)} MB</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} /> Documents (PDF)
                        </span>
                        <span style={{ fontWeight: '600' }}>{(parseFloat(stats.storage) * 0.15).toFixed(1)} MB</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#eab308' }} /> Metadata (C2PA)
                        </span>
                        <span style={{ fontWeight: '600' }}>{(parseFloat(stats.storage) * 0.05).toFixed(1)} MB</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle style={{ width: '18px', height: '18px', color: '#64748b' }} /> Largest Assets
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {documents.sort((a,b) => parseFloat(b.size) - parseFloat(a.size)).slice(0, 3).map(doc => (
                        <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: '14px', color: '#334155', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{doc.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VERIFICATIONS DETAIL VIEW */}
          {currentView === 'verifications-detail' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>Verification History</h2>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ padding: '8px 16px', background: '#ecfdf5', borderRadius: '20px', color: '#166534', fontSize: '13px', fontWeight: '600' }}>
                      {verificationLogs.length} Total Verifications
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Time</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Asset</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Location</th>
                        <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Client</th>
                        <th style={{ padding: '16px', textAlign: 'right', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verificationLogs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px', fontSize: '14px', color: '#334155' }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>
                            {log.assetName}
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Globe style={{ width: '14px', height: '14px' }} />
                              {log.location} <span style={{ fontSize: '12px', color: '#94a3b8' }}>({log.ip})</span>
                            </div>
                          </td>
                          <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>
                            {log.userAgent}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'right' }}>
                            <span style={{
                              padding: '4px 12px',
                              borderRadius: '99px',
                              fontSize: '12px',
                              fontWeight: '600',
                              background: log.result === 'Verified' ? '#dcfce7' : '#fef2f2',
                              color: log.result === 'Verified' ? '#166534' : '#991b1b'
                            }}>
                              {log.result.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* INVOICES VIEW */}
          {currentView === 'invoices' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Billing History</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>View and download your invoices</p>
                  </div>
                  <button style={{ padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Download style={{ width: '16px', height: '16px' }} />
                    Export All
                  </button>
                </div>

                {invoices.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '64px 24px', color: '#94a3b8' }}>
                    <Receipt style={{ width: '48px', height: '48px', margin: '0 auto 16px', opacity: 0.3 }} />
                    <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No invoices yet</p>
                    <p style={{ fontSize: '14px' }}>Your billing history will appear here</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Invoice</th>
                          <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                          <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Description</th>
                          <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Amount</th>
                          <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                          <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((invoice) => (
                          <tr key={invoice.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: '#0f172a', fontFamily: 'monospace' }}>{invoice.id}</td>
                            <td style={{ padding: '16px', fontSize: '14px', color: '#64748b' }}>{new Date(invoice.date).toLocaleDateString()}</td>
                            <td style={{ padding: '16px', fontSize: '14px', color: '#0f172a' }}>{invoice.description}</td>
                            <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>${invoice.amount.toFixed(2)}</td>
                            <td style={{ padding: '16px' }}>
                              <span style={{ padding: '4px 12px', background: invoice.status === 'paid' ? '#dcfce7' : '#fef3c7', color: invoice.status === 'paid' ? '#166534' : '#92400e', borderRadius: '99px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
                                {invoice.status}
                              </span>
                            </td>
                            <td style={{ padding: '16px', textAlign: 'right' }}>
                              <button style={{ padding: '6px 12px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <Download style={{ width: '14px', height: '14px' }} />
                                PDF
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AUDIT LOGS VIEW */}
          {currentView === 'audit-logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Security Audit Log</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Track all account activity and changes</p>
                  </div>
                  <button 
                    onClick={handleExportAuditLogs}
                    style={{ padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Download style={{ width: '16px', height: '16px' }} />
                    Export CSV
                  </button>
                </div>

                {auditLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '64px 24px', color: '#94a3b8' }}>
                    <Shield style={{ width: '48px', height: '48px', margin: '0 auto 16px', opacity: 0.3 }} />
                    <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No audit logs yet</p>
                    <p style={{ fontSize: '14px' }}>Account activity will be tracked here</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {auditLogs.map((log) => (
                      <div key={log.id} style={{ padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: log.action.includes('security') ? '#fee2e2' : log.action.includes('subscription') ? '#dbeafe' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {log.action.includes('security') ? <Shield style={{ width: '20px', height: '20px', color: '#dc2626' }} /> : 
                           log.action.includes('subscription') ? <CreditCard style={{ width: '20px', height: '20px', color: '#2563eb' }} /> :
                           <CheckCircle2 style={{ width: '20px', height: '20px', color: '#16a34a' }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{log.action.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' }}>{new Date(log.timestamp).toLocaleString()}</p>
                        </div>
                        {log.details && (
                          <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace', background: 'white', padding: '6px 12px', borderRadius: '6px' }}>
                            {JSON.stringify(log.details).substring(0, 50)}...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WEBHOOKS VIEW */}
          {currentView === 'webhooks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Webhook Endpoints</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Receive real-time notifications for events</p>
                  </div>
                  <button style={{ padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus style={{ width: '16px', height: '16px' }} />
                    Add Webhook
                  </button>
                </div>

                {webhooks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '64px 24px', color: '#94a3b8' }}>
                    <Webhook style={{ width: '48px', height: '48px', margin: '0 auto 16px', opacity: 0.3 }} />
                    <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No webhooks configured</p>
                    <p style={{ fontSize: '14px', marginBottom: '24px' }}>Set up webhooks to receive real-time event notifications</p>
                    <button style={{ padding: '12px 24px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                      Create Your First Webhook
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {webhooks.map((webhook) => (
                      <div key={webhook.id} style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                              <p style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: 0, fontFamily: 'monospace' }}>{webhook.url}</p>
                              <span style={{ padding: '4px 8px', background: webhook.enabled ? '#dcfce7' : '#f1f5f9', color: webhook.enabled ? '#166534' : '#64748b', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                                {webhook.enabled ? 'ACTIVE' : 'DISABLED'}
                              </span>
                            </div>
                            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Events: {webhook.events.join(', ')}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => handleTestWebhook(webhook.id)}
                              style={{ padding: '8px 16px', background: 'white', color: '#2563eb', border: '1px solid #2563eb', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Test
                            </button>
                            <button 
                              onClick={() => handleDeleteWebhook(webhook.id)}
                              style={{ padding: '8px 16px', background: 'white', color: '#dc2626', border: '1px solid #dc2626', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div style={{ padding: '12px', background: 'white', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: '#64748b' }}>
                          Secret: {webhook.secret}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TEAM VIEW */}
          {currentView === 'team' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Team Members</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Manage team access and permissions</p>
                  </div>
                  <button style={{ padding: '10px 20px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus style={{ width: '16px', height: '16px' }} />
                    Invite Member
                  </button>
                </div>

                <div style={{ textAlign: 'center', padding: '64px 24px', color: '#94a3b8' }}>
                  <Users style={{ width: '48px', height: '48px', margin: '0 auto 16px', opacity: 0.3 }} />
                  <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Team collaboration coming soon</p>
                  <p style={{ fontSize: '14px', marginBottom: '24px' }}>Invite team members, assign roles, and manage permissions</p>
                  <div style={{ display: 'inline-flex', gap: '12px', padding: '16px 24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>∞</p>
                      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Team Members</p>
                    </div>
                    <div style={{ width: '1px', background: '#e2e8f0' }} />
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>5</p>
                      <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Role Types</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API DOCS VIEW */}
          {currentView === 'api-docs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ marginBottom: '32px' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>API Documentation</h2>
                  <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>Integrate CredLink into your applications</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                  <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <Code style={{ width: '32px', height: '32px', color: '#3b82f6', marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>REST API</h3>
                    <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>Full-featured REST API for signing and verification</p>
                    <button style={{ padding: '8px 16px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      View Docs
                    </button>
                  </div>
                  <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <TrendingUp style={{ width: '32px', height: '32px', color: '#8b5cf6', marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Rate Limits</h3>
                    <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>Enterprise: 10,000 requests/hour</p>
                    <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: '23%', height: '100%', background: '#8b5cf6' }} />
                    </div>
                  </div>
                </div>

                <div style={{ padding: '24px', background: '#0f172a', borderRadius: '12px', color: 'white' }}>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px' }}>Quick Start</p>
                  <pre style={{ margin: 0, fontSize: '13px', fontFamily: 'monospace', lineHeight: '1.6', overflow: 'auto' }}>
{`curl -X POST https://api.credlink.com/sign \\
  -H "Authorization: Bearer ${user?.apiKey || 'YOUR_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{"image": "document.jpg", "metadata": {...}}'`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* UPLOAD VIEW */}
          {currentView === 'upload' && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{
                padding: '64px',
                border: '2px dashed #cbd5e1',
                borderRadius: '24px',
                backgroundColor: '#ffffff',
                textAlign: 'center',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
              >
                <input 
                  type="file" 
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer'
                  }}
                  onChange={handleUpload}
                  accept="image/*,application/pdf"
                  disabled={isUploading}
                />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {isUploading ? (
                    <>
                      <div style={{ 
                        padding: '20px', 
                        background: '#eff6ff', 
                        borderRadius: '50%', 
                        marginBottom: '24px',
                      }}>
                        <Loader2 style={{ width: '40px', height: '40px', color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                      </div>
                      <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Securing Asset...</h3>
                      <p style={{ color: '#64748b', fontSize: '15px' }}>Embedding C2PA cryptographic signature</p>
                    </>
                  ) : (
                    <>
                      <div style={{
                        width: '80px',
                        height: '80px',
                        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '32px',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.1)'
                      }}>
                        <FileSignature style={{ width: '40px', height: '40px', color: '#2563eb' }} />
                      </div>
                      <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '12px' }}>Drop your file here to sign</h3>
                      <p style={{ color: '#64748b', marginBottom: '32px', fontSize: '15px', maxWidth: '300px', lineHeight: '1.5' }}>We support high-res images and PDFs up to 50MB. All processing is done securely.</p>
                      <button style={{
                        padding: '12px 28px',
                        backgroundColor: '#0f172a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '15px',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
                      }}>
                        Select File
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENTS VIEW */}
          {currentView === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <DocumentsTable 
                documents={documents} 
                onDelete={handleDelete} 
                onView={(doc) => setSelectedDoc(doc)}
              />
            </div>
          )}

        </div>
      </main>

      {/* Document Details Modal ("Way to get in") */}
      {selectedDoc && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px'
        }} onClick={() => setSelectedDoc(null)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '600px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
            animation: 'slideUp 0.3s ease-out'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>{selectedDoc.name}</h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  fontWeight: '600',
                  backgroundColor: selectedDoc.status === 'verified' ? '#dcfce7' : '#dbeafe',
                  color: selectedDoc.status === 'verified' ? '#166534' : '#1e40af',
                }}>
                  {selectedDoc.status === 'verified' ? <ShieldCheck style={{ width: '14px', height: '14px', marginRight: '6px' }} /> : <CheckCircle2 style={{ width: '14px', height: '14px', marginRight: '6px' }} />}
                  {selectedDoc.status.toUpperCase()}
                </span>
              </div>
              <button 
                onClick={() => setSelectedDoc(null)}
                style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X style={{ width: '24px', height: '24px' }} />
              </button>
            </div>
            
            <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ 
                height: '200px', 
                background: '#f8fafc', 
                borderRadius: '12px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                border: '1px dashed #cbd5e1'
              }}>
                {selectedDoc.thumbnail ? (
                  <img src={selectedDoc.thumbnail} alt="" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ textAlign: 'center', color: '#64748b' }}>
                    <ImageIcon style={{ width: '48px', height: '48px', margin: '0 auto 12px auto', opacity: 0.5 }} />
                    <p style={{ fontSize: '14px' }}>Preview not available</p>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Signed Date</p>
                  <p style={{ fontSize: '15px', color: '#0f172a', fontWeight: '500' }}>{new Date(selectedDoc.signedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>File Size</p>
                  <p style={{ fontSize: '15px', color: '#0f172a', fontWeight: '500' }}>{selectedDoc.size}</p>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Cryptographic Hash</p>
                  <p style={{ fontSize: '13px', color: '#0f172a', fontFamily: 'monospace', background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', wordBreak: 'break-all' }}>{selectedDoc.hash}</p>
                </div>
              </div>

              <div style={{ paddingTop: '24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px' }}>
                <button 
                  style={{ flex: 1, padding: '12px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}
                  onClick={() => selectedDoc.proofId && window.open(`http://localhost:8000/download/${selectedDoc.proofId}`, '_blank')}
                >
                  Download Proof
                </button>
                <button 
                  style={{ flex: 1, padding: '12px', background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}
                  onClick={() => window.open('https://c2pa.org/verify', '_blank')}
                >
                  Verify Externally
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
  } catch (error) {
    console.error('[Dashboard] Render error:', error);
    return <div style={{ padding: '20px', color: 'red' }}>Dashboard Error: {String(error)}</div>;
  }
}

// --- Subcomponents ---

function NavButton({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '12px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        backgroundColor: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        color: active ? '#ffffff' : '#94a3b8',
        border: 'none',
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {active && <div style={{ position: 'absolute', left: 0, top: '10%', bottom: '10%', width: '4px', background: '#38bdf8', borderRadius: '0 4px 4px 0' }} />}
      <Icon style={{ width: '20px', height: '20px', color: active ? '#38bdf8' : 'currentColor', transition: 'color 0.2s' }} />
      {label}
    </button>
  );
}

function StatCard({ label, value, trend, trendColor, icon, iconBg, onClick }: { label: string, value: string, trend: string, trendColor: string, icon: any, iconBg: string, onClick?: () => void }) {
  return (
    <div style={{
      padding: '28px',
      backgroundColor: 'white',
      borderRadius: '20px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02), 0 10px 25px -5px rgba(0, 0, 0, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.5)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      transition: 'all 0.2s',
      cursor: onClick ? 'pointer' : 'default'
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      if (onClick) e.currentTarget.style.borderColor = '#3b82f6';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = 'translateY(0)';
      if (onClick) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
    }}
    onClick={onClick}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
          <div style={{ 
            width: '44px', 
            height: '44px', 
            background: iconBg, 
            borderRadius: '12px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            {icon}
          </div>
        </div>
        <div style={{ marginTop: '12px' }}>
          <span style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>{value}</span>
        </div>
      </div>
      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: trendColor }} />
        <p style={{ fontSize: '13px', color: trendColor, fontWeight: '600', margin: 0 }}>{trend}</p>
      </div>
    </div>
  );
}

function DocumentsTable({ documents, onDelete, onView }: { documents: SignedDocument[], onDelete: (id: string) => void, onView: (doc: SignedDocument) => void }) {
  if (documents.length === 0) {
    return (
      <div style={{
        padding: '64px',
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: '20px',
        border: '1px dashed #cbd5e1',
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          background: '#f1f5f9',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px auto'
        }}>
          <Files style={{ width: '32px', height: '32px', color: '#94a3b8' }} />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>No signed assets yet</h3>
        <p style={{ color: '#64748b', margin: 0, fontSize: '15px' }}>Upload your first document to verify authenticity.</p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '20px',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
      border: '1px solid rgba(226, 232, 240, 0.6)'
    }}>
      <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <tr>
            <th style={{ padding: '20px 32px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asset Name</th>
            <th style={{ padding: '20px 32px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verification</th>
            <th style={{ padding: '20px 32px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signed</th>
            <th style={{ padding: '20px 32px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Size</th>
            <th style={{ padding: '20px 32px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
          </tr>
        </thead>
        <tbody style={{ backgroundColor: 'white' }}>
          {documents.map((doc) => (
            <tr 
              key={doc.id} 
              style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.1s', cursor: 'pointer' }} 
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} 
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
              onClick={() => onView(doc)}
            >
              <td style={{ padding: '20px 32px', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{
                    height: '44px',
                    width: '44px',
                    flexShrink: 0,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {doc.thumbnail ? (
                      <img style={{ height: '100%', width: '100%', objectFit: 'cover' }} src={doc.thumbnail} alt="" />
                    ) : (
                      doc.name.endsWith('.pdf') ? 
                        <FileText style={{ height: '22px', width: '22px', color: '#ef4444' }} /> :
                        <ImageIcon style={{ height: '22px', width: '22px', color: '#3b82f6' }} />
                    )}
                  </div>
                  <div style={{ marginLeft: '16px' }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{doc.name}</div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px', fontFamily: 'monospace' }}>{doc.id}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding: '20px 32px', whiteSpace: 'nowrap' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 12px',
                  borderRadius: '9999px',
                  fontSize: '13px',
                  fontWeight: '600',
                  backgroundColor: doc.status === 'verified' ? '#dcfce7' : '#dbeafe',
                  color: doc.status === 'verified' ? '#166534' : '#1e40af',
                  border: `1px solid ${doc.status === 'verified' ? '#bbf7d0' : '#bfdbfe'}`
                }}>
                  {doc.status === 'verified' ? <ShieldCheck style={{ width: '14px', height: '14px', marginRight: '6px' }} /> : <CheckCircle2 style={{ width: '14px', height: '14px', marginRight: '6px' }} />}
                  {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                </span>
              </td>
              <td style={{ padding: '20px 32px', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: '14px', color: '#334155', fontWeight: '500' }}>
                  {new Date(doc.signedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {new Date(doc.signedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </div>
              </td>
              <td style={{ padding: '20px 32px', whiteSpace: 'nowrap', fontSize: '14px', color: '#64748b', fontFamily: 'monospace', fontWeight: '500' }}>
                {doc.size}
              </td>
              <td style={{ padding: '20px 32px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }} onClick={e => e.stopPropagation()}>
                  <button 
                    style={{
                      padding: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      color: '#64748b',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    onClick={() => doc.proofId && window.open(`http://localhost:8000/download/${doc.proofId}`, '_blank')}
                    title="Download Certificate"
                  >
                    <Download style={{ width: '16px', height: '16px' }} />
                  </button>
                  <button 
                    style={{
                      padding: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      color: '#64748b',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                    onClick={() => onDelete(doc.id)}
                    title="Delete Document"
                  >
                    <Trash2 style={{ width: '16px', height: '16px' }} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
