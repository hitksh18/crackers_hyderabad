/**
 * Conversion funnel.
 *
 * Horizontal bars rather than the usual tapering trapezoid: a shop owner needs
 * to read the drop between two steps, and bars sharing a common baseline make
 * that comparison immediate.
 */

const nf = new Intl.NumberFormat('en-IN');

export default function FunnelChart({ stages }) {
  const top = Math.max(...stages.map((s) => s.value), 1);

  return (
    <ol className="space-y-3.5">
      {stages.map((stage, i) => {
        const previous = i === 0 ? null : stages[i - 1].value;
        // Step-to-step conversion, which is the number that tells you where the
        // journey leaks. Suppressed when the previous step is empty.
        const rate = previous ? Math.round((stage.value / previous) * 1000) / 10 : null;
        const width = Math.max(1.5, (stage.value / top) * 100);

        return (
          <li key={stage.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
                {stage.label}
              </span>
              <span className="flex items-baseline gap-2">
                <span
                  className="tabular text-sm font-bold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  {nf.format(stage.value)}
                </span>
                {rate !== null && (
                  <span
                    className="tabular text-[11px] font-semibold"
                    style={{ color: rate >= 100 ? 'var(--delta-up)' : 'var(--text-muted)' }}
                  >
                    {rate}%
                  </span>
                )}
              </span>
            </div>

            <div
              className="h-2.5 w-full overflow-hidden"
              style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--r-pill)' }}
            >
              <div
                className="h-full transition-[width] duration-500"
                style={{
                  width: `${width}%`,
                  background: 'var(--grad-ember)',
                  borderRadius: 'var(--r-pill)',
                }}
              />
            </div>

            {stage.hint && (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {stage.hint}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
