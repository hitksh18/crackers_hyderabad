import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Boxes,
  Tag,
  Truck,
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
import { Diya } from '../components/ui/Ornaments';
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

const STORY_POINTS = [
  { icon: Boxes, text: 'Build bulk orders across every category in one basket' },
  { icon: Tag, text: 'Wholesale pricing for retailers stocking up for the season' },
  { icon: Truck, text: 'Follow every order from confirmation through to delivery' },
];

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
  if (role === 'sales' || role === 'billing') return BILLING_URL;
  if (role === 'admin') return `${ADMIN_URL}/dashboard`;
  if (role === 'mod' || role === 'packer') return `${ADMIN_URL}/orders`;
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
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [googleError, setGoogleError] = useState('');
  const { loginWithEmail, loginWithGoogle, user, userRole, authReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();

  const [from] = useState(() => location.state?.from || sessionStorage.getItem(FROM_KEY) || null);

  // Centralized redirect is now ONLY for auth restoration / Google redirect.
  // Email login navigates directly in handleEmailLogin (OLD known-good path:
  // result.role -> from||getHomePath). This effect must not duplicate it.
  useEffect(() => {
    if (loading) return;
    if (location.pathname !== '/login') return;
    if (authReady && user && userRole) {
      const destination = from || getHomePath(userRole);
      if (from) sessionStorage.removeItem(FROM_KEY);
      goToDestination(navigate, destination);
    }
  }, [authReady, user, userRole, loading, navigate, from, location.pathname]);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormError('');
    try {
      if (isSignUp) {
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
      } else {
        const result = await loginWithEmail(email, password);
        if (result?.role) {
          const destination = from || getHomePath(result.role);
          if (from) sessionStorage.removeItem(FROM_KEY);
          goToDestination(navigate, destination);
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
        goToDestination(navigate, destination);
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
      : 'Logging in...'
    : isSignUp
      ? 'Sign Up'
      : 'Login';

  return (
    <div className="relative min-h-screen w-full overflow-hidden" style={{ background: 'var(--surface-page)' }}>
      <Seo title="Sign In | Crackers Hyderabad" noindex />
      <div className="grid min-h-screen lg:grid-cols-[1.04fr_1fr]">
        {/* ---------------------------------------------------------------
            Editorial panel — maroon, one ornament, brand story.
            --------------------------------------------------------------- */}
        <aside
          className="relative order-2 flex items-center overflow-hidden py-12 lg:order-1 lg:py-0"
          style={{ background: 'var(--grad-maroon)' }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(46% 40% at 82% 12%, rgba(210, 166, 79, 0.24) 0%, transparent 100%), radial-gradient(52% 46% at 8% 92%, rgba(195, 58, 20, 0.34) 0%, transparent 100%)',
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-px lg:block"
            style={{ background: 'linear-gradient(180deg, transparent, var(--gold-400), transparent)', opacity: 0.55 }}
          />

          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerParent(reduced, 0.07, 0.05)}
            className="shell-narrow relative"
          >
            <motion.div variants={revealVariants(reduced, 18)} className="max-w-xl">
              <Diya className="mb-7 h-8 w-14" />

              <p
                className="label-caps"
                style={{ color: 'var(--gold-400)', letterSpacing: '0.24em' }}
              >
                Crackers Hyderabad
              </p>

              <h1
                className="hero-title mt-4 text-balance"
                style={{ color: 'var(--text-on-dark)' }}
              >
                Wholesale fireworks,
                <span className="block" style={{ color: 'var(--gold-400)' }}>
                  ordered the easy way.
                </span>
              </h1>

              <p
                className="mt-5 max-w-md text-pretty text-base leading-relaxed"
                style={{ color: 'rgba(237, 231, 223, 0.78)' }}
              >
                Sign in to keep your festival stock list, your order history and your invoices
                together in one account.
              </p>
            </motion.div>

            <motion.ul
              variants={revealVariants(reduced, 18)}
              className="mt-9 hidden max-w-md flex-col gap-4 lg:flex"
            >
              {STORY_POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: 'rgba(210, 166, 79, 0.14)',
                      border: '1px solid rgba(210, 166, 79, 0.38)',
                    }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} style={{ color: 'var(--gold-400)' }} />
                  </span>
                  <span className="text-sm leading-relaxed" style={{ color: 'rgba(237, 231, 223, 0.82)' }}>
                    {text}
                  </span>
                </li>
              ))}
            </motion.ul>
          </motion.div>
        </aside>

        {/* ---------------------------------------------------------------
            Form panel.
            --------------------------------------------------------------- */}
        <section className="order-1 flex items-center justify-center py-12 sm:py-16 lg:order-2">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerParent(reduced, 0.06, 0.1)}
            className="shell-narrow"
          >
            <div className="mx-auto w-full max-w-md">
              <motion.div variants={revealVariants(reduced, 16)}>
                <h2 className="section-title">
                  {isSignUp ? 'Create Account' : 'Welcome Back'}
                </h2>
                <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {isSignUp
                    ? 'Register to start shopping'
                    : 'Login to continue your shopping experience'}
                </p>
              </motion.div>

              <motion.div variants={revealVariants(reduced, 16)} className="mt-8">
                <div role="alert" aria-live="polite">
                  {errorMessages.map(({ id, message }) => (
                    <div
                      key={id}
                      className="mb-6 flex items-start gap-3 rounded-xl px-4 py-3"
                      style={{
                        background: 'rgba(203, 42, 42, 0.09)',
                        border: '1px solid rgba(203, 42, 42, 0.3)',
                      }}
                    >
                      <AlertCircle
                        className="mt-0.5 h-4 w-4 shrink-0"
                        strokeWidth={2}
                        style={{ color: 'var(--crimson-600)' }}
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--crimson-600)' }}>
                        {message}
                      </p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleEmailLogin} className="space-y-5">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="mb-2 flex items-center gap-2 text-sm font-semibold"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      <Mail className="h-4 w-4" strokeWidth={2} style={{ color: 'var(--ember-600)' }} aria-hidden="true" />
                      Email
                    </label>
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.email@example.com"
                      className="input-premium is-glass"
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
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="input-premium is-glass pr-14"
                        aria-invalid={formError ? 'true' : 'false'}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl"
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
                    className="btn-primary btn-shine w-full"
                  >
                    {loading && (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                    )}
                    {submitLabel}
                  </button>
                </form>

                <div className="my-7 flex items-center gap-4">
                  <hr className="rule-gold flex-1" />
                  <span className="label-caps whitespace-nowrap">Or continue with</span>
                  <hr className="rule-gold flex-1" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading || googleLoading}
                  aria-busy={googleLoading}
                  className="btn-outline w-full"
                >
                  {googleLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                      Redirecting to Google...
                    </>
                  ) : (
                    <>
                      <GoogleMark />
                      Login with Google
                    </>
                  )}
                </button>

                <p className="mt-7 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setFormError('');
                      setGoogleError('');
                    }}
                    className="inline-flex min-h-[44px] items-center px-1 font-semibold underline-offset-4 hover:underline"
                    style={{ color: 'var(--ember-600)' }}
                  >
                    {isSignUp ? 'Login' : 'Sign up'}
                  </button>
                </p>
              </motion.div>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
};

export default Login;
