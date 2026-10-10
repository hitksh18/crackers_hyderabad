import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ScrollToTop from './components/ScrollToTop';
import Navbar from './components/Navbar';
import CheckoutNavbar from './components/CheckoutNavbar';
import TopBanner from './components/TopBanner';
import CustomToast from './components/CustomToast';
import ProtectedRoute from './components/ProtectedRoute';
// Below-the-fold / deferred chrome: the copyright strip never renders on the
// home page and the WhatsApp float renders null until its Firestore settings
// arrive, so both load after the first paint without changing any behaviour.
const SimpleCopyright = lazy(() => import('./components/SimpleCopyright'));
const WhatsAppButton = lazy(() => import('./components/WhatsAppButton'));
import { ThemeProvider } from './contexts/ThemeContext';
import { useReducedMotion } from './hooks/useReducedMotion';
import { pageVariants } from './lib/motion';
import { trackPageview as trackGaPageview } from './lib/analytics';
import { ProductGridSkeleton } from './components/ui/Skeleton';
import { trackPageview } from './utils/siteTracker';

// Home is the landing route — it stays eager so the hero paints immediately.
// Every other storefront route splits into its own chunk: visitors only
// download the page they navigate to, never on the first load.
import Home from './pages/Home';
const Products = lazy(() => import('./pages/Products'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));
const MyOrders = lazy(() => import('./pages/MyOrders'));

// Staff and admin surfaces live in the separate admin frontend
// (admin.crackershyderabad.com); the counter register lives at
// billing.crackershyderabad.com. They are intentionally not imported here,
// so the public store never downloads staff code.

const RouteFallback = () => (
  <div className="shell section-pad-sm">
    <ProductGridSkeleton count={4} label="Loading page" />
  </div>
);

function AppContent() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const isHomePage = location.pathname === '/';
  const isProductsPage = location.pathname === '/products';
  const isCheckoutPage = location.pathname === '/checkout';
  const isCartPage = location.pathname === '/cart';
  /* Focused authentication screen: no storefront chrome (banner, navbar,
     footer strip, WhatsApp float) on /login. */
  const isLoginPage = location.pathname === '/login';
  /* The scrolling announcement bar sits above the navbar on the storefront
     routes that show it. Product detail is one of them, so it gets the exact
     same TopBanner instance as the home page. */
  const showTopBanner = ['/', '/products', '/cart', '/profile'].includes(location.pathname)
    || location.pathname.startsWith('/product/');

  /* Two independent pageview channels, deliberately not merged.

     GA4 skips the initial load because gtag('config') in index.html has
     already reported it, and it follows the search string because Google's
     reports treat ?query as part of the page. The first-party tracker does
     neither: it must see the landing page (that hit carries the session's
     referrer) and it keys aggregates by path alone, so a query string cannot
     split one page across many rows. */
  const firstRouteLoad = useRef(true);
  useEffect(() => {
    if (firstRouteLoad.current) {
      firstRouteLoad.current = false;
      return;
    }
    trackGaPageview(location.pathname + location.search, document.title);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const blockImageSave = (e) => {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', blockImageSave);
    document.addEventListener('dragstart', blockImageSave);
    return () => {
      document.removeEventListener('contextmenu', blockImageSave);
      document.removeEventListener('dragstart', blockImageSave);
    };
  }, []);

  /* One pageview per navigation. A single-page app never reloads, so without
     this the shop would only ever see landing pages. The tracker itself decides
     what to skip (staff routes, local development) and never throws. */
  useEffect(() => {
    trackPageview(location.pathname);
  }, [location.pathname]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-xl focus:bg-white focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:shadow-lift"
        style={{ color: 'var(--maroon-700)' }}
      >
        Skip to main content
      </a>

      <ScrollToTop />
      {/* Festive ticker first (scrolls away), then the fixed navbar with its
          own height spacer — the strip can never slide under or overlap
          the bar. */}
      {!isLoginPage && showTopBanner && <TopBanner />}
      {!isLoginPage && (isCheckoutPage ? <CheckoutNavbar /> : isCartPage ? <CheckoutNavbar title="Shopping Cart" /> : <Navbar />)}

      <main
        id="main-content"
        tabIndex={-1}
        className="focus:outline-none flex-grow"
      >
        {/* Enter-only transition: the incoming page never waits on an exit
            animation, so navigation stays as fast as it was. The Products
            page renders without the entrance animation so the catalogue is
            immediately stable on load/refresh. */}
        <motion.div
          key={location.pathname}
          className="admin-route-wrap"
          variants={pageVariants(reduced)}
          initial={isProductsPage ? false : 'initial'}
          animate={isProductsPage ? undefined : 'animate'}
        >
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/products" element={<Products />} />
              <Route path="/product/:slug" element={<ProductDetail />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order-success" element={<OrderSuccess />} />
              <Route path="/track-order" element={<TrackOrder />} />
              <Route path="/track/:orderCode" element={<OrderTracking />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-orders"
                element={
                  <ProtectedRoute>
                    <MyOrders />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </motion.div>
      </main>

      {/* The desktop cart is a fixed-viewport workspace — the footer strip
          stays out of its way on lg so it can never push the page into a
          document scroll. Mobile keeps the footer with its natural scroll. */}
      {!isHomePage && !isLoginPage && (
        <div className={isCartPage ? 'lg:hidden' : undefined}>
          <Suspense fallback={null}>
            <SimpleCopyright />
          </Suspense>
        </div>
      )}
      {!isLoginPage && (
        <Suspense fallback={null}>
          <WhatsAppButton />
        </Suspense>
      )}
      <CustomToast />
    </>
  );
}

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </Router>
  );
}

/* Sits below BrowserRouter so it can read the location, and above the page
   content so it can shape the shell. The storefront is a single scrolling
   column: banner, navbar, page, footer chrome. */
function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppContent />
    </div>
  );
}

export default App;
