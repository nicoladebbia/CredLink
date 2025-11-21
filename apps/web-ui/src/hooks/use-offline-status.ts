import { useState, useEffect } from 'react';

interface UseOfflineStatusReturn {
  isOnline: boolean;
  isOffline: boolean;
  connectionType?: string;
  effectiveType?: string;
}

export function useOfflineStatus(): UseOfflineStatusReturn {
  const [isOnline, setIsOnline] = useState(true);
  const [connectionType, setConnectionType] = useState<string>();
  const [effectiveType, setEffectiveType] = useState<string>();

  useEffect(() => {
    // Initial status
    setIsOnline(navigator.onLine);

    // Get connection info if available
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;
    
    if (connection) {
      setConnectionType(connection.type);
      setEffectiveType(connection.effectiveType);
      
      const handleConnectionChange = () => {
        setConnectionType(connection.type);
        setEffectiveType(connection.effectiveType);
      };
      
      connection.addEventListener('change', handleConnectionChange);
      
      return () => {
        connection.removeEventListener('change', handleConnectionChange);
      };
    }

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    connectionType,
    effectiveType,
  };
}
