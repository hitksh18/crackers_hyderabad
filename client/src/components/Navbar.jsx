import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home as HomeIcon,
  ShoppingBag,
  ShoppingCart,
  Heart,
  User,
  LogOut,
  ClipboardList,
  LogIn,
  Search,
  X,
  Phone,
  Menu,
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { readSiteSettings } from '../lib/siteSettings';
import { productPath } from '../lib/productLinks';
import { popoverVariants, SPRING } from '../lib/motion';
import UserAvatar from './UserAvatar';
// Interaction-only surfaces: the mobile menu, the mobile search overlay and
// the cart toast never appear on first paint (they mount on tap / add-to-cart
// only), so they split into on-demand chunks instead of weighing down the
// header's first render. The bar itself — logo, links, search, cart, profile
// — stays fully synchronous above.
const CartNotificationPill = lazy(() => import('./CartNotificationPill'));
const MobileMenu = lazy(() => import('./MobileMenu'));
const SearchOverlay = lazy(() => import('./SearchOverlay'));
/* Suggestion dropdown overlays the header only while typing — split out so
   the header's first render stays synchronous (see note above). */
const SearchSuggestions = lazy(() => import('./SearchSuggestions'));
const DESKTOP_LISTBOX_ID = 'site-search-suggestions';


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
  const { wishlistCount } = useWishlist();
  const { user, signOut } = useAuth();
  const reduced = useReducedMotion();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const isActive = (path) => pathname === path;
  /* /products is a search RESULTS page: the navbar input filters the grid
     in real time (via ?q=) and the suggestion dropdown NEVER renders there.
     Every other route keeps the suggestion dropdown (with Add to Cart). */
  const isProductsPage = pathname === '/products';
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  /* Suggestion dropdown state — overlay only, never affects bar layout. */
  const [suggestOpen, setSuggestOpen] = useState(false);
  const searchInputRef = useRef(null);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO);
  /* Fixed header: no scroll-driven compaction — the bar keeps one look. */
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

  /* Fixed-header contract: the announcement bar is fixed at viewport top
     and this navbar is fixed directly beneath it (top comes from
     --top-banner-h in CSS), so NEITHER ever scrolls away, shrinks, hides,
     or changes position. No scroll listener is needed — and none is wanted
      (hide-on-scroll / shrink-on-scroll are explicitly out). Height is
     still published for page offsets and the hero viewport math. */

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
    setSuggestOpen(false);
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

  /* Submit-only fallback is the form submit; live suggestions overlay the
     header search bar (desktop) and the mobile search sheet, sharing the
     home hero's ranking engine. Submitting navigates to /products?q=, which
     filters the catalogue inline. The query clears so the bar resets. */
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSuggestOpen(false);
    if (isProductsPage) {
      /* Results page: flush the filter immediately, keep the typed text. */
      pushProductsQuery(q);
      setSearchOpen(false);
      return;
    }
    navigate(`/products?q=${encodeURIComponent(q)}`);
    setSearchQuery('');
    setSearchOpen(false);
  };

  /* Live results-page plumbing: on /products the input writes the query
     into ?q= (other params preserved) so the grid filters in real time.
     lastPushed separates OUR pushes from external navigation, keeping the
     input and the URL in sync without feedback loops. */
  const lastPushedRef = useRef(null);

  const pushProductsQuery = useCallback((rawQuery) => {
    const q = String(rawQuery || '').trim();
    const params = new URLSearchParams(search);
    if ((params.get('q') || '') === q) return;
    lastPushedRef.current = q;
    if (q) params.set('q', q);
    else params.delete('q');
    const qs = params.toString();
    navigate(`/products${qs ? `?${qs}` : ''}`, { replace: true });
  }, [navigate, search]);

  /* URL → input (deep links, back/forward): only when the URL query was
     not produced by this input. */
  useEffect(() => {
    if (!isProductsPage) return;
    const qParam = new URLSearchParams(search).get('q') || '';
    if (lastPushedRef.current === qParam) return;
    lastPushedRef.current = qParam;
    setSearchQuery((prev) => (prev === qParam ? prev : qParam));
  }, [isProductsPage, search]);

  /* input → URL on /products, short debounce so typing feels instant but
     navigation is not spammed per keystroke. */
  useEffect(() => {
    if (!isProductsPage) return undefined;
    const t = window.setTimeout(() => pushProductsQuery(searchQuery), 120);
    return () => window.clearTimeout(t);
  }, [searchQuery, isProductsPage, pushProductsQuery]);

  /* Suggestion picks share the existing routes — product page for a row,
     /products?q= for "view all". The query clears so the bar resets. */
  const handleSuggestionPick = useCallback((product) => {
    if (!product) return;
    setSuggestOpen(false);
    setSearchQuery('');
    setSearchOpen(false);
    navigate(productPath(product));
  }, [navigate]);

  const handleSearchViewAll = useCallback(() => {
    const q = searchQuery.trim();
    if (!q) return;
    setSuggestOpen(false);
    setSearchQuery('');
    setSearchOpen(false);
    navigate(`/products?q=${encodeURIComponent(q)}`);
  }, [navigate, searchQuery]);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const navLinkClass = (path) => `nav-link ${isActive(path) ? 'active' : ''}`;

  /* Staff surfaces (billing register, dashboard, orders console, price list)
     live in the separate admin frontend. The storefront menu carries only
     customer account links. */
  const accountLinks = [
    { to: '/profile', label: 'My Profile', icon: User, show: true },
    { to: '/my-orders', label: 'My Orders', icon: ClipboardList, show: true },
  ].filter((item) => item.show);

  const menuRowClass =
    'flex min-h-[44px] items-center gap-3 px-4 text-sm font-medium transition-colors hover:bg-primary-50 dark:hover:bg-white/10';

  const wordmark = (
    <>
      Crackers <span style={{ color: 'var(--gold-400)' }}>Hyderabad</span>
    </>
  );

  return (
    <>
      <nav
        ref={navRef}
        className={`glass-nav nav-fixed sticky top-0 z-nav${pathname === '/' ? ' home-nav' : ''}`}
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
                alt="Crackers Hyderabad – Firecrackers in Hyderabad"
                width={64}
                height={64}
                decoding="async"
                fetchPriority="high"
                className="h-16 w-16 shrink-0"
                style={{ borderRadius: '50%' }}
              />
              <motion.span
                whileHover={reduced ? undefined : { scale: 1.02 }}
                transition={SPRING.snappy}
                className="whitespace-nowrap text-xl font-bold tracking-tight"
                style={{ fontFamily: 'var(--font-display)', color: '#FDF9F0' }}
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
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (!isProductsPage) setSuggestOpen(e.target.value.trim().length > 0);
                  }}
                  onFocus={() => {
                    if (!isProductsPage && searchQuery.trim().length > 0) setSuggestOpen(true);
                  }}
                  placeholder="Search crackers, gift boxes and more..."
                  autoComplete="off"
                  aria-label="Search products"
                  role={isProductsPage ? 'searchbox' : 'combobox'}
                  aria-expanded={isProductsPage ? undefined : suggestOpen && searchQuery.trim().length > 0}
                  aria-controls={isProductsPage ? undefined : DESKTOP_LISTBOX_ID}
                  aria-autocomplete={isProductsPage ? undefined : 'list'}
                  className={`input-premium is-glass pl-11 text-sm${searchQuery ? ' pr-10' : ' pr-4'}`}
                  style={{ borderRadius: 'var(--r-pill)' }}
                />
                {/* Subtle clear control — resets the bar in place, never navigates. */}
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSuggestOpen(false);
                      searchInputRef.current?.focus();
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: 'var(--text-subtle)' }}
                  >
                    <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="sr-only focus:not-sr-only focus:absolute focus:right-0 focus:top-full focus:z-raised focus:mt-2 focus:inline-flex focus:min-h-[44px] focus:items-center focus:rounded-[var(--r-pill)] focus:px-5 focus:py-2 focus:text-sm focus:font-semibold"
                style={{ background: 'var(--ember-600)', color: '#FFFFFF', boxShadow: 'var(--shadow-md)' }}
              >
                Search
              </button>
              {/* Live suggestions overlay — absolute, out of flow: the bar's
                  size and position never change. Never rendered on
                  /products, where the input filters the grid instead. */}
              {!isProductsPage && (
                <Suspense fallback={null}>
                  <SearchSuggestions
                    query={searchQuery}
                    open={suggestOpen}
                    onOpenChange={setSuggestOpen}
                    onPick={handleSuggestionPick}
                    onViewAll={handleSearchViewAll}
                    inputRef={searchInputRef}
                    listboxId={DESKTOP_LISTBOX_ID}
                    floating
                    showAddToCart
                  />
                </Suspense>
              )}
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

              <Link
                to="/wishlist"
                className={navLinkClass('/wishlist')}
                title="Favorites"
                aria-label={wishlistCount > 0 ? `Favorites, ${wishlistCount} items` : 'Favorites'}
                aria-current={isActive('/wishlist') ? 'page' : undefined}
              >
                <span className="relative inline-flex">
                  <Heart className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
                  <CartCountBadge count={wishlistCount} reduced={reduced} />
                </span>
                <span>Favorites</span>
              </Link>

              <a href={PHONE_HREF} className="arrow-btn shrink-0" aria-label="Call us" title="Call us">
                <Phone className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
              </a>

              {/* Account slot renders its settled logged-out state on the very
                  first paint and upgrades in place when Firebase auth + roles
                  resolve — it never shows a skeleton or blank space while
                  loading, and the navbar never waits on authentication. */}
              {user ? (
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
                <Link to="/login" className="btn-maroon nav-login-btn shrink-0 px-4 py-2 text-sm">
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-pill)] border shadow-xs lg:hidden"
              style={{ borderColor: 'rgba(210,166,79,0.35)', background: 'rgba(253,249,240,0.08)', color: '#FDF9F0' }}
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
                alt="Crackers Hyderabad – Firecrackers in Hyderabad"
                width={40}
                height={40}
                decoding="async"
                fetchPriority="high"
                className="mr-1.5 h-10 w-10 shrink-0 sm:h-11 sm:w-11"
                style={{ borderRadius: '50%' }}
              />
              <span
                className="truncate text-[13px] font-bold tracking-tight leading-tight min-[360px]:text-sm sm:text-base"
                style={{ fontFamily: 'var(--font-display)', color: '#FDF9F0' }}
              >
                {wordmark}
              </span>
            </Link>

            {/* Mobile search is available on every page including products */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-pill)] border shadow-xs"
              style={{ borderColor: 'rgba(210,166,79,0.35)', background: 'rgba(253,249,240,0.08)', color: '#FDF9F0' }}
              aria-label="Search products"
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
            >
              <Search className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </button>

            <Link
              to="/cart"
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-pill)] border shadow-xs"
              aria-label={`Cart, ${cartCount} items`}
              aria-current={isActive('/cart') ? 'page' : undefined}
              style={
                isActive('/cart')
                  ? { color: 'var(--gold-400)', borderColor: 'var(--gold-400)', background: 'rgba(253,249,240,0.12)' }
                  : { borderColor: 'rgba(210,166,79,0.35)', background: 'rgba(253,249,240,0.08)', color: '#FDF9F0' }
              }
            >
              <ShoppingCart className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
              <CartCountBadge count={cartCount} reduced={reduced} />
            </Link>
          </div>

          {/* Product notification pill (below the bar) */}
          <Suspense fallback={null}>
            <CartNotificationPill />
          </Suspense>
        </div>
      </nav>

      {/* Spacer reserving the fixed header's height (live banner + nav vars,
          so page content always starts below both bars instead of guessing
          at hardcoded offsets. */}
      <div aria-hidden="true" style={{ height: 'calc(var(--top-banner-h, 0px) + var(--nav-h, 72px))' }} />

      <AnimatePresence>
        {mobileMenuOpen && (
          <Suspense fallback={null}>
            <MobileMenu
              key="mobile-menu"
              onClose={closeMobileMenu}
              pathname={pathname}
              user={user}
              cartCount={cartCount}
              wishlistCount={wishlistCount}
              onSignOut={signOut}
              phoneHref={PHONE_HREF}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <Suspense fallback={null}>
            <SearchOverlay
              key="search-overlay"
              onClose={closeSearch}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onSubmit={handleSearchSubmit}
              onPickProduct={handleSuggestionPick}
              onViewAll={handleSearchViewAll}
              enableSuggestions={!isProductsPage}
              showAddToCart
            />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
