import { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const styles = {
    success: { bg: '#dcfce7', border: '#86efac', text: '#166534', icon: '#22c55e' },
    error: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', icon: '#ef4444' },
    warning: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', icon: '#f59e0b' },
    info: { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', icon: '#3b82f6' }
  };

  const style = styles[type];
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertCircle : Info;

  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      right: '24px',
      zIndex: 9999,
      minWidth: '320px',
      maxWidth: '480px',
      background: style.bg,
      border: `2px solid ${style.border}`,
      borderRadius: '12px',
      padding: '16px 20px',
      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      animation: 'slideInRight 0.3s ease-out'
    }}>
      <Icon style={{ width: '20px', height: '20px', color: style.icon, flexShrink: 0 }} />
      <p style={{ flex: 1, margin: 0, fontSize: '14px', fontWeight: '600', color: style.text, lineHeight: '1.4' }}>
        {message}
      </p>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          padding: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'background 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
      >
        <X style={{ width: '16px', height: '16px', color: style.text }} />
      </button>
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }>;
  removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  return (
    <>
      {toasts.map((toast, index) => (
        <div key={toast.id} style={{ position: 'fixed', top: `${24 + index * 80}px`, right: '24px', zIndex: 9999 }}>
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        </div>
      ))}
    </>
  );
}
