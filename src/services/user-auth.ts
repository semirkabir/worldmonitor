import { User } from 'firebase/auth';
import { getFirebaseAuth, onAuthChange, isFirebaseConfigured, getCurrentUser, handleRedirectResult } from '@/services/firebase-auth';

export type UserTier = 'free' | 'pro' | 'business' | 'enterprise';

export interface AuthState {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  tier: UserTier;
}

let authState: AuthState = {
  user: null,
  loading: true,
  isConfigured: false,
  tier: 'free',
};

const listeners: Set<(state: AuthState) => void> = new Set();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(authState);
  }
}

export function initAuth(): void {
  const isConfigured = isFirebaseConfigured();
  authState.isConfigured = isConfigured;
  
  if (!isConfigured) {
    authState.loading = false;
    notifyListeners();
    return;
  }

  getFirebaseAuth();
  
  // Check for redirect result first (if returning from redirect login)
  handleRedirectResult().then((user) => {
    if (user) {
      authState.user = user;
      authState.loading = false;
      console.log('[Auth] User from redirect:', user.email);
      notifyListeners();
      return;
    }
    
    // Set up listener for auth changes
    onAuthChange((user) => {
      authState.user = user;
      authState.loading = false;
      console.log('[Auth] State changed:', { user: user?.email, uid: user?.uid, loading: false });
      notifyListeners();
    });
    
    // Also check current user immediately
    const current = getCurrentUser();
    console.log('[Auth] Current user on init:', current?.email);
  });
  
  // Initial state check after a delay
  setTimeout(() => {
    if (authState.loading) {
      authState.loading = false;
      console.log('[Auth] Timeout - assuming no user');
      notifyListeners();
    }
  }, 3000);
}

export function subscribeToAuth(callback: (state: AuthState) => void): () => void {
  listeners.add(callback);
  callback(authState);
  return () => listeners.delete(callback);
}

export function getCurrentAuthState(): AuthState {
  return authState;
}

export function isLoggedIn(): boolean {
  return authState.user !== null;
}

export function getUserId(): string | null {
  return authState.user?.uid ?? null;
}
