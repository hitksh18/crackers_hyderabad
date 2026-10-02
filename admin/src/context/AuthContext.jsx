import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  linkWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigValid, firebaseConfigError } from '../firebase';
import toast from '../utils/toast';

const DEV = import.meta.env.DEV;
const log = (...args) => { if (DEV) console.log(...args); };
const logError = (...args) => { if (DEV) console.error(...args); else console.error(...args); };

// Firestore getDoc can hang if the SDK is offline / rules misconfigured /
// network blocked. Wrap with a real timeout so the caller never waits forever.
// This does NOT hide the error — it turns a silent hang into a catchable
// rejection that the auth lifecycle handles as a proper error state.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const AuthContext = createContext();

/** Firebase auth codes are not sentences. Turn them into ones before toasting. */
const AUTH_TOAST_MESSAGES = {
  'auth/invalid-email': 'That email address does not look right. Check it and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact us to have it re-enabled.',
  'auth/user-not-found': 'No account exists for that email.',
  'auth/wrong-password': 'That password is incorrect. Try again or reset it.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-login-credentials': 'Email or password is incorrect.',
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

const friendlyAuthMessage = (error, fallback = 'We could not sign you in. Please try again.') =>
  AUTH_TOAST_MESSAGES[error?.code] || fallback;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSales, setIsSales] = useState(false);
  const [isBilling, setIsBilling] = useState(false);
  const [isPacker, setIsPacker] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [roleError, setRoleError] = useState(false);
  const [loading, setLoading] = useState(true);
  /*
   * Whether we know *who* is signed in, as opposed to what they are allowed to
   * do. `loading` covers both and only clears after the roles/{uid} read, which
   * is a network round trip nothing about identity depends on. Anything keyed
   * only on the account — the cart's storage key, for one — should wait on this
   * instead, or it inherits a Firestore read's latency and its failure modes.
   */
  const [authReady, setAuthReady] = useState(false);

  const fetchUserRole = useCallback(async (currentUser) => {
    if (!currentUser) {
      log('[AUTH] No user — clearing role');
      setUserRole(null);
      setRoleError(false);
      setIsAdmin(false);
      setIsSales(false);
      setIsBilling(false);
      setIsPacker(false);
      setIsMod(false);
      setIsStaff(false);
      return;
    }

    if (!isFirebaseConfigValid) {
      logError('[AUTH ERROR] Cannot fetch role — Firebase config invalid:', firebaseConfigError);
      setRoleError(true);
      setUserRole(null);
      setIsAdmin(false);
      setIsSales(false);
      setIsBilling(false);
      setIsPacker(false);
      setIsMod(false);
      setIsStaff(false);
      return null;
    }

    log('[AUTH] Checking admin access for', currentUser.uid);
    try {
      const roleDoc = await withTimeout(
        getDoc(doc(db, 'roles', currentUser.uid)),
        10000,
        'roles lookup'
      );

      if (roleDoc.exists()) {
        const role = roleDoc.data().role;
        log('[AUTH] Admin access result:', role);
        setRoleError(false);
        setUserRole(role);
        setIsAdmin(role === 'admin');
        setIsSales(role === 'sales');
        setIsBilling(role === 'billing');
        setIsPacker(role === 'packer');
        setIsMod(role === 'mod');
        setIsStaff(['admin', 'sales', 'billing', 'packer', 'mod'].includes(role));
        return role;
      } else {
        log('[AUTH] Admin access result: customer (no role doc)');
        setRoleError(false);
        setUserRole('customer');
        setIsAdmin(false);
        setIsSales(false);
        setIsBilling(false);
        setIsPacker(false);
        setIsMod(false);
        setIsStaff(false);
        return 'customer';
      }
    } catch (error) {
      logError('[AUTH ERROR] roles lookup failed:', error?.message || error, error?.code || '');
      setRoleError(true);
      setUserRole(null);
      setIsAdmin(false);
      setIsSales(false);
      setIsBilling(false);
      setIsPacker(false);
      setIsMod(false);
      setIsStaff(false);
      return null;
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (!user) return;
    log('[AUTH] Retrying admin access check');
    setRoleError(false);
    await fetchUserRole(user);
    log('[AUTH] Retry complete');
  }, [user, fetchUserRole]);

  useEffect(() => {
    log('[AUTH] Initializing — waiting for auth state');

    if (!isFirebaseConfigValid) {
      logError('[AUTH ERROR] Firebase misconfigured — aborting auth listener:', firebaseConfigError);
      setRoleError(true);
      setAuthReady(true);
      setLoading(false);
      return undefined;
    }

    let fired = false;
    let cancelled = false;

    // Safety net: if the SDK never calls back (e.g., blocked script, bad
    // config, extension interference), surface a real error instead of an
    // infinite spinner. This is NOT an arbitrary hide — it logs the exact
    // cause and forces a recoverable error state with "Try Again".
    const watchdog = setTimeout(() => {
      if (!fired && !cancelled) {
        logError('[AUTH ERROR] Auth state listener did not fire within 12s — check Firebase config, network, and browser extensions');
        setRoleError(true);
        setAuthReady(true);
        setLoading(false);
      }
    }, 12000);

    let unsubscribe = () => {};

    try {
      unsubscribe = onAuthStateChanged(
        auth,
        async (currentUser) => {
          fired = true;
          clearTimeout(watchdog);
          if (cancelled) return;
          log('[AUTH] Auth state changed — user:', currentUser ? currentUser.uid : 'null');
          setUser(currentUser);
          setAuthReady(true);

          try {
            if (currentUser) {
              log('[AUTH] User detected — fetching role');
              await fetchUserRole(currentUser);
            } else {
              log('[AUTH] No user — redirect will handle');
              setUserRole(null);
              setRoleError(false);
              setIsAdmin(false);
              setIsSales(false);
              setIsBilling(false);
              setIsPacker(false);
              setIsMod(false);
              setIsStaff(false);
            }
          } catch (e) {
            logError('[AUTH ERROR] Unexpected error in auth handler:', e?.message || e);
            setRoleError(true);
          } finally {
            if (!cancelled) {
              log('[AUTH] Loading complete');
              setLoading(false);
            }
          }
        },
        (error) => {
          fired = true;
          clearTimeout(watchdog);
          logError('[AUTH ERROR] onAuthStateChanged error:', error?.message || error, error?.code || '');
          if (!cancelled) {
            setRoleError(true);
            setAuthReady(true);
            setLoading(false);
          }
        }
      );
    } catch (e) {
      clearTimeout(watchdog);
      logError('[AUTH ERROR] Failed to attach auth listener:', e?.message || e);
      setRoleError(true);
      setAuthReady(true);
      setLoading(false);
    }

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      try { unsubscribe(); } catch { /* ignore */ }
    };
  }, [fetchUserRole]);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          name: result.user.displayName || '',
          email: result.user.email || '',
          phone: result.user.phoneNumber || '',
          createdAt: new Date(),
        }, { merge: true });
      }
      
      const role = await fetchUserRole(result.user);
      
      toast.success('Logged in successfully!');
      return { ...result, role };
    } catch (error) {
      console.error(error);
      toast.error(
        friendlyAuthMessage(error, 'Google sign-in did not complete. Please try again.')
      );
      throw error;
    }
  };

  /**
   * Link the signed-in account to a Google identity (Profile page).
   * This must be a link, not a sign-in: signInWithPopup would swap the
   * session to whatever Google account is chosen, silently replacing the
   * current user — a real risk for staff sessions.
   */
  const linkWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      if (!auth.currentUser) {
        toast.error('Please sign in first, then link Google.');
        return null;
      }
      await linkWithPopup(auth.currentUser, provider);
      await fetchUserRole(auth.currentUser);
      toast.success('Google account linked!');
      return auth.currentUser;
    } catch (error) {
      toast.error(
        friendlyAuthMessage(error, 'Could not link your Google account. Please try again.')
      );
      throw error;
    }
  };

  const loginWithEmail = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      
      const role = await fetchUserRole(result.user);
      
      toast.success('Logged in successfully!');
      return { ...result, role };
    } catch (error) {
      console.error(error);
      toast.error(
        friendlyAuthMessage(error, 'We could not sign you in. Please check your details and try again.')
      );
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUserRole(null);
      setIsAdmin(false);
      setIsSales(false);
      setIsBilling(false);
      setIsPacker(false);
      setIsMod(false);
      setIsStaff(false);
      toast.success('Logged out successfully!');
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  };

  const value = {
    user,
    isAdmin,
    isSales,
    isBilling,
    isPacker,
    isMod,
    isStaff,
    userRole,
    roleError,
    loading,
    authReady,
    loginWithGoogle,
    linkWithGoogle,
    loginWithEmail,
    signOut,
    refreshRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
