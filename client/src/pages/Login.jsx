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
import GoogleMark from '../components/ui/GoogleMark';
import { RangoliDivider } from '../components/ui/Ornaments';

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

/* APP_CONTEXT = "customer": this application never leaves its own origin.
   Role decides what a session may access, never where the browser goes —
   so an admin signing in here lands on the storefront, and staff consoles
   are reached by visiting their own URLs directly. `from` is accepted only
   as a same-origin path, which also closes any open-redirect reading. */
const safeInternalPath = (value) => {
  const path = String(value || '');
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  return path;
};

const getHomePath = () => '/';

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
      const destination = safeInternalPath(from) || getHomePath();
      if (from) sessionStorage.removeItem(FROM_KEY);
      setRedirecting(true);
      navigate(destination, { replace: true });
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
          const destination = safeInternalPath(from) || getHomePath();
          if (from) sessionStorage.removeItem(FROM_KEY);
          setRedirecting(true);
          navigate(destination, { replace: true });
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
        const destination = safeInternalPath(from) || getHomePath();
        if (from) sessionStorage.removeItem(FROM_KEY);
        setRedirecting(true);
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
      <div className="grid min-h-screen place-items-center" style={{ background: '#FDF9F0' }}>
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
      className="login-page relative grid min-h-dvh w-full overflow-hidden lg:h-dvh lg:grid-cols-[1.05fr_1fr]"
      style={{ background: '#FDF9F0' }}
    >
      <Seo title="Sign In | Crackers Hyderabad" noindex />

      {/* Back to Home — overlaid pill on desktop, inline row on mobile. */}
      <Link
        to="/"
        className="absolute left-6 top-6 z-20 hidden min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-sm font-medium backdrop-blur transition-colors hover:brightness-95 lg:inline-flex"
        style={{ borderColor: '#E2D2B7', background: 'rgba(255,255,255,0.85)', color: '#60453D' }}
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Back to Home
      </Link>

      {/* LEFT — editorial brand visual. Compact strip on mobile, full height on desktop.
          Deep maroon festive panel with fireworks photography — the branded anchor. */}
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
          style={{ background: 'linear-gradient(180deg, rgba(58,11,12,0.55) 0%, rgba(58,11,12,0.15) 38%, rgba(58,11,12,0.82) 100%), linear-gradient(90deg, rgba(58,11,12,0.35) 0%, transparent 55%), radial-gradient(60% 45% at 50% 78%, rgba(210, 166, 79, 0.28) 0%, transparent 100%)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{ boxShadow: 'inset 0 0 140px rgba(58, 11, 12, 0.45)' }}
        />
        <div className="relative p-4 sm:p-7 lg:p-10">
          <p
            className="text-[11px] font-semibold uppercase sm:text-xs lg:text-sm"
            style={{ color: '#E2C177', letterSpacing: '0.3em', fontFamily: 'var(--font-body)' }}
          >
            Crackers Hyderabad
          </p>
          <p
            className="mt-2 text-balance text-2xl sm:text-4xl lg:text-[2.75rem]"
            style={{ color: '#FFFDF8', fontFamily: 'var(--font-display)', lineHeight: 1.1 }}
          >
            Celebrate brighter.
          </p>
          <p className="mt-2 hidden max-w-xs text-sm leading-relaxed sm:block lg:max-w-sm lg:text-[15px]" style={{ color: 'rgba(253, 249, 240, 0.85)' }}>
            Shop premium fireworks for your celebrations.
          </p>
        </div>
      </aside>

      {/* RIGHT — luxury ivory festive wall with the authentication form and a
          decorative catalogue rail (a div: App already provides <main>). */}
      <div className="login-side relative z-10 mx-auto flex w-full flex-col items-center justify-center px-4 py-3 sm:px-6 sm:py-6 lg:h-dvh lg:overflow-y-auto lg:py-6">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerParent(reduced, 0.07, 0.05)}
          className="login-formwrap relative flex w-full max-w-[400px] flex-col items-center"
        >
          <Link
            to="/"
            className="mb-1 inline-flex min-h-[44px] items-center gap-1.5 self-start text-sm font-medium lg:hidden"
            style={{ color: '#75665C' }}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to Home
          </Link>
          {/* Compact brand row with a whisper of gold beneath. */}
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
              style={{ color: '#9E7029', letterSpacing: '0.22em', fontFamily: 'var(--font-body)' }}
            >
              Crackers Hyderabad
            </p>
          </motion.div>
          <motion.div variants={revealVariants(reduced, 14)} aria-hidden="true" className="mt-2 w-full max-w-[170px]">
            <RangoliDivider />
          </motion.div>

          <motion.div variants={revealVariants(reduced, 14)} className="mt-3 text-center">
            <h1
              className="text-balance"
              style={{ color: '#4A2F2A', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 1.35rem + 1.4vw, 2rem)', lineHeight: 1.15 }}
            >
              {isSignUp ? 'Create Account' : 'Welcome back'}
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: '#75665C' }}>
              {isSignUp ? 'Create an account to start shopping' : 'Sign in to continue to your account'}
            </p>
          </motion.div>

          {/* Login card: warm ivory premium, subtle gold hairline, soft shadow. */}
          <motion.div
            variants={revealVariants(reduced, 16)}
            className="mt-4 w-full"
            style={{
              background: '#FFFDF8',
              border: '1px solid rgba(201, 151, 62, 0.35)',
              borderRadius: '20px',
              boxShadow: '0 18px 44px rgba(58, 11, 12, 0.10)',
              padding: 'clamp(0.875rem, 2vw, 1.25rem)',
            }}
          >
            <div role="alert" aria-live="polite">
              {errorMessages.map(({ id, message }) => (
                <div
                  key={id}
                  className="mb-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3"
                  style={{
                    background: 'rgba(203, 42, 42, 0.07)',
                    border: '1px solid rgba(203, 42, 42, 0.3)',
                  }}
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    strokeWidth={2}
                    style={{ color: '#CB2A2A' }}
                    aria-hidden="true"
                  />
                  <p className="text-[13px] font-medium leading-relaxed" style={{ color: '#94251F' }}>
                    {message}
                  </p>
                </div>
              ))}
            </div>

            <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-3 block text-sm font-semibold"
                  style={{ color: '#60453D' }}
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
                  style={{ height: '48px' }}
                  aria-invalid={formError ? 'true' : 'false'}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-3 block text-sm font-semibold"
                  style={{ color: '#60453D' }}
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
                    style={{ height: '48px' }}
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
                  <p className="mt-2 text-xs" style={{ color: '#9A887A' }}>
                    Use at least 6 characters.
                  </p>
                )}
              </div>

              {isSignUp && (
                <div>
                  <label
                    htmlFor="login-confirm-password"
                    className="mb-3 block text-sm font-semibold"
                    style={{ color: '#60453D' }}
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
                      style={{ height: '48px' }}
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
                style={{ height: '50px', fontSize: '0.95rem' }}
              >
                {loading && (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                )}
                {submitLabel}
              </button>
            </form>

            <div className="my-3 flex items-center gap-4">
              <span aria-hidden="true" className="h-px flex-1" style={{ background: '#EFE3CE' }} />
              <span className="whitespace-nowrap text-[11px] font-semibold uppercase" style={{ color: '#9A887A', letterSpacing: '0.14em' }}>
                Or continue with
              </span>
              <span aria-hidden="true" className="h-px flex-1" style={{ background: '#EFE3CE' }} />
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

            <p className="mt-3 text-center text-sm" style={{ color: '#75665C' }}>
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
                style={{ color: '#761713' }}
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
