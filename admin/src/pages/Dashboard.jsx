import { useState, useEffect, useMemo } from 'react';
import '../admin-portrait.css';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Plus,
  Package,
  ShoppingCart,
  TrendingUp,
  Search,
  BarChart3,
  Users,
  ArrowRight,
  X,
  Image as ImageIcon,
  Settings,
  Sparkles,
  FileText,
  Tag,
  Boxes,
  ShoppingBag,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from '../utils/toast';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { Skeleton, StatCardSkeleton } from '../components/ui/Skeleton';
import AnimatedCounter from '../components/ui/AnimatedCounter';
import OrderStatusBadge from '../components/admin/OrderStatusBadge';
import { displayNameForCategory } from '../lib/categoryIcons';
import { BILLING_URL } from '../lib/billingUrl';
import AdminTopBar from '../components/admin/AdminTopBar';

const DEFAULT_QUICK_ACTIONS = [
  { id: 'analytics', to: '/analytics', label: 'Analytics', desc: 'View reports & insights', icon: BarChart3, system: true },
  { id: 'add-product', to: '/products/add', label: 'Add Product', desc: 'Create new product', icon: Plus, system: true },
  { id: 'users', to: '/users', label: 'Users', desc: 'Manage user accounts', icon: Users, system: true },
  { id: 'homepage', to: '/canvas', label: 'Canvas', desc: 'Customize homepage', icon: ImageIcon, system: true },
  { id: 'categories', to: '/categories', label: 'Categories', desc: 'Manage product categories', icon: Boxes, system: true },
];

const KNOWN_DESTINATIONS = [
  { value: '/analytics', label: 'Analytics' },
  { value: '/products/add', label: 'Add Product' },
  { value: '/users', label: 'Users' },
  { value: '/canvas', label: 'Canvas / Homepage' },
  { value: '/orders', label: 'Orders' },
  { value: BILLING_URL, label: 'Billing' },
  { value: '/products', label: 'All Products' },
  { value: '/categories', label: 'Categories' },
  { value: '/products', label: 'Products (Storefront)' },
];

const ICON_OPTIONS = [
  { value: 'BarChart3', label: 'Chart', icon: BarChart3 },
  { value: 'Plus', label: 'Plus', icon: Plus },
  { value: 'Users', label: 'Users', icon: Users },
  { value: 'ImageIcon', label: 'Image', icon: ImageIcon },
  { value: 'Package', label: 'Package', icon: Package },
  { value: 'ShoppingCart', label: 'Cart', icon: ShoppingCart },
  { value: 'FileText', label: 'File', icon: FileText },
  { value: 'Tag', label: 'Tag', icon: Tag },
  { value: 'Settings', label: 'Settings', icon: Settings },
  { value: 'Boxes', label: 'Boxes', icon: Boxes },
  { value: 'ShoppingBag', label: 'Bag', icon: ShoppingBag },
];

const iconMap = {
  BarChart3, Plus, Users, ImageIcon, Package, ShoppingCart, FileText, Tag, Settings, Boxes, ShoppingBag,
};

const STORAGE_KEY = 'admin_quick_actions_custom';

const AdminDashboard = () => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [usersCount, setUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [customActions, setCustomActions] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [formData, setFormData] = useState({ label: '', desc: '', to: '', icon: 'Package' });

  const { markAllAsRead, recentOrders } = useNotifications();
  const { user, loading: authLoading } = useAuth();
  const [adminName, setAdminName] = useState(null);

  /* Portrait-desktop composition (portrait PC monitors) shows more list
     rows instead of stretching few rows across a tall viewport. Gated on
     the desktop-portrait detector (see admin-portrait.css): physical
     resolution is NOT trusted, so there is no min-width here. Landscape
     and mobile keep exactly 5. Presentational only — same data. */
  const PORTRAIT_DESKTOP_MQ = '(orientation: portrait) and (hover: hover) and (pointer: fine) and (min-height: 900px)';
  const [isPortraitDesktop, setIsPortraitDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PORTRAIT_DESKTOP_MQ).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(PORTRAIT_DESKTOP_MQ);
    const onChange = (e) => setIsPortraitDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const resolveName = async () => {
      if (authLoading) return;
      if (!user) {
        if (!cancelled) setAdminName('Admin');
        return;
      }
      // 1. displayName
      const display = user.displayName?.trim();
      if (display) {
        if (!cancelled) setAdminName(display);
        return;
      }
      // 2. Firestore users/{uid} name
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const storedName = snap.exists() ? (snap.data().name || snap.data().displayName || '').trim() : '';
        if (storedName) {
          if (!cancelled) setAdminName(storedName);
          return;
        }
      } catch {
        // ignore, fall through
      }
      // 3. email prefix
      const email = user.email || '';
      if (email.includes('@')) {
        const prefix = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
        // Title case
        const titled = prefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (titled) {
          if (!cancelled) setAdminName(titled);
          return;
        }
      }
      if (!cancelled) setAdminName('Admin');
    };
    resolveName();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const today = useMemo(() => {
    const d = new Date();
    return {
      weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
      date: d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsSnap, ordersSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
      ]);
      const productsData = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(productsData);
      const ordersData = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const epochMs = (t) => t?.seconds ? t.seconds * 1000 : (t?.getTime?.() ?? 0);
      setOrders(ordersData.sort((a, b) => epochMs(b.createdAt) - epochMs(a.createdAt)));
      const uniqueCustomers = new Set(ordersData.map(o => o.customer?.email || o.userEmail || o.userId).filter(Boolean));
      const usersCountVal = usersSnap.docs ? usersSnap.docs.length : 0;
      setUsersCount(Math.max(uniqueCustomers.size, usersCountVal) || ordersData.length);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const topProducts = products
    .filter(p => p.salesCount > 0)
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
    .slice(0, isPortraitDesktop ? 10 : 5);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

  const kpis = [
    { key: 'revenue', label: 'Total Revenue', short: 'Revenue', value: totalRevenue, display: `₹${totalRevenue.toLocaleString('en-IN')}`, hint: 'All time', icon: TrendingUp, accent: 'var(--ember-600)' },
    { key: 'orders', label: 'Total Orders', short: 'Orders', value: orders.length, display: String(orders.length), hint: 'All time', icon: ShoppingCart, accent: 'var(--gold-500)' },
    { key: 'products', label: 'Total Products', short: 'Products', value: products.length, display: String(products.length), hint: `${products.filter(p=>p.isFeatured).length} featured`, icon: Package, accent: 'var(--maroon-700)' },
    { key: 'customers', label: 'Total Customers', short: 'Customers', value: usersCount, display: String(usersCount), hint: 'Registered', icon: Users, accent: 'var(--leaf-600)' },
  ];

  const allQuickActions = [...DEFAULT_QUICK_ACTIONS, ...customActions.map(c => ({ ...c, icon: iconMap[c.icon] || Package }))];

  const filteredOrders = orders.filter(order => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (order.customer?.name || '').toLowerCase().includes(q)
      || String(order.shortCode || order.id || '').toLowerCase().includes(q)
      || (order.status || '').toLowerCase().includes(q);
  }).slice(0, isPortraitDesktop ? 10 : 5);

  const filteredTopProducts = topProducts.filter(product => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (product.name || '').toLowerCase().includes(q) || (product.category || '').toLowerCase().includes(q);
  });

  const handleAddAction = () => {
    if (!formData.label.trim() || !formData.to) {
      toast.error('Name and destination are required');
      return;
    }
    if (editingAction) {
      const updated = customActions.map(a => a.id === editingAction.id ? { ...a, label: formData.label.trim(), desc: formData.desc.trim(), to: formData.to, icon: formData.icon } : a);
      setCustomActions(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      toast.success('Quick action updated');
    } else {
      const newAction = {
        id: `custom-${Date.now()}`,
        label: formData.label.trim(),
        desc: formData.desc.trim() || 'Quick access',
        to: formData.to,
        icon: formData.icon,
        system: false,
      };
      const updated = [...customActions, newAction];
      setCustomActions(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      toast.success('Quick action added');
    }
    setShowAddModal(false);
    setEditingAction(null);
    setFormData({ label: '', desc: '', to: '', icon: 'Package' });
  };

  const handleEdit = (action) => {
    setEditingAction(action);
    setFormData({ label: action.label, desc: action.desc, to: action.to, icon: typeof action.icon === 'string' ? action.icon : 'Package' });
    setShowAddModal(true);
  };

  const handleDelete = (id) => {
    const updated = customActions.filter(a => a.id !== id);
    setCustomActions(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    toast.success('Removed');
  };

  const notificationsForTab = (() => {
    const base = recentOrders.slice(0, 10).map(o => ({
      id: o.id,
      title: o.status === 'Delivered' ? 'Order Delivered' : o.status === 'Cancelled' ? 'Order Cancelled' : 'New Order Received',
      desc: `Order #${o.shortCode || o.id.slice(0,6)} for ₹${(o.total||0).toLocaleString('en-IN')} by ${o.customer?.name || 'customer'}`,
      time: o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : 'recently',
      type: 'Orders',
      unread: true,
    }));
    if (activeTab === 'All') return base;
    if (activeTab === 'Orders') return base;
    if (activeTab === 'System') return [{ id: 'sys1', title: 'System Update', desc: 'Server is running normally', time: 'today', type: 'System', unread: false }];
    if (activeTab === 'Updates') return [{ id: 'upd1', title: 'Inventory Sync', desc: 'All products synced successfully', time: 'today', type: 'Updates', unread: false }];
    return base;
  })();

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-64px)] flex-col bg-[var(--surface-page)] p-6 transition-colors duration-200">
        <div className="mx-auto w-full max-w-[1800px] space-y-4">
          <StatCardSkeleton count={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard flex flex-1 flex-col bg-[var(--surface-page)] text-[var(--text-body)] transition-colors duration-200 lg:min-h-0 lg:overflow-hidden">
      <AdminTopBar searchValue={globalSearch} onSearchChange={setGlobalSearch} onNotificationClick={() => setNotificationOpen(true)} />

      {/* Dashboard Content - viewport fit: header(68) + content(remaining) grid auto/auto/auto/1fr */}
      <div className="dash-content mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-4 py-3 lg:flex-1 lg:min-h-0 lg:px-8 xl:px-10 lg:py-4">
        {/* Header + Banner - 65-80px compact */}
        <div className="dash-topgrid grid shrink-0 gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex min-h-[72px] flex-col justify-center">
            <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>Welcome back,</p>
            <h1 className="mt-1 break-words text-[22px] font-bold leading-none tracking-tight lg:text-[24px]" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>{adminName || 'Admin'}</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Here&apos;s what&apos;s happening with your store today.</p>
            <div className="mt-3 lg:hidden">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
                <input
                  id="admin-search-mobile"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search products, orders..."
                  className="h-9 w-full rounded-full border bg-[var(--surface-sunken)] pl-10 pr-4 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-200"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
                />
              </div>
            </div>
          </div>

          {/* Calendar / Promo Banner - compact, brand */}
          <div className="dash-banner relative flex min-h-[72px] items-center overflow-hidden rounded-2xl border p-4 transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="absolute inset-0 opacity-20" style={{ background: 'var(--grad-festive)' }} />
            <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(60% 80% at 85% 20%, var(--gold-400), transparent)' }} />
            <div className="relative flex w-full items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: 'var(--grad-ember)' }}>
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-strong)' }}>Lighting up celebrations</p>
                  <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--gold-500)' }}>across Hyderabad!</p>
                </div>
              </div>
              <div className="hidden text-right shrink-0 sm:block">
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{today.weekday}</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>{today.date}</p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards - 80-90px, full width 4 cols */}
        <div className="dash-kpi-grid grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3">
          {kpis.map(({ key, label, short, display, hint, icon: Icon, accent }) => (
            <div key={key} className="dash-kpi flex min-h-[88px] min-w-0 flex-col justify-center rounded-2xl border p-4 transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)' }}>
              {/* Mobile: value-first stat tile (matches dashboard wireframe) */}
              <div className="min-w-0 sm:hidden">
                <p className="text-[20px] font-bold leading-none [overflow-wrap:anywhere]" style={{ color: 'var(--text-strong)' }}>{display}</p>
                <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>{short}</p>
              </div>
              {/* Desktop: label + value + hint with icon */}
              <div className="hidden sm:flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="mt-1.5 text-[20px] font-bold leading-none [overflow-wrap:anywhere]" style={{ color: 'var(--text-strong)' }}>{display}</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-subtle)' }}>{hint}</p>
                </div>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: accent }}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions - 125-140px compact */}
        <section className="shrink-0 rounded-2xl border p-3 transition-colors duration-200 lg:p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Quick Actions</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>Manage your store with quick access to common tasks.</p>
            </div>
            <button onClick={() => { setEditingAction(null); setFormData({ label: '', desc: '', to: '', icon: 'Package' }); setShowAddModal(true); }} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors duration-200" style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}>
              <Plus className="h-3.5 w-3.5" /> Add Quick Action
            </button>
          </div>

          <div className="dash-qa-grid mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {allQuickActions.map((action) => {
              const Icon = action.icon;
              const isCustom = !action.system;
              // Cross-subdomain destinations (Billing lives on
              // billing.crackershyderabad.com) need a real anchor, not a
              // React Router Link.
              const isExternal = /^https?:\/\//.test(action.to || '');
              const inner = (
                <>
                  <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)' }}>
                    <Icon className="h-4 w-4" style={{ color: 'var(--ember-600)' }} />
                  </span>
                  <span>
                    <p className="break-words text-sm font-semibold leading-tight" style={{ color: 'var(--text-strong)' }}>{action.label}</p>
                      <p className="mt-1 hidden line-clamp-2 text-xs leading-tight sm:block" style={{ color: 'var(--text-muted)' }}>{action.desc}</p>
                  </span>
                </>
              );
              return (
                <div key={action.id} className="dash-qa group relative flex min-h-[96px] min-w-0 flex-col rounded-2xl border p-4 transition hover:scale-[1.01] transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                  {isExternal ? (
                    <a href={action.to} className="flex min-w-0 flex-1 flex-col gap-2.5">{inner}</a>
                  ) : (
                    <Link to={action.to} className="flex min-w-0 flex-1 flex-col gap-2.5">{inner}</Link>
                  )}
                  {isCustom && (
                    <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                      <button onClick={() => handleEdit(action)} className="grid h-6 w-6 place-items-center rounded-full transition-colors duration-200" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)' }}>
                        <Settings className="h-3 w-3" style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <button onClick={() => handleDelete(action.id)} className="grid h-6 w-6 place-items-center rounded-full" style={{ background: 'var(--crimson-600)', color: '#fff' }}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent Orders + Top Products - fill remaining height, internal scroll only if needed */}
        <div className="dash-panels grid gap-3 lg:flex-1 lg:min-h-0 lg:grid-cols-[1.35fr_0.9fr]">
          {/* Recent Orders */}
          <section className="flex min-h-[260px] flex-col rounded-2xl border p-4 transition-colors duration-200 lg:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Recent Orders</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Latest orders from your customers</p>
              </div>
              <Link to="/orders" className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: 'var(--gold-500)' }}>
                View All Orders <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredOrders.length === 0 ? (
                <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>No orders yet</div>
              ) : (
                <div className="space-y-2">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="dash-order-row flex items-center justify-between gap-3 rounded-xl border px-3 py-3 transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: 'var(--text-strong)' }}>#{order.shortCode || order.id.slice(0, 8)} — {order.customer?.name || 'Customer'}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>₹{(order.total||0).toLocaleString('en-IN')} • {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : new Date(order.createdAt).toLocaleDateString()}</p>
                      </div>
                      <OrderStatusBadge status={order.status || 'Pending'} className="shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Top Selling Products */}
          <section className="flex min-h-[260px] flex-col rounded-2xl border p-4 transition-colors duration-200 lg:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Top Selling Products</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your best performing products</p>
              </div>
              <Link to="/products" className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: 'var(--gold-500)' }}>
                View All <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredTopProducts.length === 0 ? (
                <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>No sales yet</div>
              ) : (
                <div className="space-y-2">
                  {filteredTopProducts.map((product, idx) => (
                    <div key={product.id} className="dash-top-row flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', color: 'var(--text-strong)' }}>{idx + 1}</span>
                      <img src={product.imageURL || '/images/website/nav-logo.png'} alt="" className="hidden h-10 w-10 rounded-lg object-cover sm:block" style={{ border: '1px solid var(--hairline)' }} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-tight lg:truncate" style={{ color: 'var(--text-strong)' }}>{product.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{displayNameForCategory(product.category)} • {product.salesCount} sold</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold sm:hidden" style={{ color: 'var(--text-strong)' }}>{product.salesCount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Notification Drawer - overlay, theme-aware */}
      <AnimatePresence>
        {notificationOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNotificationOpen(false)} className="fixed inset-0 z-50 bg-black/50" />
            <motion.div
              initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 z-50 flex h-full w-[92vw] max-w-[400px] flex-col border-l shadow-2xl transition-colors duration-200"
              style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
            >
              <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--hairline)' }}>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Notifications</h2>
                <button onClick={() => setNotificationOpen(false)} className="grid h-8 w-8 place-items-center rounded-full transition-colors duration-200" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}>
                  <X className="h-4 w-4" style={{ color: 'var(--text-body)' }} />
                </button>
              </div>
              <div className="flex gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
                {['All', 'Orders', 'System', 'Updates'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200"
                    style={activeTab === tab ? { background: 'var(--text-strong)', color: 'var(--surface-card)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)', border: '1px solid var(--hairline)' }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-2">
                  {notificationsForTab.length === 0 ? (
                    <p className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No notifications</p>
                  ) : (
                    notificationsForTab.map(n => (
                      <div key={n.id} className="rounded-xl border p-3 transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                        <p className="text-sm font-medium leading-tight" style={{ color: 'var(--text-strong)' }}>{n.title}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{n.desc}</p>
                        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-subtle)' }}>{n.time}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="border-t p-3" style={{ borderColor: 'var(--hairline)' }}>
                <button onClick={() => { markAllAsRead(); setNotificationOpen(false); }} className="w-full rounded-full py-2.5 text-sm font-semibold transition-colors duration-200" style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}>
                  View All Notifications →
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Quick Action Modal - theme-aware */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setShowAddModal(false)}>
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border p-5 shadow-xl transition-colors duration-200"
              style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>{editingAction ? 'Edit Quick Action' : 'Add Quick Action'}</h3>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Name</label>
                  <input value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="e.g. Inventory" className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-200" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-strong)' }} />
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Icon</label>
                  <select value={formData.icon} onChange={(e) => setFormData({ ...formData, icon: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none transition-colors duration-200" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}>
                    {ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Description</label>
                  <input value={formData.desc} onChange={(e) => setFormData({ ...formData, desc: e.target.value })} placeholder="Short description" className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm placeholder:text-[var(--text-subtle)] focus:outline-none transition-colors duration-200" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-strong)' }} />
                </div>
                <div>
                  <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Destination</label>
                  <select value={formData.to} onChange={(e) => setFormData({ ...formData, to: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none transition-colors duration-200" style={{ background: 'var(--surface-sunken)', borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}>
                    <option value="">Select page</option>
                    {KNOWN_DESTINATIONS.map(d => <option key={d.value} value={d.value}>{d.label} — {d.value}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => { setShowAddModal(false); setEditingAction(null); }} className="rounded-full border px-4 py-2 text-sm transition-colors duration-200" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Cancel</button>
                <button onClick={handleAddAction} className="rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200" style={{ background: 'var(--text-strong)', color: 'var(--surface-card)' }}>{editingAction ? 'Save' : 'Add'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
