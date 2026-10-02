import { ArrowRight } from 'lucide-react';
import { Skeleton } from '../../ui/Skeleton';

const nf = new Intl.NumberFormat('en-IN');

/**
 * Compact top-5 ranked list with proportional bars.
 * The full dataset with CSV export lives further down the page
 * (Most visited pages / How they found the shop); `viewAllHref`
 * jumps there.
 */
export default function TopListCard({
  title,
  subtitle,
  icon: Icon,
  rows,
  loading = false,
  emptyText = 'Nothing recorded yet.',
  viewAllHref,
  viewAllLabel = 'View All',
}) {
  const top = (rows || []).slice(0, 5);
  const peak = Math.max(...top.map((r) => r.count), 1);

  return (
    <section className="ana-card">
      <div className="ana-head">
        <div className="min-w-0">
          <h3 className="ana-panel-title">
            {Icon && <Icon className="ana-panel-icon" aria-hidden="true" />}
            {title}
          </h3>
          {subtitle && <p className="ana-panel-sub">{subtitle}</p>}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-label={`Loading ${title}`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {emptyText}
        </p>
      ) : (
        <>
          <ol className="ana-rank">
            {top.map((row, i) => (
              <li key={row.label} className="ana-rank-row">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${(row.count / peak) * 100}%`,
                    background: 'var(--maroon)',
                    opacity: 0.12,
                    borderRadius: 'var(--r-sm)',
                  }}
                />
                <span className="ana-rank-num">{i + 1}</span>
                <span className="ana-rank-label" title={row.label}>{row.label}</span>
                <span className="ana-rank-count">{nf.format(row.count)}</span>
              </li>
            ))}
          </ol>
          {viewAllHref && (
            <a href={viewAllHref} className="ana-viewall">
              {viewAllLabel} <ArrowRight aria-hidden="true" />
            </a>
          )}
        </>
      )}
    </section>
  );
}
