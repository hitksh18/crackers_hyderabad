const RADIUS = 54;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/* Three fixed slices, so three fixed shades of the brand ramp. Assigning
   colours by index keeps mobile the same colour on every range. */
const SLICE_COLORS = ['var(--ember-500)', 'var(--gold-500)', 'var(--maroon-700)'];

/**
 * Device split as a pure-SVG donut.
 *
 * Drawn with stroke-dasharray on one circle per slice rather than arc paths:
 * far less maths, and the segments animate for free when the range changes.
 */
export default function DeviceDonut({ devices }) {
  const total = devices.reduce((sum, d) => sum + d.count, 0);

  let offset = 0;
  const slices = devices.map((device, i) => {
    const share = total > 0 ? device.count / total : 0;
    const slice = {
      ...device,
      share,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      dash: share * CIRCUMFERENCE,
      offset,
    };
    offset += share * CIRCUMFERENCE;
    return slice;
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="h-36 w-36" role="img" aria-label="Device split">
          <circle
            cx="70"
            cy="70"
            r={RADIUS}
            fill="none"
            stroke="var(--surface-sunken)"
            strokeWidth={STROKE}
          />
          {/* Rotated so the first slice starts at twelve o'clock. */}
          <g transform="rotate(-90 70 70)">
            {slices.map((slice) =>
              slice.dash > 0 ? (
                <circle
                  key={slice.label}
                  cx="70"
                  cy="70"
                  r={RADIUS}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${slice.dash} ${CIRCUMFERENCE - slice.dash}`}
                  strokeDashoffset={-slice.offset}
                  strokeLinecap="butt"
                />
              ) : null,
            )}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p
              className="tabular text-xl font-bold leading-none"
              style={{ color: 'var(--text-strong)' }}
            >
              {total.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              total views
            </p>
          </div>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: slice.color }}
            />
            <span
              className="flex-1 text-sm capitalize"
              style={{ color: 'var(--text-body)' }}
            >
              {slice.label}
            </span>
            <span
              className="tabular text-sm font-semibold"
              style={{ color: 'var(--text-strong)' }}
            >
              {Math.round(slice.share * 1000) / 10}%
            </span>
            <span
              className="tabular w-14 text-right text-[11px]"
              style={{ color: 'var(--text-subtle)' }}
            >
              {slice.count.toLocaleString('en-IN')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
