import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSigningProgress } from '@/hooks/use-signing-progress';
import { Progress } from '@/components/ui/Progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatBytes, formatDate } from '@/lib/utils';
import { 
  CloudArrowUpIcon, 
  ShieldCheckIcon, 
  DocumentTextIcon, 
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

const stageConfig = {
  uploading: {
    icon: CloudArrowUpIcon,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    title: 'Uploading Image',
  },
  validating: {
    icon: ShieldCheckIcon,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    title: 'Validating Format',
  },
  signing: {
    icon: DocumentTextIcon,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    title: 'Generating C2PA Manifest',
  },
  generating: {
    icon: ShieldCheckIcon,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    title: 'Creating Certificate',
  },
  completed: {
    icon: CheckCircleIcon,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    title: 'Completed Successfully',
  },
  error: {
    icon: ExclamationTriangleIcon,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    title: 'Error Occurred',
  },
} as const;

interface SigningProgressProps {
  file: File;
  metadata: any;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function SigningProgress({ file, metadata, onComplete, onError }: SigningProgressProps) {
  const { progress, isConnected, error, startSigning, cancelSigning, resetProgress } = useSigningProgress();

  const handleStart = () => {
    startSigning(file, metadata);
  };

  const handleCancel = () => {
    cancelSigning();
  };

  const handleRetry = () => {
    resetProgress();
    handleStart();
  };

  React.useEffect(() => {
    // Auto-start when component mounts
    handleStart();
  }, []);

  React.useEffect(() => {
    if (progress?.stage === 'completed') {
      onComplete?.(progress);
    } else if (progress?.stage === 'error') {
      onError?.(progress.message);
    }
  }, [progress, onComplete, onError]);

  const currentStageConfig = progress ? stageConfig[progress.stage] : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-2xl mx-auto"
    >
      <Card className="relative overflow-hidden">
        {/* Connection Status */}
        <div className="absolute top-4 right-4 z-10">
          <Badge variant={isConnected ? 'secondary' : 'destructive'} className="text-xs">
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

        <CardHeader className="pb-4">
          <div className="flex items-center space-x-3">
            <AnimatePresence mode="wait">
              {currentStageConfig && (
                <motion.div
                  key={progress?.stage}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className={`p-2 rounded-full ${currentStageConfig.bgColor}`}
                >
                  <currentStageConfig.icon className={`h-5 w-5 ${currentStageConfig.color}`} />
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="flex-1">
              <CardTitle className="text-lg">
                {currentStageConfig?.title || 'Initializing...'}
              </CardTitle>
              <CardDescription className="text-sm">
                {progress?.message || 'Preparing to sign your image...'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* File Information */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <DocumentTextIcon className="h-4 w-4 text-slate-500" />
                <span className="font-medium text-slate-700">{file.name}</span>
              </div>
              <span className="text-slate-500">{formatBytes(file.size)}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Progress</span>
              <span className="text-slate-500">{Math.round(progress?.progress || 0)}%</span>
            </div>
            
            <Progress 
              value={progress?.progress || 0} 
              className="h-3"
            />
            
            {/* Stage Indicators */}
            <div className="flex justify-between text-xs text-slate-500 mt-4">
              {Object.keys(stageConfig).map((stage, index) => {
                const stageKey = stage as keyof typeof stageConfig;
                const isActive = progress?.stage === stageKey;
                const isCompleted = progress?.progress && progress.progress > (index * 100) / Object.keys(stageConfig).length;
                
                return (
                  <div
                    key={stage}
                    className={`flex flex-col items-center space-y-1 ${
                      isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-slate-400'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      isActive ? 'bg-blue-600' : isCompleted ? 'bg-green-600' : 'bg-slate-300'
                    }`} />
                    <span className="hidden sm:inline capitalize">{stage}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 border border-red-200 rounded-lg p-4"
              >
                <div className="flex items-start space-x-3">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-red-800">Signing Error</h4>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    Retry
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            {progress?.stage === 'completed' ? (
              <Button className="flex-1" onClick={() => onComplete?.(progress)}>
                <CheckCircleIcon className="h-4 w-4 mr-2" />
                View Certificate
              </Button>
            ) : progress?.stage === 'error' ? (
              <Button variant="outline" className="flex-1" onClick={handleRetry}>
                Retry Signing
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={!isConnected}
                  className="flex-1"
                >
                  <XMarkIcon className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <div className="flex-1 text-center text-sm text-slate-500">
                  {progress?.details?.estimatedTime && (
                    <span>Estimated time: {progress.details.estimatedTime}s</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Timestamp */}
          {progress && (
            <div className="text-xs text-slate-400 text-center">
              Started at {formatDate(progress.timestamp)}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
