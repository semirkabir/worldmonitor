import { initializeApp, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  type Auth, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  type User 
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

console.log('[Firebase] Config loaded:', {
  apiKey: firebaseConfig.apiKey?.slice(0, 8) + '...',
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
});

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function initFirebase(): Auth {
  console.log('[Firebase] Initializing...');
  if (!app) {
    app = initializeApp(firebaseConfig);
    console.log('[Firebase] App initialized');
  }
  if (!auth) {
    auth = getAuth(app);
    console.log('[Firebase] Auth ready');
  }
  return auth;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    return initFirebase();
  }
  return auth;
}

export function getCurrentUser(): User | null {
  return auth?.currentUser ?? null;
}

export async function loginWithGoogle(): Promise<User | null> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  
  try {
    // Try popup first - works in most cases
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error: any) {
    console.log('[Firebase] Popup failed, trying redirect:', error?.code);
    
    // If popup fails due to COOP, try redirect
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/internal-error' || error?.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(auth, provider);
        return null; // Will redirect
      } catch (redirectError) {
        console.error('Redirect failed:', redirectError);
        return null;
      }
    }
    
    console.error('Login failed:', error);
    return null;
  }
}

export async function handleRedirectResult(): Promise<User | null> {
  const auth = getFirebaseAuth();
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (error) {
    console.error('Redirect result failed:', error);
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

export function isFirebaseConfigured(): boolean {
  const key = import.meta.env.VITE_FIREBASE_API_KEY;
  const configured = !!key && key.length > 10 && key !== 'demo';
  console.log('[Firebase] Config check:', { key: key?.slice(0, 10) + '...', configured });
  return configured;
}

export type { User };
