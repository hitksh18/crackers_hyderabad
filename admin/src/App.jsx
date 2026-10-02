import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import CustomToast from './components/CustomToast';
import ScrollToTop from './components/ScrollToTop';
import Login from './pages/Login';
import { BILLING_URL } from './lib/billingUrl';

// Staff console router. Routes are root-level: this app is served at
// admin.crackershyderabad.com, so /dashboard — never /admin/dashboard.
// Guards mirror the old storefront route guards exactly; the API remains the
// real authorization boundary.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Products = lazy(() => import('./pages/Products'));
const AddProduct = lazy(() => import('./pages/AddProduct'));
const EditProduct = lazy(() => import('./pages/EditProduct'));
const Categories = lazy(() => import('./pages/Categories'));
const Users = lazy(() => import('./pages/Users'));
const PriceList = lazy(() => import('./pages/PriceList'));
const Canvas = lazy(() => import('./pages/Canvas'));
// NOTE: the counter register is NOT an admin route. It runs as its own
// frontend (see /billing); /billing below is only a signpost pointing there.

/* Roles permitted on the shared staff surfaces. The vocabulary is exactly
   admin, sales, customer — these mirror the predicates the pages themselves
   use, so if you change one, change the other. */
const ORDERS_ROLES = ['admin'];
const PRICE_LIST_ROLES = ['admin', 'sales'];
/* Roles whose home is the billing console: they pass through this signpost
   on the way in (login landing, root redirect) and are forwarded. Admin may
   open it manually and stays for the explicit "Open Billing" button. */
const BILLING_HOME_ROLES = ['sales'];

const RouteFallback = () => (
  <div className="shell section-pad-sm">
    <p className="label-caps" style={{ color: 'var(--text-subtle)' }}>Loading…</p>
  </div>
);

/* Role-aware landing: sends each staff role to its home and never bounces a
   signed-in user between guards. Non-staff sessions are rejected at login, so
   reaching here without a staff role means "go sign in". */
function RootRedirect() {
  const { userRole } = useAuth();
  if (userRole === 'admin') return <Navigate to="/dashboard" replace />;
  if (userRole === 'sales') return <Navigate to="/billing" replace />;
  return <Navigate to="/login" replace />;
}

/* The counter register moved to its own app (billing.crackershyderabad.com).
   Staff bookmarks and the sales/billing landing path still resolve here, so
   this signpost forwards those roles straight there — the explicit button
   stays as the manual fallback for admins opening it by hand. */
function BillingMoved() {
  const { userRole } = useAuth();
  useEffect(() => {
    if (BILLING_HOME_ROLES.includes(userRole)) window.location.replace(BILLING_URL);
  }, [userRole]);

  return (
    <div className="shell section-pad grid place-items-center">
      <div
        className="w-full max-w-md rounded-2xl border p-8 text-center"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <p className="label-caps" style={{ color: 'var(--gold-500)' }}>Counter billing</p>
        <h1 className="mt-3 text-xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
          Billing moved to its own app
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          The register now runs at billing.crackershyderabad.com. Opening it now and signing in with your staff account.
        </p>
        <a href={BILLING_URL} className="btn-primary mt-6 w-full">
          Open Billing
        </a>
      </div>
    </div>
  );
}

function AdminShell() {
  const location = useLocation();
  const isDashboardPath = location.pathname === '/dashboard';
  // The dashboard overview owns the whole viewport on desktop (app-viewport,
  // no page scroll). Below lg it behaves like a normal page: content
  // determines the height and the document scrolls — otherwise
  // taller-than-viewport content on phones would be clipped with no way to
  // reach it.
  const shellClass = isDashboardPath
    ? 'flex min-h-screen flex-col lg:h-screen lg:overflow-hidden'
    : 'flex min-h-screen flex-col';

  return (
    <div className={shellClass}>
      <ScrollToTop />
      <main className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<RouteFallback />}>
          <Routes location={location}>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <RootRedirect />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute adminOnly>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute adminOnly>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute allowRoles={ORDERS_ROLES}>
                  <Orders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders/:orderId"
              element={
                <ProtectedRoute allowRoles={ORDERS_ROLES}>
                  <OrderDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute adminOnly>
                  <Products />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products/add"
              element={
                <ProtectedRoute adminOnly>
                  <AddProduct />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products/edit/:id"
              element={
                <ProtectedRoute adminOnly>
                  <EditProduct />
                </ProtectedRoute>
              }
            />
            <Route
              path="/categories"
              element={
                <ProtectedRoute adminOnly>
                  <Categories />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute adminOnly>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing"
              element={
                /* Plain admin/sales landing: the signpost forwards sales (and
                   admin on the explicit button) to the register. */
                <ProtectedRoute allowRoles={[...BILLING_HOME_ROLES, 'admin']}>
                  <BillingMoved />
                </ProtectedRoute>
              }
            />
            <Route
              path="/price-list"
              element={
                <ProtectedRoute allowRoles={PRICE_LIST_ROLES}>
                  <PriceList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/canvas"
              element={
                <ProtectedRoute adminOnly>
                  <Canvas />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <CustomToast />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        {/* Cart/Wishlist state exists only for the Canvas live preview's
            product cards. No checkout or persistence flows live here. */}
        <CartProvider>
          <WishlistProvider>
            <NotificationProvider>
              <AdminShell />
            </NotificationProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
