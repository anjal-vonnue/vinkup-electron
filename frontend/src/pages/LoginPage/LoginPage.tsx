import { useSearchParams } from 'react-router';
import type { DesktopAuthErrorCode } from '@itp/types';
import LoginCard from '../../components/LoginCard';
import AccessRestrictedCard from '../../components/AccessRestrictedCard';
import { useAuth } from '../../context/Useauth';
import styles from './LoginPage.module.css';

const DESKTOP_ERROR_MESSAGES: Partial<Record<DesktopAuthErrorCode, string>> = {
  CANCELLED: 'Sign-in was cancelled. Try again.',
  TIMEOUT: 'Sign-in timed out. Try again.',
  BACKEND_UNAVAILABLE: "Can't reach the Vinkup server. Check your connection and try again.",
  DOMAIN_NOT_PERMITTED: 'Use an approved @vonnue.com Google account.',
  NOT_PROVISIONED: "Your account hasn't been provisioned yet. Contact your administrator.",
  SECURE_STORAGE_UNAVAILABLE:
    "Secure storage isn't available, so you'll need to sign in again after restarting.",
  SESSION_EXPIRED: 'Your session ended. Sign in again.',
  SESSION_REVOKED: 'Your session was signed out. Sign in again.',
};

export default function LoginPage() {
  const { login, status, error } = useAuth();
  const [searchParams] = useSearchParams();
  const queryError = searchParams.get('error');

  const handleGoogleSignIn = () => {
    console.log('handling signin');
    login();
  };

  if (
    queryError === 'DOMAIN_NOT_PERMITTED' ||
    queryError === 'NOT_PROVISIONED' ||
    queryError === 'LOGIN_FAILED'
  ) {
    return (
      <AccessRestrictedCard
        detectedEmail={searchParams.get('email') ?? 'unknown'}
        domainInfo={
          queryError === 'DOMAIN_NOT_PERMITTED'
            ? 'External Personal Domain • OAuth2 / IdP Ingress'
            : 'Valid Domain • Account Not Provisioned'
        }
        allowedDomain="vonnue.com"
        onSignInRetry={handleGoogleSignIn}
      />
    );
  }

  const message = error
    ? (DESKTOP_ERROR_MESSAGES[error] ?? "Sign-in didn't complete. Try again.")
    : null;

  return (
    <>
      {status === 'pending' && (
        <p className={styles.notice} role="status">
          Waiting for your browser to finish sign-in…
        </p>
      )}
      {status !== 'pending' && message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
      <LoginCard handleGoogleSignIn={handleGoogleSignIn} />
    </>
  );
}
