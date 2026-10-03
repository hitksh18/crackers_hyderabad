import { Package, ShoppingCart, TriangleAlert, UserPlus } from 'lucide-react';
import { TableSkeleton } from '../../ui/Skeleton';

const nf = new Intl.NumberFormat('en-IN');

const DONUT_COLORS = [
  '#ec7049',
  '#d2a64f',
  '#a33b2e',
  '#7c5a2a',
  '#c97e5d',
  '#8a8f98',
  '#5d4037',
  '#b0a08a',
];

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function EmptyNote({ children }) {
  return (
    <p className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
      {children}
    </p>
  );
}

function timeAgo(ms) {
  const diff = Date.now() - Number(ms);
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Generic donut: slices are [{ label, value, sub }]. Pure SVG, same technique
 * as DeviceDonut. Renders nothing when every value is zero — callers show an
 * honest empty state instead of a fake 0% chart.
 */
export function DonutChart({ slices, centerValue, centerLabel, formatValue = (v) => nf.format(v) }) {
  const total = slices.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  if (total <= 0) return null;
  let offset = 0;
  const parts = slices.map((slice, i) => {
    const share = Number(slice.value) / total;
    const part = { ...slice, share, color: DONUT_COLORS[i % DONUT_COLORS.length], offset };
    offset += share * CIRCUMFERENCE;
    return part;
  });
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="h-36 w-36" role="img" aria-label="Breakdown chart">
          <circle cx="70" cy="70" r={RADIUS} fill="none" stroke="var(--surface-sunken)" strokeWidth="22" />
          <g transform="rotate(-90 70 70)">
            {parts.map((part) => (
              <circle
                key={part.label}
                cx="70"
                cy="70"
                r={RADIUS}
                fill="none"
                stroke={part.color}
                strokeWidth="22"
                strokeDasharray={`${part.share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={-part.offset}
                strokeLinecap="butt"
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="tabular text-xl font-bold leading-none" style={{ color: 'var(--text-strong)' }}>
              {centerValue}
            </p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {centerLabel}
            </p>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: part.color }} />
            <span className="min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--text-body)' }}>
              {part.label}
            </span>
            <span className="tabular text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {(Math.round(part.share * 1000) / 10).toFixed(1)}%
            </span>
            <span className="tabular w-20 shrink-0 text-right text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              {formatValue(part.value)}{part.sub ? ` · ${part.sub}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_COLORS = {
  Pending: 'var(--gold-500)',
  Confirmed: 'var(--ember-500)',
  Packed: 'var(--gold-600)',
  Shipped: 'var(--maroon-500)',
  'Out for Delivery': 'var(--ember-600)',
  Delivered: 'var(--leaf-600)',
  Cancelled: 'var(--crimson-600)',
  Completed: 'var(--leaf-500)',
};

/** Horizontal progress bars for the fixed order-status vocabulary. */
export function StatusBars({ statuses }) {
  const max = Math.max(...statuses.map((s) => s.count), 1);
  return (
    <ul className="space-y-2.5">
      {statuses.map((row) => (
        <li key={row.status}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-sm" style={{ color: 'var(--text-body)' }}>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: STATUS_COLORS[row.status] || 'var(--text-subtle)' }}
                aria-hidden="true"
              />
              <span className="truncate">{row.status}</span>
            </span>
            <span className="tabular shrink-0 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {nf.format(row.count)}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--surface-sunken)' }}
            role="img"
            aria-label={`${row.status}: ${row.count} orders`}
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(row.count > 0 ? 2 : 0, (row.count / max) * 100)}%`,
                background: STATUS_COLORS[row.status] || 'var(--text-subtle)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const ACTIVITY_ICON = {
  order: ShoppingCart,
  status: Package,
  signup: UserPlus,
};

/** Real recent events only — orders, status moves, signups. Never faked. */
export function ActivityFeed({ events, loading = false }) {
  if (loading) return <TableSkeleton rows={4} cols={1} label="Loading activity" />;
  if (!events || events.length === 0) return <EmptyNote>No recent activity.</EmptyNote>;
  return (
    <ul className="space-y-1">
      {events.map((event, i) => {
        const Icon = ACTIVITY_ICON[event.type] || ShoppingCart;
        return (
          <li
            key={`${event.ms}-${i}`}
            className="flex items-start gap-3 rounded-[var(--r-md)] px-2 py-2 transition-colors"
            style={{ border: '1px solid transparent' }}
          >
            <span
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: 'var(--ember-500)' }} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                {event.title}
              </p>
              {event.detail && (
                <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                  {event.detail}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              {timeAgo(event.ms)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Only real database-backed alerts. Empty array = a calm "all clear". */
export function AlertsList({ alerts, loading = false }) {
  if (loading) return <TableSkeleton rows={3} cols={1} label="Loading alerts" />;
  if (!alerts || alerts.length === 0) {
    return <EmptyNote>No alerts — stock, fulfilment and cancellations look normal.</EmptyNote>;
  }
  return (
    <ul className="space-y-2">
      {alerts.map((alert, i) => (
        <li
          key={`${alert.kind}-${i}`}
          className="flex items-start gap-2.5 rounded-[var(--r-md)] px-3 py-2.5"
          style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--gold-500)' }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {alert.title}
            </p>
            {alert.detail && (
              <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                {alert.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
