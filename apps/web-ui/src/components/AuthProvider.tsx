import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-react';
import type { ReactNode } from 'react';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Make authentication optional for now
if (!clerkPubKey) {
  console.warn('Clerk not configured - running without authentication');
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // If no Clerk key, just render children without Clerk provider
  if (!clerkPubKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      {children}
    </ClerkProvider>
  );
}

export function useClerkAuth() {
  // If no Clerk key, return mock auth state
  if (!clerkPubKey) {
    return {
      isLoaded: true,
      isSignedIn: false,
      user: null,
      signOut: async () => {},
      userId: 'demo-user',
      email: 'demo@example.com',
      name: 'Demo User',
    };
  }

  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { isLoaded: userLoaded, isSignedIn: userSignedIn, user } = useUser();
  
  return {
    isLoaded: isLoaded && userLoaded,
    isSignedIn: isSignedIn && userSignedIn,
    user,
    signOut,
    userId: user?.id || 'demo-user',
    email: user?.primaryEmailAddress?.emailAddress || 'demo@example.com',
    name: user?.fullName || user?.firstName || 'Demo User',
  };
}
