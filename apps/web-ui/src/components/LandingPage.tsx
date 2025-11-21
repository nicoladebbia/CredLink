interface LandingPageProps {
  onEnter: () => void;
}

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '4rem', margin: '0 0 1rem 0', fontWeight: 'bold' }}>
          CredLink
        </h1>
        <p style={{ fontSize: '1.5rem', margin: '0 0 2rem 0', opacity: 0.9 }}>
          Content Authenticity Platform
        </p>
        <button 
          onClick={onEnter}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.2rem',
            backgroundColor: 'white',
            color: '#667eea',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Enter Platform →
        </button>
        <p style={{ marginTop: '1rem', opacity: 0.7 }}>
          Start with 5 free certificates • No credit card required
        </p>
      </div>
    </div>
  );
}
