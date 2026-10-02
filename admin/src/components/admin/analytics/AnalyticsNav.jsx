import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import RangePicker from './RangePicker';
import AccountMenu from '../AccountMenu';

/**
 * Dedicated Live Analytics navbar.
 *
 * Deliberately NOT the Admin Dashboard top bar: no global search, no server
 * status, no billing/orders links, no notifications, no profile. Just the
 * workspace chrome — back, centered title, date range + refresh.
 */
export default function AnalyticsNav({ range, onChange, onRefresh, refreshing, loading, disabled }) {
  return (
    <header className="ana-nav">
      <div className="ana-nav-inner">
        <div className="ana-nav-left">
          <Link to="/dashboard" className="ana-back" aria-label="Back to dashboard">
            <ArrowLeft aria-hidden="true" />
            <span className="ana-back-full">Back to Dashboard</span>
            <span className="ana-back-short">Back</span>
          </Link>
        </div>

        <h1 className="ana-nav-title">Live Analytics</h1>

        <div className="ana-nav-right">
          <div className="ana-range">
            <RangePicker range={range} onChange={onChange} disabled={disabled || loading} compact />
          </div>
          <span className="ana-div" aria-hidden="true" />
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || refreshing}
            className="ana-refresh"
            title="Refresh analytics"
          >
            {refreshing
              ? <Loader2 className="animate-spin" aria-hidden="true" />
              : <RefreshCw aria-hidden="true" />}
            <span>Refresh</span>
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
