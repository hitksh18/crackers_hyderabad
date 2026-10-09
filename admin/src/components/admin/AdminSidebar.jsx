import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BILLING_URL } from '../../lib/billingUrl';
import './AdminSidebar.css';

/**
 * Primary admin navigation. Mounted once in AdminShell (hidden on /login and
 * the full-screen Canvas editor), so every admin page shares the same nav.
 *
 * Only routes that exist are listed — Notifications, Email Automation
 * and Logs have no pages or backend, so they are omitted rather than linked
 * to dead ends. Route guards in App.jsx remain the access authority; this is
 * navigation only.
 */

const GROUPS = [
  {
    title: 'Main',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    title: 'Manage',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3, prefetch: true },
      { to: '/orders', label: 'Orders', icon: ShoppingCart, prefetch: true },
      {
        to: '/products',
        label: 'Manage Products',
        icon: Package,
        prefetch: true,
        match: (p) => p === '/products' || p.startsWith('/products/edit'),
      },
      { to: '/products/add', label: 'Add Product', icon: Plus },
      { to: '/categories', label: 'Categories', icon: Boxes },
      { to: '/coupons', label: 'Coupons', icon: Tag, prefetch: true },
      { to: '/price-list', label: 'Price List', icon: FileText },
      { to: BILLING_URL, label: 'Billing / POS', icon: Receipt, external: true },
    ],
  },
  {
    title: 'Website',
    items: [
      { to: '/canvas', label: 'Canvas', icon: ImageIcon, prefetch: true },
      { to: '/site-settings', label: 'Site Settings', icon: Settings },
    ],
  },
  {
    title: 'Others',
    items: [
      { to: '/users', label: 'Users', icon: Users },
      { to: '/email-automation', label: 'Email Automation', icon: Mail, prefetch: true },
    ],
  },
];

const COLLAPSE_KEY = 'admin_sidebar_collapsed';

/* Warm heavy route chunks on hover/focus so first open skips the download
   waterfall. React.lazy reuses the same modules — no double load, and the
   prefetch is a no-op once cached. */
const ROUTE_PREFETCHERS = {
  '/canvas': () => import('../../pages/Canvas'),
  '/orders': () => import('../../pages/Orders'),
  '/analytics': () => import('../../pages/Analytics'),
  '/products': () => import('../../pages/Products'),
  '/coupons': () => import('../../pages/Coupons'),
  '/email-automation': () => import('../../pages/EmailAutomation'),
};
function prefetchRoute(to) {
  try {
    ROUTE_PREFETCHERS[to]?.().catch(() => {});
  } catch {
    /* prefetch is best-effort */
  }
}

function isItemActive(item, pathname) {
  if (item.external) return false;
  if (typeof item.match === 'function') return item.match(pathname);
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Close the drawer on navigation. */
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  /* Lock body scroll while the drawer is open. */
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1');
      } catch {
        /* persistence is best-effort */
      }
      return !v;
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch {
      /* sign-out best-effort; still leave */
    }
    navigate('/login', { replace: true });
  };

  const nav = (
    <div className={`asb-inner${collapsed ? ' is-collapsed' : ''}`}>
      {/* The single store identity — the top navbar carries none. */}
      <Link to="/dashboard" className="asb-brand" aria-label="Crackers Hyderabad admin home">
        <img src="/images/website/nav-logo.png" alt="" className="asb-brand-logo" />
        <span className="asb-brand-text">
          <span className="asb-brand-name">Crackers Hyderabad</span>
          <span className="asb-brand-sub">Admin Console</span>
        </span>
      </Link>

      <nav className="asb-nav" aria-label="Admin navigation">
        {GROUPS.map((group) => (
          <div key={group.title} className="asb-group">
            <p className="asb-group-title" aria-hidden="true">{group.title}</p>
            <ul className="asb-list">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item, location.pathname);
                const cls = `asb-item${active ? ' is-active' : ''}`;
                const label = (
                  <>
                    <Icon className="asb-item-icon" aria-hidden="true" />
                    <span className="asb-item-label">{item.label}</span>
                    {item.external && (
                      <span className="asb-item-ext" aria-hidden="true">↗</span>
                    )}
                  </>
                );
                return (
                  <li key={item.to + item.label}>
                    {item.external ? (
                      <a href={item.to} target="_blank" rel="noreferrer" className={cls} title={item.label}>
                        {label}
                      </a>
                    ) : (
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={cls}
                        title={item.label}
                        onPointerEnter={item.prefetch ? () => prefetchRoute(item.to) : undefined}
                        onFocus={item.prefetch ? () => prefetchRoute(item.to) : undefined}
                      >
                        {label}
                      </NavLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="asb-foot">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="asb-collapse"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
          <span className="asb-item-label">Collapse</span>
        </button>
        <button type="button" onClick={handleSignOut} className="asb-signout" title="Sign Out">
          <LogOut className="asb-item-icon" aria-hidden="true" />
          <span className="asb-item-label">Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktoprail — icons + labels, collapsible to icons-only. */}
      <aside className="asb-desktop" aria-label="Admin sidebar">
        {nav}
      </aside>

      {/* Mobile trigger — the sidebar itself is the drawer. */}
      <button
        type="button"
        className="asb-fab"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Menu aria-hidden="true" />
      </button>

      {/* Mobile drawer. */}
      <div className={`asb-drawer-veil${mobileOpen ? ' is-open' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <aside className={`asb-drawer${mobileOpen ? ' is-open' : ''}`} aria-label="Admin navigation" aria-hidden={!mobileOpen}>
        <button
          type="button"
          className="asb-drawer-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X aria-hidden="true" />
        </button>
        {nav}
      </aside>
    </>
  );
}
