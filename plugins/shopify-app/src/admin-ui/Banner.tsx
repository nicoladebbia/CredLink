/**
 * C2 Concierge Admin Banner
 * Shows remote-only policy status and information
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, Alert, Spinner } from '@shopify/polaris';
import { WarningIcon, InfoIcon, CheckCircleIcon } from '@shopify/polaris-icons';

interface BannerProps {
  shopDomain: string;
  remoteOnly: boolean;
  enforcedReason?: string;
  onRetroSign?: () => void;
}

export const C2Banner: React.FC<BannerProps> = ({
  shopDomain,
  remoteOnly,
  enforcedReason,
  onRetroSign
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [retroSignResult, setRetroSignResult] = useState<any>(null);

  const getReasonText = (reason: string): string => {
    switch (reason) {
      case 'cdn_transformations':
        return 'Shopify CDN serves WebP/AVIF formats automatically based on user agent.';
      case 'image_optimizer_detected':
        return 'Image optimizer app detected that may modify provenance.';
      case 'format_conversion':
        return 'Automatic image format conversion detected.';
      default:
        return 'Potential image transformation detected that could affect provenance.';
    }
  };

  const handleRetroSign = async () => {
    if (!onRetroSign) return;

    setIsLoading(true);
    try {
      const result = await onRetroSign();
      setRetroSignResult(result);
    } catch (error) {
      console.error('Retro-sign failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      {remoteOnly ? (
        <Alert
          icon={WarningIcon}
          title="Remote-Only enforced to protect C2PA survival"
          tone="warning"
        >
          <div style={{ marginBottom: '10px' }}>
            <strong>Reason:</strong> {getReasonText(enforcedReason || 'unknown')}
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong>Action:</strong> Remote manifests are always injected. Embeds are disabled to ensure provenance survival.
          </div>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Badge tone="warning">Remote-Only Mode</Badge>
            <Button
              variant="primary"
              onClick={handleRetroSign}
              disabled={isLoading}
              icon={isLoading ? Spinner : undefined}
            >
              {isLoading ? 'Processing...' : 'Retro-Sign Existing Media'}
            </Button>
          </div>

          {retroSignResult && (
            <div style={{ marginTop: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '4px' }}>
              <strong>Retro-sign Results:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                <li>Products processed: {retroSignResult.processed || 0}</li>
                <li>Images signed: {retroSignResult.signed || 0}</li>
                <li>Failed: {retroSignResult.failed || 0}</li>
              </ul>
            </div>
          )}
        </Alert>
      ) : (
        <Alert
          icon={CheckCircleIcon}
          title="C2 Concierge Active"
          tone="success"
        >
          <div style={{ marginBottom: '10px' }}>
            <strong>Status:</strong> Your products are being signed with C2PA provenance.
          </div>
          <div style={{ marginBottom: '15px' }}>
            <strong>Policy:</strong> Standard mode - provenance embedded in images.
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Badge tone="success">Active</Badge>
            <Badge tone="info">Standard Mode</Badge>
          </div>
        </Alert>
      )}

      <Card sectioned title="Provenance Information">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          <div>
            <strong>Shop Domain:</strong><br />
            <span style={{ color: '#637381' }}>{shopDomain}</span>
          </div>
          <div>
            <strong>Policy Mode:</strong><br />
            <Badge tone={remoteOnly ? 'warning' : 'success'}>
              {remoteOnly ? 'Remote-Only' : 'Standard'}
            </Badge>
          </div>
          <div>
            <strong>Badge Display:</strong><br />
            <Badge tone="info">Enabled</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default C2Banner;
