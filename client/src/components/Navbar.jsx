import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home as HomeIcon,
  ShoppingBag,
  ShoppingCart,
  User,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  Receipt,
  LogIn,
  Search,
  Phone,
  Menu,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { readSiteSettings } from '../lib/siteSettings';
import { popoverVariants, SPRING } from '../lib/motion';
import CartNotificationPill from './CartNotificationPill';
import MobileMenu from './MobileMenu';
import SearchOverlay from './SearchOverlay';
import UserAvatar from './UserAvatar';

const PHONE_HREF = 'tel:+919876543210';

const DEFAULT_LOGO = '/images/website/nav-logo.png';
const DESKTOP_QUERY = '(min-width: 1024px)';

/** Count badge. Remounts on change so the pop reads as "something was added". */
const CartCountBadge = ({ count, reduced }) => {
  if (count <= 0) return null;

  return (
    <motion.span
      key={count}
      initial={{ scale: reduced ? 1 : 0.5 }}
      animate={{ scale: 1 }}
      transition={reduced ? { duration: 0.001 } : SPRING.snappy}
      className="tabular absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full text-[10px] font-bold leading-none"
      style={{
        width: 18,
        height: 18,
        background: 'var(--ember-600)',
        color: '#FFFFFF',
        border: '2px solid var(--surface-page)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      {count}
    </motion.span>
  );
};

const Navbar = () => {
  const { getCartCount } = useCart();
  const { user, isAdmin, isSales, isBilling, isPacker, isMod, signOut, loading: authLoading } = useAuth();
  const reduced = useReducedMotion();
  const isStaffMember = isAdmin || isSales || isBilling || isPacker || isMod;
  const canSeeBilling = isAdmin || isSales;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isActive = (path) => pathname === path;
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO);
  const profileMenuRef = useRef(null);
  const navRef = useRef(null);
  const cartCount = getCartCount();

  useEffect(() => {
    readSiteSettings().then(s => {
      if (s.branding?.logoUrl) setLogoUrl(s.branding.logoUrl);
      if (s.branding?.faviconUrl) {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
        link.href = s.branding.faviconUrl;
      }
    });
  }, []);

  /* Publish the measured navbar height so sticky page content can clear it
     instead of guessing at a hardcoded offset. */
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

  useEffect(() => {
    setShowProfileMenu(false);
    setMobileMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  /* The mobile surfaces have no meaning once the desktop bar takes over. */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event) => {
      if (!event.matches) return;
      setMobileMenuOpen(false);
      setSearchOpen(false);
    };

    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }

    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/products?q=${encodeURIComponent(q)}`);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const navLinkClass = (path) => `nav-link ${isActive(path) ? 'active' : ''}`;

  const accountLinks = [
    { to: '/profile', label: 'My Profile', icon: User, show: true },
    { to: '/my-orders', label: 'My Orders', icon: ClipboardList, show: !isStaffMember },
    { to: '/admin/billing', label: 'Billing', icon: Receipt, show: canSeeBilling },
    { to: '/admin/dashboard', label: 'Admin Dashboard', icon: LayoutDashboard, show: isAdmin },
    { to: '/admin/orders', label: 'Orders & Packing', icon: ClipboardList, show: isPacker || isMod },
    { to: '/price-list', label: 'Price List', icon: Receipt, show: isSales || isBilling || isMod },
  ].filter((item) => item.show);

  const menuRowClass =
    'flex min-h-[44px] items-center gap-3 px-4 text-sm font-medium transition-colors hover:bg-primary-50 dark:hover:bg-white/10';

  const wordmark = (
    <>
      Crackers <span style={{ color: 'var(--ember-600)' }}>Hyderabad</span>
    </>
  );

  return (
    <>
      <nav
        ref={navRef}
        className={`glass-nav sticky top-0 z-nav${pathname === '/' ? ' home-nav' : ''}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
          style={{ background: pathname === '/' ? 'linear-gradient(90deg, transparent, rgba(210,166,79,0.22), transparent)' : 'var(--grad-gold)', opacity: pathname === '/' ? 1 : 0.55 }}
        />

        <div className="shell relative py-2 lg:py-3">
          {/* ================= Desktop ================= */}
          <div className="hidden items-center gap-4 lg:flex xl:gap-6">
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2.5"
              aria-label="Crackers Hyderabad, home"
            >
              <img
                src={logoUrl}
                alt=""
                aria-hidden="true"
                width={64}
                height={64}
                decoding="async"
                className="h-16 w-16 shrink-0"
                style={{ borderRadius: '50%' }}
              />
              <motion.span
                whileHover={reduced ? undefined : { scale: 1.02 }}
                transition={SPRING.snappy}
                className="whitespace-nowrap text-xl font-bold tracking-tight"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-strong)' }}
              >
                {wordmark}
              </motion.span>
            </Link>

            <div className="flex shrink-0 items-center gap-4">
              <Link
                to="/"
                className={navLinkClass('/')}
                title="Home"
                aria-current={isActive('/') ? 'page' : undefined}
              >
                <HomeIcon className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
                <span>Home</span>
              </Link>
              <Link
                to="/products"
                className={navLinkClass('/products')}
                title="Products"
                aria-current={isActive('/products') ? 'page' : undefined}
              >
                <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
                <span>Products</span>
              </Link>
            </div>

            <form
              onSubmit={handleSearchSubmit}
              role="search"
              className="search-expand relative mx-auto min-w-0 flex-1 lg:max-w-[420px] xl:max-w-[540px]"
            >
              <label htmlFor="site-search" className="sr-only">
                Search products
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: 'var(--text-subtle)' }}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
                <input
                  id="site-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search crackers, gift boxes and more..."
                  autoComplete="off"
                  className="input-premium is-glass pl-11 pr-4 text-sm"
                  style={{ borderRadius: 'var(--r-pill)' }}
                />
              </div>
              <button
                type="submit"
                className="sr-only focus:not-sr-only focus:absolute focus:right-0 focus:top-full focus:z-raised focus:mt-2 focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-[var(--r-pill)] focus:px-5 focus:py-2 focus:text-sm focus:font-semibold"
                style={{ background: 'var(--ember-600)', color: '#FFFFFF', boxShadow: 'var(--shadow-md)' }}
              >
                Search
              </button>
            </form>

            <div className="flex shrink-0 items-center gap-2 xl:gap-3">
              <Link
                to="/cart"
                className={navLinkClass('/cart')}
                title="Cart"
                aria-current={isActive('/cart') ? 'page' : undefined}
              >
                <span className="relative inline-flex">
                  <ShoppingCart className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
                  <CartCountBadge count={cartCount} reduced={reduced} />
                </span>
                <span>Cart</span>
              </Link>

              <a href={PHONE_HREF} className="arrow-btn shrink-0" aria-label="Call us" title="Call us">
                <Phone className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
              </a>

              {canSeeBilling && (
                <Link to="/admin/billing" className="btn-primary shrink-0 px-4 py-2 text-sm">
                  <Receipt className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                  <span>Billing</span>
                </Link>
              )}

              {authLoading ? (
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center"
                  aria-hidden="true"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span className="h-full w-full rounded-full" style={{ background: 'var(--surface-sunken)' }}>
                    <span className="skeleton block h-full w-full rounded-full" />
                  </span>
                </span>
              ) : user ? (
                <div className="relative shrink-0" ref={profileMenuRef}>
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
                        className="modal-glass z-raised absolute right-0 mt-3 max-h-[calc(100vh-6rem)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto"
                        style={{
                          borderRadius: 'var(--r-lg)',
                          transformOrigin: 'top right',
                        }}
                      >
                        <div
                          className="flex items-center gap-3 px-4 py-3"
                          style={{
                            background: 'var(--surface-sunken)',
                            borderBottom: '1px solid var(--hairline)',
                          }}
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

                        <div className="flex flex-col py-2">
                          {accountLinks.map((item) => {
                            const Icon = item.icon;
                            return (
                              <Link
                                key={item.to}
                                to={item.to}
                                onClick={() => setShowProfileMenu(false)}
                                className={menuRowClass}
                                style={{ color: 'var(--text-body)' }}
                              >
                                <Icon
                                  className="h-4 w-4 shrink-0"
                                  style={{ color: 'var(--ember-600)' }}
                                  strokeWidth={2.2}
                                  aria-hidden="true"
                                />
                                <span>{item.label}</span>
                              </Link>
                            );
                          })}

                          <a href={PHONE_HREF} className={menuRowClass} style={{ color: 'var(--text-body)' }}>
                            <Phone
                              className="h-4 w-4 shrink-0"
                              style={{ color: 'var(--ember-600)' }}
                              strokeWidth={2.2}
                              aria-hidden="true"
                            />
                            <span>Call Us</span>
                          </a>

                          <hr
                            style={{
                              border: 0,
                              borderTop: '1px solid var(--hairline)',
                              margin: '0.5rem 0',
                            }}
                          />

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
                <Link to="/login" className="btn-primary shrink-0 px-4 py-2 text-sm">
                  <LogIn className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                  <span>Login</span>
                </Link>
              )}
            </div>
          </div>

          {/* ================= Mobile ================= */}
          <div className="flex items-center gap-1.5 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-pill)] border bg-[var(--surface-card)] shadow-xs lg:hidden"
              style={{ borderColor: 'var(--hairline-strong)', color: 'var(--text-muted)' }}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </button>

            <Link
              to="/"
              className="flex min-h-[44px] min-w-0 flex-1 items-center justify-center px-1"
              aria-label="Crackers Hyderabad, home"
            >
              <img
                src={logoUrl}
                alt=""
                aria-hidden="true"
                width={40}
                height={40}
                decoding="async"
                className="mr-1.5 h-10 w-10 shrink-0 sm:h-11 sm:w-11"
                style={{ borderRadius: '50%' }}
              />
              <span
                className="truncate text-[13px] font-bold tracking-tight leading-tight min-[360px]:text-sm sm:text-base"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-strong)' }}
              >
                {wordmark}
              </span>
            </Link>

            {/* Mobile search is available on every page including products */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-pill)] border bg-[var(--surface-card)] shadow-xs"
              style={{ borderColor: 'var(--hairline-strong)', color: 'var(--text-muted)' }}
              aria-label="Search products"
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
            >
              <Search className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </button>

            <Link
              to="/cart"
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-pill)] border bg-[var(--surface-card)] shadow-xs"
              aria-label={`Cart, ${cartCount} items`}
              aria-current={isActive('/cart') ? 'page' : undefined}
              style={
                isActive('/cart')
                  ? { color: 'var(--ember-600)', borderColor: 'var(--ember-600)' }
                  : { borderColor: 'var(--hairline-strong)', color: 'var(--text-muted)' }
              }
            >
              <ShoppingCart className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
              <CartCountBadge count={cartCount} reduced={reduced} />
            </Link>
          </div>

          {/* Product notification pill (below the bar) */}
          <CartNotificationPill />
        </div>
      </nav>

      <AnimatePresence>
        {mobileMenuOpen && (
          <MobileMenu
            key="mobile-menu"
            onClose={closeMobileMenu}
            pathname={pathname}
            user={user}
            isAdmin={isAdmin}
            isSales={isSales}
            isBilling={isBilling}
            isPacker={isPacker}
            isMod={isMod}
            isStaffMember={isStaffMember}
            canSeeBilling={canSeeBilling}
            cartCount={cartCount}
            onSignOut={signOut}
            phoneHref={PHONE_HREF}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <SearchOverlay
            key="search-overlay"
            onClose={closeSearch}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onSubmit={handleSearchSubmit}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
