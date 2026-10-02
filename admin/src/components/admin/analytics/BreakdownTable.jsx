import { Download } from 'lucide-react';
import { exportCsv } from '../../../utils/csv';
import { TableSkeleton } from '../../ui/Skeleton';

const nf = new Intl.NumberFormat('en-IN');

/**
 * A ranked breakdown — top pages, referrers, countries, cities.
 *
 * Rows carry an inline share bar rather than a separate chart: the ranking and
 * the magnitude are the same question, so they belong on one line.
 *
 * When `onSelect` is supplied the rows become buttons, which is how the country
 * list filters the region and city tables beside it.
 */
export default function BreakdownTable({
  title,
  icon: Icon,
  rows,
  loading = false,
  onSelect,
  selected,
  emptyText = 'Nothing recorded yet.',
  csvName,
  labelHeading = 'Name',
  note,
}) {
  const peak = Math.max(...rows.map((r) => r.count), 1);

  return (
    <section className="card-premium flex flex-col p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <h3 className="card-title flex items-center gap-2" style={{ color: 'var(--text-strong)' }}>
          {Icon && <Icon className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--maroon)' }} />}
          {title}
        </h3>

        {csvName && rows.length > 0 && (
          <button
            type="button"
            onClick={() =>
              exportCsv(csvName, rows, [
                { key: 'label', header: labelHeading },
                { key: 'count', header: 'Count' },
              ])
            }
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
            style={{
              borderColor: 'var(--hairline)',
              color: 'var(--text-muted)',
              background: 'var(--surface-card)',
            }}
            aria-label={`Download ${title} as CSV`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            CSV
          </button>
        )}
      </header>

      {note && (
        <p className="mb-3 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          {note}
        </p>
      )}

      {loading ? (
        <TableSkeleton rows={5} cols={2} label={`Loading ${title}`} />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const isSelected = selected === row.label;
            const share = (row.count / peak) * 100;

            const content = (
              <>
                {/* The bar sits behind the text so long labels stay readable
                    instead of being squeezed into a narrow column. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${share}%`,
                    background: 'var(--maroon)',
                    opacity: isSelected ? 0.22 : 0.1,
                    borderRadius: 'var(--r-sm)',
                  }}
                />
                <span className="relative min-w-0 flex-1 truncate" title={row.label}>
                  {row.label}
                </span>
                <span
                  className="tabular relative shrink-0 font-semibold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  {nf.format(row.count)}
                </span>
              </>
            );

            const shell = 'relative flex items-center gap-3 overflow-hidden px-2.5 py-2 text-sm';

            return (
              <li key={row.label}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(isSelected ? null : row.label)}
                    aria-pressed={isSelected}
                    className={`${shell} w-full text-left transition-colors`}
                    style={{
                      borderRadius: 'var(--r-sm)',
                      color: 'var(--text-body)',
                      minHeight: 40,
                      outline: isSelected ? '1px solid var(--hairline-strong)' : 'none',
                    }}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    className={shell}
                    style={{ borderRadius: 'var(--r-sm)', color: 'var(--text-body)' }}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
