import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import AnimatedCounter from '../../ui/AnimatedCounter';
import { Skeleton } from '../../ui/Skeleton';

/* Movement against the previous, equally long period. `null` means there was
   nothing to compare against — shown as a dash, because a jump from zero is
   not a percentage anybody can act on. */
function DeltaBadge({ delta, invert = false }) {
  if (delta === null || delta === undefined) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: 'var(--delta-flat)' }}
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
        no prior data
      </span>
    );
  }

  const flat = delta === 0;
  // `invert` exists for metrics where down is the good direction; none today,
  // but a bounce rate would need it and the caller should not have to reverse
  // the colour by hand.
  const good = invert ? delta < 0 : delta > 0;
  const color = flat ? 'var(--delta-flat)' : good ? 'var(--delta-up)' : 'var(--delta-down)';
  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold tabular"
      style={{ color }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {flat ? 'no change' : `${Math.abs(delta)}%`}
      <span className="sr-only">
        {flat ? 'unchanged' : delta > 0 ? 'up' : 'down'} versus the previous period
      </span>
    </span>
  );
}

/**
 * One headline metric.
 *
 * Skeletons are per-card rather than one blocking spinner, so a slow range
 * change never blanks the whole dashboard.
 */
export default function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  prefix = '',
  suffix = '',
  decimals = 0,
  hint,
  loading = false,
  invert = false,
}) {
  if (loading) {
    return (
      <div className="card-premium space-y-3 p-5" aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    );
  }

  return (
    <div className="card-premium p-5">
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </p>
        {Icon && (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: 'var(--surface-sunken)', color: 'var(--maroon)' }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>

      <p
        className="mt-2.5 text-3xl font-bold leading-none"
        style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}
      >
        <AnimatedCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <DeltaBadge delta={delta} invert={invert} />
        {hint && (
          <span className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

export { DeltaBadge };
