import { isLoggedIn } from '@/services/user-auth';
import { loginWithGoogle } from '@/services/firebase-auth';

let authModal: HTMLDivElement | null = null;

export function initAuthModal(): void {
  if (authModal) return;

  authModal = document.createElement('div');
  authModal.className = 'auth-modal-overlay';
  authModal.innerHTML = `
    <div class="auth-modal">
      <button class="auth-modal-close">&times;</button>
      <div class="auth-modal-icon">🔐</div>
      <h2 class="auth-modal-title">Sign In Required</h2>
      <p class="auth-modal-desc">This feature is available to registered users. Sign in to unlock:</p>
      <ul class="auth-modal-features">
        <li>✓ Save custom layouts & watchlists</li>
        <li>✓ Add widgets to your dashboard</li>
        <li>✓ Access historical playback</li>
        <li>✓ Export data & reports</li>
        <li>✓ Unlimited AI summaries</li>
      </ul>
      <button class="auth-modal-btn" id="authModalSignIn">Sign in with Google</button>
      <p class="auth-modal-footer">Don't have an account? <span id="authModalSignUp">Sign up for free</span></p>
    </div>
  `;

  document.body.appendChild(authModal);

  const closeHandler = () => {
    authModal?.classList.remove('active');
  };

  authModal.querySelector('.auth-modal-close')?.addEventListener('click', closeHandler);

  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeHandler();
  });

  authModal.querySelector('#authModalSignIn')?.addEventListener('click', async () => {
    await loginWithGoogle();
    closeAuthModal();
  });

  authModal.querySelector('#authModalSignUp')?.addEventListener('click', async () => {
    await loginWithGoogle();
    closeAuthModal();
  });
}

function closeAuthModal(): void {
  if (authModal) {
    authModal.classList.remove('active');
  }
}

export function showAuthModal(): void {
  initAuthModal();

  if (!authModal) return;

  authModal.classList.add('active');
}

export function requireAuth(): boolean {
  if (!isLoggedIn()) {
    showAuthModal();
    return false;
  }
  return true;
}

export function checkFeatureAccess(feature: string): boolean {
  if (isLoggedIn()) {
    return true;
  }
  
  const restrictedFeatures = [
    'watchlist',
    'save-layout', 
    'add-widget',
    'historical-playback',
    'export',
    'custom-widgets',
    'intelligence-findings',
    'alert-rules',
  ];
  
  if (restrictedFeatures.includes(feature)) {
    showAuthModal();
    return false;
  }
  
  return true;
}
