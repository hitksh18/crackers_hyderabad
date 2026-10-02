const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* Only every third hour is labelled. Twenty-four labels across a phone-width
   grid is unreadable, and the shape is what matters here, not the exact hour. */
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

const hourName = (h) => {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
};

/**
 * Traffic by weekday and hour.
 *
 * A 7x24 CSS grid, coloured by share of the busiest cell. It answers the one
 * scheduling question a shop actually has: when are people looking, so when
 * should stock, staff and offers be ready.
 *
 * Hours are the visitor's own local hours, recorded client-side — a customer
 * browsing at 9pm their time lands in the 21:00 column wherever they are.
 */
export default function TrafficHeatmap({ grid }) {
  const peak = Math.max(...grid.flat(), 0);

  /* The busiest cell, stated in words. 168 title-only cells convey nothing to a
     screen reader, so the grid is hidden from it and this sentence carries the
     finding instead. */
  let busiest = null;
  grid.forEach((row, dow) =>
    row.forEach((count, hour) => {
      if (count > 0 && count === peak && !busiest) busiest = { dow, hour, count };
    }),
  );

  return (
    <div className="overflow-x-auto">
      <p className="sr-only">
        {busiest
          ? `Busiest hour: ${DAYS[busiest.dow]} at ${hourName(busiest.hour)}, with ${busiest.count} pageviews.`
          : 'No hourly traffic recorded for this period yet.'}
      </p>

      <div className="min-w-[520px]" aria-hidden="true">
        <div className="mb-1 grid gap-1" style={{ gridTemplateColumns: '2.4rem repeat(24, 1fr)' }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              className="text-center text-[9px] leading-none"
              style={{ color: 'var(--text-subtle)' }}
            >
              {HOUR_LABELS.includes(h) ? hourName(h) : ''}
            </span>
          ))}
        </div>

        {grid.map((row, dow) => (
          <div
            key={DAYS[dow]}
            className="mb-1 grid items-center gap-1"
            style={{ gridTemplateColumns: '2.4rem repeat(24, 1fr)' }}
          >
            <span
              className="text-[10px] font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              {DAYS[dow]}
            </span>
            {row.map((count, hour) => {
              /* Square-rooted so a single very busy hour does not flatten every
                 other cell to invisible. */
              const intensity = peak > 0 ? Math.sqrt(count / peak) : 0;
              return (
                <span
                  key={hour}
                  title={`${DAYS[dow]} ${hourName(hour)} — ${count} view${count === 1 ? '' : 's'}`}
                  className="aspect-square w-full"
                  style={{
                    borderRadius: 'var(--r-sm)',
                    /* Opacity on a single brand colour rather than color-mix:
                       it needs no colour-function support and reads correctly
                       on both the light and dark card surface. */
                    background: 'var(--maroon)',
                    opacity: count > 0 ? 0.14 + intensity * 0.86 : 0.07,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>
          Quiet
        </span>
        <span
          className="h-2 w-24 rounded-full"
          /* Transparent to solid maroon — the same ramp the cells produce by
             varying opacity over the card surface. */
          style={{ background: 'linear-gradient(90deg, transparent 0%, var(--maroon) 100%)' }}
        />
        <span className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>
          Busy {peak > 0 && `(peak ${peak})`}
        </span>
      </div>
    </div>
  );
}
