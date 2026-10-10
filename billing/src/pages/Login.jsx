import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Seo from '../components/Seo';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent } from '../lib/motion';
import GoogleMark from '../components/ui/GoogleMark';
import BrandLogo from '../components/billing/BrandLogo';
import { BILLING_ROLES } from '../lib/roles';
import { BRAND_NAME } from '../lib/branding';

/** Firebase auth codes are not sentences. Turn them into ones. */
const AUTH_MESSAGES = {
  'auth/invalid-email': 'That email address does not look right. Check it and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact us to have it re-enabled.',
  'auth/user-not-found': 'No account exists for that email.',
  'auth/wrong-password': 'That password is incorrect. Try again or reset it.',
  'auth/invalid-credential': 'Email or password is incorrect. Please check both and try again.',
  'auth/invalid-login-credentials': 'Email or password is incorrect. Please check both and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a minute before trying again.',
  'auth/network-request-failed': 'We could not reach the server. Check your connection and try again.',
  'auth/email-already-in-use': 'Email already in use. Try logging in instead.',
  'auth/weak-password': 'Please choose a password with at least six characters.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Use email and password, or ask the shop to enable it.',
  'auth/admin-restricted-operation': 'This sign-in method is not enabled. Use email and password, or ask the shop to enable it.',
  'auth/unauthorized-domain': 'This domain is not authorized for sign-in. Add it in Firebase Authentication settings and try again.',
  'auth/account-exists-with-different-credential':
    'An account already exists with this email. Sign in with email and password instead.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'The Google sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and retry.',
};

const readableAuthError = (error, fallback) =>
  AUTH_MESSAGES[error?.code] || fallback;

/* The protected-route guard records the page a logged-out visitor was aiming
   at, and the email flow hands it back via location.state. Google's redirect
   round-trip reloads the page and drops that state, so the destination is
   parked in sessionStorage before leaving and restored on the way back. */
const FROM_KEY = 'auth_from';

/* Billing terminal role set lives in lib/roles (shared by the router guard). */

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [googleError, setGoogleError] = useState('');
  const { loginWithEmail, loginWithGoogle, signOut, user, userRole, authReady, refreshRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();

  const [from] = useState(() => location.state?.from || sessionStorage.getItem(FROM_KEY) || null);

  const getHomePath = () => '/';

  // Billing terminal: any role outside admin/sales must never hold a session
  // here. Reject the login immediately with a clear message instead.
  const rejectNonStaff = useCallback(async (role) => {
    if (BILLING_ROLES.includes(role)) return false;
    try { await signOut(); } catch { /* already signed out */ }
    setFormError('This account does not have billing access. Please sign in with an admin or sales account.');
    return true;
  }, [signOut]);

  // Centralized redirect is now ONLY for auth restoration / Google redirect.
  // Email login navigates directly in handleEmailLogin (OLD known-good path:
  // result.role -> from||getHomePath). This effect must not duplicate it.
  useEffect(() => {
    if (loading) return;
    if (location.pathname !== '/login') return;
    if (authReady && user && userRole) {
      if (!BILLING_ROLES.includes(userRole)) {
        rejectNonStaff(userRole);
        return;
      }
      const destination = from || getHomePath(userRole);
      if (from) sessionStorage.removeItem(FROM_KEY);
      navigate(destination, { replace: true });
    }
  }, [authReady, user, userRole, loading, navigate, from, location.pathname, rejectNonStaff]);

  /* Signed in but the role lookup did not resolve: previously the form just
     went idle with no message and no navigation (a silent stall). Surface it
     and retry the lookup — the effect above navigates once it resolves. */
  const handleMissingRole = async () => {
    setFormError('Signed in, but we could not verify your access. Trying again…');
    try {
      await refreshRole();
    } catch {
      setFormError('Signed in, but we could not verify your access. Please try again.');
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');
    try {
      const result = await loginWithEmail(email, password);
      if (result?.role) {
        if (await rejectNonStaff(result.role)) return;
        const destination = from || getHomePath(result.role);
        if (from) sessionStorage.removeItem(FROM_KEY);
        navigate(destination, { replace: true });
      } else {
        await handleMissingRole();
      }
    } catch (error) {
      console.error(error);
      setFormError(
        readableAuthError(error, 'We could not sign you in. Please check your details and try again.')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleError('');
    setGoogleLoading(true);
    try {
      if (from) sessionStorage.setItem(FROM_KEY, from);
      const result = await loginWithGoogle();
      if (result?.role) {
        if (await rejectNonStaff(result.role)) return;
        const destination = from || getHomePath(result.role);
        if (from) sessionStorage.removeItem(FROM_KEY);
        navigate(destination, { replace: true });
      } else {
        await handleMissingRole();
      }
    } catch (error) {
      if (from) sessionStorage.removeItem(FROM_KEY);
      console.error(error);
      setGoogleError(
        readableAuthError(error, 'Google sign-in did not complete. Please try again.')
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  /* `formError` is the only signal allowed to mark the email/password fields
     invalid. A Google popup failure is tracked separately but still shown. */
  const errorMessages = [
    { id: 'form', message: formError },
    { id: 'google', message: googleError },
  ].filter((entry) => entry.message);

  const submitLabel = loading ? 'Signing in...' : 'Sign In';

  return (
    <div
      className="relative flex min-h-screen w-full flex-col overflow-hidden"
      style={{ background: 'var(--surface-page)' }}
    >
      <Seo title={`Sign In | ${BRAND_NAME}`} noindex />

      {/* Atmospheric glow — decorative only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-16 h-[420px] w-[680px] max-w-[120vw] -translate-x-1/2"
          style={{ background: 'radial-gradient(50% 50% at 50% 50%, rgba(195, 58, 20, 0.13) 0%, transparent 100%)' }}
        />
        <div
          className="absolute -bottom-32 left-1/2 h-[300px] w-[560px] max-w-[120vw] -translate-x-1/2"
          style={{ background: 'radial-gradient(50% 50% at 50% 50%, rgba(210, 166, 79, 0.06) 0%, transparent 100%)' }}
        />
      </div>

      {/* Centered terminal column. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col items-center justify-center px-5 pb-8 pt-8 sm:px-6">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerParent(reduced, 0.07, 0.05)}
          className="flex w-full flex-col items-center"
        >
          {/* Brand lockup with a soft halo. */}
          <motion.div variants={revealVariants(reduced, 14)} className="relative flex flex-col items-center">
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-6 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: 'radial-gradient(50% 50% at 50% 50%, rgba(210, 166, 79, 0.2) 0%, transparent 70%)' }}
            />
            <div className="relative flex items-center gap-3">
              <BrandLogo size={52} />
            </div>
            <p
              className="mt-3 text-[11px] font-semibold uppercase"
              style={{ color: 'var(--gold-400)', letterSpacing: '0.32em', fontFamily: 'var(--font-body)' }}
            >
              Billing Console
            </p>
          </motion.div>

          <motion.div variants={revealVariants(reduced, 14)} className="mt-5 text-center">
            <h1
              className="text-balance"
              style={{ color: 'var(--text-strong)', fontSize: 'clamp(1.5rem, 1.25rem + 1.2vw, 1.9rem)', lineHeight: 1.2, fontWeight: 700 }}
            >
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              Sign in to access the billing console.
            </p>
          </motion.div>

          {/* Login card: ~460px, console surface, warm hairline, soft shadow. */}
          <motion.div
            variants={revealVariants(reduced, 16)}
            className="mt-6 w-full max-w-[460px]"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid rgba(210, 140, 90, 0.2)',
              borderRadius: '20px',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
              padding: 'clamp(1.25rem, 3.5vw, 2rem)',
            }}
          >
            <div role="alert" aria-live="polite">
              {errorMessages.map(({ id, message }) => (
                <div
                  key={id}
                  className="mb-5 flex items-start gap-2.5 rounded-lg px-3.5 py-3"
                  style={{
                    background: 'rgba(203, 42, 42, 0.1)',
                    border: '1px solid rgba(203, 42, 42, 0.32)',
                  }}
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={2}
                    style={{ color: 'var(--crimson-600)' }}
                    aria-hidden="true"
                  />
                  <p className="text-[13px] font-medium leading-relaxed" style={{ color: 'var(--crimson-600)' }}>
                    {message}
                  </p>
                </div>
              ))}
            </div>

            <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-2 flex items-center gap-2 text-sm font-semibold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  <Mail className="h-4 w-4" strokeWidth={2} style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                  Email address
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="input-premium"
                  style={{ height: '50px' }}
                  aria-invalid={formError ? 'true' : 'false'}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-2 flex items-center gap-2 text-sm font-semibold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  <Lock className="h-4 w-4" strokeWidth={2} style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="input-premium pr-14"
                    style={{ height: '50px' }}
                    aria-invalid={formError ? 'true' : 'false'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-primary mt-1 w-full"
                style={{ height: '50px', fontSize: '0.95rem' }}
              >
                {loading && (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                )}
                {submitLabel}
              </button>
            </form>

            <div className="my-5 flex items-center gap-4">
              <span aria-hidden="true" className="h-px flex-1" style={{ background: 'var(--hairline)' }} />
              <span className="whitespace-nowrap text-[11px] font-semibold uppercase" style={{ color: 'var(--text-subtle)', letterSpacing: '0.14em' }}>
                Or
              </span>
              <span aria-hidden="true" className="h-px flex-1" style={{ background: 'var(--hairline)' }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              aria-busy={googleLoading}
              className="btn-outline w-full"
              style={{ height: '50px' }}
            >
              {googleLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                  Redirecting to Google...
                </>
              ) : (
                <>
                  <GoogleMark />
                  Continue with Google
                </>
              )}
            </button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
