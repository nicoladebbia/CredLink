# Investigator UI - Watermark Hint Components

## Watermark Hint UI Implementation

### React Components for Watermark Hints
```typescript
import React, { useState, useCallback, useMemo } from 'react';
import { WatermarkHint, TenantWatermarkConfig } from '../core/watermark-config';

interface WatermarkHintChipProps {
  hint: WatermarkHint | null;
  c2paStatus: 'verified' | 'failed' | 'unknown';
  tenantConfig: TenantWatermarkConfig;
  onDismiss?: () => void;
  onLearnMore?: () => void;
  className?: string;
}

/**
 * Watermark Hint Chip - Shows watermark detection status
 * STRICTLY displays as "hint only" - never as provenance
 */
export const WatermarkHintChip: React.FC<WatermarkHintChipProps> = ({
  hint,
  c2paStatus,
  tenantConfig,
  onDismiss,
  onLearnMore,
  className = ''
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Determine if hint should be shown
  const shouldShowHint = useMemo(() => {
    if (!tenantConfig.enabled) return false;
    if (!hint) return false;
    if (hint.confidence < tenantConfig.sensitivity) return false;
    if (c2paStatus === 'unknown' && tenantConfig.ui?.requireC2PA) return false;
    return true;
  }, [hint, tenantConfig, c2paStatus]);

  // Don't render if hint shouldn't be shown
  if (!shouldShowHint) {
    return null;
  }

  // Determine chip color and text based on confidence
  const chipConfig = useMemo(() => {
    if (hint!.confidence >= 0.8) {
      return {
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        icon: '💧',
        text: 'WM Hint'
      };
    } else if (hint!.confidence >= 0.6) {
      return {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: '💧',
        text: 'WM Hint'
      };
    } else {
      return {
        color: 'bg-gray-100 text-gray-600 border-gray-200',
        icon: '💧',
        text: 'WM Hint'
      };
    }
  }, [hint]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleLearnMore = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onLearnMore?.();
  }, [onLearnMore]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss?.();
  }, [onDismiss]);

  return (
    <div className={`inline-flex items-center ${className}`}>
      <div
        className={`
          relative inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
          border cursor-pointer transition-all duration-200
          ${chipConfig.color}
          ${isHovered ? 'shadow-md' : 'shadow-sm'}
        `}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setShowDetails(!showDetails)}
      >
        <span className="mr-1">{chipConfig.icon}</span>
        <span>{chipConfig.text}</span>
        
        {/* Confidence indicator */}
        <span className="ml-1 text-xs opacity-75">
          {Math.round(hint!.confidence * 100)}%
        </span>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="ml-1 hover:opacity-70 transition-opacity"
            title="Dismiss hint"
          >
            ✕
          </button>
        )}

        {/* Hover tooltip */}
        {isHovered && !showDetails && (
          <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50">
            <div className="font-semibold mb-1">Watermark Hint</div>
            <div className="mb-2">
              Watermark detected with {Math.round(hint!.confidence * 100)}% confidence.
              This is an <strong>investigative hint only</strong>, not cryptographic provenance.
            </div>
            <div className="text-gray-300">
              <div>Profile: {hint!.profile}</div>
              <div>Detected: {hint!.detectedAt.toLocaleTimeString()}</div>
              <div>Binding: {hint!.payloadBindOk ? '✓ Valid' : '✗ Invalid'}</div>
            </div>
            <div className="absolute bottom-0 left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        )}
      </div>

      {/* Details panel */}
      {showDetails && (
        <WatermarkHintDetails
          hint={hint!}
          c2paStatus={c2paStatus}
          onClose={() => setShowDetails(false)}
          onLearnMore={onLearnMore}
        />
      )}
    </div>
  );
};

interface WatermarkHintDetailsProps {
  hint: WatermarkHint;
  c2paStatus: 'verified' | 'failed' | 'unknown';
  onClose: () => void;
  onLearnMore?: () => void;
}

/**
 * Detailed watermark hint information panel
 */
export const WatermarkHintDetails: React.FC<WatermarkHintDetailsProps> = ({
  hint,
  c2paStatus,
  onClose,
  onLearnMore
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Watermark Hint Details</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Warning banner */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <span className="text-yellow-600 mr-2">⚠️</span>
              <div>
                <div className="font-medium text-yellow-800">Investigative Hint Only</div>
                <div className="text-sm text-yellow-700 mt-1">
                  This watermark is a hint that may help cluster variants, not cryptographic provenance.
                  Watermarks can be removed or forged.
                </div>
              </div>
            </div>
          </div>

          {/* Detection results */}
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm font-medium text-gray-600">Detection Status</span>
              <span className={`text-sm font-medium ${
                hint.confidence >= 0.8 ? 'text-green-600' :
                hint.confidence >= 0.6 ? 'text-yellow-600' : 'text-gray-600'
              }`}>
                {hint.confidence >= 0.8 ? 'High Confidence' :
                 hint.confidence >= 0.6 ? 'Medium Confidence' : 'Low Confidence'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm font-medium text-gray-600">Confidence Score</span>
              <span className="text-sm text-gray-900">{Math.round(hint.confidence * 100)}%</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm font-medium text-gray-600">Watermark Profile</span>
              <span className="text-sm text-gray-900">{hint.profile}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm font-medium text-gray-600">Payload Version</span>
              <span className="text-sm text-gray-900">v{hint.payloadVersion}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm font-medium text-gray-600">Manifest Binding</span>
              <span className={`text-sm font-medium ${
                hint.payloadBindOk ? 'text-green-600' : 'text-red-600'
              }`}>
                {hint.payloadBindOk ? '✓ Valid' : '✗ Invalid'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm font-medium text-gray-600">C2PA Status</span>
              <span className={`text-sm font-medium ${
                c2paStatus === 'verified' ? 'text-green-600' :
                c2paStatus === 'failed' ? 'text-red-600' : 'text-gray-600'
              }`}>
                {c2paStatus === 'verified' ? '✓ Verified' :
                 c2paStatus === 'failed' ? '✗ Failed' : 'Unknown'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-gray-600">Detected At</span>
              <span className="text-sm text-gray-900">
                {new Date(hint.detectedAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Transform history */}
          {hint.transformHistory && hint.transformHistory.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium text-gray-600 mb-2">Transform History</div>
              <div className="bg-gray-50 rounded p-2">
                {hint.transformHistory.map((transform, index) => (
                  <div key={index} className="text-xs text-gray-600 py-1">
                    • {transform.replace(/[<>]/g, '')} {/* SECURITY: XSS prevention - sanitize transform names */}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={onLearnMore}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Learn More About Watermarks
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface WatermarkSettingsProps {
  tenantConfig: TenantWatermarkConfig;
  onConfigChange: (config: TenantWatermarkConfig) => void;
  disabled?: boolean;
}

/**
 * Watermark settings panel for tenant configuration
 */
export const WatermarkSettings: React.FC<WatermarkSettingsProps> = ({
  tenantConfig,
  onConfigChange,
  disabled = false
}) => {
  const [localConfig, setLocalConfig] = useState(tenantConfig);

  const handleEnableToggle = useCallback((enabled: boolean) => {
    const newConfig = { ...localConfig, enabled };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  }, [localConfig, onConfigChange]);

  const handleProfileChange = useCallback((profile: TenantWatermarkConfig['profile']) => {
    const newConfig = { ...localConfig, profile };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  }, [localConfig, onConfigChange]);

  const handleSensitivityChange = useCallback((sensitivity: number) => {
    // SECURITY: Added input validation to prevent invalid sensitivity values
    if (typeof sensitivity !== 'number' || isNaN(sensitivity)) {
      return; // Invalid input, ignore
    }
    
    // Clamp sensitivity to valid range [0, 1]
    const clampedSensitivity = Math.max(0, Math.min(1, sensitivity));
    
    const newConfig = { ...localConfig, sensitivity: clampedSensitivity };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  }, [localConfig, onConfigChange]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Watermark Hints Settings</h3>
      
      {/* Enable/Disable */}
      <div className="mb-6">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={localConfig.enabled}
            onChange={(e) => handleEnableToggle(e.target.checked)}
            disabled={disabled}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-2 text-sm font-medium text-gray-700">
            Enable watermark hints
          </span>
        </label>
        <p className="mt-1 text-xs text-gray-500">
          Show investigative watermark hints in the verification interface
        </p>
      </div>

      {/* Profile selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Watermark Profile
        </label>
        <select
          value={localConfig.profile}
          onChange={(e) => handleProfileChange(e.target.value as TenantWatermarkConfig['profile'])}
          disabled={disabled || !localConfig.enabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="off">Off</option>
          <option value="dct_ecc_v1">DCT with ECC (v1)</option>
          <option value="latent_x">Latent Diffusion (Research Only)</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Select the watermark detection profile to use
        </p>
      </div>

      {/* Sensitivity slider */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Detection Sensitivity
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={localConfig.sensitivity}
            onChange={(e) => handleSensitivityChange(parseFloat(e.target.value))}
            disabled={disabled || !localConfig.enabled}
            className="flex-1"
          />
          <span className="text-sm text-gray-600 w-12 text-right">
            {Math.round(localConfig.sensitivity * 100)}%
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Minimum confidence threshold for showing hints
        </p>
      </div>

      {/* Warning banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start">
          <span className="text-amber-600 mr-2">ℹ️</span>
          <div>
            <div className="font-medium text-amber-800">Important Notice</div>
            <div className="text-sm text-amber-700 mt-1">
              Watermark hints are investigative tools only and never replace cryptographic 
              provenance from C2PA Content Credentials. They may be removed or forged.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface WatermarkToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  className?: string;
}

/**
 * Global toggle for hiding/showing all watermark hints
 */
export const WatermarkToggle: React.FC<WatermarkToggleProps> = ({
  enabled,
  onToggle,
  className = ''
}) => {
  return (
    <div className={`flex items-center ${className}`}>
      <label className="flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="ml-2 text-sm text-gray-700">Show watermark hints</span>
      </label>
    </div>
  );
};
```

### Integration with Investigator Interface
```typescript
import React, { useState, useCallback, useMemo } from 'react';
import { WatermarkHint, TenantWatermarkConfig } from '../core/watermark-config';
import { WatermarkHintChip, WatermarkSettings, WatermarkToggle } from './investigator-watermark-ui';

interface InvestigatorWatermarkIntegrationProps {
  // Asset data
  assetData: ArrayBuffer;
  manifestHash: string;
  c2paStatus: 'verified' | 'failed' | 'unknown';
  
  // Configuration
  tenantConfig: TenantWatermarkConfig;
  onTenantConfigChange: (config: TenantWatermarkConfig) => void;
  
  // Watermark detection result
  watermarkHint: WatermarkHint | null;
  
  // Actions
  onDismissHint?: () => void;
  onLearnMore?: () => void;
  
  // UI state
  showSettings?: boolean;
  onToggleSettings?: () => void;
}

/**
 * Main integration component for watermark hints in investigator interface
 */
export const InvestigatorWatermarkIntegration: React.FC<InvestigatorWatermarkIntegrationProps> = ({
  assetData,
  manifestHash,
  c2paStatus,
  tenantConfig,
  onTenantConfigChange,
  watermarkHint,
  onDismissHint,
  onLearnMore,
  showSettings = false,
  onToggleSettings
}) => {
  const [globalShowHints, setGlobalShowHints] = useState(true);
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set());

  // Check if hint should be shown
  const shouldShowHint = useMemo(() => {
    if (!globalShowHints) return false;
    if (!tenantConfig.enabled) return false;
    if (!watermarkHint) return false;
    if (watermarkHint.confidence < tenantConfig.sensitivity) return false;
    if (c2paStatus === 'unknown' && tenantConfig.ui?.requireC2PA) return false;
    
    // Check if this hint has been dismissed
    const hintKey = `${manifestHash}-${watermarkHint.profile}`;
    if (dismissedHints.has(hintKey)) return false;
    
    return true;
  }, [globalShowHints, tenantConfig, watermarkHint, c2paStatus, manifestHash, dismissedHints]);

  // Handle hint dismissal
  const handleDismissHint = useCallback(() => {
    if (watermarkHint) {
      const hintKey = `${manifestHash}-${watermarkHint.profile}`;
      setDismissedHints(prev => new Set([...prev, hintKey]));
    }
    onDismissHint?.();
  }, [watermarkHint, manifestHash, onDismissHint]);

  // Handle tenant config changes
  const handleTenantConfigChange = useCallback((newConfig: TenantWatermarkConfig) => {
    onTenantConfigChange(newConfig);
  }, [onTenantConfigChange]);

  return (
    <div className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-gray-900">Watermark Analysis</h3>
          <WatermarkToggle
            enabled={globalShowHints}
            onToggle={setGlobalShowHints}
          />
        </div>
        
        {onToggleSettings && (
          <button
            onClick={onToggleSettings}
            className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            {showSettings ? 'Hide Settings' : 'Show Settings'}
          </button>
        )}
      </div>

      {/* Status overview */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* C2PA Status */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-600 mb-1">C2PA Status</div>
            <div className={`text-lg font-semibold ${
              c2paStatus === 'verified' ? 'text-green-600' :
              c2paStatus === 'failed' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {c2paStatus === 'verified' ? '✓ Verified' :
               c2paStatus === 'failed' ? '✗ Failed' : 'Unknown'}
            </div>
          </div>

          {/* Watermark Status */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-600 mb-1">Watermark Hint</div>
            <div className="text-lg font-semibold text-gray-900">
              {watermarkHint ? 
                `${Math.round(watermarkHint.confidence * 100)}%` : 
                'Not Detected'
              }
            </div>
          </div>

          {/* Binding Status */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-600 mb-1">Binding</div>
            <div className={`text-lg font-semibold ${
              watermarkHint?.payloadBindOk ? 'text-green-600' : 'text-gray-600'
            }`}>
              {watermarkHint?.payloadBindOk ? '✓ Valid' : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Watermark hint chip */}
      {shouldShowHint && (
        <div className="flex items-center justify-center">
          <WatermarkHintChip
            hint={watermarkHint}
            c2paStatus={c2paStatus}
            tenantConfig={tenantConfig}
            onDismiss={handleDismissHint}
            onLearnMore={onLearnMore}
          />
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <WatermarkSettings
          tenantConfig={tenantConfig}
          onConfigChange={handleTenantConfigChange}
        />
      )}

      {/* Educational content */}
      {!shouldShowHint && tenantConfig.enabled && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <span className="text-blue-600 mr-2">ℹ️</span>
            <div>
              <div className="font-medium text-blue-800">No Watermark Hint Detected</div>
              <div className="text-sm text-blue-700 mt-1">
                No watermark hint was detected or the confidence is below your sensitivity threshold. 
                This is normal - watermarks are optional and may be removed during processing.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

### CSS Styling
```css
/* Watermark hint chip animations */
.watermark-hint-chip {
  transition: all 0.2s ease-in-out;
}

.watermark-hint-chip:hover {
  transform: translateY(-1px);
}

/* Tooltip positioning */
.watermark-tooltip {
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Confidence indicator colors */
.watermark-confidence-high {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.watermark-confidence-medium {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}

.watermark-confidence-low {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
}

/* Settings panel */
.watermark-settings {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: white;
}

/* Toggle switch */
.watermark-toggle input[type="checkbox"] {
  @apply w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500;
}

/* Responsive design */
@media (max-width: 768px) {
  .watermark-status-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
```

### Export all components
```typescript
export {
  WatermarkHintChip,
  WatermarkHintDetails,
  WatermarkSettings,
  WatermarkToggle,
  InvestigatorWatermarkIntegration
};

export type {
  WatermarkHintChipProps,
  WatermarkHintDetailsProps,
  WatermarkSettingsProps,
  WatermarkToggleProps,
  InvestigatorWatermarkIntegrationProps
};
```
