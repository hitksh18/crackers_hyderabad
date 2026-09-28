import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  X,
  Home as HomeIcon,
  ShoppingBag,
  ShoppingCart,
  User,
  LogIn,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Receipt,
  Phone,
  ChevronRight,
} from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { sheetVariants, staggerParent, revealVariants } from '../lib/motion';
import { Diya } from './ui/Ornaments';
import UserAvatar from './UserAvatar';

/**
 * Full-screen navigation for viewports below `lg`.
 *
 * Presentational only — every link, role gate and handler is supplied by
 * Navbar so the gating logic lives in exactly one place.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MobileMenu = ({
  onClose,
  pathname,
  user,
  isAdmin,
  isSales,
  isBilling,
  isPacker,
  isMod,
  isStaffMember,
  canSeeBilling,
  cartCount,
  onSignOut,
  phoneHref,
}) => {
  const reduced = useReducedMotion();
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  /* Body scroll lock + focus handoff, unwound on close. */
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  /* Escape closes; Tab is trapped inside the panel. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE));
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const primaryLinks = [
    { to: '/', label: 'Home', icon: HomeIcon },
    { to: '/products', label: 'Products', icon: ShoppingBag },
    { to: '/cart', label: 'Cart', icon: ShoppingCart, count: cartCount },
  ];

  const accountLinks = [
    { to: '/profile', label: 'My Profile', icon: User, show: true },
    { to: '/my-orders', label: 'My Orders', icon: ClipboardList, show: !isStaffMember },
    { to: '/admin/billing', label: 'Billing', icon: Receipt, show: canSeeBilling },
    { to: '/admin/dashboard', label: 'Admin Dashboard', icon: LayoutDashboard, show: isAdmin },
    { to: '/admin/orders', label: 'Orders & Packing', icon: ClipboardList, show: isPacker || isMod },
    { to: '/price-list', label: 'Price List', icon: Receipt, show: isSales || isBilling || isMod },
  ].filter((item) => item.show);

  const rowClass =
    'flex min-h-[52px] items-center gap-3 rounded-[var(--r-md)] px-3 text-sm font-semibold transition-colors hover:bg-primary-50 dark:hover:bg-white/10';

  return (
    <motion.div
      variants={sheetVariants(reduced)}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-modal lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Main menu"
      ref={panelRef}
    >
      <div className="bg-festive absolute inset-0" aria-hidden="true" />

      <div className="relative flex h-full flex-col overflow-y-auto overscroll-contain">
        <div
          className="shell flex shrink-0 items-center justify-between gap-3 py-3"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Diya flame={false} className="h-5 w-8 shrink-0 opacity-90" />
            <span
              className="truncate text-base font-bold tracking-tight sm:text-lg"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-strong)' }}
            >
              Crackers <span style={{ color: 'var(--ember-600)' }}>Hyderabad</span>
            </span>
          </span>

          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            className="arrow-btn shrink-0"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <motion.div
          variants={staggerParent(reduced, 0.05, 0.06)}
          className="shell flex flex-1 flex-col gap-7 pb-10 pt-6"
        >
          {/* ---- Primary navigation, editorial scale ---- */}
          <nav aria-label="Primary">
            {primaryLinks.map((item, index) => {
              const Icon = item.icon;
              const active = pathname === item.to;

              return (
                <motion.div key={item.to} variants={revealVariants(reduced, 14)}>
                  <Link
                    to={item.to}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className="relative flex min-h-[64px] items-center gap-4 py-3 pl-4 pr-1"
                    style={{ borderBottom: '1px solid var(--hairline)' }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-9 w-[3px] -translate-y-1/2 rounded-full"
                      style={{ background: active ? 'var(--grad-gold)' : 'transparent' }}
                    />
                    <span
                      className="label-caps tabular shrink-0"
                      style={{ color: 'var(--gold-600)' }}
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span
                      className="subsection-title min-w-0 flex-1"
                      style={{ color: active ? 'var(--ember-600)' : 'var(--text-strong)' }}
                    >
                      {item.label}
                    </span>
                    {item.count > 0 && (
                      <span className="badge badge-ember tabular shrink-0">
                        {item.count}
                        <span className="sr-only"> items in cart</span>
                      </span>
                    )}
                    <Icon
                      className="h-5 w-5 shrink-0"
                      style={{ color: 'var(--text-subtle)' }}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          {/* ---- Account ---- */}
          <motion.div variants={revealVariants(reduced, 14)}>
            <p className="label-caps mb-3">Account</p>

            {user ? (
              <div
                className="glass-card overflow-hidden"
                style={{ borderRadius: 'var(--r-lg)' }}
              >
                <div
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--hairline)' }}
                >
                  <UserAvatar
                    user={user}
                    className="h-10 w-10"
                    initialsSize={15}
                    style={{ border: '2px solid var(--ember-600)' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="label-caps block">Logged in as</span>
                    <span
                      className="block truncate text-sm font-semibold"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      {user.email || user.displayName}
                    </span>
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 p-2">
                  {accountLinks.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className={rowClass}
                        style={{ color: 'var(--text-body)' }}
                      >
                        <Icon
                          className="h-4 w-4 shrink-0"
                          style={{ color: 'var(--ember-600)' }}
                          strokeWidth={2.2}
                          aria-hidden="true"
                        />
                        <span className="flex-1">{item.label}</span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0"
                          style={{ color: 'var(--text-subtle)' }}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      </Link>
                    );
                  })}

                  <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: '0.35rem 0' }} />

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSignOut().catch(() => {});
                    }}
                    className={`${rowClass} w-full text-left`}
                    style={{ color: 'var(--crimson-600)' }}
                  >
                    <LogOut className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                    <span className="flex-1">Logout</span>
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/login" onClick={onClose} className="btn-primary w-full">
                <LogIn className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
                <span>Login</span>
              </Link>
            )}
          </motion.div>

          {/* ---- Support + preferences ---- */}
          <motion.div variants={revealVariants(reduced, 14)} className="flex flex-col gap-3">
            <a href={phoneHref} className="btn-outline w-full">
              <Phone className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
              <span>Call Us</span>
            </a>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default MobileMenu;
