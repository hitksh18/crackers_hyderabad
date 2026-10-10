import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../firebase';
import toast from '../utils/toast';
import Seo from '../components/Seo';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent } from '../lib/motion';
import { ADMIN_URL, BILLING_URL } from '../lib/consoleUrls';
import GoogleMark from '../components/ui/GoogleMark';

/** Firebase auth codes are not sentences. Turn them into ones. */
const AUTH_MESSAGES = {
  'auth/invalid-email': 'That email address does not look right. Check it and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact us to have it re-enabled.',
  'auth/user-not-found': 'No account exists for that email. Create one below.',
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

/* Staff consoles live on separate subdomains (Firebase sessions are per
   origin, so each console asks for its own sign-in). A deep link the visitor
   was aiming at (`from`) always wins; otherwise each role lands on its own
   home — customers on the storefront, staff on their console. */
const getHomePath = (role) => {
  if (role === 'sales') return BILLING_URL;
  if (role === 'admin') return `${ADMIN_URL}/dashboard`;
  return '/';
};

/* Internal destinations go through React Router; cross-subdomain
   destinations need a real navigation. */
const goToDestination = (navigate, destination) => {
  if (/^https?:\/\//.test(destination)) {
    window.location.assign(destination);
    return;
  }
  navigate(destination, { replace: true });
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /* Confirm-password is presentation-layer only: it is compared locally and
     only `password` is ever sent to the existing signup handler. */
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [googleError, setGoogleError] = useState('');
  /* redirecting covers the handoff after auth succeeds — especially the
     cross-subdomain console navigation, where the app unmounts and the
     target console boots. Without it the last painted frame simply vanishes
     into a blank document while the next app loads. */
  const [redirecting, setRedirecting] = useState(false);
  const { loginWithEmail, loginWithGoogle, user, userRole, authReady, refreshRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();

  const [from] = useState(() => location.state?.from || sessionStorage.getItem(FROM_KEY) || null);

  // Centralized redirect is now ONLY for auth restoration / Google redirect.
  // Email login navigates directly in handleEmailLogin (OLD known-good path:
  // result.role -> from||getHomePath). This effect must not duplicate it.
  useEffect(() => {
    if (loading || redirecting) return;
    if (location.pathname !== '/login') return;
    if (authReady && user && userRole) {
      const destination = from || getHomePath(userRole);
      if (from) sessionStorage.removeItem(FROM_KEY);
      setRedirecting(true);
      goToDestination(navigate, destination);
    }
  }, [authReady, user, userRole, loading, redirecting, navigate, from, location.pathname]);

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
      if (isSignUp) {
        if (password !== confirmPassword) {
          setFormError('Passwords do not match. Please re-enter the same password in both fields.');
          return;
        }
        const created = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(
          doc(db, 'users', created.user.uid),
          {
            name: '',
            email: created.user.email || '',
            phone: '',
            createdAt: new Date(),
          },
          { merge: true }
        );
        toast.success('Account created successfully! Signing you in...');
        setIsSignUp(false);
        setPassword('');
        setConfirmPassword('');
        setShowConfirmPassword(false);
      } else {
        const result = await loginWithEmail(email, password);
        if (result?.role) {
          const destination = from || getHomePath(result.role);
          if (from) sessionStorage.removeItem(FROM_KEY);
          setRedirecting(true);
          goToDestination(navigate, destination);
        } else {
          await handleMissingRole();
        }
      }
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Email already in use. Try logging in instead.');
      }
      setFormError(
        readableAuthError(
          error,
          isSignUp
            ? 'We could not create that account. Please check your details and try again.'
            : 'We could not sign you in. Please check your details and try again.'
        )
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
        const destination = from || getHomePath(result.role);
        if (from) sessionStorage.removeItem(FROM_KEY);
        setRedirecting(true);
        goToDestination(navigate, destination);
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

  const submitLabel = loading
    ? isSignUp
      ? 'Creating Account...'
      : 'Signing in...'
    : isSignUp
      ? 'Create Account'
      : 'Sign In';

  /* Post-login handoff: branded loading state instead of a blank document
     while the session, role and destination resolve. */
  if (redirecting) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ background: '#0d0b0a' }}>
        <Seo title="Sign In | Crackers Hyderabad" noindex />
        <div role="status" aria-live="polite" aria-busy="true" aria-label="Signing you in" className="auth-loader">
          <div aria-hidden="true" className="auth-loader__glow" />
          <div className="auth-loader__inner">
            <div className="auth-loader__brand" aria-hidden="true">
              <span aria-hidden="true" className="auth-loader__halo" />
              <span aria-hidden="true" className="auth-loader__ring" />
              <img
                src="/images/website/nav-logo.png"
                alt=""
                width={84}
                height={84}
                decoding="async"
                className="auth-loader__logo"
              />
            </div>
            <div className="auth-loader__copy">
              <p className="auth-loader__title">Signing you in</p>
              <p className="auth-loader__subtitle">
                <span>Taking you to your account</span>
                <span className="auth-loader__dots" aria-hidden="true">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </p>
            </div>
            <div className="auth-loader__track" aria-hidden="true">
              <span className="auth-loader__shimmer" />
            </div>
            <span className="sr-only">Signing you in — please wait</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative grid min-h-dvh w-full overflow-hidden lg:h-dvh lg:grid-cols-[1.05fr_1fr]"
      style={{ background: '#0d0b0a' }}
    >
      <Seo title="Sign In | Crackers Hyderabad" noindex />

      {/* Back to Home — overlaid pill on desktop, inline row on mobile
          where the compact visual strip leaves no room for an overlay. */}
      <Link
        to="/"
        className="absolute left-6 top-6 z-20 hidden min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium backdrop-blur transition-colors hover:brightness-150 lg:inline-flex"
        style={{ borderColor: 'rgba(245, 239, 228, 0.18)', background: 'rgba(13, 11, 10, 0.55)', color: 'rgba(245, 239, 228, 0.75)' }}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Back to Home
      </Link>

      {/* LEFT — editorial visual. Compact strip on mobile, full height on desktop. */}
      <aside
        aria-label="Crackers Hyderabad Diwali fireworks"
        className="relative flex h-20 flex-col justify-end overflow-hidden sm:h-44 lg:h-auto"
      >
        <img
          src="/images/hero-bg.jpg"
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(13,11,10,0.62) 0%, rgba(13,11,10,0.18) 38%, rgba(13,11,10,0.86) 100%), linear-gradient(90deg, rgba(13,11,10,0.42) 0%, transparent 55%), radial-gradient(60% 45% at 50% 78%, rgba(195, 58, 20, 0.22) 0%, transparent 100%)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{ boxShadow: 'inset 0 0 140px rgba(0, 0, 0, 0.75)' }}
        />
        <div className="relative p-4 sm:p-7 lg:p-10">
          <p
            className="text-[11px] font-semibold uppercase sm:text-xs lg:text-sm"
            style={{ color: 'var(--gold-400)', letterSpacing: '0.3em', fontFamily: 'var(--font-body)' }}
          >
            Crackers Hyderabad
          </p>
          <p
            className="mt-2 text-balance text-2xl sm:text-4xl lg:text-[2.75rem]"
            style={{ color: '#FFFFFF', fontFamily: 'var(--font-display)', lineHeight: 1.1 }}
          >
            Celebrate brighter.
          </p>
          <p className="mt-2 hidden max-w-xs text-sm leading-relaxed sm:block lg:max-w-sm lg:text-[15px]" style={{ color: 'rgba(245, 239, 228, 0.75)' }}>
            Shop premium fireworks for your celebrations.
          </p>
        </div>
      </aside>

      {/* RIGHT — authentication column (a div: App already provides <main>). */}
      <div className="relative z-10 mx-auto flex w-full flex-col items-center justify-center overflow-hidden px-4 py-3 sm:px-6 sm:py-6 lg:h-dvh lg:overflow-y-auto lg:py-6">
        {/* Warm ambient light behind the card so the form side never reads flat black. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(55% 42% at 50% 46%, rgba(120, 26, 18, 0.4) 0%, rgba(195, 58, 20, 0.1) 45%, transparent 75%)' }}
        />
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerParent(reduced, 0.07, 0.05)}
          className="relative flex w-full max-w-[440px] flex-col items-center"
        >
          <Link
            to="/"
            className="mb-1 inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-medium lg:hidden"
            style={{ color: 'rgba(245, 239, 228, 0.7)' }}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to Home
          </Link>
          {/* Compact brand row. */}
          <motion.div variants={revealVariants(reduced, 14)} className="flex items-center gap-3">
            <img
              src="/images/website/nav-logo.png"
              alt="Crackers Hyderabad"
              width={112}
              height={52}
              decoding="async"
              className="h-8 w-auto object-contain sm:h-14"
            />
            <p
              className="text-[13px] font-semibold uppercase sm:text-[15px]"
              style={{ color: 'var(--gold-400)', letterSpacing: '0.22em', fontFamily: 'var(--font-body)' }}
            >
              Crackers Hyderabad
            </p>
          </motion.div>

          <motion.div variants={revealVariants(reduced, 14)} className="mt-4 text-center">
            <h1
              className="text-balance"
              style={{ color: '#FFFFFF', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 1.35rem + 1.4vw, 2rem)', lineHeight: 1.15 }}
            >
              {isSignUp ? 'Create Account' : 'Welcome back'}
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: 'rgba(245, 239, 228, 0.62)' }}>
              {isSignUp ? 'Create an account to start shopping' : 'Sign in to continue to your account'}
            </p>
          </motion.div>

          {/* Login card: charcoal, warm hairline, soft shadow. */}
          <motion.div
            variants={revealVariants(reduced, 16)}
            className="mt-5 w-full"
            style={{
              background: '#171110',
              border: '1px solid rgba(210, 140, 90, 0.22)',
              borderRadius: '18px',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0,0,0,0.4)',
              padding: 'clamp(1rem, 3vw, 1.75rem)',
            }}
          >
            <div role="alert" aria-live="polite">
              {errorMessages.map(({ id, message }) => (
                <div
                  key={id}
                  className="mb-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3"
                  style={{
                    background: 'rgba(203, 42, 42, 0.1)',
                    border: '1px solid rgba(203, 42, 42, 0.32)',
                  }}
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={2}
                    style={{ color: '#E4695E' }}
                    aria-hidden="true"
                  />
                  <p className="text-[13px] font-medium leading-relaxed" style={{ color: '#E89B93' }}>
                    {message}
                  </p>
                </div>
              ))}
            </div>

            <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-3 block text-sm font-semibold"
                  style={{ color: '#F5EFE4' }}
                >
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
                  className="mb-3 block text-sm font-semibold"
                  style={{ color: '#F5EFE4' }}
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
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
                {isSignUp && (
                  <p className="mt-2 text-xs" style={{ color: 'rgba(245, 239, 228, 0.5)' }}>
                    Use at least 6 characters.
                  </p>
                )}
              </div>

              {isSignUp && (
                <div>
                  <label
                    htmlFor="login-confirm-password"
                    className="mb-3 block text-sm font-semibold"
                    style={{ color: '#F5EFE4' }}
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <input
                      id="login-confirm-password"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="input-premium pr-14"
                      style={{ height: '50px' }}
                      aria-invalid={formError ? 'true' : 'false'}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((visible) => !visible)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      aria-pressed={showConfirmPassword}
                      className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
                      ) : (
                        <Eye className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="btn-primary mt-1 w-full"
                style={{ height: '52px', fontSize: '0.95rem' }}
              >
                {loading && (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                )}
                {submitLabel}
              </button>
            </form>

            <div className="my-3 flex items-center gap-4">
              <span aria-hidden="true" className="h-px flex-1" style={{ background: 'rgba(245, 239, 228, 0.16)' }} />
              <span className="whitespace-nowrap text-[11px] font-semibold uppercase" style={{ color: 'rgba(245, 239, 228, 0.48)', letterSpacing: '0.14em' }}>
                Or continue with
              </span>
              <span aria-hidden="true" className="h-px flex-1" style={{ background: 'rgba(245, 239, 228, 0.16)' }} />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              aria-busy={googleLoading}
              className="btn-outline w-full"
              style={{ height: '52px' }}
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

            <p className="mt-3 text-center text-sm" style={{ color: 'rgba(245, 239, 228, 0.62)' }}>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setFormError('');
                  setGoogleError('');
                  setConfirmPassword('');
                  setShowConfirmPassword(false);
                }}
                className="inline-flex min-h-[44px] items-center px-1 font-semibold underline-offset-4 hover:underline"
                style={{ color: 'var(--ember-600)' }}
              >
                {isSignUp ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
