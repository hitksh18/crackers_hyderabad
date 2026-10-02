import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard.
 *
 * `adminOnly` / `adminOrSales` / `staffOnly` are the original coarse flags and
 * behave exactly as before. `allowRoles` is the explicit form: pass the exact
 * roles permitted on the route.
 *
 * Loading and error UI are premium dark surfaces (auth-loader) but the
 * authorization logic itself is unchanged.
 */
const ProtectedRoute = ({
  children,
  adminOnly = false,
  adminOrSales = false,
  staffOnly = false,
  allowRoles = null,
}) => {
  const { user, isAdmin, isSales, isStaff, userRole, loading, roleError, refreshRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Checking your access"
        className="auth-loader"
      >
        {/* subtle warm haze behind logo — extremely low opacity */}
        <div aria-hidden="true" className="auth-loader__glow" />
        <span aria-hidden="true" className="auth-loader__speck" style={{ left: '30%', top: '28%' }} />
        <span aria-hidden="true" className="auth-loader__speck" style={{ right: '26%', bottom: '32%', opacity: 0.2 }} />

        <div className="auth-loader__inner">
          {/* Brand mark — uses the exact project logo asset */}
          <div className="auth-loader__brand" aria-hidden="true">
            <span className="auth-loader__halo" />
            <span className="auth-loader__ring" />
            <img
              src="/images/website/nav-logo.png"
              alt=""
              width={84}
              height={84}
              decoding="async"
              fetchPriority="high"
              className="auth-loader__logo"
            />
          </div>

          <div className="auth-loader__copy">
            <p className="auth-loader__title">Checking your access</p>
            <p className="auth-loader__subtitle">
              <span>One moment please</span>
              <span className="auth-loader__dots" aria-hidden="true">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
          </div>

          <div className="auth-loader__track" aria-hidden="true">
            <span className="auth-loader__shimmer" />
          </div>

          <span className="sr-only">Verifying your session — please wait</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roleError && !userRole) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="auth-loader auth-loader--error"
      >
        <div aria-hidden="true" className="auth-loader__glow" />
        <div className="auth-loader__inner">
          <div className="auth-loader__brand" aria-hidden="true">
            <span className="auth-loader__halo" />
            <img
              src="/images/website/nav-logo.png"
              alt=""
              width={84}
              height={84}
              decoding="async"
              className="auth-loader__logo"
            />
          </div>

          <div className="auth-loader__copy">
            <p className="auth-loader__title">Unable to verify access</p>
            <p
              className="auth-loader__subtitle"
              style={{ maxWidth: '30ch', textAlign: 'center', lineHeight: 1.6 }}
            >
              We had trouble reaching the server. Please try again.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshRole}
            className="btn-primary"
            style={{ minWidth: 148, marginTop: 4 }}
          >
            Try Again
          </button>

          <p className="auth-loader__foot" aria-hidden="true">
            Crackers Hyderabad
          </p>
        </div>
      </div>
    );
  }

  if (allowRoles && !allowRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (adminOrSales && !isAdmin && !isSales) {
    return <Navigate to="/" replace />;
  }

  if (staffOnly && !isAdmin && !isSales && !isStaff) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
