import { AlertTriangle, ArrowRight, Download, Package, ShoppingCart, UserPlus } from 'lucide-react';
import AnimatedCounter from '../../ui/AnimatedCounter';
import { Skeleton, TableSkeleton } from '../../ui/Skeleton';
import { DeltaBadge } from './StatCard';
import { Sparkline } from './KpiCard';
import { DonutChart } from './CommerceWidgets';

const nf = new Intl.NumberFormat('en-IN');
const inr = (value) => `₹${nf.format(Math.round(Number(value) || 0))}`;

function timeAgo(ms) {
  const diff = Date.now() - Number(ms);
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(Number(ms)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const codeOf = (title) => {
  const m = String(title || '').match(/#([A-Za-z0-9]+)/);
  return m ? `#${m[1]}` : null;
};

export function AxEmpty({ children }) {
  return <p className="ax-empty">{children}</p>;
}

export function AxCard({ title, sub, icon: Icon, action, children, className = '' }) {
  return (
    <div className={`ax-card${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className="ax-card-head">
          <div className="min-w-0">
            {title && (
              <h3 className="ax-card-title">
                {Icon && <Icon aria-hidden="true" />}
                {title}
              </h3>
            )}
            {sub && <p className="ax-card-sub">{sub}</p>}
          </div>
          {action && <div className="flex-none">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function AxTabs({ options, value, onChange, label }) {
  return (
    <div className="ax-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          onClick={() => onChange(option.key)}
          className="ax-tab"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AxLegend({ items }) {
  return (
    <div className="ax-legend" aria-hidden="true">
      {items.map((item) => (
        <span key={item.label}>
          <i style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function AxCsv({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} className="ana-csv">
      <Download aria-hidden="true" />
      {label}
    </button>
  );
}

/** Unified KPI panel item (rendered inside the divider grid by AxKpis). */
export function AxKpiCell({ icon: Icon, label, value, delta, prefix = '', suffix = '', decimals = 0, sub, spark = null, sparkColor = '#ec7049', statik = null, dash = false, loading = false }) {
  const noData = dash || value == null;
  if (loading) {
    return (
      <div className="ax-kpi" aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    );
  }
  return (
    <div className="ax-kpi">
      <div className="ax-kpi-top">
        {Icon && (
          <span className="ax-kpi-ico">
            <Icon aria-hidden="true" />
          </span>
        )}
        <span className="ax-kpi-label">{label}</span>
      </div>
      <div className="ax-kpi-main">
        {statik != null ? (
          <span className="ax-kpi-value" style={{ fontSize: 19 }}>{statik}</span>
        ) : noData ? (
          <span className="ax-kpi-value" aria-label={`${label} unavailable`}>—</span>
        ) : (
          <span className="ax-kpi-value">
            <AnimatedCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
          </span>
        )}
        {!statik && !noData && spark && spark.length > 1 && <Sparkline data={spark} color={sparkColor} />}
      </div>
      <div className="ax-kpi-foot">
        {!statik && !noData && <DeltaBadge delta={delta} />}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

export function AxKpis({ children }) {
  return <div className="ax-kpis">{children}</div>;
}

const RAIL_ICON = { order: ShoppingCart, status: Package, signup: UserPlus };

export function AxLive({ count, windowMinutes = 5, events, showAll, onToggle, loading = false }) {
  if (loading) return <TableSkeleton rows={4} cols={1} label="Loading live activity" />;
  const visible = showAll ? events : (events || []).slice(0, 5);
  return (
    <div>
      <div className="flex items-end gap-2.5">
        <span className="ax-live-num">
          <AnimatedCounter value={count} />
        </span>
        <span className="ax-live-cap" style={{ paddingBottom: 7 }}>
          visitors online · last {windowMinutes} min
        </span>
      </div>
      {visible.length === 0 ? (
        <AxEmpty>No recent activity.</AxEmpty>
      ) : (
        <ul className="ax-feed">
          {visible.map((event, i) => {
            const Icon = RAIL_ICON[event.type] || ShoppingCart;
            const code = codeOf(event.title);
            return (
              <li key={`${event.ms}-${i}`} className="ax-feed-item">
                <span className="ax-feed-dot">
                  <Icon aria-hidden="true" />
                </span>
                <div className="ax-feed-body">
                  {code && <p className="ax-feed-code">{event.type === 'order' && !/→/.test(event.title) ? `New order ${code}` : code}</p>}
                  <p className="ax-feed-title">{event.title}</p>
                  {event.detail && <p className="ax-feed-sub">{event.detail}</p>}
                </div>
                <span className="ax-feed-time">{timeAgo(event.ms)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {(events || []).length > 5 && (
        <button type="button" onClick={onToggle} className="ax-viewall">
          {showAll ? 'Show less' : `View all (${events.length})`}
          <ArrowRight aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const CAT_COLORS = ['#ec7049', '#d2a64f', '#a33b2e', '#c97e5d', 'var(--text-subtle)', '#7c5a2a'];

/** Single category representation: large donut + clickable breakdown rows. */
export function AxCategory({ categories, selected, onSelect, loading = false }) {
  if (loading) return <TableSkeleton rows={4} cols={2} label="Loading categories" />;
  if (!categories || categories.length === 0) return <AxEmpty>No product sales in this period.</AxEmpty>;
  return (
    <div>
      <DonutChart
        size="lg"
        slices={categories.map((c) => ({ label: c.label, value: c.revenue, sub: `${nf.format(c.qty)} sold` }))}
        centerValue={inr(categories.reduce((s, c) => s + c.revenue, 0))}
        centerLabel="revenue"
        formatValue={(v) => inr(v)}
      />
      <div className="mt-4">
        {categories.map((c, i) => {
          const active = selected === c.label;
          const pct = (Math.round(c.share * 10) / 10).toFixed(1);
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => onSelect(active ? null : c.label)}
              aria-pressed={active}
              className="ax-catrow"
              style={active ? { background: 'rgba(236,112,73,0.06)', borderRadius: 8 } : undefined}
            >
              <span className="ax-catdot" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
              <span className="ax-catname">{c.label}</span>
              <span className="ax-catpct">{pct}%</span>
              <span className="ax-catmeta">
                {inr(c.revenue)} · {nf.format(c.qty)} sold
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const AX_STATUS_COLORS = {
  Pending: '#d2a64f',
  Confirmed: '#ec7049',
  Packed: '#be8c36',
  Shipped: '#c97e5d',
  'Out for Delivery': '#df4c21',
  Delivered: 'var(--leaf-600)',
  Cancelled: 'var(--crimson-600)',
  Completed: 'var(--leaf-600)',
};

export function AxStatus({ statuses, loading = false }) {
  if (loading) return <TableSkeleton rows={7} cols={1} label="Loading statuses" />;
  const max = Math.max(...(statuses || []).map((s) => s.count), 1);
  return (
    <ul>
      {(statuses || []).map((row) => (
        <li key={row.status} className="ax-status">
          <span className="dot" style={{ background: AX_STATUS_COLORS[row.status] || 'var(--text-subtle)' }} />
          <span className="lbl">{row.status}</span>
          <span className="n">{nf.format(row.count)}</span>
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${row.count > 0 ? Math.max(4, (row.count / max) * 100) : 0}%`, background: AX_STATUS_COLORS[row.status] || 'var(--text-subtle)' }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AxRanked({ rows, loading, emptyText, onSelect, selected }) {
  if (loading) return <TableSkeleton rows={5} cols={2} label="Loading ranking" />;
  if (!rows || rows.length === 0) return <AxEmpty>{emptyText}</AxEmpty>;
  const peak = Math.max(...rows.map((r) => Number(r.count) || 0), 1);
  return (
    <ol className="ax-ranked">
      {rows.map((row, i) => {
        const active = selected && row.label === selected;
        const inner = (
          <>
            <span className="ax-ranked-fill" aria-hidden="true" style={{ width: `${(Number(row.count) / peak) * 100}%` }} />
            <span className="ax-ranked-num">{i + 1}</span>
            <span className="ax-ranked-label" title={row.label}>{row.label}</span>
            <span className="ax-ranked-count">{nf.format(Number(row.count) || 0)}</span>
          </>
        );
        return (
          <li key={row.label || i} className="ax-ranked-row" style={active ? { outline: '1px solid var(--hairline-strong)' } : undefined}>
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
}

export function AxInsights({ alerts, loading = false }) {
  if (loading) return <TableSkeleton rows={3} cols={1} label="Loading insights" />;
  if (!alerts || alerts.length === 0) {
    return <AxEmpty>No insights right now — stock, fulfilment and cancellations look normal.</AxEmpty>;
  }
  return (
    <ul>
      {alerts.map((alert, i) => (
        <li key={`${alert.kind}-${i}`} className="ax-insight">
          <span className="ax-insight-ico">
            <AlertTriangle aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="ax-insight-title">{alert.title}</p>
            {alert.detail && <p className="ax-insight-sub">{alert.detail}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
