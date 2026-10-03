import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarDays,
  Download,
  Eye,
  Globe2,
  IndianRupee,
  Link2,
  Monitor,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Tag,
  Users,
} from 'lucide-react';
import { authFetch, readApiError } from '../utils/apiClient';
import { exportCsv } from '../utils/csv';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants } from '../lib/motion';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import AnimatedCounter from '../components/ui/AnimatedCounter';
import DualTrendChart from '../components/admin/analytics/DualTrendChart';
import FunnelChart from '../components/admin/analytics/FunnelChart';
import TrafficHeatmap from '../components/admin/analytics/TrafficHeatmap';
import DeviceDonut from '../components/admin/analytics/DeviceDonut';
import AnalyticsNav from '../components/admin/analytics/AnalyticsNav';
import KpiCard from '../components/admin/analytics/KpiCard';
import { AlertsList, ActivityFeed, DonutChart, EmptyNote, StatusBars } from '../components/admin/analytics/CommerceWidgets';
import '../components/admin/analytics/analytics.css';

const LIVE_POLL_MS = 15_000;
const SNAPSHOT_POLL_MS = 180_000;

const nf = new Intl.NumberFormat('en-IN');
const inr = (value) => `₹${nf.format(Math.round(Number(value) || 0))}`;
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (code) => {
  if (!code || code === 'ZZ') return 'Unknown';
  try { return COUNTRY_NAMES.of(code) || code; } catch { return code; }
};

const fmtDay = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (ms) => {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/* Referrer rows carry raw values; group by host so the card reads as
   actual sources. Ungroupable values stay verbatim — nothing invented. */
const groupReferrers = (rows) => {
  const byHost = new Map();
  for (const row of rows || []) {
    let host = String(row.label || '').trim();
    try {
      const url = new URL(host.includes('://') ? host : `https://${host}`);
      host = url.hostname.replace(/^www\./, '');
    } catch { /* keep raw label */ }
    if (!host) continue;
    byHost.set(host, (byHost.get(host) || 0) + (Number(row.count) || 0));
  }
  return [...byHost.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1))
    .slice(0, 8);
};

const AnaHead = ({ icon: Icon, title, hint, action }) => (
  <div className="ana-head">
    <div className="min-w-0">
      <h3 className="ana-panel-title">
        {Icon && <Icon className="ana-panel-icon" aria-hidden="true" />}
        {title}
      </h3>
      {hint && <p className="ana-panel-sub">{hint}</p>}
    </div>
    {action && <div className="flex-none">{action}</div>}
  </div>
);

const CsvButton = ({ onClick, label }) => (
  <button type="button" onClick={onClick} className="ana-csv">
    <Download aria-hidden="true" />
    {label}
  </button>
);

/* One ranked list with share bars — top pages and traffic sources share it,
   so each metric lives in exactly one place. */
const RankedList = ({ rows, loading, emptyText, onSelect, selected }) => {
  if (loading) return <TableSkeleton rows={5} cols={2} label="Loading ranking" />;
  if (!rows || rows.length === 0) return <EmptyNote>{emptyText}</EmptyNote>;
  const peak = Math.max(...rows.map((r) => Number(r.count) || 0), 1);
  return (
    <ol className="ana-rank">
      {rows.map((row, i) => {
        const inner = (
          <>
            <span className="ana-rank-fill" aria-hidden="true" style={{ width: `${(Number(row.count) / peak) * 100}%` }} />
            <span className="ana-rank-num">{i + 1}</span>
            <span className="ana-rank-label" title={row.label}>{row.label}</span>
            <span className="ana-rank-count">{nf.format(Number(row.count) || 0)}</span>
          </>
        );
        const active = selected && row.label === selected;
        return (
          <li key={row.label || i} className="ana-rank-row" style={active ? { outline: '1px solid var(--hairline-strong)' } : undefined}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(active ? null : row.label)}
                aria-pressed={Boolean(active)}
                className="flex w-full items-center gap-2.5"
              >
                {inner}
              </button>
            ) : inner}
          </li>
        );
      })}
    </ol>
  );
};

const LOCATION_TABS = [
  { key: 'countries', label: 'Countries' },
  { key: 'regions', label: 'Regions' },
  { key: 'cities', label: 'Cities' },
];

export default function AdminAnalytics() {
  const reduced = useReducedMotion();
  const [range, setRange] = useState({ days: 7, custom: false });
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [revMode, setRevMode] = useState('both');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [country, setCountry] = useState(null);
  const [locationTab, setLocationTab] = useState('countries');
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [hidden, setHidden] = useState(typeof document === 'undefined' ? false : document.visibilityState === 'hidden');
  const snapshotAbort = useRef(null);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (range.custom) { params.set('from', range.from); params.set('to', range.to); } else { params.set('days', String(range.days)); }
    return params.toString();
  }, [range]);

  /* Single aggregated request: traffic snapshot + commerce block. */
  const loadSnapshot = useCallback(async ({ silent = false } = {}) => {
    snapshotAbort.current?.abort();
    const controller = new AbortController();
    snapshotAbort.current = controller;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await authFetch(`/api/admin/analytics/commerce?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error(await readApiError(response, 'Could not load analytics.'));
      setSnapshot(await response.json());
      setError('');
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Could not load analytics.');
    } finally {
      if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [query]);
  const loadLive = useCallback(async (signal) => {
    try {
      const response = await authFetch('/api/admin/analytics/live', { signal });
      if (!response.ok) return;
      setLive(await response.json());
    } catch { void 0; } finally { setLiveLoading(false); }
  }, []);
  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('focus', onVisibility); };
  }, []);
  useEffect(() => { setCountry(null); setCategoryFilter(null); setShowAllActivity(false); }, [query]);
  useEffect(() => { loadSnapshot(); return () => snapshotAbort.current?.abort(); }, [loadSnapshot]);
  useEffect(() => {
    if (hidden) return undefined;
    const timer = setInterval(() => loadSnapshot({ silent: true }), SNAPSHOT_POLL_MS);
    return () => clearInterval(timer);
  }, [hidden, loadSnapshot]);
  useEffect(() => {
    if (hidden) return undefined;
    const controller = new AbortController();
    loadLive(controller.signal);
    const timer = setInterval(() => loadLive(controller.signal), LIVE_POLL_MS);
    return () => { clearInterval(timer); controller.abort(); };
  }, [hidden, loadLive]);

  const totals = snapshot?.totals;
  const deltas = snapshot?.deltas || {};
  const series = useMemo(() => snapshot?.series || [], [snapshot]);
  const commerce = snapshot?.commerce;
  const summary = commerce?.summary;
  const commerceUnavailable = Boolean(snapshot) && commerce && commerce.unavailable;

  const sparkFor = useCallback((key) => {
    if (!series.length) return [];
    return series.map((row) => {
      const o = Number(row.orders) || 0;
      const r = Number(row.revenue) || 0;
      if (key === 'orders') return o;
      if (key === 'revenue') return r;
      return 0;
    });
  }, [series]);

  const customersSpark = useMemo(() => commerce?.customersSeries || [], [commerce]);

  const salesLines = useMemo(() => {
    const all = [
      { key: 'orders', label: 'Orders', color: '#ec7049', format: (v) => nf.format(Math.round(v)), axisFormat: (v) => compact.format(v) },
      { key: 'revenue', label: 'Revenue', color: '#d2a64f', format: (v) => inr(v), axisFormat: (v) => `₹${compact.format(v)}` },
    ];
    if (revMode === 'revenue') return [all[1]];
    if (revMode === 'orders') return [all[0]];
    return all;
  }, [revMode]);

  const trafficLines = useMemo(() => ([
    { key: 'pageviews', label: 'Pageviews', color: '#ec7049', format: (v) => nf.format(Math.round(v)), axisFormat: (v) => compact.format(v) },
    { key: 'sessions', label: 'Visits', color: '#d2a64f', format: (v) => nf.format(Math.round(v)), axisFormat: (v) => compact.format(v) },
  ]), []);

  const funnelStages = useMemo(() => {
    const f = snapshot?.funnel;
    if (!f) return [];
    return [
      { key: 'productViews', label: 'Product pages viewed', value: f.productViews },
      { key: 'addToCart', label: 'Added to cart', value: f.addToCart },
      { key: 'checkoutStarts', label: 'Reached checkout', value: f.checkoutStarts },
      { key: 'purchases', label: 'Orders placed', value: f.purchases, hint: 'Counted from real orders, not from browser events.' },
    ];
  }, [snapshot]);
  const funnelTracked = funnelStages.slice(0, 3).some((s) => (Number(s.value) || 0) > 0);

  const regions = useMemo(() => (snapshot?.regions || []).filter((row) => !country || row.country === country).slice(0, 8), [snapshot, country]);
  const cities = useMemo(() => (snapshot?.cities || []).filter((row) => !country || row.country === country).slice(0, 8), [snapshot, country]);
  const countries = useMemo(() => (snapshot?.countries || []).map((row) => ({ ...row, label: countryName(row.label) })).slice(0, 8), [snapshot]);
  const locationRows = locationTab === 'regions' ? regions : locationTab === 'cities' ? cities : countries;
  const geoEmpty = countries.length === 0 && (snapshot?.regions || []).length === 0 && (snapshot?.cities || []).length === 0;
  const onCountryClick = (name) => {
    if (name === null) { setCountry(null); return; }
    const match = (snapshot?.countries || []).find((row) => countryName(row.label) === name);
    setCountry(match ? match.label : null);
  };
  const selectedCountryName = country ? countryName(country) : null;
  const exportLocationCsv = () => exportCsv(`analytics-${locationTab}.csv`, locationRows, [
    { key: 'label', header: locationTab === 'countries' ? 'Country' : locationTab === 'regions' ? 'Region' : 'City' },
    { key: 'count', header: 'Visitors' },
  ]);

  const sources = useMemo(() => groupReferrers(snapshot?.referrers), [snapshot]);
  const pages = useMemo(() => (snapshot?.pages || []).slice(0, 8), [snapshot]);
  const devices = useMemo(() => snapshot?.devices || [], [snapshot]);
  const deviceTotal = devices.reduce((sum, d) => sum + (Number(d.count) || 0), 0);

  const categories = useMemo(() => commerce?.categorySales || [], [commerce]);
  const filteredProducts = useMemo(() => {
    const list = commerce?.topProducts || [];
    if (!categoryFilter) return list;
    return list.filter((p) => (p.category || 'Uncategorized') === categoryFilter);
  }, [commerce, categoryFilter]);

  const activity = useMemo(() => commerce?.activity || [], [commerce]);
  const visibleActivity = showAllActivity ? activity : activity.slice(0, 5);
  const liveCount = live?.live ?? 0;

  const rangeLabel = snapshot ? `${snapshot.range.from} to ${snapshot.range.to}` : range.custom ? `${range.from} to ${range.to}` : `last ${range.days} days`;
  const prettyRange = snapshot
    ? `${fmtDay(snapshot.range.from)} – ${fmtDay(snapshot.range.to)}`
    : range.custom
      ? `${fmtDay(range.from)} – ${fmtDay(range.to)}`
      : `Last ${range.days} days`;
  const prettyPrev = snapshot?.previousRange?.from
    ? `${fmtDay(snapshot.previousRange.from)} – ${fmtDay(snapshot.previousRange.to)}`
    : null;
  const gaps = snapshot?.dataGaps;
  const ordersTruncated = gaps?.ordersTruncated || commerce?.dataGaps?.ordersTruncated;
  const noTraffic = Boolean(snapshot) && totals?.pageviews === 0;

  const dailyCsv = () => exportCsv(`analytics-daily-${snapshot.range.from}-to-${snapshot.range.to}.csv`, series, [
    { key: 'day', header: 'Date' },
    { key: 'pageviews', header: 'Pageviews' },
    { key: 'sessions', header: 'Visits' },
    { key: 'orders', header: 'Orders' },
    { key: 'revenue', header: 'Revenue (INR)' },
  ]);

  return (
    <div className="ana">
      <AnalyticsNav
        range={range}
        onChange={setRange}
        onRefresh={() => loadSnapshot({ silent: true })}
        refreshing={refreshing}
        loading={loading}
        disabled={loading}
      />

      <motion.div variants={pageVariants(reduced)} initial="initial" animate="animate" className="ana-container">
        <div className="ana-intro">
          <div>
            <h2>Business overview</h2>
            <p>
              Revenue, orders, customers and traffic for {rangeLabel}
              {prettyPrev ? `, vs ${prettyPrev}` : ''}.
            </p>
          </div>
          <div className="ana-intro-meta">
            <span className="ana-dates">
              <CalendarDays aria-hidden="true" />
              {prettyRange}
            </span>
            <span className={`ana-livebadge${hidden ? ' is-paused' : ''}`}>
              {!hidden && liveCount > 0
                ? <span className="live-dot" aria-hidden="true" />
                : <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: hidden ? 'var(--delta-flat)' : 'var(--delta-up)' }} />}
              Live data
            </span>
          </div>
        </div>

        {error && (
          <div role="alert" className="ana-alert" style={{ borderColor: 'var(--delta-down)' }}>
            <AlertTriangle aria-hidden="true" style={{ color: 'var(--delta-down)' }} />
            <div>
              <p>{error}</p>
              <button type="button" onClick={() => loadSnapshot()} className="mt-1 text-xs font-semibold underline" style={{ color: 'var(--maroon)' }}>Try again</button>
            </div>
          </div>
        )}

        {commerceUnavailable && (
          <div role="alert" className="ana-alert" style={{ borderColor: 'var(--delta-down)' }}>
            <AlertTriangle aria-hidden="true" style={{ color: 'var(--delta-down)' }} />
            <div>
              <p>Order figures could not be read for this period. Traffic below is unaffected.</p>
              <button type="button" onClick={() => loadSnapshot()} className="mt-1 text-xs font-semibold underline" style={{ color: 'var(--maroon)' }}>Try again</button>
            </div>
          </div>
        )}

        {/* Primary KPIs */}
        <section className="ana-grid ana-grid-kpi" aria-label="Primary metrics">
          <KpiCard label="Total Revenue" value={summary?.revenue ?? 0} delta={summary?.deltas.revenue} prefix="₹" icon={IndianRupee} loading={loading} sub="Cancelled orders excluded" spark={sparkFor('revenue')} sparkColor="#ec7049" />
          <KpiCard label="Orders" value={summary?.orders ?? 0} delta={summary?.deltas.orders} icon={ShoppingCart} loading={loading} spark={sparkFor('orders')} sparkColor="#ec7049" />
          <KpiCard label="Customers" value={summary?.customers ?? 0} delta={summary?.deltas.customers} icon={Users} loading={loading} sub="Distinct buyers" spark={customersSpark} sparkColor="#d2a64f" />
          <KpiCard label="Average Order Value" value={summary?.avgOrderValue ?? 0} delta={summary?.deltas.avgOrderValue} prefix="₹" icon={Receipt} loading={loading} />
        </section>

        {/* Secondary KPIs */}
        <section className="ana-grid ana-grid-kpi" aria-label="Secondary metrics">
          <KpiCard label="Items Sold" value={summary?.itemsSold ?? 0} delta={summary?.deltas.itemsSold} icon={Package} loading={loading} />
          <KpiCard label="Cancelled Orders" value={summary?.cancelled ?? 0} icon={Ban} loading={loading} sub="In this period" />
          <div className="ana-card ana-kpi">
            <div className="ana-kpi-top">
              <span className="ana-kpi-icon"><RotateCcw aria-hidden="true" /></span>
              <span className="ana-kpi-label">Refunds</span>
            </div>
            <div className="ana-kpi-main"><span className="ana-kpi-value text-lg">Not tracked</span></div>
            <div className="ana-kpi-foot"><span>No refund events recorded yet.</span></div>
          </div>
          <KpiCard label="Conversion Rate" value={totals?.conversionRate ?? 0} delta={deltas.conversionRate} suffix="%" decimals={1} icon={Percent} loading={loading} sub="Orders per visit" />
        </section>

        {/* Main chart + live */}
        <section className="ana-dash">
          <div className="ana-card ana-chart-card ana-span-8">
            <AnaHead
              title="Revenue & Orders"
              hint="Daily revenue and placed orders."
              action={series.length > 0 && <CsvButton label="Daily CSV" onClick={dailyCsv} />}
            />
            <div className="ana-tabs" role="tablist" aria-label="Chart series">
              {[{ key: 'both', label: 'Both' }, { key: 'revenue', label: 'Revenue' }, { key: 'orders', label: 'Orders' }].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={revMode === option.key}
                  onClick={() => setRevMode(option.key)}
                  className="ana-tab"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="ana-legend" aria-hidden="true">
              {(revMode === 'both' || revMode === 'orders') && <span><i style={{ background: '#ec7049' }} />Orders</span>}
              {(revMode === 'both' || revMode === 'revenue') && <span><i style={{ background: '#d2a64f' }} />Revenue (₹)</span>}
            </div>
            {loading
              ? <Skeleton className="h-[220px] w-full" rounded="var(--r-md)" />
              : <DualTrendChart series={series} lines={salesLines} dualAxis={revMode === 'both'} />}
            {!loading && (summary?.orders ?? 0) === 0 && (
              <p className="ana-zero">No data for this period.</p>
            )}
          </div>

          <div className="ana-card ana-span-4">
            <AnaHead icon={Activity} title="Live Now" hint={`Visitors online · last ${live?.windowMinutes ?? 5} min`} />
            {loading || liveLoading ? (
              <TableSkeleton rows={3} cols={1} label="Loading live" />
            ) : (
              <>
                <div className="ana-pulse-top">
                  <span className="ana-pulse-num"><AnimatedCounter value={liveCount} /></span>
                  <span className="ana-pulse-cap">visitors online now</span>
                </div>
                <ActivityFeed events={visibleActivity} loading={false} />
                {activity.length > 5 && (
                  <button type="button" onClick={() => setShowAllActivity((v) => !v)} className="ana-viewall">
                    {showAllActivity ? 'Show less' : `View all (${activity.length})`}
                    <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Category + status */}
        <section className="ana-dash">
          <div className="ana-card ana-span-6">
            <AnaHead
              icon={Tag}
              title="Sales by Category"
              hint={categoryFilter ? `Filtering Top Products — click to clear.` : 'Click a category to filter Top Products.'}
            />
            {loading ? <TableSkeleton rows={4} cols={2} label="Loading categories" /> : categories.length === 0 ? (
              <EmptyNote>No product sales in this period.</EmptyNote>
            ) : (
              <>
                <DonutChart
                  slices={categories.map((c) => ({ label: c.label, value: c.revenue, sub: `${nf.format(c.qty)} sold` }))}
                  centerValue={inr(categories.reduce((s, c) => s + c.revenue, 0))}
                  centerLabel="revenue"
                  formatValue={(v) => inr(v)}
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => setCategoryFilter((prev) => (prev === c.label ? null : c.label))}
                      aria-pressed={categoryFilter === c.label}
                      aria-selected={categoryFilter === c.label}
                      className="ana-tab"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="ana-card ana-span-6">
            <AnaHead title="Order Status" hint="Placed orders in this period." />
            {loading ? <TableSkeleton rows={7} cols={1} label="Loading statuses" /> : <StatusBars statuses={commerce?.orderStatuses || []} />}
          </div>
        </section>

        {/* Top products */}
        <section className="ana-card ana-span-12" style={{ marginBottom: 16 }}>
          <AnaHead
            icon={Package}
            title="Top Products"
            hint={categoryFilter ? `Top in ${categoryFilter}.` : 'By units sold.'}
            action={<Link to="/products" className="ana-viewall" style={{ marginTop: 0 }}>View all<ArrowRight aria-hidden="true" /></Link>}
          />
          {loading ? <TableSkeleton rows={6} cols={3} label="Loading best sellers" /> : filteredProducts.length === 0 ? (
            <EmptyNote>{categoryFilter ? `No sales in ${categoryFilter} this period.` : 'No product sales in this period.'}</EmptyNote>
          ) : (
            <div className="ana-tablewrap ana-table-dense">
              <table>
                <thead>
                  <tr>
                    <th className="w-8 text-left">#</th>
                    <th className="text-left">Product</th>
                    <th className="text-right">Units</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.slice(0, 10).map((product, i) => (
                    <tr key={product.id || i} style={{ borderTop: '1px solid var(--hairline)' }}>
                      <td className="tabular py-2 pr-2" style={{ color: 'var(--text-subtle)' }}>{i + 1}</td>
                      <td className="max-w-[420px] truncate py-2 pr-3" title={product.name} style={{ color: 'var(--text-body)' }}>
                        <Link to={`/products/edit/${product.id}`} className="hover:underline" style={{ color: 'var(--text-body)' }}>
                          {product.name}
                        </Link>
                      </td>
                      <td className="tabular py-2 text-right font-semibold" style={{ color: 'var(--text-strong)' }}>{nf.format(product.units)}</td>
                      <td className="tabular py-2 text-right" style={{ color: 'var(--text-body)' }}>{inr(product.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Customers + alerts */}
        <section className="ana-dash">
          <div className="ana-card ana-span-6">
            <AnaHead icon={Users} title="Top Customers" hint="By spend. Contact details masked." />
            {loading ? <TableSkeleton rows={4} cols={3} label="Loading customers" /> : (commerce?.topCustomers || []).length === 0 ? (
              <EmptyNote>No customer orders in this period.</EmptyNote>
            ) : (
              <div className="ana-tablewrap ana-table-dense">
                <table>
                  <thead>
                    <tr>
                      <th className="text-left">Customer</th>
                      <th className="text-right">Orders</th>
                      <th className="text-right">Spend</th>
                      <th className="text-right">Last Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(commerce.topCustomers || []).map((customer, i) => (
                      <tr key={`${customer.emailMasked || customer.name}-${i}`} style={{ borderTop: '1px solid var(--hairline)' }}>
                        <td className="max-w-[150px] truncate py-2 pr-3" style={{ color: 'var(--text-body)' }}>
                          <span className="block font-semibold" style={{ color: 'var(--text-strong)' }}>{customer.name}</span>
                          {customer.emailMasked && <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>{customer.emailMasked}</span>}
                        </td>
                        <td className="tabular py-2 text-right font-semibold" style={{ color: 'var(--text-strong)' }}>{nf.format(customer.orders)}</td>
                        <td className="tabular py-2 text-right" style={{ color: 'var(--text-body)' }}>{inr(customer.spend)}</td>
                        <td className="tabular py-2 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                          #{customer.lastCode} · {fmtDateTime(customer.lastMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="ana-card ana-span-6">
            <AnaHead title="Business Alerts" hint="From live catalogue and order data." />
            <AlertsList alerts={commerce?.alerts} loading={loading} />
          </div>
        </section>

        {/* Traffic + funnel */}
        <section className="ana-dash">
          <div className="ana-card ana-chart-card ana-span-6">
            <AnaHead title="Traffic Overview" hint="Pageviews and visits over time." />
            <ul className="ana-statrow">
              <li><span>Visitors</span><strong>{nf.format(totals?.sessions ?? 0)}</strong></li>
              <li><span>Pageviews</span><strong>{nf.format(totals?.pageviews ?? 0)}</strong></li>
              <li><span>Pages / visit</span><strong>{totals?.viewsPerSession ?? 0}</strong></li>
            </ul>
            {loading
              ? <Skeleton className="h-[200px] w-full" rounded="var(--r-md)" />
              : <DualTrendChart series={series} lines={trafficLines} />}
            {!loading && (
              <p className="ana-zero">New vs returning split is not tracked yet.</p>
            )}
          </div>
          <div className="ana-card ana-span-6">
            <AnaHead title="Conversion Funnel" hint="Share carrying on from the step above." />
            {loading ? <TableSkeleton rows={4} cols={1} label="Loading funnel" /> : <FunnelChart stages={funnelStages} />}
            {!loading && !funnelTracked && (
              <p className="ana-zero">Browser-event stages have no data yet. Orders (last step) are exact.</p>
            )}
          </div>
        </section>

        {noTraffic && (
          <div className="ana-alert">
            <AlertTriangle aria-hidden="true" style={{ color: 'var(--gold-400)' }} />
            <div>
              <p>No traffic data yet.</p>
              <p className="ana-alert-sub">Visits fill in as customers browse the live site. Orders and revenue above are real regardless.</p>
            </div>
          </div>
        )}

        {/* Pages + sources */}
        <section className="ana-dash">
          <div className="ana-card ana-span-6">
            <AnaHead icon={Eye} title="Most Visited Pages" hint="Top routes this period." />
            <RankedList rows={pages} loading={loading} emptyText="No page data yet." />
          </div>
          <div className="ana-card ana-span-6">
            <AnaHead icon={Link2} title="How They Found The Shop" hint="Grouped by referring host." />
            <RankedList rows={sources} loading={loading} emptyText="No referrer data — direct or hidden arrivals." />
          </div>
        </section>

        {/* Devices + location */}
        <section className="ana-dash">
          <div className="ana-card ana-span-4">
            <AnaHead icon={Monitor} title="Devices" hint="Visits by device." />
            {loading
              ? <TableSkeleton rows={3} cols={2} label="Loading device split" />
              : deviceTotal === 0
                ? <EmptyNote>Device tracking unavailable for this period.</EmptyNote>
                : <DeviceDonut devices={devices} />}
          </div>
          <div className="ana-card ana-span-8">
            <AnaHead
              icon={Globe2}
              title="Visitors by Location"
              hint={selectedCountryName ? `Filtered to ${selectedCountryName}.` : 'Rough indication from language and timezone.'}
              action={!geoEmpty && <CsvButton label="CSV" onClick={exportLocationCsv} />}
            />
            {loading ? <TableSkeleton rows={5} cols={2} label="Loading locations" /> : geoEmpty ? (
              <EmptyNote>Location analytics not configured for this period.</EmptyNote>
            ) : (
              <>
                <div className="ana-tabs" role="tablist" aria-label="Location level">
                  {LOCATION_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={locationTab === tab.key}
                      onClick={() => setLocationTab(tab.key)}
                      className="ana-tab"
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <RankedList
                  rows={locationRows}
                  loading={false}
                  emptyText="Nothing recorded at this level."
                  onSelect={locationTab === 'countries' ? onCountryClick : undefined}
                  selected={selectedCountryName}
                />
                {selectedCountryName && (
                  <button type="button" onClick={() => onCountryClick(null)} className="ana-viewall">
                    Clear {selectedCountryName} filter
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        <section className="ana-card ana-span-12" style={{ marginBottom: 16 }}>
          <AnaHead title="When People Browse" hint="Pageviews by weekday and hour, visitor-local time." />
          {loading ? <Skeleton className="h-[200px] w-full" rounded="var(--r-md)" /> : <TrafficHeatmap grid={snapshot?.grid || []} />}
        </section>

        {ordersTruncated && (
          <p className="ana-warn" style={{ color: 'var(--delta-down)' }}>
            <AlertTriangle aria-hidden="true" />
            This period has more orders than a single read returns, so order figures are partial. Choose a shorter range for exact numbers.
          </p>
        )}

        <p className="ana-footnote">
          Collected first-party. No IP address is stored and no third-party tracker is loaded. Staff pages are excluded from every count. Revenue excludes cancelled orders.
        </p>
      </motion.div>
    </div>
  );
}
