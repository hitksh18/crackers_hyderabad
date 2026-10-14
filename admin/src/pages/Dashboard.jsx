import { useState, useEffect, useMemo } from 'react';
import '../admin-portrait.css';
import { motion, AnimatePresence } from 'framer-motion';
import { collection } from 'firebase/firestore';
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
  Boxes,
  Star,
  TicketPercent,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from '../utils/toast';
import { useNotifications } from '../contexts/NotificationContext';
import { Skeleton, StatCardSkeleton } from '../components/ui/Skeleton';
import OrderStatusBadge from '../components/admin/OrderStatusBadge';
import DualTrendChart from '../components/admin/analytics/DualTrendChart';
import { cachedGetDocs, ordersCacheTtl } from '../lib/firestoreCache';
import { displayNameForCategory } from '../lib/categoryIcons';
import { getDisplayOrderId, orderIdMatches } from '../lib/orderId';
import AdminTopBar from '../components/admin/AdminTopBar';

/* The eight most-used destinations. Fixed — quick actions are shortcuts, not
   a second navigation system; everything else lives in the sidebar. */
const QUICK_ACTIONS = [
  { id: 'analytics', to: '/analytics', label: 'Analytics', desc: 'View sales and performance', icon: BarChart3 },
  { id: 'add-product', to: '/products/add', label: 'Add Product', desc: 'Create a new product', icon: Plus },
  { id: 'users', to: '/users', label: 'Users', desc: 'Manage customers and users', icon: Users },
  { id: 'homepage', to: '/canvas', label: 'Canvas', desc: 'Edit homepage', icon: ImageIcon },
  { id: 'categories', to: '/categories', label: 'Categories', desc: 'Manage product categories', icon: Boxes },
  { id: 'site-settings', to: '/site-settings', label: 'Site Settings', desc: 'Configure site/order settings', icon: Settings },
  { id: 'products', to: '/products', label: 'Manage Products', desc: 'View and manage products', icon: Package },
  { id: 'coupons', to: '/coupons', label: 'Create Coupon', desc: 'Create and manage discount coupons', icon: TicketPercent },
];

const AdminDashboard = () => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('All');
  const [salesRange, setSalesRange] = useState(7);

  const { markAllAsRead, recentOrders } = useNotifications();

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


  /* Products and orders load independently through a short-TTL shared cache
     (see lib/firestoreCache): returning from Canvas reuses the data instead
     of re-downloading it, and each widget renders as soon as its own dataset
     lands rather than blocking the whole page. */
  const [productsReady, setProductsReady] = useState(false);
  const [ordersReady, setOrdersReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cachedGetDocs(collection(db, 'products'), 'products')
      .then((productsData) => {
        if (cancelled) return;
        setProducts(productsData);
        setProductsReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Error fetching products:', error);
        toast.error('Failed to fetch products');
        setProductsReady(true);
      });
    cachedGetDocs(collection(db, 'orders'), 'orders', { ttl: ordersCacheTtl })
      .then((ordersData) => {
        if (cancelled) return;
        const epochMs = (t) => (t?.seconds ? t.seconds * 1000 : (t?.getTime?.() ?? 0));
        setOrders(ordersData.sort((a, b) => epochMs(b.createdAt) - epochMs(a.createdAt)));
        setOrdersReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Error fetching orders:', error);
        toast.error('Failed to fetch orders');
        setOrdersReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dataReady = productsReady && ordersReady;

  const topProducts = products
    .filter(p => p.salesCount > 0)
    .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
    .slice(0, isPortraitDesktop ? 10 : 5);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const featuredCount = products.filter(p => p.isFeatured).length;

  const kpis = [
    { key: 'revenue', label: 'Total Revenue', short: 'Revenue', value: totalRevenue, display: `₹${totalRevenue.toLocaleString('en-IN')}`, hint: 'All time', icon: TrendingUp, accent: 'var(--ember-600)' },
    { key: 'orders', label: 'Total Orders', short: 'Orders', value: orders.length, display: String(orders.length), hint: 'All time', icon: ShoppingCart, accent: 'var(--gold-500)' },
    { key: 'products', label: 'Total Products', short: 'Products', value: products.length, display: String(products.length), hint: `${featuredCount} featured`, icon: Package, accent: 'var(--maroon-700)' },
    { key: 'featured', label: 'Featured Products', short: 'Featured', value: featuredCount, display: String(featuredCount), hint: 'Handpicked', icon: Star, accent: 'var(--leaf-600)' },
  ];

  /* Sales Overview buckets, aggregated locally from the same orders above —
     no new endpoint, no invented numbers. */
  const dayKeyOf = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const orderMs = (o) => {
    const t = o.createdAt;
    if (t?.seconds) return t.seconds * 1000;
    if (typeof t === 'string') return Date.parse(t);
    return t?.getTime?.() ?? NaN;
  };
  const salesSeries = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = salesRange - 1; i >= 0; i -= 1) {
      const d = new Date(start);
      d.setDate(start.getDate() - i);
      days.push({ day: dayKeyOf(d.getTime()), revenue: 0, orders: 0 });
    }
    const byDay = new Map(days.map((row) => [row.day, row]));
    orders.forEach((o) => {
      const ms = orderMs(o);
      if (!Number.isFinite(ms)) return;
      const row = byDay.get(dayKeyOf(ms));
      if (!row) return;
      row.orders += 1;
      row.revenue += (o.total || 0);
    });
    return days;
  }, [orders, salesRange]);

  const rangeRevenue = salesSeries.reduce((sum, r) => sum + r.revenue, 0);
  const rangeOrders = salesSeries.reduce((sum, r) => sum + r.orders, 0);
  const rangeAov = rangeOrders > 0 ? rangeRevenue / rangeOrders : 0;
  const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
  const salesLines = useMemo(() => [
    { key: 'revenue', label: 'Revenue', color: '#ec7049', format: (v) => inr(v), axisFormat: (v) => `₹${Math.round(v / 1000)}k` },
    { key: 'orders', label: 'Orders', color: '#d2a64f', format: (v) => String(Math.round(v)), axisFormat: (v) => String(Math.round(v)) },
  ], []);

  /* Live Order Feed — the live order stream, falling back to the loaded
     orders when the stream has not emitted yet. */
  const feedOrders = (recentOrders.length > 0 ? recentOrders : orders).slice(0, 7);

  /* Order IDs are matched through the shared helper so the dashboard and the
     Orders page cannot disagree about what an id looks like — and so a search
     keeps working after the id format is changed. See lib/orderId.js. */
  const filteredOrders = orders.filter(order => {
    const raw = globalSearch.trim();
    if (!raw) return true;
    const textTerm = raw.toLowerCase();
    return orderIdMatches(order, raw)
      || (order.customer?.name || '').toLowerCase().includes(textTerm)
      || (order.status || '').toLowerCase().includes(textTerm);
  }).slice(0, isPortraitDesktop ? 10 : 5);

  const filteredTopProducts = topProducts.filter(product => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (product.name || '').toLowerCase().includes(q) || (product.category || '').toLowerCase().includes(q);
  });

  const notificationsForTab = (() => {
    const base = recentOrders.slice(0, 10).map(o => ({
      id: o.id,
      title: o.status === 'Delivered' ? 'Order Delivered' : o.status === 'Cancelled' ? 'Order Cancelled' : 'New Order Received',
      desc: `Order #${getDisplayOrderId(o) || 'N/A'} for ₹${(o.total||0).toLocaleString('en-IN')} by ${o.customer?.name || 'customer'}`,
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

  return (
    <div className="admin-dashboard admin-page bg-[var(--surface-page)] text-[var(--text-body)] transition-colors duration-200">
      <AdminTopBar searchValue={globalSearch} onSearchChange={setGlobalSearch} onNotificationClick={() => setNotificationOpen(true)} />

      {/* Dashboard Content — starts directly with statistics; identity and
          date live in the top navbar. */}
      <div className="dash-content mx-auto flex w-full max-w-[1800px] flex-col gap-3 px-4 py-3 lg:flex-1 lg:px-8 xl:px-10 lg:py-4">
        {/* Mobile search — the navbar search appears on desktop only. */}
        <div className="shrink-0 lg:hidden">
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

        {/* KPI Cards — skeleton until both datasets land; the rest of the
            page (quick actions, panels) never waits on them. */}
        {!dataReady ? (
          <div className="shrink-0">
            <StatCardSkeleton count={4} />
          </div>
        ) : (
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
        )}

        {/* Quick Actions — the eight most-used destinations, fixed */}
        <section className="shrink-0 rounded-2xl border p-3 transition-colors duration-200 lg:p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Quick Actions</h2>

          <div className="dash-qa-grid mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.id} to={action.to} className="dash-qa group flex min-w-0 items-center gap-3 rounded-2xl border p-3.5 transition hover:scale-[1.01] transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)' }}>
                    <Icon className="h-4 w-4" style={{ color: 'var(--ember-600)' }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold leading-tight" style={{ color: 'var(--text-strong)' }}>{action.label}</span>
                    <span className="mt-0.5 hidden truncate text-xs leading-tight sm:block" style={{ color: 'var(--text-muted)' }}>{action.desc}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" style={{ color: 'var(--text-subtle)' }} />
                </Link>
              );
            })}
          </div>
        </section>

        {/* Sales Overview + Live Order Feed */}
        <div className="dash-panels grid shrink-0 gap-3 lg:grid-cols-[1.35fr_0.9fr]">
          <section className="flex min-w-0 flex-col rounded-2xl border p-4 transition-colors duration-200 lg:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Sales Overview</h2>
                <p className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>
                  {inr(rangeRevenue)} • {rangeOrders} orders • AOV {inr(rangeAov)}
                </p>
              </div>
              <div className="flex gap-1 rounded-full border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }} role="group" aria-label="Sales range">
                {[7, 14, 28].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setSalesRange(days)}
                    aria-pressed={salesRange === days}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={salesRange === days
                      ? { background: 'var(--text-strong)', color: 'var(--surface-card)' }
                      : { color: 'var(--text-muted)' }}
                  >
                    {days}D
                  </button>
                ))}
              </div>
            </div>
            {!ordersReady ? (
              <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Loading sales…</div>
            ) : (
              <DualTrendChart series={salesSeries} lines={salesLines} dualAxis viewH={210} />
            )}
          </section>

          {/* Live Order Feed — the live order stream */}
          <section className="flex min-h-[240px] min-w-0 flex-col rounded-2xl border p-4 transition-colors duration-200 lg:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>Live Order Feed</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Newest orders as they arrive</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)', color: 'var(--text-body)' }}>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--leaf-600)]" aria-hidden="true" />
                Live
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {!ordersReady ? (
                <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Loading orders…</div>
              ) : feedOrders.length === 0 ? (
                <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>No orders yet</div>
              ) : (
                <div className="space-y-2">
                  {feedOrders.map((order) => (
                    <Link key={order.id} to={`/orders/${order.id}`} className="dash-order-row flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: 'var(--text-strong)' }}>#{getDisplayOrderId(order) || 'N/A'} — {order.customer?.name || 'Customer'}</p>
                        <p className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>₹{(order.total || 0).toLocaleString('en-IN')} • {order.status || 'Pending'}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-subtle)' }} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

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
              {!ordersReady ? (
                <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Loading orders…</div>
              ) : filteredOrders.length === 0 ? (
                <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>No orders yet</div>
              ) : (
                <div className="space-y-2">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="dash-order-row flex items-center justify-between gap-3 rounded-xl border px-3 py-3 transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: 'var(--text-strong)' }}>#{getDisplayOrderId(order) || 'N/A'} — {order.customer?.name || 'Customer'}</p>
                        <p className="text-xs tabular" style={{ color: 'var(--text-muted)' }}>₹{(order.total||0).toLocaleString('en-IN')} • {order.paymentMode || 'Online'} • {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : new Date(order.createdAt).toLocaleDateString()}</p>
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
              {!productsReady ? (
                <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>Loading products…</div>
              ) : filteredTopProducts.length === 0 ? (
                <div className="grid place-items-center rounded-xl border border-dashed py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--text-muted)' }}>No sales yet</div>
              ) : (
                <div className="space-y-2">
                  {filteredTopProducts.map((product, idx) => (
                    <div key={product.id} className="dash-top-row flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-200" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold" style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', color: 'var(--text-strong)' }}>{idx + 1}</span>
                      <img src={product.imageURL || '/images/website/nav-logo.png'} alt="" loading="lazy" decoding="async" width={40} height={40} className="hidden h-10 w-10 rounded-lg object-cover sm:block" style={{ border: '1px solid var(--hairline)' }} />
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

    </div>
  );
};

export default AdminDashboard;