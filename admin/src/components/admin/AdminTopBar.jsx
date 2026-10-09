import { Link } from 'react-router-dom';
import { Search, ShoppingCart, Bell, Receipt, Settings } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import { BILLING_URL } from '../../lib/billingUrl';
import { useAdminIdentity, useToday } from '../../hooks/useAdminIdentity';
import AccountMenu from './AccountMenu';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const AdminTopBar = ({ searchValue = '', onSearchChange, showSearch = true, onNotificationClick }) => {
  const { unreadCount, liveOrderCount, serverStatus } = useNotifications();
  const { isAdmin, isSales } = useAuth();
  const { name: adminName, roleLabel } = useAdminIdentity();
  const today = useToday();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOnline = serverStatus === 'online';
  const canSeeBilling = isAdmin || isSales;
  const handleBellClick = onNotificationClick || (() => setInternalOpen(true));

  return (
    <>
      <header className="admin-topbar sticky top-0 z-40 flex h-[68px] w-full shrink-0 items-center gap-3 border-b px-4 transition-colors duration-200 lg:px-8 xl:px-10" style={{ borderColor: 'var(--admin-border)', background: 'var(--admin-bg)' }}>
        {/* No store branding here — the sidebar owns the single identity.
            Search stays centered, identity and actions stay right. */}

        {showSearch ? (
          <div className="admin-topbar-search mx-2 hidden flex-1 justify-center lg:flex">
            <div className="admin-topbar-searchbox relative w-full max-w-[560px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
              <input
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Search products, orders, customers, categories..."
                className="h-9 w-full rounded-full border bg-[var(--surface-sunken)] pl-10 pr-4 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-200"
                style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
              />
            </div>
          </div>
        ) : (
          <div className="hidden flex-1 lg:block" />
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:inline-flex transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }}>
            <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-[var(--leaf-600)]' : 'bg-[var(--crimson-600)]'}`} />
            {isOnline ? 'Server Online' : 'Server Offline'}
          </span>

          {canSeeBilling && (
            <a href={BILLING_URL} target="_blank" rel="noreferrer" title="Open the billing terminal in a new tab" className="hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:inline-flex transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }}>
              <Receipt className="h-3.5 w-3.5" style={{ color: 'var(--ember-600)' }} /> Billing
            </a>
          )}

          <Link to="/orders" className="hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium sm:inline-flex transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }}>
            <ShoppingCart className="h-3.5 w-3.5" style={{ color: 'var(--gold-500)' }} /> {liveOrderCount} Orders
          </Link>

          {/* Admin-only: system settings live on the Site Settings page. */}
          {isAdmin && (
            <Link
              to="/site-settings"
              title="Site settings"
              className="hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-200 sm:inline-flex"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }}
            >
              <Settings className="h-3.5 w-3.5" style={{ color: 'var(--text-subtle)' }} /> Settings
            </Link>
          )}

          {/* Signed-in identity + date — kept compact, hidden on small screens
              where the avatar menu still carries the account. */}
          <div className="hidden min-w-0 flex-col items-end leading-tight md:flex" title={today.full}>
            <span className="max-w-[160px] truncate text-[13px] font-semibold" style={{ color: 'var(--text-strong)' }}>
              {adminName}
            </span>
            <span className="text-[11px] tabular" style={{ color: 'var(--text-subtle)' }}>
              {roleLabel} • {today.short}
            </span>
          </div>

          <button
            onClick={handleBellClick}
            className="relative grid h-9 w-9 place-items-center rounded-full border bg-[var(--surface-sunken)] hover:opacity-90 transition-colors duration-200"
            style={{ borderColor: 'var(--hairline)', color: 'var(--text-body)' }}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[10px] font-bold" style={{ background: 'var(--ember-600)', color: '#fff' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AccountMenu />
        </div>
      </header>

      <AnimatePresence>
        {internalOpen && !onNotificationClick && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setInternalOpen(false)} className="fixed inset-0 z-50 bg-black/50" />
            <motion.div
              initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 flex h-full w-[92vw] max-w-[400px] flex-col border-l shadow-2xl"
              style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
            >
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--hairline)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Notifications</h2>
                <button onClick={() => setInternalOpen(false)} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                  <span className="text-sm">×</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No new notifications</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default AdminTopBar;
