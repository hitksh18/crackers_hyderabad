import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import CustomToast from './components/CustomToast';
import Login from './pages/Login';
import { BILLING_ROLES } from './lib/roles';

// Counter billing terminal. Served at billing.crackershyderabad.com.
// ONLY admin and sales roles may pass the guards below — everything else
// (customer, unknown) is rejected at login and by the
// route guard. The API remains the real authorization boundary.
const Billing = lazy(() => import('./pages/Billing'));

/* Shown when a signed-in user lacks a billing role. Offers a clean exit to
   switch accounts — never the register, never a redirect loop. */
function AccessDenied() {
  const { signOut, userRole } = useAuth();
  return (
    <div className="grid min-h-screen place-items-center px-4" style={{ background: 'var(--surface-page)' }}>
      <div className="w-full max-w-md rounded-2xl border p-8 text-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <p className="label-caps" style={{ color: 'var(--crimson-600)' }}>Access denied</p>
        <h1 className="mt-3 text-xl font-bold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
          Billing is restricted to staff
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          {userRole
            ? `This account is signed in with the “${userRole}” role, which cannot access the billing terminal.`
            : 'This account does not have a billing role.'}{' '}
          Please sign in with an admin or sales account.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { signOut().catch(() => {}); }}
            className="btn-primary w-full"
          >
            Sign out
          </button>
          <Link to="/login" className="btn-outline w-full">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

const RouteFallback = () => (
  <div className="shell section-pad-sm">
    <p className="label-caps" style={{ color: 'var(--text-subtle)' }}>Loading…</p>
  </div>
);

function BillingShell() {
  // The register owns the whole viewport, exactly as it did inside admin.
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <main className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/denied" element={<AccessDenied />} />
            <Route
              path="/"
              element={
                <ProtectedRoute allowRoles={BILLING_ROLES}>
                  <Billing />
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
        <BillingShell />
      </AuthProvider>
    </Router>
  );
}

export default App;
