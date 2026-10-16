import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogOut, ClipboardList, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { readSiteSettings } from '../lib/siteSettings';
import { popoverVariants } from '../lib/motion';
import UserAvatar from './UserAvatar';

const DEFAULT_LOGO = '/images/website/nav-logo.png';

/**
 * Compact route header. The global Navbar stays untouched for every other
 * route — this bar carries just the brand, a centered title and the account
 * slot (same dropdown behaviour as the main bar). No search, nav links,
 * cart, phone or mobile menu: checkout/cart must not leak visitors away
 * mid-order.
 */
const CheckoutNavbar = ({ title = 'Checkout' }) => {
  const { user, signOut } = useAuth();
  const reduced = useReducedMotion();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO);
  const profileMenuRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    readSiteSettings().then((s) => {
      if (s.branding?.logoUrl) setLogoUrl(s.branding.logoUrl);
    });
  }, []);

  /* Publish the measured navbar height (mirrors the main Navbar) so the
     cart's viewport calc subtracts the real value instead of a fallback. */
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const root = document.documentElement;
    const publishHeight = () => {
      root.style.setProperty('--nav-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);

    return () => {
      observer.disconnect();
      root.style.removeProperty('--nav-h');
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const menuRowClass =
    'flex min-h-[44px] items-center gap-3 px-4 text-sm font-medium transition-colors hover:bg-primary-50 dark:hover:bg-white/10';

  return (
    <>
      {/* In-flow spacer for the FIXED announcement bar (same contract as the
          main Navbar's spacer): the sticky bar below carries
          top: var(--top-banner-h), which shifts it visually without moving
          following content — without this spacer the first content row
          would slide underneath the bar. Zero-height when the banner is
          absent or disabled, so those pages are unaffected. */}
      <div aria-hidden="true" style={{ height: 'var(--top-banner-h, 0px)' }} />
      <nav ref={navRef} className="glass-nav sticky top-0 z-nav" aria-label="Checkout">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'var(--grad-gold)', opacity: 0.55 }}
      />

      <div className="shell relative flex min-h-[56px] items-center gap-2.5 py-2 sm:min-h-[64px] sm:gap-3 lg:min-h-[72px]">
        <Link
          to="/"
          className="flex min-w-0 shrink-0 items-center gap-2"
          aria-label="Crackers Hyderabad, home"
        >
          <img
            src={logoUrl}
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            decoding="async"
            className="h-8 w-8 shrink-0 sm:h-11 sm:w-11"
            style={{ borderRadius: '50%', aspectRatio: '1 / 1', objectFit: 'cover' }}
          />
          {/* Brand name: desktop/tablet only. Hidden on mobile (<sm) so the
              mobile cart header is simply [LOGO] SHOPPING CART with no
              redundancy or crowding. */}
          <span
            className="hidden truncate text-base font-bold tracking-tight sm:block sm:text-lg"
            style={{ fontFamily: 'var(--font-display)', color: '#FDF9F0' }}
          >
            Crackers <span style={{ color: 'var(--gold-400)' }}>Hyderabad</span>
          </span>
        </Link>

        {/* Mobile (<sm): left-aligned beside the logo, single line, compact.
            Desktop (sm+): centered absolute title, unchanged from before. */}
        <h1
          className="min-w-0 flex-1 truncate whitespace-nowrap text-left text-[13px] font-bold uppercase tracking-[0.12em] min-[375px]:text-[15px] min-[375px]:tracking-[0.14em] sm:pointer-events-none sm:absolute sm:left-1/2 sm:flex-none sm:-translate-x-1/2 sm:text-center sm:text-xl sm:tracking-[0.18em]"
          style={{ fontFamily: 'var(--font-display)', color: '#FDF9F0' }}
        >
          {title}
        </h1>

        <div className="ml-auto flex shrink-0 items-center">
          {user ? (
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                aria-label="Account menu"
                aria-haspopup="true"
                aria-expanded={showProfileMenu}
                className="arrow-btn overflow-hidden p-0"
                style={user.photoURL ? { borderColor: 'var(--ember-600)' } : undefined}
              >
                <UserAvatar user={user} className="h-full w-full" initialsSize={16} />
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <motion.div
                    variants={popoverVariants(reduced)}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="modal-glass z-raised absolute right-0 mt-3 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto"
                    style={{ borderRadius: 'var(--r-lg)', transformOrigin: 'top right' }}
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
                        <span className="block truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                          {user.email || user.displayName}
                        </span>
                      </span>
                    </div>

                    <div className="flex flex-col py-2">
                      <Link
                        to="/profile"
                        onClick={() => setShowProfileMenu(false)}
                        className={menuRowClass}
                        style={{ color: 'var(--text-body)' }}
                      >
                        <User className="h-4 w-4 shrink-0" style={{ color: 'var(--ember-600)' }} strokeWidth={2.2} aria-hidden="true" />
                        <span>My Profile</span>
                      </Link>
                      <Link
                        to="/my-orders"
                        onClick={() => setShowProfileMenu(false)}
                        className={menuRowClass}
                        style={{ color: 'var(--text-body)' }}
                      >
                        <ClipboardList className="h-4 w-4 shrink-0" style={{ color: 'var(--ember-600)' }} strokeWidth={2.2} aria-hidden="true" />
                        <span>My Orders</span>
                      </Link>
                      <hr style={{ border: 0, borderTop: '1px solid var(--hairline)', margin: '0.5rem 0' }} />
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileMenu(false);
                          signOut().catch(() => {});
                        }}
                        className={`${menuRowClass} w-full text-left`}
                        style={{ color: 'var(--crimson-600)' }}
                      >
                        <LogOut className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Link to="/login" className="btn-maroon nav-login-btn shrink-0 px-4 py-2 text-sm" aria-label="Login">
              <LogIn className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
              <span className="hidden sm:inline">Login</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
    </>
  );
};

export default CheckoutNavbar;
