import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Clock,
  Download,
  Eye,
  Globe2,
  IndianRupee,
  Layers,
  Link2,
  MapPin,
  Monitor,
  Package,
  Percent,
  Receipt,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { authFetch, readApiError } from '../utils/apiClient';
import { exportCsv } from '../utils/csv';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants } from '../lib/motion';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import AnimatedCounter from '../components/ui/AnimatedCounter';
import TrendChart from '../components/admin/analytics/TrendChart';
import DualTrendChart from '../components/admin/analytics/DualTrendChart';
import FunnelChart from '../components/admin/analytics/FunnelChart';
import TrafficHeatmap from '../components/admin/analytics/TrafficHeatmap';
import DeviceDonut from '../components/admin/analytics/DeviceDonut';
import BreakdownTable from '../components/admin/analytics/BreakdownTable';
import AnalyticsNav from '../components/admin/analytics/AnalyticsNav';
import KpiCard from '../components/admin/analytics/KpiCard';
import TopListCard from '../components/admin/analytics/TopListCard';
import '../components/admin/analytics/analytics.css';

const LIVE_POLL_MS = 15_000;
const SNAPSHOT_POLL_MS = 180_000;

const METRICS = [
  { key: 'pageviews', label: 'Pageviews' },
  { key: 'sessions', label: 'Visits' },
  { key: 'orders', label: 'Orders' },
  { key: 'revenue', label: 'Revenue' },
];

/* "Overview" is the dual-line default; the four singles preserve the exact
   day-by-day metric switching the page has always had. */
const METRIC_TABS = [{ key: 'overview', label: 'Overview' }, ...METRICS];

const nf = new Intl.NumberFormat('en-IN');
const inr = (value) => `₹${nf.format(Math.round(value))}`;
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

export default function AdminAnalytics() {
  const reduced = useReducedMotion();
  const [range, setRange] = useState({ days: 7, custom: false });
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [metric, setMetric] = useState('overview');
  const [country, setCountry] = useState(null);
  const [hidden, setHidden] = useState(typeof document === 'undefined' ? false : document.visibilityState === 'hidden');
  const snapshotAbort = useRef(null);
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (range.custom) { params.set('from', range.from); params.set('to', range.to); } else { params.set('days', String(range.days)); }
    return params.toString();
  }, [range]);
  const loadSnapshot = useCallback(async ({ silent = false } = {}) => {
    snapshotAbort.current?.abort();
    const controller = new AbortController();
    snapshotAbort.current = controller;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await authFetch(`/api/analytics/site?${query}`, { signal: controller.signal });
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
      const response = await authFetch('/api/analytics/live', { signal });
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
  useEffect(() => { setCountry(null); }, [query]);
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
  const regions = useMemo(() => (snapshot?.regions || []).filter((row) => !country || row.country === country).slice(0, 12), [snapshot, country]);
  const cities = useMemo(() => (snapshot?.cities || []).filter((row) => !country || row.country === country).slice(0, 12), [snapshot, country]);
  const countries = useMemo(() => (snapshot?.countries || []).map((row) => ({ ...row, label: countryName(row.label) })), [snapshot]);
  const onCountryClick = (name) => {
    if (name === null) { setCountry(null); return; }
    const match = (snapshot?.countries || []).find((row) => countryName(row.label) === name);
    setCountry(match ? match.label : null);
  };
  const selectedCountryName = country ? countryName(country) : null;
  const formatMetric = (value, axis = false) => {
    if (metric === 'revenue') return axis ? `₹${compact.format(value)}` : inr(value);
    return axis ? compact.format(value) : nf.format(Math.round(value));
  };
  const rangeLabel = snapshot ? `${snapshot.range.from} to ${snapshot.range.to}` : range.custom ? `${range.from} to ${range.to}` : `last ${range.days} days`;
  const prettyRange = snapshot
    ? `${fmtDay(snapshot.range.from)} – ${fmtDay(snapshot.range.to)}`
    : range.custom
      ? `${fmtDay(range.from)} – ${fmtDay(range.to)}`
      : `Last ${range.days} days`;
  const gaps = snapshot?.dataGaps;
  const noTraffic = Boolean(snapshot) && totals?.pageviews === 0;

  /* Daily sparkline source for every KPI — derived from the same series the
     charts draw, never hardcoded. Averages and rates are re-computed per day. */
  const sparkFor = useCallback((key) => {
    if (!series.length) return [];
    return series.map((row) => {
      const pv = Number(row.pageviews) || 0;
      const s = Number(row.sessions) || 0;
      const o = Number(row.orders) || 0;
      const r = Number(row.revenue) || 0;
      switch (key) {
        case 'pageviews': return pv;
        case 'sessions': return s;
        case 'orders': return o;
        case 'revenue': return r;
        case 'avgOrderValue': return o > 0 ? r / o : 0;
        case 'viewsPerSession': return s > 0 ? pv / s : 0;
        case 'conversionRate': return s > 0 ? (o / s) * 100 : 0;
        default: return 0;
      }
    });
  }, [series]);

  const trafficLines = useMemo(() => ([
    { key: 'pageviews', label: 'Pageviews', color: '#ec7049', format: (v) => nf.format(Math.round(v)), axisFormat: (v) => compact.format(v) },
    { key: 'sessions', label: 'Visits', color: '#d2a64f', format: (v) => nf.format(Math.round(v)), axisFormat: (v) => compact.format(v) },
  ]), []);
  const salesLines = useMemo(() => ([
    { key: 'orders', label: 'Orders', color: '#ec7049', format: (v) => nf.format(Math.round(v)), axisFormat: (v) => compact.format(v) },
    { key: 'revenue', label: 'Revenue', color: '#d2a64f', format: (v) => inr(v), axisFormat: (v) => `₹${compact.format(v)}` },
  ]), []);

  const liveCount = live?.live ?? 0;
  const coverage = gaps && snapshot ? { have: gaps.trackingDays, of: snapshot.range.days } : null;
  const coveragePct = coverage && coverage.of > 0 ? Math.min(100, Math.round((coverage.have / coverage.of) * 100)) : 0;

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
        {/* Intro */}
        <div className="ana-intro">
          <div>
            <h2>Live analytics</h2>
            <p>Traffic, journey and sales for the {rangeLabel}, compared with the period before it.</p>
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

        {/* KPI row 1 */}
        <section className="ana-grid ana-grid-kpi" aria-label="Sales metrics">
          <KpiCard label="Live now" value={liveCount} icon={Activity} loading={liveLoading} liveMode stale={hidden} windowMinutes={live?.windowMinutes ?? 5} />
          <KpiCard label="Revenue" value={totals?.revenue ?? 0} delta={deltas.revenue} prefix="₹" icon={IndianRupee} loading={loading} sub="Cancelled and refunded excluded" spark={sparkFor('revenue')} sparkColor="#ec7049" />
          <KpiCard label="Orders" value={totals?.orders ?? 0} delta={deltas.orders} icon={ShoppingCart} loading={loading} spark={sparkFor('orders')} sparkColor="#ec7049" />
          <KpiCard label="Average order" value={totals?.avgOrderValue ?? 0} delta={deltas.avgOrderValue} prefix="₹" icon={Receipt} loading={loading} spark={sparkFor('avgOrderValue')} sparkColor="#d2a64f" />
        </section>

        {/* KPI row 2 */}
        <section className="ana-grid ana-grid-kpi" aria-label="Traffic metrics">
          <KpiCard label="Pageviews" value={totals?.pageviews ?? 0} delta={deltas.pageviews} icon={Eye} loading={loading} spark={sparkFor('pageviews')} sparkColor="#ec7049" />
          <KpiCard label="Visits" value={totals?.sessions ?? 0} delta={deltas.sessions} icon={Users} loading={loading} sub="One per browser tab" spark={sparkFor('sessions')} sparkColor="#d2a64f" />
          <KpiCard label="Pages per visit" value={totals?.viewsPerSession ?? 0} delta={deltas.viewsPerSession} decimals={2} icon={Layers} loading={loading} spark={sparkFor('viewsPerSession')} sparkColor="#d2a64f" />
          <KpiCard label="Conversion" value={totals?.conversionRate ?? 0} delta={deltas.conversionRate} suffix="%" decimals={1} icon={Percent} loading={loading} sub="Orders per visit" spark={sparkFor('conversionRate')} sparkColor="#ec7049" />
        </section>

        {noTraffic && (
          <div className="ana-alert">
            <AlertTriangle aria-hidden="true" style={{ color: 'var(--gold-400)' }} />
            <div>
              <p>No visitor data for this period yet.</p>
              <p className="ana-alert-sub">Traffic, device and hour figures start filling in as soon as visitors browse the live site — tracking is skipped on staff pages and in local development. Orders and revenue above are real and complete regardless.</p>
            </div>
          </div>
        )}

        {/* Two balanced charts */}
        <section className="ana-grid ana-grid-2">
          <div className="ana-card ana-chart-card">
            <AnaHead
              title="Traffic Overview"
              hint="Pageviews and visits over time."
              action={series.length > 0 && <CsvButton label="Daily CSV" onClick={dailyCsv} />}
            />
            <div className="ana-tabs" role="tablist" aria-label="Chart metric">
              {METRIC_TABS.map((option) => {
                const active = metric === option.key;
                return (
                  <button key={option.key} type="button" role="tab" aria-selected={active} onClick={() => setMetric(option.key)} className="ana-tab">
                    {option.label}
                  </button>
                );
              })}
            </div>
            {metric === 'overview' && (
              <div className="ana-legend" aria-hidden="true">
                <span><i style={{ background: '#ec7049' }} />Pageviews</span>
                <span><i style={{ background: '#d2a64f' }} />Visits</span>
              </div>
            )}
            {loading
              ? <Skeleton className="h-[220px] w-full" rounded="var(--r-md)" />
              : metric === 'overview'
                ? <DualTrendChart series={series} lines={trafficLines} />
                : <TrendChart series={series} metric={metric} metricLabel={METRICS.find((m) => m.key === metric)?.label.toLowerCase()} formatValue={formatMetric} />}
          </div>

          <div className="ana-card ana-chart-card">
            <AnaHead title="Orders & Revenue" hint="Daily orders and revenue trend." />
            <div className="ana-legend" aria-hidden="true">
              <span><i style={{ background: '#ec7049' }} />Orders</span>
              <span><i style={{ background: '#d2a64f' }} />Revenue (₹)</span>
            </div>
            {loading
              ? <Skeleton className="h-[220px] w-full" rounded="var(--r-md)" />
              : <DualTrendChart series={series} lines={salesLines} dualAxis />}
            {!loading && (totals?.orders ?? 0) === 0 && (
              <p className="ana-zero">No orders in this period — showing zero.</p>
            )}
          </div>
        </section>

        {/* Top pages / referrers / devices */}
        <section className="ana-grid ana-grid-3">
          <TopListCard
            title="Top Pages"
            subtitle="Most visited pages in this period."
            icon={Eye}
            rows={snapshot?.pages || []}
            loading={loading}
            viewAllHref="#ana-pages"
            emptyText="No page data yet."
          />
          <TopListCard
            title="Top Referrers"
            subtitle="Where visitors come from."
            icon={Link2}
            rows={snapshot?.referrers || []}
            loading={loading}
            viewAllHref="#ana-pages"
            emptyText="Everyone arrived directly, or the referrer was hidden."
          />
          <div className="ana-card">
            <AnaHead icon={Monitor} title="Devices" hint="Sessions by device type." />
            {loading
              ? <TableSkeleton rows={3} cols={2} label="Loading device split" />
              : <DeviceDonut devices={snapshot?.devices || []} />}
          </div>
        </section>

        {/* Journey + live pulse */}
        <section className="ana-grid ana-grid-2">
          <div className="ana-card">
            <AnaHead title="Where the journey leaks" hint="Each percentage is the share that carried on from the step above." />
            {loading ? <TableSkeleton rows={4} cols={1} label="Loading funnel" /> : <FunnelChart stages={funnelStages} />}
          </div>
          <div className="ana-card">
            <AnaHead icon={Activity} title="Live pulse" hint="Right now, plus tracking coverage for this range." />
            {loading || liveLoading ? (
              <TableSkeleton rows={3} cols={2} label="Loading live pulse" />
            ) : (
              <>
                <div className="ana-pulse-top">
                  <span className="ana-pulse-num">
                    <AnimatedCounter value={liveCount} />
                  </span>
                  <span className="ana-pulse-cap">visitors online now · last {live?.windowMinutes ?? 5} min</span>
                </div>
                <ul className="ana-pulse-rows">
                  <li><span>Visits this period</span><strong>{nf.format(totals?.sessions ?? 0)}</strong></li>
                  <li><span>Pageviews this period</span><strong>{nf.format(totals?.pageviews ?? 0)}</strong></li>
                  <li>
                    <span>Tracking coverage</span>
                    <strong>{coverage ? `${coverage.have} of ${coverage.of} days` : '—'}</strong>
                  </li>
                </ul>
                {coverage && (
                  <>
                    <div className="ana-meter" role="img" aria-label={`Tracking data for ${coverage.have} of ${coverage.of} days`}>
                      <div style={{ width: `${coveragePct}%` }} />
                    </div>
                    <p className="ana-meter-cap">Orders cover the whole period; visits settle once tracking has run a full range.</p>
                  </>
                )}
              </>
            )}
          </div>
        </section>

        {/* Heatmap */}
        <section className="ana-card" style={{ marginBottom: 16 }}>
          <AnaHead icon={Clock} title="When people browse" hint="Pageviews by weekday and hour, in each visitor's own local time." />
          {loading ? <Skeleton className="h-[220px] w-full" rounded="var(--r-md)" /> : <TrafficHeatmap grid={snapshot?.grid || []} />}
        </section>

        {/* Geography */}
        <section style={{ marginBottom: 16 }}>
          <AnaHead
            icon={Globe2}
            title="Where visitors come from"
            hint={selectedCountryName ? `Filtered to ${selectedCountryName}. Click it again to clear.` : 'Click a country to filter the regions and cities beside it.'}
          />
          <div className="ana-grid ana-grid-3" style={{ marginBottom: 0 }}>
            <BreakdownTable title="Countries" icon={Globe2} rows={countries} loading={loading} onSelect={onCountryClick} selected={selectedCountryName} labelHeading="Country" csvName="analytics-countries.csv" emptyText="No location data yet." />
            <BreakdownTable title="Regions" icon={MapPin} rows={regions} loading={loading} labelHeading="Region" csvName="analytics-regions.csv" emptyText={selectedCountryName ? `No regions recorded for ${selectedCountryName}.` : 'No region data yet.'} note="Falls back to the visitor's timezone only when their location cannot be resolved." />
            <BreakdownTable title="Cities" icon={MapPin} rows={cities} loading={loading} labelHeading="City" csvName="analytics-cities.csv" emptyText={selectedCountryName ? `No cities recorded for ${selectedCountryName}.` : 'No city data yet.'} note="One count per visit, not per page, so this reads as visitors." />
          </div>
        </section>

        {/* Detailed pages + referrers */}
        <section id="ana-pages" className="ana-grid ana-grid-2">
          <BreakdownTable title="Most visited pages" icon={Eye} rows={snapshot?.pages || []} loading={loading} labelHeading="Path" csvName="analytics-pages.csv" />
          <BreakdownTable title="How they found the shop" icon={Link2} rows={snapshot?.referrers || []} loading={loading} labelHeading="Referrer" csvName="analytics-referrers.csv" emptyText="Everyone arrived directly, or the referrer was hidden." />
        </section>

        {/* Best sellers */}
        <section className="ana-card" style={{ marginBottom: 16 }}>
          <AnaHead
            icon={Package}
            title="Best sellers this period"
            hint="From placed orders, so these numbers are exact."
            action={(snapshot?.topProducts || []).length > 0 && (
              <CsvButton
                label="CSV"
                onClick={() => exportCsv('analytics-top-products.csv', snapshot.topProducts, [
                  { key: 'name', header: 'Product' },
                  { key: 'units', header: 'Units sold' },
                  { key: 'revenue', header: 'Revenue (INR)' },
                ])}
              />
            )}
          />
          {loading ? <TableSkeleton rows={5} cols={3} label="Loading best sellers" /> : (snapshot?.topProducts || []).length === 0 ? <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No orders in this period.</p> : (
            <div className="ana-tablewrap">
              <table>
                <thead>
                  <tr>
                    <th className="text-left">Product</th>
                    <th className="text-right">Units</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.topProducts.map((product) => (
                    <tr key={product.id} style={{ borderTop: '1px solid var(--hairline)' }}>
                      <td className="truncate py-2 pr-3" style={{ color: 'var(--text-body)', maxWidth: '320px' }}>{product.name}</td>
                      <td className="tabular py-2 text-right font-semibold" style={{ color: 'var(--text-strong)' }}>{nf.format(product.units)}</td>
                      <td className="tabular py-2 text-right" style={{ color: 'var(--text-body)' }}>{inr(product.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {gaps && (gaps.ordersTruncated || gaps.ordersUnavailable) && (
          <p className="ana-warn" style={{ color: 'var(--delta-down)' }}>
            <AlertTriangle aria-hidden="true" />
            {gaps.ordersUnavailable ? 'Order figures could not be read for this period, so revenue and best sellers are missing.' : 'This period has more orders than a single read returns, so order figures are partial. Choose a shorter range for exact numbers.'}
          </p>
        )}

        {gaps && snapshot && gaps.trackingDays < snapshot.range.days && (
          <p className="ana-warn" style={{ color: 'var(--text-muted)' }}>
            <AlertTriangle aria-hidden="true" style={{ color: 'var(--gold-400)' }} />
            <span>Visitor tracking has data for {gaps.trackingDays} of these {snapshot.range.days} days, while orders cover the whole period. Anything that divides orders by visits — conversion, pages per visit — will settle once tracking has run for a full range.</span>
          </p>
        )}

        <p className="ana-footnote">
          Collected first-party. No IP address is stored and no third-party tracker is loaded — location is taken from the visitor&apos;s own language and timezone settings, so treat it as a rough indication rather than a fact. Staff pages are excluded from every count.
        </p>
      </motion.div>
    </div>
  );
}
