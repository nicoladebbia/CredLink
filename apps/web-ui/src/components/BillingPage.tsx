import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Check, Loader2, Download, AlertCircle } from 'lucide-react';

interface PricingTier {
  id: string;
  name: string;
  price: number;
  yearlyPrice?: number;
  interval: string;
  priceId?: string;
  yearlyPriceId?: string;
  features: string[];
  limits: {
    signatures: number;
    storageMB: number;
    apiCalls: number;
  };
}

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  tier: string;
}

interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
  hostedUrl: string | null;
  periodStart: string;
  periodEnd: string;
  paid: boolean;
  created: string;
}

export function BillingPage() {
  const [searchParams] = useSearchParams();
  
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    // Check for success/cancel from Stripe redirect
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      setSuccess('Payment successful! Your subscription is now active.');
      // Clean URL
      window.history.replaceState({}, '', '/billing');
    }
    
    fetchData();
  }, [searchParams]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('credlink_token');
      
      // Fetch pricing tiers
      const pricingRes = await fetch(`${API_URL}/billing/pricing`);
      const pricingData = await pricingRes.json();
      setTiers(pricingData.tiers);
      
      // Fetch current subscription
      const subRes = await fetch(`${API_URL}/billing/subscription`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const subData = await subRes.json();
      setSubscription(subData.subscription);
      
      // Fetch invoices
      const invRes = await fetch(`${API_URL}/billing/invoices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const invData = await invRes.json();
      setInvoices(invData.invoices || []);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (tier: PricingTier) => {
    if (tier.id === 'free') return;
    
    setProcessing(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('credlink_token');
      const priceId = billingInterval === 'yearly' ? tier.yearlyPriceId : tier.priceId;
      
      const response = await fetch(`${API_URL}/billing/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          priceId,
          tier: tier.id
        })
      });
      
      const data = await response.json();
      
      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
      
    } catch (err: any) {
      setError(err.message);
      setProcessing(false);
    }
  };

  const handleManageBilling = async () => {
    setProcessing(true);
    
    try {
      const token = localStorage.getItem('credlink_token');
      
      const response = await fetch(`${API_URL}/billing/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      }
      
    } catch (err: any) {
      setError(err.message);
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Loader2 style={{ width: '32px', height: '32px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 24px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: '800', color: '#0f172a', marginBottom: '12px' }}>
          Billing & Subscription
        </h1>
        <p style={{ fontSize: '16px', color: '#64748b' }}>
          Manage your subscription and billing information
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div style={{ padding: '16px', background: '#dcfce7', border: '1px solid #16a34a', borderRadius: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Check style={{ width: '20px', height: '20px', color: '#16a34a' }} />
          <p style={{ color: '#166534', margin: 0 }}>{success}</p>
        </div>
      )}
      
      {error && (
        <div style={{ padding: '16px', background: '#fee2e2', border: '1px solid #dc2626', borderRadius: '12px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle style={{ width: '20px', height: '20px', color: '#dc2626' }} />
          <p style={{ color: '#991b1b', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Current Subscription */}
      {subscription && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '16px' }}>
            Current Subscription
          </h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '16px', color: '#64748b', marginBottom: '8px' }}>
                Plan: <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{subscription.tier}</strong>
              </p>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                Status: <span style={{ padding: '4px 8px', background: subscription.status === 'active' ? '#dcfce7' : '#f1f5f9', color: subscription.status === 'active' ? '#166534' : '#64748b', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                  {subscription.status.toUpperCase()}
                </span>
              </p>
              <p style={{ fontSize: '14px', color: '#64748b' }}>
                Renews: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
              {subscription.cancelAtPeriodEnd && (
                <p style={{ fontSize: '14px', color: '#dc2626', marginTop: '8px', fontWeight: '600' }}>
                  ⚠️ Subscription will cancel at period end
                </p>
              )}
            </div>
            <button
              onClick={handleManageBilling}
              disabled={processing}
              style={{ padding: '12px 24px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: processing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {processing ? <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> : <CreditCard style={{ width: '16px', height: '16px' }} />}
              Manage Billing
            </button>
          </div>
        </div>
      )}

      {/* Billing Interval Toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: '12px', padding: '4px' }}>
          <button
            onClick={() => setBillingInterval('monthly')}
            style={{ padding: '8px 24px', background: billingInterval === 'monthly' ? 'white' : 'transparent', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: billingInterval === 'monthly' ? '#0f172a' : '#64748b' }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingInterval('yearly')}
            style={{ padding: '8px 24px', background: billingInterval === 'yearly' ? 'white' : 'transparent', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: billingInterval === 'yearly' ? '#0f172a' : '#64748b', position: 'relative' }}
          >
            Yearly
            <span style={{ position: 'absolute', top: '-8px', right: '-8px', padding: '2px 6px', background: '#16a34a', color: 'white', borderRadius: '6px', fontSize: '10px', fontWeight: '700' }}>
              SAVE 17%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Tiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '48px' }}>
        {tiers.map(tier => {
          const price = billingInterval === 'yearly' ? (tier.yearlyPrice || tier.price * 10) : tier.price;
          const isCurrentTier = subscription?.tier === tier.id;
          const isFree = tier.id === 'free';
          
          return (
            <div
              key={tier.id}
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '32px',
                boxShadow: tier.id === 'enterprise' ? '0 10px 25px -5px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0,0,0,0.05)',
                border: tier.id === 'enterprise' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                position: 'relative'
              }}
            >
              {tier.id === 'enterprise' && (
                <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', padding: '4px 16px', background: '#3b82f6', color: 'white', borderRadius: '99px', fontSize: '12px', fontWeight: '700' }}>
                  MOST POPULAR
                </div>
              )}
              
              <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
                {tier.name}
              </h3>
              
              <div style={{ marginBottom: '24px' }}>
                <span style={{ fontSize: '48px', fontWeight: '800', color: '#0f172a' }}>
                  ${price}
                </span>
                <span style={{ fontSize: '16px', color: '#64748b' }}>
                  /{billingInterval === 'yearly' ? 'year' : 'month'}
                </span>
              </div>
              
              <ul style={{ listStyle: 'none', padding: 0, marginBottom: '32px' }}>
                {tier.features.map((feature, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '12px' }}>
                    <Check style={{ width: '20px', height: '20px', color: '#16a34a', flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ fontSize: '14px', color: '#64748b' }}>{feature}</span>
                  </li>
                ))}
              </ul>
              
              <button
                onClick={() => handleSubscribe(tier)}
                disabled={processing || isCurrentTier || isFree}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: isCurrentTier ? '#f1f5f9' : (tier.id === 'enterprise' ? '#3b82f6' : '#0f172a'),
                  color: isCurrentTier ? '#64748b' : 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '16px',
                  cursor: (processing || isCurrentTier || isFree) ? 'not-allowed' : 'pointer',
                  opacity: (processing || isCurrentTier || isFree) ? 0.6 : 1
                }}
              >
                {isCurrentTier ? 'Current Plan' : (isFree ? 'Free Forever' : `Subscribe to ${tier.name}`)}
              </button>
            </div>
          );
        })}
      </div>

      {/* Invoices */}
      {invoices.length > 0 && (
        <div style={{ background: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>
            Billing History
          </h2>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Amount</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'right', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(invoice => (
                  <tr key={invoice.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#334155' }}>
                      {new Date(invoice.created).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                      ${invoice.amount.toFixed(2)} {invoice.currency}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        background: invoice.paid ? '#dcfce7' : '#fee2e2',
                        color: invoice.paid ? '#166534' : '#991b1b',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {invoice.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      {invoice.pdfUrl && (
                        <a
                          href={invoice.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563eb', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}
                        >
                          <Download style={{ width: '16px', height: '16px' }} />
                          Download
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
