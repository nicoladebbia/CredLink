# Investigator UX Interface Implementation

## Overview
Fast, intuitive investigator interface for collision review with side-by-side image comparison, similarity visualization, lineage diff display, and efficient disposition controls. Designed for sub-60s time-to-disposition with keyboard shortcuts and batch operations.

## Dependencies
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.3.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-slider": "^1.1.2",
    "@radix-ui/react-select": "^1.2.2",
    "lucide-react": "^0.294.0",
    "framer-motion": "^10.16.16",
    "react-hotkeys-hook": "^4.4.1",
    "react-virtualized": "^9.22.5",
    "recharts": "^2.8.0",
    "date-fns": "^2.30.0",
    "react-dom-confetti": "^0.2.0",
    "react-intersection-observer": "^9.5.3",
    "react-window": "^1.8.8"
  }
}
```

## Core Implementation

### Investigator Interface Components
```typescript
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useHotkeys } from 'react-hotkeys-hook';
import { FixedSizeList as List } from 'react-window';
import { 
  Eye, 
  EyeOff, 
  Scale, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Clock,
  Filter,
  Download,
  Zap,
  Target,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Save,
  Share,
  Shield,
  Activity,
  TrendingUp,
  BarChart3
} from 'lucide-react';

export interface InvestigatorProps {
  collisionId: string;
  collisionData: CollisionResult;
  onDisposition: (collisionId: string, disposition: CollisionDisposition) => void;
  onBatchDisposition: (collisionIds: string[], disposition: CollisionDisposition) => void;
  preferences: InvestigatorPreferences;
  metrics: InvestigatorMetrics;
  isLoading?: boolean;
  error?: string;
}

export interface CollisionDisposition {
  label: 'benign_variant' | 'suspicious' | 'not_similar' | 'false_positive' | 'escalate';
  notes?: string;
  confidence: number;
  escalate?: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  reviewerId?: string;
  timestamp: Date;
}

export interface InvestigatorPreferences {
  theme: 'light' | 'dark' | 'auto';
  autoAdvance: boolean;
  showSimilarityBars: boolean;
  showLineageDiff: boolean;
  keyboardShortcuts: boolean;
  imageQuality: 'low' | 'medium' | 'high' | 'ultra';
  layout: 'split' | 'overlay' | 'blink' | 'carousel';
  animationSpeed: 'slow' | 'normal' | 'fast' | 'disabled';
  soundEnabled: boolean;
  notifications: boolean;
  autoSave: boolean;
  batchMode: boolean;
  showMetrics: boolean;
  compactMode: boolean;
}

export interface InvestigatorMetrics {
  totalReviewed: number;
  averageTimeToDisposition: number;
  dispositionDistribution: Record<string, number>;
  accuracyScore: number;
  sessionDuration: number;
  reviewRate: number; // reviews per hour
  errorRate: number;
  escalationRate: number;
  batchEfficiency: number;
  keystrokesSaved: number;
  timeSaved: number; // minutes saved with shortcuts
}

export interface CollisionResult {
  id: string;
  primaryAsset: AssetData;
  conflictingAssets: AssetData[];
  similarityScore: number;
  confidenceScore: number;
  matchType: 'pdq' | 'embedding' | 'ensemble';
  metadata: {
    detectedAt: Date;
    algorithm: string;
    threshold: number;
    processingTime: number;
    lineageDiff?: LineageDiff;
  };
  status: 'pending' | 'reviewing' | 'completed' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  history: DispositionHistory[];
}

export interface AssetData {
  id: string;
  url: string;
  thumbnailUrl?: string;
  metadata: Record<string, any>;
  hash: string;
  embedding?: number[];
  createdAt: Date;
  source: string;
  classification?: string;
}

export interface LineageDiff {
  added: string[];
  removed: string[];
  modified: Array<{ path: string; changes: string[] }>;
  similarity: number;
}

export interface DispositionHistory {
  timestamp: Date;
  reviewerId: string;
  disposition: CollisionDisposition;
  notes?: string;
}

export interface PerformanceMetrics {
  renderTime: number;
  imageLoadTime: number;
  animationFrameRate: number;
  memoryUsage: number;
  networkLatency: number;
}
```

### Core Investigator Component
```typescript
export const InvestigatorInterface: React.FC<InvestigatorProps> = ({
  collisionId,
  collisionData,
  onDisposition,
  onBatchDisposition,
  preferences,
  metrics,
  isLoading = false,
  error
}) => {
  const [currentDisposition, setCurrentDisposition] = useState<CollisionDisposition | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState(0.5);
  const [showMetrics, setShowMetrics] = useState(preferences.showMetrics);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    imageLoadTime: 0,
    animationFrameRate: 60,
    memoryUsage: 0,
    networkLatency: 0
  });

  const listRef = useRef<List>(null);
  const animationControls = useAnimation();
  const startTimeRef = useRef<Date>(new Date());

  // Performance monitoring
  useEffect(() => {
    const measurePerformance = () => {
      const startTime = performance.now();
      
      requestAnimationFrame(() => {
        const endTime = performance.now();
        const renderTime = endTime - startTime;
        
        setPerformanceMetrics(prev => ({
          ...prev,
          renderTime,
          memoryUsage: (performance as any).memory?.usedJSHeapSize || 0
        }));
      });
    };

    const interval = setInterval(measurePerformance, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useHotkeys('left', () => navigateCollision(-1), [currentIndex]);
  useHotkeys('right', () => navigateCollision(1), [currentIndex]);
  useHotkeys('space', () => setIsPlaying(prev => !prev), [isPlaying]);
  useHotkeys('b', () => handleDisposition('benign_variant'), []);
  useHotkeys('s', () => handleDisposition('suspicious'), []);
  useHotkeys('n', () => handleDisposition('not_similar'), []);
  useHotkeys('f', () => handleDisposition('false_positive'), []);
  useHotkeys('e', () => handleDisposition('escalate'), []);

  const navigateCollision = useCallback((direction: number) => {
    const newIndex = Math.max(0, Math.min(collisionData.conflictingAssets.length - 1, currentIndex + direction));
    setCurrentIndex(newIndex);
    
    if (listRef.current) {
      listRef.current.scrollToItem(newIndex);
    }
  }, [currentIndex, collisionData.conflictingAssets.length]);

  const handleDisposition = useCallback((label: CollisionDisposition['label']) => {
    const disposition: CollisionDisposition = {
      label,
      notes: notes.trim() || undefined,
      confidence,
      escalate: label === 'escalate',
      priority: collisionData.priority,
      tags: collisionData.tags,
      timestamp: new Date()
    };

    setCurrentDisposition(disposition);
    onDisposition(collisionId, disposition);

    if (preferences.autoAdvance && currentIndex < collisionData.conflictingAssets.length - 1) {
      navigateCollision(1);
    }
  }, [notes, confidence, collisionId, collisionData.priority, collisionData.tags, onDisposition, preferences.autoAdvance, currentIndex, navigateCollision]);

  const handleBatchDisposition = useCallback((label: CollisionDisposition['label']) => {
    if (selectedAssets.length === 0) return;

    const disposition: CollisionDisposition = {
      label,
      notes: notes.trim() || undefined,
      confidence,
      escalate: label === 'escalate',
      priority: collisionData.priority,
      tags: collisionData.tags,
      timestamp: new Date()
    };

    onBatchDisposition(selectedAssets, disposition);
    setSelectedAssets([]);
  }, [selectedAssets, notes, confidence, collisionData.priority, collisionData.tags, onBatchDisposition]);

  const currentAsset = collisionData.conflictingAssets[currentIndex];

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (currentIndex < collisionData.conflictingAssets.length - 1) {
        navigateCollision(1);
      } else {
        setIsPlaying(false);
      }
    }, 2000); // 2 seconds per image

    return () => clearInterval(interval);
  }, [isPlaying, currentIndex, collisionData.conflictingAssets.length, navigateCollision]);

  // Auto-save functionality
  useEffect(() => {
    if (!preferences.autoSave || !currentDisposition) return;

    const timeout = setTimeout(() => {
      // Auto-save logic would go here
      console.log('Auto-saving disposition:', currentDisposition);
    }, 5000); // Save after 5 seconds of inactivity

    return () => clearTimeout(timeout);
  }, [currentDisposition, preferences.autoSave]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="investigator-interface"
      data-theme={preferences.theme}
    >
      {/* Header with metrics and controls */}
      <HeaderComponent 
        metrics={metrics}
        performanceMetrics={performanceMetrics}
        showMetrics={showMetrics}
        onToggleMetrics={() => setShowMetrics(!showMetrics)}
        preferences={preferences}
      />

      {/* Main content area */}
      <div className="main-content">
        {/* Image comparison area */}
        <ImageComparisonArea
          primaryAsset={collisionData.primaryAsset}
          currentAsset={currentAsset}
          layout={preferences.layout}
          imageQuality={preferences.imageQuality}
          animationSpeed={preferences.animationSpeed}
          onImageLoad={(loadTime) => setPerformanceMetrics(prev => ({ ...prev, imageLoadTime: loadTime }))}
        />

        {/* Controls and disposition panel */}
        <ControlsPanel
          currentDisposition={currentDisposition}
          notes={notes}
          confidence={confidence}
          onNotesChange={setNotes}
          onConfidenceChange={setConfidence}
          onDisposition={handleDisposition}
          onBatchDisposition={handleBatchDisposition}
          selectedAssets={selectedAssets}
          preferences={preferences}
          collisionData={collisionData}
        />
      </div>

      {/* Asset list/queue */}
      <AssetQueue
        assets={collisionData.conflictingAssets}
        currentIndex={currentIndex}
        selectedAssets={selectedAssets}
        onSelectAsset={(assetId) => setSelectedAssets(prev => 
          prev.includes(assetId) 
            ? prev.filter(id => id !== assetId)
            : [...prev, assetId]
        )}
        onNavigate={navigateCollision}
        listRef={listRef}
        compactMode={preferences.compactMode}
      />

      {/* Navigation controls */}
      <NavigationControls
        currentIndex={currentIndex}
        totalAssets={collisionData.conflictingAssets.length}
        isPlaying={isPlaying}
        onNavigate={navigateCollision}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        onReset={() => setCurrentIndex(0)}
        preferences={preferences}
      />
    </motion.div>
  );
};
  sessionDuration: number;
}

// Main Investigator Interface Component
export const InvestigatorInterface: React.FC<InvestigatorProps> = ({
  collisionId,
  collisionData,
  onDisposition,
  onBatchDisposition,
  preferences
}) => {
  const [currentView, setCurrentView] = useState<'comparison' | 'details' | 'history'>('comparison');
  const [selectedDisposition, setSelectedDisposition] = useState<CollisionDisposition | null>(null);
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState(0.8);
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<InvestigatorMetrics>({
    totalReviewed: 0,
    averageTimeToDisposition: 0,
    dispositionDistribution: {},
    accuracyScore: 0,
    sessionDuration: 0
  });

  // Keyboard shortcuts for fast disposition
  useHotkeys('b', () => handleQuickDisposition('benign_variant'), [collisionId]);
  useHotkeys('s', () => handleQuickDisposition('suspicious'), [collisionId]);
  useHotkeys('n', () => handleQuickDisposition('not_similar'), [collisionId]);
  useHotkeys('f', () => handleQuickDisposition('false_positive'), [collisionId]);
  useHotkeys('space', () => toggleImageComparison(), []);
  useHotkeys('enter', () => submitDisposition(), [selectedDisposition]);

  /**
   * Handle quick disposition with keyboard
   */
  const handleQuickDisposition = useCallback((label: CollisionDisposition['label']) => {
    setSelectedDisposition({
      label,
      confidence,
      notes
    });
    
    if (preferences.autoAdvance) {
      setTimeout(() => submitDisposition(), 100);
    }
  }, [confidence, notes, preferences.autoAdvance]);

  /**
   * Submit disposition
   */
  const submitDisposition = useCallback(async () => {
    if (!selectedDisposition) {
      return;
    }

    setIsLoading(true);
    const startTime = performance.now();

    try {
      await onDisposition(collisionId, {
        ...selectedDisposition,
        notes,
        confidence
      });

      // Update metrics
      const dispositionTime = performance.now() - startTime;
      setMetrics(prev => ({
        ...prev,
        totalReviewed: prev.totalReviewed + 1,
        averageTimeToDisposition: (prev.averageTimeToDisposition * prev.totalReviewed + dispositionTime) / (prev.totalReviewed + 1),
        dispositionDistribution: {
          ...prev.dispositionDistribution,
          [selectedDisposition.label]: (prev.dispositionDistribution[selectedDisposition.label] || 0) + 1
        }
      }));

      // Reset form for next collision
      setSelectedDisposition(null);
      setNotes('');
      setConfidence(0.8);

    } catch (error) {
      console.error('Failed to submit disposition:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDisposition, notes, confidence, collisionId, onDisposition]);

  /**
   * Toggle image comparison mode
   */
  const toggleImageComparison = useCallback(() => {
    const modes: Array<'split' | 'overlay' | 'blink'> = ['split', 'overlay', 'blink'];
    const currentIndex = modes.indexOf(preferences.layout);
    const nextIndex = (currentIndex + 1) % modes.length;
    // Update preferences through callback
  }, [preferences.layout]);

  return (
    <div className={`investigator-interface theme-${preferences.theme}`}>
      {/* Header with metrics and controls */}
      <InvestigatorHeader 
        metrics={metrics}
        collisionData={collisionData}
        onBatchDisposition={onBatchDisposition}
      />

      {/* Main content area */}
      <div className="investigator-content">
        {/* Left sidebar - collision list and filters */}
        <CollisionSidebar 
          currentCollisionId={collisionId}
          filters={{}}
          onCollisionSelect={(id) => {/* Navigate to collision */}}
        />

        {/* Center - main comparison view */}
        <div className="main-view">
          {currentView === 'comparison' && (
            <ImageComparisonView
              primaryAsset={collisionData.primaryAsset}
              conflictingAssets={collisionData.conflictingAssets}
              layout={preferences.layout}
              showSimilarityBars={preferences.showSimilarityBars}
              onAssetSelect={(asset) => {/* Show asset details */}}
            />
          )}

          {currentView === 'details' && (
            <CollisionDetailsView
              collisionData={collisionData}
              showLineageDiff={preferences.showLineageDiff}
            />
          )}

          {currentView === 'history' && (
            <CollisionHistoryView
              collisionId={collisionId}
              onHistorySelect={(item) => {/* Load historical collision */}}
            />
          )}
        </div>

        {/* Right sidebar - disposition controls */}
        <DispositionSidebar
          selectedDisposition={selectedDisposition}
          onDispositionChange={setSelectedDisposition}
          notes={notes}
          onNotesChange={setNotes}
          confidence={confidence}
          onConfidenceChange={setConfidence}
          onSubmit={submitDisposition}
          isLoading={isLoading}
          shortcuts={preferences.keyboardShortcuts}
        />
      </div>

      {/* Footer with keyboard shortcuts hint */}
      {preferences.keyboardShortcuts && (
        <KeyboardShortcutsBar />
      )}
    </div>
  );
};
```

### Image Comparison View Component
```typescript
interface ImageComparisonViewProps {
  primaryAsset: CollisionResult['primaryAsset'];
  conflictingAssets: CollisionResult['conflictingAssets'];
  layout: 'split' | 'overlay' | 'blink';
  showSimilarityBars: boolean;
  onAssetSelect: (asset: any) => void;
}

export const ImageComparisonView: React.FC<ImageComparisonViewProps> = ({
  primaryAsset,
  conflictingAssets,
  layout,
  showSimilarityBars,
  onAssetSelect
}) => {
  const [selectedConflictIndex, setSelectedConflictIndex] = useState(0);
  const [blinkState, setBlinkState] = useState<'primary' | 'conflict'>('primary');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);

  const selectedConflict = conflictingAssets[selectedConflictIndex];

  // Blink mode animation
  useEffect(() => {
    if (layout === 'blink') {
      const interval = setInterval(() => {
        setBlinkState(prev => prev === 'primary' ? 'conflict' : 'primary');
      }, 500);
      return () => clearInterval(interval);
    }
  }, [layout]);

  return (
    <div className={`image-comparison-view layout-${layout}`}>
      {/* Comparison controls */}
      <div className="comparison-controls">
        <div className="conflict-selector">
          <label>Conflicting Asset:</label>
          <select 
            value={selectedConflictIndex} 
            onChange={(e) => setSelectedConflictIndex(parseInt(e.target.value))}
          >
            {conflictingAssets.map((conflict, index) => (
              <option key={conflict.assetId} value={index}>
                {conflict.assetId} ({(conflict.similarity.combined * 100).toFixed(1)}% similar)
              </option>
            ))}
          </select>
        </div>

        {layout === 'overlay' && (
          <div className="overlay-controls">
            <label>Overlay Opacity:</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
            />
          </div>
        )}
      </div>

      {/* Image display area */}
      <div className="image-display-area">
        {layout === 'split' && (
          <SplitImageView
            primaryAsset={primaryAsset}
            conflictingAsset={selectedConflict}
            showSimilarityBars={showSimilarityBars}
          />
        )}

        {layout === 'overlay' && (
          <OverlayImageView
            primaryAsset={primaryAsset}
            conflictingAsset={selectedConflict}
            overlayOpacity={overlayOpacity}
          />
        )}

        {layout === 'blink' && (
          <BlinkImageView
            primaryAsset={primaryAsset}
            conflictingAsset={selectedConflict}
            blinkState={blinkState}
          />
        )}
      </div>

      {/* Similarity analysis panel */}
      <SimilarityAnalysisPanel
        primaryAsset={primaryAsset}
        conflictingAsset={selectedConflict}
        showBars={showSimilarityBars}
      />
    </div>
  );
};

// Split view component
const SplitImageView: React.FC<{
  primaryAsset: any;
  conflictingAsset: any;
  showSimilarityBars: boolean;
}> = ({ primaryAsset, conflictingAsset, showSimilarityBars }) => {
  return (
    <div className="split-image-view">
      <div className="image-panel primary">
        <div className="image-header">
          <h3>Primary Asset</h3>
          <span className="asset-id">{primaryAsset.assetId}</span>
        </div>
        <div className="image-container">
          <img 
            src={primaryAsset.imageUrl} 
            alt="Primary asset"
            loading="lazy"
          />
        </div>
        {showSimilarityBars && (
          <div className="similarity-bars">
            <SimilarityBar label="PDQ" value={0.9} />
            <SimilarityBar label="Ensemble" value={0.85} />
            <SimilarityBar label="Embedding" value={0.92} />
          </div>
        )}
      </div>

      <div className="image-panel conflict">
        <div className="image-header">
          <h3>Conflicting Asset</h3>
          <span className="asset-id">{conflictingAsset.assetId}</span>
          <span className={`severity-badge ${conflictingAsset.conflictType.severity}`}>
            {conflictingAsset.conflictType.severity}
          </span>
        </div>
        <div className="image-container">
          <img 
            src={conflictingAsset.imageUrl} 
            alt="Conflicting asset"
            loading="lazy"
          />
        </div>
        {showSimilarityBars && (
          <div className="similarity-bars">
            <SimilarityBar label="PDQ" value={conflictingAsset.similarity.pdq} />
            <SimilarityBar label="Ensemble" value={conflictingAsset.similarity.ensemble || 0} />
            <SimilarityBar label="Embedding" value={conflictingAsset.similarity.embedding || 0} />
          </div>
        )}
      </div>
    </div>
  );
};

// Overlay view component
const OverlayImageView: React.FC<{
  primaryAsset: any;
  conflictingAsset: any;
  overlayOpacity: number;
}> = ({ primaryAsset, conflictingAsset, overlayOpacity }) => {
  return (
    <div className="overlay-image-view">
      <div className="image-container">
        <img 
          src={primaryAsset.imageUrl} 
          alt="Primary asset"
          className="base-image"
        />
        <img 
          src={conflictingAsset.imageUrl} 
          alt="Conflicting asset"
          className="overlay-image"
          style={{ opacity: overlayOpacity }}
        />
      </div>
      
      <div className="overlay-info">
        <div className="asset-info primary">
          <span className="label">Primary:</span>
          <span className="asset-id">{primaryAsset.assetId}</span>
        </div>
        <div className="asset-info conflict">
          <span className="label">Conflict:</span>
          <span className="asset-id">{conflictingAsset.assetId}</span>
          <span className={`severity-badge ${conflictingAsset.conflictType.severity}`}>
            {conflictingAsset.conflictType.severity}
          </span>
        </div>
      </div>
    </div>
  );
};

// Blink view component
const BlinkImageView: React.FC<{
  primaryAsset: any;
  conflictingAsset: any;
  blinkState: 'primary' | 'conflict';
}> = ({ primaryAsset, conflictingAsset, blinkState }) => {
  const currentAsset = blinkState === 'primary' ? primaryAsset : conflictingAsset;
  const currentLabel = blinkState === 'primary' ? 'Primary' : 'Conflict';

  return (
    <div className="blink-image-view">
      <div className="image-container">
        <AnimatePresence mode="wait">
          <motion.img
            key={blinkState}
            src={currentAsset.imageUrl}
            alt={`${currentLabel} asset`}
            className="blink-image"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          />
        </AnimatePresence>
      </div>
      
      <div className="blink-indicator">
        <div className={`indicator ${blinkState}`}>
          {currentLabel}: {currentAsset.assetId}
        </div>
      </div>
    </div>
  );
};
```

### Similarity Analysis Component
```typescript
interface SimilarityAnalysisPanelProps {
  primaryAsset: any;
  conflictingAsset: any;
  showBars: boolean;
}

export const SimilarityAnalysisPanel: React.FC<SimilarityAnalysisPanelProps> = ({
  primaryAsset,
  conflictingAsset,
  showBars
}) => {
  const similarityData = useMemo(() => ({
    pdq: {
      value: conflictingAsset.similarity.pdq,
      threshold: 0.85,
      label: 'PDQ Hash',
      description: 'Perceptual hash similarity'
    },
    ensemble: {
      value: conflictingAsset.similarity.ensemble || 0,
      threshold: 0.8,
      label: 'Ensemble',
      description: 'Multi-algorithm consensus'
    },
    embedding: {
      value: conflictingAsset.similarity.embedding || 0,
      threshold: 0.9,
      label: 'Embedding',
      description: 'Deep learning similarity'
    },
    combined: {
      value: conflictingAsset.similarity.combined,
      threshold: 0.85,
      label: 'Combined',
      description: 'Weighted overall similarity'
    }
  }), [conflictingAsset.similarity]);

  return (
    <div className="similarity-analysis-panel">
      <h3>Similarity Analysis</h3>
      
      {/* Overall similarity score */}
      <div className="overall-similarity">
        <div className="score-display">
          <span className="score-value">
            {(similarityData.combined.value * 100).toFixed(1)}%
          </span>
          <span className="score-label">Overall Similarity</span>
        </div>
        <div className="confidence-indicator">
          <Target className="w-5 h-5" />
          <span>Confidence: {(conflictingAsset.confidence * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Detailed similarity bars */}
      {showBars && (
        <div className="detailed-similarity">
          {Object.entries(similarityData).map(([key, data]) => (
            <div key={key} className="similarity-item">
              <div className="similarity-header">
                <span className="label">{data.label}</span>
                <span className="value">{(data.value * 100).toFixed(1)}%</span>
              </div>
              <div className="similarity-bar">
                <div 
                  className={`bar-fill ${data.value >= data.threshold ? 'above-threshold' : 'below-threshold'}`}
                  style={{ width: `${data.value * 100}%` }}
                />
                <div 
                  className="threshold-line"
                  style={{ left: `${data.threshold * 100}%` }}
                />
              </div>
              <div className="similarity-description">
                {data.description}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Conflict type information */}
      <div className="conflict-info">
        <h4>Conflict Analysis</h4>
        <div className={`conflict-type ${conflictingAsset.conflictType.severity}`}>
          <AlertTriangle className="w-4 h-4" />
          <span>{conflictingAsset.conflictType.type.replace('_', ' ')}</span>
          <span className="severity">{conflictingAsset.conflictType.severity}</span>
        </div>
        <p className="conflict-description">
          {conflictingAsset.conflictType.description}
        </p>
      </div>
    </div>
  );
};

// Similarity bar component
const SimilarityBar: React.FC<{
  label: string;
  value: number;
  threshold?: number;
}> = ({ label, value, threshold = 0.85 }) => {
  return (
    <div className="similarity-bar-item">
      <div className="bar-label">
        <span>{label}</span>
        <span className="bar-value">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="bar-container">
        <div 
          className={`bar-fill ${value >= threshold ? 'above' : 'below'}`}
          style={{ width: `${value * 100}%` }}
        />
        {threshold && (
          <div 
            className="threshold-marker"
            style={{ left: `${threshold * 100}%` }}
          />
        )}
      </div>
    </div>
  );
};
```

### Disposition Sidebar Component
```typescript
interface DispositionSidebarProps {
  selectedDisposition: CollisionDisposition | null;
  onDispositionChange: (disposition: CollisionDisposition) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  confidence: number;
  onConfidenceChange: (confidence: number) => void;
  onSubmit: () => void;
  isLoading: boolean;
  shortcuts: boolean;
}

export const DispositionSidebar: React.FC<DispositionSidebarProps> = ({
  selectedDisposition,
  onDispositionChange,
  notes,
  onNotesChange,
  confidence,
  onConfidenceChange,
  onSubmit,
  isLoading,
  shortcuts
}) => {
  const dispositionOptions = [
    {
      label: 'benign_variant' as const,
      icon: CheckCircle,
      color: 'green',
      description: 'Legitimate variation or derivative work',
      shortcut: 'b'
    },
    {
      label: 'suspicious' as const,
      icon: AlertTriangle,
      color: 'orange',
      description: 'Requires further investigation',
      shortcut: 's'
    },
    {
      label: 'not_similar' as const,
      icon: XCircle,
      color: 'red',
      description: 'False positive - not actually similar',
      shortcut: 'n'
    },
    {
      label: 'false_positive' as const,
      icon: EyeOff,
      color: 'gray',
      description: 'System error - ignore this collision',
      shortcut: 'f'
    }
  ];

  return (
    <div className="disposition-sidebar">
      <h3>Disposition</h3>
      
      {/* Disposition options */}
      <div className="disposition-options">
        {dispositionOptions.map((option) => (
          <button
            key={option.label}
            className={`disposition-button ${selectedDisposition?.label === option.label ? 'selected' : ''} ${option.color}`}
            onClick={() => onDispositionChange({
              label: option.label,
              confidence,
              notes
            })}
          >
            <option.icon className="w-5 h-5" />
            <div className="button-content">
              <span className="label">
                {option.label.replace('_', ' ')}
                {shortcuts && <span className="shortcut">[{option.shortcut}]</span>}
              </span>
              <span className="description">{option.description}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Confidence slider */}
      <div className="confidence-control">
        <label>Confidence: {(confidence * 100).toFixed(0)}%</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={confidence}
          onChange={(e) => onConfidenceChange(parseFloat(e.target.value))}
        />
        <div className="confidence-labels">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
        </div>
      </div>

      {/* Notes textarea */}
      <div className="notes-control">
        <label>Notes (Optional)</label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add any additional context or observations..."
          rows={4}
        />
      </div>

      {/* Action buttons */}
      <div className="action-buttons">
        <button
          className="submit-button"
          onClick={onSubmit}
          disabled={!selectedDisposition || isLoading}
        >
          {isLoading ? (
            <>
              <div className="spinner" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Submit Disposition
            </>
          )}
        </button>

        <button className="escalate-button">
          <AlertTriangle className="w-4 h-4" />
          Escalate for Review
        </button>
      </div>

      {/* Keyboard shortcuts help */}
      {shortcuts && (
        <div className="shortcuts-help">
          <h4>Keyboard Shortcuts</h4>
          <div className="shortcut-list">
            <div><kbd>B</kbd> Benign Variant</div>
            <div><kbd>S</kbd> Suspicious</div>
            <div><kbd>N</kbd> Not Similar</div>
            <div><kbd>F</kbd> False Positive</div>
            <div><kbd>Space</kbd> Toggle View</div>
            <div><kbd>Enter</kbd> Submit</div>
          </div>
        </div>
      )}
    </div>
  );
};
```

### Batch Operations Component
```typescript
interface BatchOperationsProps {
  selectedCollisions: string[];
  onBatchDisposition: (collisionIds: string[], disposition: CollisionDisposition) => void;
  onSelectionChange: (collisionIds: string[]) => void;
}

export const BatchOperations: React.FC<BatchOperationsProps> = ({
  selectedCollisions,
  onBatchDisposition,
  onSelectionChange
}) => {
  const [batchDisposition, setBatchDisposition] = useState<CollisionDisposition['label'] | null>(null);
  const [showBatchDialog, setShowBatchDialog] = useState(false);

  const handleBatchDisposition = () => {
    if (!batchDisposition || selectedCollisions.length === 0) {
      return;
    }

    onBatchDisposition(selectedCollisions, {
      label: batchDisposition,
      confidence: 0.8,
      notes: 'Batch disposition'
    });

    setShowBatchDialog(false);
    setBatchDisposition(null);
    onSelectionChange([]);
  };

  return (
    <>
      <div className="batch-operations">
        <div className="selection-info">
          <span className="selected-count">
            {selectedCollisions.length} collisions selected
          </span>
          <button
            className="clear-selection"
            onClick={() => onSelectionChange([])}
          >
            Clear Selection
          </button>
        </div>

        {selectedCollisions.length > 0 && (
          <div className="batch-actions">
            <button
              className="batch-disposition-button"
              onClick={() => setShowBatchDialog(true)}
            >
              <Zap className="w-4 h-4" />
              Batch Disposition
            </button>

            <button className="export-button">
              <Download className="w-4 h-4" />
              Export Selected
            </button>
          </div>
        )}
      </div>

      {/* Batch disposition dialog */}
      {showBatchDialog && (
        <BatchDispositionDialog
          collisionCount={selectedCollisions.length}
          selectedDisposition={batchDisposition}
          onDispositionChange={setBatchDisposition}
          onConfirm={handleBatchDisposition}
          onCancel={() => {
            setShowBatchDialog(false);
            setBatchDisposition(null);
          }}
        />
      )}
    </>
  );
};

// Batch disposition dialog component
const BatchDispositionDialog: React.FC<{
  collisionCount: number;
  selectedDisposition: CollisionDisposition['label'] | null;
  onDispositionChange: (disposition: CollisionDisposition['label']) => void;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  collisionCount,
  selectedDisposition,
  onDispositionChange,
  onConfirm,
  onCancel
}) => {
  return (
    <motion.div
      className="batch-disposition-dialog-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="batch-disposition-dialog"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <h3>Batch Disposition</h3>
        <p>
          Apply disposition to {collisionCount} selected collision{collisionCount !== 1 ? 's' : ''}
        </p>

        <div className="disposition-options">
          {[
            { label: 'benign_variant', icon: CheckCircle },
            { label: 'suspicious', icon: AlertTriangle },
            { label: 'not_similar', icon: XCircle },
            { label: 'false_positive', icon: EyeOff }
          ].map((option) => (
            <button
              key={option.label}
              className={`disposition-option ${selectedDisposition === option.label ? 'selected' : ''}`}
              onClick={() => onDispositionChange(option.label as CollisionDisposition['label'])}
            >
              <option.icon className="w-5 h-5" />
              <span>{option.label.replace('_', ' ')}</span>
            </button>
          ))}
        </div>

        <div className="dialog-actions">
          <button className="cancel-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="confirm-button"
            onClick={onConfirm}
            disabled={!selectedDisposition}
          >
            Apply to {collisionCount} Collision{collisionCount !== 1 ? 's' : ''}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
```
