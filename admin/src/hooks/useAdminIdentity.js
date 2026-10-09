import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { configFor } from '../components/admin/userRoles';

/**
 * Signed-in staff identity for the top navbar: display name (Firebase profile
 * → users/{uid} → email prefix) plus the existing role label. No hardcoded
 * names — everything comes from the authenticated session.
 */
export function useAdminIdentity() {
  const { user, userRole, loading: authLoading } = useAuth();
  const [name, setName] = useState('Admin');

  useEffect(() => {
    let cancelled = false;
    const resolveName = async () => {
      if (authLoading) return;
      if (!user) {
        if (!cancelled) setName('Admin');
        return;
      }
      const display = user.displayName?.trim();
      if (display) {
        if (!cancelled) setName(display);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const storedName = snap.exists()
          ? (snap.data().name || snap.data().displayName || '').trim()
          : '';
        if (storedName) {
          if (!cancelled) setName(storedName);
          return;
        }
      } catch {
        // ignore, fall through
      }
      const email = user.email || '';
      if (email.includes('@')) {
        const titled = email
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .trim()
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        if (titled) {
          if (!cancelled) setName(titled);
          return;
        }
      }
      if (!cancelled) setName('Admin');
    };
    resolveName();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const roleLabel = (userRole && configFor(userRole)?.label) || userRole || 'Staff';
  return { name, roleLabel };
}

/** Current date in the visitor's locale, refreshed every 30s. Never hardcoded. */
export function useToday() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return {
    short: now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    full: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  };
}
