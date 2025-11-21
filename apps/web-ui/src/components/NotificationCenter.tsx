import { Bell, X, CheckCircle2, AlertTriangle, Info, Shield, DollarSign, Users } from 'lucide-react';

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'info' | 'security' | 'billing' | 'team';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
}

export function NotificationCenter({ isOpen, onClose, notifications, onMarkAsRead, onClearAll }: NotificationCenterProps) {
  if (!isOpen) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 style={{ width: '18px', height: '18px', color: '#22c55e' }} />;
      case 'warning': return <AlertTriangle style={{ width: '18px', height: '18px', color: '#f59e0b' }} />;
      case 'security': return <Shield style={{ width: '18px', height: '18px', color: '#ef4444' }} />;
      case 'billing': return <DollarSign style={{ width: '18px', height: '18px', color: '#3b82f6' }} />;
      case 'team': return <Users style={{ width: '18px', height: '18px', color: '#8b5cf6' }} />;
      default: return <Info style={{ width: '18px', height: '18px', color: '#64748b' }} />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 9998,
          animation: 'fadeIn 0.2s ease-out'
        }}
      />

      {/* Notification Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '420px',
        height: '100vh',
        background: 'white',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideInRight 0.3s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Bell style={{ width: '24px', height: '24px', color: '#0f172a' }} />
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Notifications</h2>
              {unreadCount > 0 && (
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{unreadCount} unread</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px',
              cursor: 'pointer',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X style={{ width: '20px', height: '20px', color: '#64748b' }} />
          </button>
        </div>

        {/* Actions */}
        {notifications.length > 0 && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #e2e8f0' }}>
            <button
              onClick={onClearAll}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                padding: '4px 0'
              }}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Notifications List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {notifications.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '12px',
              color: '#94a3b8'
            }}>
              <Bell style={{ width: '48px', height: '48px', opacity: 0.3 }} />
              <p style={{ fontSize: '14px', fontWeight: '600' }}>No notifications</p>
              <p style={{ fontSize: '13px', textAlign: 'center', maxWidth: '240px' }}>
                You're all caught up! We'll notify you when something important happens.
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => onMarkAsRead(notification.id)}
                style={{
                  padding: '16px',
                  margin: '8px',
                  borderRadius: '12px',
                  background: notification.read ? 'white' : '#f8fafc',
                  border: `1px solid ${notification.read ? '#e2e8f0' : '#cbd5e1'}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f1f5f9';
                  e.currentTarget.style.borderColor = '#94a3b8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = notification.read ? 'white' : '#f8fafc';
                  e.currentTarget.style.borderColor = notification.read ? '#e2e8f0' : '#cbd5e1';
                }}
              >
                {!notification.read && (
                  <div style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#3b82f6'
                  }} />
                )}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {getIcon(notification.type)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#0f172a',
                      margin: '0 0 4px 0'
                    }}>
                      {notification.title}
                    </h4>
                    <p style={{
                      fontSize: '13px',
                      color: '#64748b',
                      margin: '0 0 8px 0',
                      lineHeight: '1.4'
                    }}>
                      {notification.message}
                    </p>
                    <p style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      margin: 0
                    }}>
                      {notification.timestamp}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
