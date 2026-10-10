import { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarDays,
  Eye,
  Globe2,
  IndianRupee,
  Link2,
  Monitor,
  Package,
  Percent,
  Receipt,
  RefreshCw,
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
/* Heavy chart code splits out of the initial admin bundle: the Analytics
   shell (header, KPIs, skeletons) paints first, charts hydrate per-section.
   Each usage is wrapped in Suspense with a same-size Skeleton so there is
   no layout shift while the chunk loads. */
const DualTrendChart = lazy(() => import('../components/admin/analytics/DualTrendChart'));
const FunnelChart = lazy(() => import('../components/admin/analytics/FunnelChart'));
const TrafficHeatmap = lazy(() => import('../components/admin/analytics/TrafficHeatmap'));
const DeviceDonut = lazy(() => import('../components/admin/analytics/DeviceDonut'));
import RangePicker from '../components/admin/analytics/RangePicker';
import AdminHeader from '../components/admin/AdminHeader';
import { StatusBars } from '../components/admin/analytics/CommerceWidgets';
import {
  AxCard,
  AxCategory,
  AxCsv,
  AxEmpty,
  AxInsights,
  AxKpiCell,
  AxKpis,
  AxLegend,
  AxLive,
  AxRanked,
  AxStatus,
  AxTabs,
} from '../components/admin/analytics/AxSections';
import '../components/admin/analytics/analytics.css';
import '../components/admin/analytics/ax-dashboard.css';

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

/* Referrer rows carry raw values; group by host so the list reads as
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
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
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
      setLastFetchedAt(Date.now());
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
      <AdminHeader
        title="Live Analytics"
        controls={(
          <>
            <RangePicker range={range} onChange={setRange} disabled={loading} compact />
            <button
              type="button"
              onClick={() => loadSnapshot({ silent: true })}
              disabled={loading || refreshing}
              className="ana-refresh"
              title="Refresh analytics"
            >
              <span className={refreshing ? 'animate-spin inline-flex' : 'inline-flex'} aria-hidden="true"><RefreshCw size={13} /></span>
              <span>Refresh</span>
            </button>
          </>
        )}
      />

      <motion.div variants={pageVariants(reduced)} initial="initial" animate="animate" className="ana-container">
        <div className="ax-page">
          <div className="ax-head">
            <div>
              <h2 className="ax-title">Live Analytics</h2>
              <p className="ax-sub">Business performance, sales, customers and traffic overview.</p>
            </div>
            <div className="ax-meta">
              <span className="ana-dates">
                <CalendarDays aria-hidden="true" />
                {prettyRange}
              </span>
              <span className={`ana-livebadge${hidden ? ' is-paused' : ''}`}>
                {!hidden && !error && liveCount > 0
                  ? <span className="live-dot" aria-hidden="true" />
                  : <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: error ? 'var(--delta-down)' : hidden ? 'var(--delta-flat)' : 'var(--delta-up)' }} />}
                {error ? 'Update failed' : !lastFetchedAt ? 'Live data' : Date.now() - lastFetchedAt < 90_000 ? 'Updated just now' : `Updated ${Math.max(1, Math.round((Date.now() - lastFetchedAt) / 60_000))}m ago`}
              </span>
            </div>
          </div>

          {error && (
            <div role="alert" className="ax-note" style={{ borderColor: 'var(--delta-down)' }}>
              <AlertTriangle aria-hidden="true" style={{ color: 'var(--delta-down)' }} />
              <div>
                <p>{error}</p>
                <button type="button" onClick={() => loadSnapshot()} className="mt-1 text-xs font-semibold underline" style={{ color: 'var(--maroon)' }}>Try again</button>
              </div>
            </div>
          )}

          {commerceUnavailable && (
            <div role="alert" className="ax-note" style={{ borderColor: 'var(--delta-down)' }}>
              <AlertTriangle aria-hidden="true" style={{ color: 'var(--delta-down)' }} />
              <div>
                <p>Order figures could not be read for this period. Traffic below is unaffected.</p>
                <button type="button" onClick={() => loadSnapshot()} className="mt-1 text-xs font-semibold underline" style={{ color: 'var(--maroon)' }}>Try again</button>
              </div>
            </div>
          )}

          {/* KPI panel */}
          <div className="ax-kpis" role="region" aria-label="Key metrics">
            <AxKpiCell icon={IndianRupee} label="Total Revenue" value={summary?.revenue} delta={summary?.deltas.revenue} prefix="₹" sub="Cancelled orders excluded" spark={sparkFor('revenue')} sparkColor="#ec7049" loading={loading} />
            <AxKpiCell icon={ShoppingCart} label="Orders" value={summary?.orders} delta={summary?.deltas.orders} spark={sparkFor('orders')} sparkColor="#ec7049" loading={loading} />
            <AxKpiCell icon={Users} label="Customers" value={summary?.customers} delta={summary?.deltas.customers} sub="Distinct buyers" spark={customersSpark} sparkColor="#d2a64f" loading={loading} />
            <AxKpiCell icon={Receipt} label="Average Order Value" value={summary?.avgOrderValue} delta={summary?.deltas.avgOrderValue} prefix="₹" loading={loading} />
            <AxKpiCell icon={Package} label="Items Sold" value={summary?.itemsSold} delta={summary?.deltas.itemsSold} loading={loading} />
            <AxKpiCell icon={Ban} label="Cancelled Orders" value={summary?.cancelled} sub="In this period" loading={loading} />
            <AxKpiCell icon={RotateCcw} label="Refunds" statik="Not tracked" sub="No refund events recorded yet" loading={loading} />
            <AxKpiCell icon={Percent} label="Conversion Rate" value={totals?.conversionRate} delta={deltas.conversionRate} suffix="%" decimals={1} sub="Orders per visit" loading={loading} dash={Boolean(snapshot) && (totals?.sessions ?? 0) === 0} />
          </div>

          {/* Hero row */}
          <div className="ax-grid">
            <AxCard
              className="ax-s8 ax-chart-hero"
              title="Revenue & Orders"
              sub={`Daily revenue and placed orders · ${rangeLabel}${prettyPrev ? ` · vs ${prettyPrev}` : ''}`}
              action={series.length > 0 && <AxCsv label="Daily CSV" onClick={dailyCsv} />}
            >
              <div className="ax-hero-total">
                <p className="v">{snapshot ? inr(summary?.revenue ?? 0) : '—'}</p>
                {summary && (
                <p className="c">Revenue this period{summary?.deltas.revenue != null ? ` · ${summary.deltas.revenue > 0 ? '↑' : summary.deltas.revenue < 0 ? '↓' : '→'} ${Math.abs(summary.deltas.revenue)}% vs previous` : ''}</p>
                )}
              </div>
              <AxTabs
                label="Chart series"
                value={revMode}
                onChange={setRevMode}
                options={[{ key: 'both', label: 'Both' }, { key: 'revenue', label: 'Revenue' }, { key: 'orders', label: 'Orders' }]}
              />
              <AxLegend
                items={[
                  ...((revMode === 'both' || revMode === 'orders') ? [{ label: 'Orders', color: '#ec7049' }] : []),
                  ...((revMode === 'both' || revMode === 'revenue') ? [{ label: 'Revenue (₹)', color: '#d2a64f' }] : []),
                ]}
              />
              {loading
                ? <Skeleton className="h-[300px] w-full" rounded="var(--r-md)" />
                : (
                  <Suspense fallback={<Skeleton className="h-[300px] w-full" rounded="var(--r-md)" />}>
                    <DualTrendChart series={series} lines={salesLines} dualAxis={revMode === 'both'} viewH={360} />
                  </Suspense>
                )}
              {!loading && (summary?.orders ?? 0) === 0 && (
                <p className="ax-zero">No data for this period.</p>
              )}
            </AxCard>

            <AxCard
              className="ax-s4"
              title="Live Now"
              sub={`Visitors online · last ${live?.windowMinutes ?? 5} min`}
              icon={Activity}
            >
              <AxLive
                count={liveCount}
                windowMinutes={live?.windowMinutes ?? 5}
                events={activity}
                showAll={showAllActivity}
                onToggle={() => setShowAllActivity((v) => !v)}
                loading={loading || liveLoading}
              />
            </AxCard>
          </div>

          {/* Category + status */}
          <div className="ax-grid">
            <AxCard
              className="ax-s7"
              title="Sales by Category"
              icon={Tag}
              sub={categoryFilter ? 'Filtering Top Products — click to clear.' : 'Click a category to filter Top Products.'}
            >
              <AxCategory categories={categories} selected={categoryFilter} onSelect={setCategoryFilter} loading={loading} />
            </AxCard>
            <AxCard className="ax-s5" title="Order Status" sub="Placed orders in this period.">
              {loading ? <TableSkeleton rows={7} cols={1} label="Loading statuses" /> : <AxStatus statuses={commerce?.orderStatuses || []} loading={false} />}
            </AxCard>
          </div>

          {/* Top products */}
          <AxCard
            title="Top Products"
            sub={categoryFilter ? `Top in ${categoryFilter} · by units sold.` : 'Best performing products by units sold.'}
            icon={Package}
            action={<Link to="/products" className="ax-viewall" style={{ marginTop: 0 }}>View all<ArrowRight aria-hidden="true" /></Link>}
          >
            {loading ? <TableSkeleton rows={6} cols={3} label="Loading best sellers" /> : filteredProducts.length === 0 ? (
              <AxEmpty>{categoryFilter ? `No sales in ${categoryFilter} this period.` : 'No product sales in this period.'}</AxEmpty>
            ) : (
              <div className="ax-tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th className="w-8 text-left">#</th>
                      <th className="text-left">Product</th>
                      <th className="r">Units</th>
                      <th className="r">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.slice(0, 10).map((product, i) => (
                      <tr key={product.id || i}>
                        <td><span className="ax-rank">{i + 1}</span></td>
                        <td className="max-w-[420px] truncate py-2 pr-3" title={product.name} style={{ color: 'var(--text-body)' }}>
                          <Link to={`/products/edit/${product.id}`} className="hover:underline" style={{ color: 'var(--text-body)' }}>
                            {product.name}
                          </Link>
                        </td>
                        <td className="tabular r py-2 font-semibold" style={{ color: 'var(--text-strong)' }}>{nf.format(product.units)}</td>
                        <td className="tabular r py-2" style={{ color: 'var(--text-body)' }}>{inr(product.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AxCard>

          {/* Customers + insights */}
          <div className="ax-grid">
            <AxCard className="ax-s7" title="Top Customers" icon={Users} sub="By spend · contact details masked.">
              {loading ? <TableSkeleton rows={4} cols={3} label="Loading customers" /> : (commerce?.topCustomers || []).length === 0 ? (
                <AxEmpty>No customer orders in this period.</AxEmpty>
              ) : (
                <div className="ax-tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="text-left">Customer</th>
                        <th className="r">Orders</th>
                        <th className="r">Spend</th>
                        <th className="r">Last Order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(commerce.topCustomers || []).map((customer, i) => (
                        <tr key={`${customer.emailMasked || customer.name}-${i}`}>
                          <td className="max-w-[150px] truncate py-2 pr-3" style={{ color: 'var(--text-body)' }}>
                            <span className="block font-semibold" style={{ color: 'var(--text-strong)' }}>{customer.name}</span>
                            {customer.emailMasked && <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>{customer.emailMasked}</span>}
                          </td>
                          <td className="tabular r py-2 font-semibold" style={{ color: 'var(--text-strong)' }}>{nf.format(customer.orders)}</td>
                          <td className="tabular r py-2" style={{ color: 'var(--text-body)' }}>{inr(customer.spend)}</td>
                          <td className="tabular r py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            #{customer.lastCode} · {fmtDateTime(customer.lastMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AxCard>
            <AxCard className="ax-s5" title="Business Insights" sub="Generated from live catalogue and order data.">
              <AxInsights alerts={commerce?.alerts} loading={loading} />
            </AxCard>
          </div>

          {/* Traffic + funnel */}
          <div className="ax-grid">
            <AxCard className="ax-s7" title="Traffic Overview" sub="Pageviews and visits over time.">
              <ul className="ax-statrow">
                <li><span>Visitors</span><strong>{nf.format(totals?.sessions ?? 0)}</strong></li>
                <li><span>Pageviews</span><strong>{nf.format(totals?.pageviews ?? 0)}</strong></li>
                <li><span>Pages / visit</span><strong>{totals?.viewsPerSession ?? 0}</strong></li>
              </ul>
              {loading
                ? <Skeleton className="h-[200px] w-full" rounded="var(--r-md)" />
                : (
                  <Suspense fallback={<Skeleton className="h-[200px] w-full" rounded="var(--r-md)" />}>
                    <DualTrendChart series={series} lines={trafficLines} />
                  </Suspense>
                )}
              {!loading && (
                <p className="ax-zero">New vs returning split is not tracked yet.</p>
              )}
            </AxCard>
            <AxCard className="ax-s5" title="Conversion Funnel" sub="Share carrying on from the step above.">
              {loading ? <TableSkeleton rows={4} cols={1} label="Loading funnel" /> : (
                <Suspense fallback={<TableSkeleton rows={4} cols={1} label="Loading funnel" />}>
                  <FunnelChart stages={funnelStages} />
                </Suspense>
              )}
              {!loading && !funnelTracked && (
                <p className="ax-zero">Browser-event stages have no data yet. Orders (last step) are exact.</p>
              )}
            </AxCard>
          </div>

          {noTraffic && (
            <div role="status" className="ax-note">
              <AlertTriangle aria-hidden="true" style={{ color: 'var(--gold-400)' }} />
              <div>
                <p>No traffic data yet.</p>
                <p className="ax-note-sub">Visits fill in as customers browse the live site. Orders and revenue above are real regardless.</p>
              </div>
            </div>
          )}

          {/* Discovery */}
          <div className="ax-h" style={{ marginTop: 4 }}>
            <div className="min-w-0">
              <h3 className="ax-h-title">Acquisition &amp; Navigation</h3>
              <p className="ax-h-sub">Where visitors come from and where they go.</p>
            </div>
          </div>
          <div className="ax-grid">
            <AxCard className="ax-s6" title="Most Visited Pages" icon={Eye} sub="Top routes this period.">
              <AxRanked rows={pages} loading={loading} emptyText="No page data yet." />
            </AxCard>
            <AxCard className="ax-s6" title="How They Found The Shop" icon={Link2} sub="Grouped by referring host.">
              <AxRanked rows={sources} loading={loading} emptyText="No referrer data — direct or hidden arrivals." />
            </AxCard>
          </div>

          {/* Audience */}
          <div className="ax-grid">
            <AxCard className="ax-s4" title="Devices" icon={Monitor} sub="Visits by device.">
              {loading
                ? <TableSkeleton rows={3} cols={2} label="Loading device split" />
                : deviceTotal === 0
                  ? <AxEmpty>Device tracking unavailable for this period.</AxEmpty>
                  : (
                    <Suspense fallback={<TableSkeleton rows={3} cols={2} label="Loading device split" />}>
                      <DeviceDonut devices={devices} />
                    </Suspense>
                  )}
            </AxCard>
            <AxCard
              className="ax-s8"
              title="Visitors by Location"
              icon={Globe2}
              sub={selectedCountryName ? `Filtered to ${selectedCountryName}.` : 'Rough indication from language and timezone.'}
              action={!geoEmpty && <AxCsv label="CSV" onClick={exportLocationCsv} />}
            >
              {loading ? <TableSkeleton rows={5} cols={2} label="Loading locations" /> : geoEmpty ? (
                <AxEmpty>Location analytics not configured for this period.</AxEmpty>
              ) : (
                <>
                  <AxTabs
                    label="Location level"
                    value={locationTab}
                    onChange={setLocationTab}
                    options={LOCATION_TABS}
                  />
                  <AxRanked
                    rows={locationRows}
                    loading={false}
                    emptyText="Nothing recorded at this level."
                    onSelect={locationTab === 'countries' ? onCountryClick : undefined}
                    selected={selectedCountryName}
                  />
                  {selectedCountryName && (
                    <button type="button" onClick={() => onCountryClick(null)} className="ax-viewall">
                      Clear {selectedCountryName} filter
                    </button>
                  )}
                </>
              )}
            </AxCard>
          </div>

          {/* Heatmap */}
          <AxCard title="When People Browse" sub="Pageviews by weekday and visitor-local time.">
            {loading ? <Skeleton className="h-[200px] w-full" rounded="var(--r-md)" /> : (
              <div className="ax-heat">
                <div className="ax-heat-scroll">
                  <Suspense fallback={<Skeleton className="h-[200px] w-full" rounded="var(--r-md)" />}>
                    <TrafficHeatmap grid={snapshot?.grid || []} />
                  </Suspense>
                </div>
              </div>
            )}
          </AxCard>

          {ordersTruncated && (
            <p className="ax-warn" style={{ color: 'var(--delta-down)', marginTop: 20 }}>
              <AlertTriangle aria-hidden="true" />
              This period has more orders than a single read returns, so order figures are partial. Choose a shorter range for exact numbers.
            </p>
          )}

          <p className="ax-foot" style={{ marginTop: 24 }}>
            Analytics uses first-party activity data. No IP addresses are stored. No third-party tracker is loaded. Staff pages are excluded from visitor counts. Revenue excludes cancelled orders.
          </p>
        </div>
      </motion.div>
    </div>
  );
}


