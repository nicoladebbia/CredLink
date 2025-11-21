import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LandingPage } from '@/components/LandingPage';
import { Dashboard } from '@/components/Dashboard';
import { VerificationPortal } from '@/components/VerificationPortal';
import { PricingPage } from '@/components/PricingPage';
import { Login } from '@/components/Login';
import { BillingPage } from '@/components/BillingPage';

// Protected Route Wrapper
function RequireAuth({ children }: { children: React.ReactElement }) {
  const token = localStorage.getItem('credlink_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// Landing page route component
function LandingRoute() {
  const navigate = useNavigate();
  const token = localStorage.getItem('credlink_token');

  // If already logged in, go to dashboard
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <LandingPage 
      onEnter={() => navigate('/login')} 
    />
  );
}

function AppContent() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify/:proofId" element={<VerificationPortal />} />
          <Route path="/pricing" element={<PricingPage />} />
          
          {/* Protected Routes */}
          <Route path="/dashboard" element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          } />
          <Route path="/billing" element={
            <RequireAuth>
              <BillingPage />
            </RequireAuth>
          } />
          <Route path="/billing/success" element={
            <RequireAuth>
              <BillingPage />
            </RequireAuth>
          } />
          <Route path="/billing/cancel" element={
            <RequireAuth>
              <BillingPage />
            </RequireAuth>
          } />
        </Routes>
      </div>
    </Router>
  );
}

function App() {
  return <AppContent />;
}

export default App;
