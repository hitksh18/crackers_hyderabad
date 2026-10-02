import { useId } from 'react';
import AnimatedCounter from '../../ui/AnimatedCounter';
import { Skeleton } from '../../ui/Skeleton';
import { DeltaBadge } from './StatCard';

/**
 * Tiny sparkline drawn from the period's daily series.
 * Decorative — the KPI value itself carries the accessible number.
 */
export function Sparkline({ data, color = '#ec7049', width = 76, height = 30 }) {
  const gid = useId();
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 0);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [
    i * step,
    height - 3 - ((v - min) / span) * (height - 6),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="ana-spark"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Compact KPI card (~116px): icon, uppercase label, large metric,
 * delta + supporting text, optional sparkline from real daily data.
 */
export default function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  prefix = '',
  suffix = '',
  decimals = 0,
  sub,
  loading = false,
  spark = null,
  sparkColor = '#ec7049',
  liveMode = false,
  stale = false,
  windowMinutes = 5,
}) {
  if (loading) {
    return (
      <div className="ana-card ana-kpi" aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    );
  }

  return (
    <div className="ana-card ana-kpi">
      <div className="ana-kpi-top">
        {Icon && (
          <span className="ana-kpi-icon">
            <Icon aria-hidden="true" />
          </span>
        )}
        <span className="ana-kpi-label">{label}</span>
        {liveMode && (value > 0 && !stale
          ? <span className="live-dot" aria-hidden="true" />
          : <span className="ana-kpi-dot-off" aria-hidden="true" />)}
      </div>

      <div className="ana-kpi-main">
        <span className="ana-kpi-value">
          <AnimatedCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
        </span>
        {!liveMode && <Sparkline data={spark} color={sparkColor} />}
      </div>

      <div className="ana-kpi-foot">
        {liveMode ? (
          <span>{stale ? 'Paused while this tab is in the background' : `Active in the last ${windowMinutes} minutes`}</span>
        ) : (
          <>
            <DeltaBadge delta={delta} />
            {sub && <span>{sub}</span>}
          </>
        )}
      </div>
    </div>
  );
}
