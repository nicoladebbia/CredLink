import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface SigningProgress {
  stage: 'uploading' | 'validating' | 'signing' | 'generating' | 'completed' | 'error';
  progress: number; // 0-100
  message: string;
  timestamp: Date;
  details?: {
    fileName?: string;
    fileSize?: number;
    estimatedTime?: number;
    currentStep?: string;
    totalSteps?: number;
  };
}

interface UseSigningProgressReturn {
  progress: SigningProgress | null;
  isConnected: boolean;
  error: string | null;
  startSigning: (file: File, metadata: any) => void;
  cancelSigning: () => void;
  resetProgress: () => void;
}

export function useSigningProgress(): UseSigningProgressReturn {
  const [progress, setProgress] = useState<SigningProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const signingIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:8000', {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Connected to signing progress server');
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from signing progress server');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Failed to connect to progress server');
      setIsConnected(false);
    });

    // Listen for progress updates
    socket.on('signing-progress', (data: SigningProgress) => {
      setProgress({
        ...data,
        timestamp: new Date(data.timestamp),
      });
    });

    // Listen for completion
    socket.on('signing-complete', (data) => {
      setProgress({
        stage: 'completed',
        progress: 100,
        message: 'Signing completed successfully!',
        timestamp: new Date(),
        details: data,
      });
    });

    // Listen for errors
    socket.on('signing-error', (data) => {
      setProgress({
        stage: 'error',
        progress: 0,
        message: data.message || 'An error occurred during signing',
        timestamp: new Date(),
        details: data,
      });
      setError(data.message || 'Signing failed');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  const startSigning = (file: File, metadata: any) => {
    if (!socketRef.current || !isConnected) {
      setError('Not connected to progress server');
      return;
    }

    // Generate unique signing ID
    const signingId = crypto.randomUUID();
    signingIdRef.current = signingId;

    // Reset progress
    setProgress({
      stage: 'uploading',
      progress: 0,
      message: 'Starting upload...',
      timestamp: new Date(),
      details: {
        fileName: file.name,
        fileSize: file.size,
      },
    });
    setError(null);

    // Emit start signing event
    socketRef.current.emit('start-signing', {
      signingId,
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
      },
      metadata,
    });

    // Simulate progress for demo (remove when backend is ready)
    simulateProgress();
  };

  const simulateProgress = () => {
    const stages = [
      { stage: 'uploading' as const, duration: 2000, message: 'Uploading image...' },
      { stage: 'validating' as const, duration: 1500, message: 'Validating image format...' },
      { stage: 'signing' as const, duration: 3000, message: 'Generating C2PA manifest...' },
      { stage: 'generating' as const, duration: 2000, message: 'Creating certificate...' },
    ];

    let currentStage = 0;
    let stageProgress = 0;
    const totalStages = stages.length;

    const progressInterval = setInterval(() => {
      if (currentStage >= totalStages) {
        clearInterval(progressInterval);
        
        // Final completion
        setProgress({
          stage: 'completed',
          progress: 100,
          message: 'Signing completed successfully!',
          timestamp: new Date(),
        });
        return;
      }

      const stage = stages[currentStage];
      stageProgress += 100 / (stage.duration / 100);

      if (stageProgress >= 100) {
        stageProgress = 100;
        currentStage++;
      }

      const overallProgress = (currentStage * 100 + stageProgress) / totalStages;

      setProgress(prev => ({
        stage: stage.stage,
        progress: Math.min(overallProgress, 99),
        message: stage.message,
        timestamp: new Date(),
        details: prev?.details,
      }));
    }, 100);
  };

  const cancelSigning = () => {
    if (socketRef.current && signingIdRef.current) {
      socketRef.current.emit('cancel-signing', {
        signingId: signingIdRef.current,
      });
    }
    resetProgress();
  };

  const resetProgress = () => {
    setProgress(null);
    setError(null);
    signingIdRef.current = null;
  };

  return {
    progress,
    isConnected,
    error,
    startSigning,
    cancelSigning,
    resetProgress,
  };
}
