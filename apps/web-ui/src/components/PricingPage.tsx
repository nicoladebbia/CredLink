import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { CheckCircle2, Star, Zap, Shield, Users, Crown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface PricingTier {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  description: string;
  features: string[];
  popular?: boolean;
  cta: string;
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Starter',
    monthlyPrice: 0,
    description: 'Perfect for trying out CredLink',
    features: [
      '5 certificates per month',
      '1 GB storage',
      'Basic verification',
      'Email support',
      'C2PA standard compliance',
    ],
    cta: 'Get Started',
  },
  {
    id: 'pro',
    name: 'Professional',
    monthlyPrice: 49,
    yearlyPrice: 490,
    description: 'Best for professionals and small businesses',
    features: [
      '50 certificates per month',
      '10 GB storage',
      'Priority verification',
      'Priority support',
      'Bulk signing tools',
      'API access',
      'Custom branding',
      'Webhook integrations',
    ],
    popular: true,
    cta: 'Start Free Trial',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 199,
    yearlyPrice: 1990,
    description: 'For large teams and organizations',
    features: [
      '500 certificates per month',
      '100 GB storage',
      'White-glove verification',
      'Dedicated support',
      'Advanced bulk signing',
      'Full API access',
      'Custom branding',
      'Advanced webhooks',
      'Team management',
      'SLA guarantees',
    ],
    cta: 'Contact Sales',
  },
];

export function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (tierId: string) => {
    if (tierId === 'enterprise') {
      // Handle enterprise contact
      window.location.href = 'mailto:sales@credlink.com?subject=Enterprise Plan Inquiry';
      return;
    }

    setLoading(tierId);
    
    try {
      const response = await fetch('/billing/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tierId,
          userId: 'demo-user', // Would come from auth context
          email: 'demo@example.com', // Would come from auth context
          trialPeriodDays: tierId === 'pro' ? 14 : undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create subscription');
      }

      // Redirect to Stripe Checkout
      if (data.data.clientSecret) {
        // For subscriptions with payment method setup
        const stripe = await import('@stripe/stripe-js').then(m => m.loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY!));
        if (stripe) {
          const { error } = await stripe.confirmPayment({
            clientSecret: data.data.clientSecret,
            confirmParams: {
              return_url: `${window.location.origin}/billing/success`,
            },
          });

          if (error) {
            throw new Error(error.message || 'Payment failed');
          }
        }
      }

      toast.success('Subscription created successfully!');
      
    } catch (error) {
      console.error('Subscription error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create subscription');
    } finally {
      setLoading(null);
    }
  };

  const handlePayAsYouGo = async (quantity: number) => {
    setLoading(`payg-${quantity}`);
    
    try {
      const response = await fetch('/billing/pay-as-you-go', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity,
          userId: 'demo-user', // Would come from auth context
          email: 'demo@example.com', // Would come from auth context
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create payment session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.data.url;
      
    } catch (error) {
      console.error('Payment error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create payment session');
    } finally {
      setLoading(null);
    }
  };

  const getDisplayPrice = (tier: PricingTier) => {
    if (billingCycle === 'yearly' && tier.yearlyPrice) {
      return {
        amount: tier.yearlyPrice / 12,
        period: 'per month',
        savings: Math.round(((tier.monthlyPrice * 12 - tier.yearlyPrice) / (tier.monthlyPrice * 12)) * 100),
      };
    }
    return {
      amount: tier.monthlyPrice,
      period: 'per month',
      savings: 0,
    };
  };

  const getTierIcon = (tierId: string) => {
    switch (tierId) {
      case 'free':
        return <Zap className="w-6 h-6 text-blue-600" />;
      case 'pro':
        return <Star className="w-6 h-6 text-purple-600" />;
      case 'enterprise':
        return <Crown className="w-6 h-6 text-amber-600" />;
      default:
        return <Shield className="w-6 h-6 text-gray-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Choose the perfect plan for your certificate signing needs
          </p>
          
          {/* Billing Toggle */}
          <div className="inline-flex items-center bg-white rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${
                billingCycle === 'yearly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {PRICING_TIERS.map((tier) => {
            const price = getDisplayPrice(tier);
            const isLoading = loading === tier.id;
            
            return (
              <Card
                key={tier.id}
                className={`relative p-8 ${
                  tier.popular
                    ? 'border-2 border-blue-600 shadow-xl scale-105'
                    : 'border border-gray-200 shadow-lg'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  {getTierIcon(tier.id)}
                  <h3 className="text-2xl font-bold text-gray-900">{tier.name}</h3>
                </div>

                <p className="text-gray-600 mb-6">{tier.description}</p>

                <div className="mb-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold text-gray-900">
                      ${price.amount}
                    </span>
                    <span className="text-gray-600">{price.period}</span>
                  </div>
                  {price.savings > 0 && (
                    <p className="text-green-600 text-sm font-medium mt-2">
                      Save {price.savings}% with yearly billing
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => handleSubscribe(tier.id)}
                  disabled={isLoading}
                  className={`w-full mb-8 ${
                    tier.popular
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-900 hover:bg-gray-800 text-white'
                  }`}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </div>
                  ) : (
                    tier.cta
                  )}
                </Button>

                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>

        {/* Pay-As-You-Go Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Pay As You Go
            </h2>
            <p className="text-lg text-gray-600">
              Perfect for occasional use. Buy certificates in bulk and save.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { quantity: 1, price: 5, description: 'Single certificate' },
              { quantity: 10, price: 45, description: '10% discount' },
              { quantity: 100, price: 400, description: '20% discount' },
            ].map((option) => {
              const isLoading = loading === `payg-${option.quantity}`;
              const perCertificate = option.price / option.quantity;
              
              return (
                <Card key={option.quantity} className="p-6 text-center">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {option.quantity} Certificate{option.quantity > 1 ? 's' : ''}
                  </h3>
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-blue-600">
                      ${option.price}
                    </span>
                    <p className="text-gray-600">
                      ${perCertificate.toFixed(2)} per certificate
                    </p>
                  </div>
                  <p className="text-gray-600 mb-6">{option.description}</p>
                  <Button
                    onClick={() => handlePayAsYouGo(option.quantity)}
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : (
                      `Buy ${option.quantity} Certificate${option.quantity > 1 ? 's' : ''}`
                    )}
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-16 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Everything you need to secure your digital assets
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center gap-4">
              <Shield className="w-12 h-12 text-blue-600" />
              <h3 className="text-xl font-semibold text-gray-900">C2PA Standard</h3>
              <p className="text-gray-600">
                Industry-leading cryptographic provenance trusted by Adobe, Microsoft, and more
              </p>
            </div>
            <div className="flex flex-col items-center gap-4">
              <Zap className="w-12 h-12 text-purple-600" />
              <h3 className="text-xl font-semibold text-gray-900">Instant Verification</h3>
              <p className="text-gray-600">
                Anyone can verify your certificates instantly with our public verification portal
              </p>
            </div>
            <div className="flex flex-col items-center gap-4">
              <Users className="w-12 h-12 text-green-600" />
              <h3 className="text-xl font-semibold text-gray-900">Team Ready</h3>
              <p className="text-gray-600">
                Built for collaboration with team management and shared billing
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
