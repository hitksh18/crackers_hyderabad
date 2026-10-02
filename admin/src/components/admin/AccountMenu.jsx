import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { configFor } from './userRoles';
import UserAvatar from '../UserAvatar';

/**
 * Shared staff account menu — the single logout surface for every admin page.
 *
 * Avatar button opens a small dropdown with the signed-in account (email +
 * role) and a Log out action that uses AuthContext.signOut (real Firebase
 * sign-out; ProtectedRoute then redirects to /login). The dropdown is
 * right-aligned and viewport-capped so it fits on phones.
 */
const AccountMenu = () => {
  const { user, userRole, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const handleLogout = () => {
    setOpen(false);
    signOut().catch(() => {});
  };

  const roleLabel = (userRole && configFor(userRole)?.label) || userRole || 'Staff';

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full transition-colors duration-200"
        style={{ border: '1px solid var(--hairline-strong)', background: 'var(--surface-sunken)' }}
      >
        <UserAvatar user={user} className="h-full w-full" initialsSize={14} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border shadow-xl"
          style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        >
          <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface-sunken)' }}>
            <UserAvatar user={user} className="h-10 w-10 shrink-0" initialsSize={15} />
            <div className="min-w-0 flex-1">
              <p className="label-caps">Signed in as</p>
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                {user?.email || user?.displayName || 'Staff account'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{roleLabel}</p>
            </div>
          </div>

          <div className="p-2">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors duration-200"
              style={{ color: 'var(--crimson-600)' }}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={2.2} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountMenu;
