import { useId, useMemo, useRef, useState } from 'react';

const VIEW_W = 720;
const VIEW_H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 46 };

/* Round the axis top up to something a person would choose, so gridline labels
   read 0/25/50/75/100 rather than 0/23.5/47/70.5/94. */
function niceMax(value) {
  if (value <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

const shortDay = (key) => {
  const [, m, d] = key.split('-');
  return `${d}/${m}`;
};

/**
 * Daily trend for one metric.
 *
 * Hand-drawn SVG rather than a charting dependency: this needs four gridlines,
 * a gradient fill and a tooltip, and the whole storefront's chart budget is
 * already spent on nothing at all — adding a library for this would cost the
 * shopper more than it saves here.
 */
export default function TrendChart({ series, metric, metricLabel, formatValue }) {
  const gradientId = useId();
  const frameRef = useRef(null);
  const [hover, setHover] = useState(null);

  const { points, peak, path, area, gridValues } = useMemo(() => {
    const values = series.map((row) => Number(row[metric]) || 0);
    const highest = Math.max(...values, 0);
    const top = niceMax(highest);
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;

    // A single-day range has no span to divide, so it sits in the middle.
    const step = series.length > 1 ? plotW / (series.length - 1) : 0;

    const mapped = series.map((row, i) => {
      const value = Number(row[metric]) || 0;
      return {
        ...row,
        value,
        x: series.length > 1 ? PAD.left + i * step : PAD.left + plotW / 2,
        y: PAD.top + plotH - (value / top) * plotH,
      };
    });

    const line = mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
    const baseline = PAD.top + plotH;
    const fill = mapped.length
      ? `${line} L${mapped[mapped.length - 1].x} ${baseline} L${mapped[0].x} ${baseline} Z`
      : '';

    return {
      points: mapped,
      /* The real high point, not the axis ceiling. niceMax rounds 903 up to
         1,000 for tidy gridlines; saying "peaked at 1,000" would be a lie. */
      peak: highest,
      path: line,
      area: fill,
      gridValues: [0, 0.25, 0.5, 0.75, 1].map((f) => ({
        value: top * f,
        y: PAD.top + plotH - f * plotH,
      })),
    };
  }, [series, metric]);

  /* Track the pointer in fractions of the frame, not pixels, so the same maths
     works at every breakpoint without reading the viewBox scale. Pointer events
     rather than mouse events, so a finger dragged across the chart on a phone
     reads out days too. */
  const onMove = (event) => {
    const frame = frameRef.current;
    if (!frame || !points.length) return;
    const rect = frame.getBoundingClientRect();
    // A collapsed frame would divide by zero and silently snap to the first day.
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const svgX = ratio * VIEW_W;
    let nearest = points[0];
    for (const point of points) {
      if (Math.abs(point.x - svgX) < Math.abs(nearest.x - svgX)) nearest = point;
    }
    setHover(nearest);
  };

  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  return (
    <div
      ref={frameRef}
      className="relative touch-pan-y"
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block w-full"
        /* Uniform scaling, deliberately: stretching the viewBox to fill the
           card would distort the axis labels along with the paths. On narrow
           screens the drawing centres inside the min-height instead. */
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, minHeight: 200 }}
        role="img"
        aria-label={`${metricLabel} per day`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--maroon)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--maroon)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((grid) => (
          <g key={grid.y}>
            <line
              x1={PAD.left}
              y1={grid.y}
              x2={VIEW_W - PAD.right}
              y2={grid.y}
              stroke="var(--hairline)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={grid.y + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-subtle)"
            >
              {formatValue ? formatValue(grid.value, true) : Math.round(grid.value)}
            </text>
          </g>
        ))}

        {area && <path d={area} fill={`url(#${gradientId})`} />}
        {path && (
          <path
            d={path}
            fill="none"
            stroke="var(--maroon)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {points.map((point, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={point.day}
              x={point.x}
              y={VIEW_H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-subtle)"
            >
              {shortDay(point.day)}
            </text>
          ) : null,
        )}

        {hover && (
          <g>
            <line
              x1={hover.x}
              y1={PAD.top}
              x2={hover.x}
              y2={VIEW_H - PAD.bottom}
              stroke="var(--hairline-strong)"
              strokeWidth="1"
            />
            <circle
              cx={hover.x}
              cy={hover.y}
              r="4.5"
              fill="var(--surface-card)"
              stroke="var(--maroon)"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-xl border px-3 py-2 shadow-lift"
          style={{
            // Clamped so the card never hangs off either edge of the chart.
            left: `${Math.min(88, Math.max(4, (hover.x / VIEW_W) * 100))}%`,
            transform: 'translateX(-50%)',
            borderColor: 'var(--hairline)',
            background: 'var(--surface-card)',
          }}
        >
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {hover.day}
          </p>
          <p
            className="tabular text-sm font-bold"
            style={{ color: 'var(--text-strong)' }}
          >
            {formatValue ? formatValue(hover.value) : hover.value} {metricLabel}
          </p>
        </div>
      )}

      {/* The same numbers as a table. The tooltip needs a pointer, so without
          this the day-by-day figures would exist only for people using a mouse. */}
      <table className="sr-only">
        <caption>
          {metricLabel} per day — peaked at {formatValue ? formatValue(peak) : peak} across{' '}
          {series.length} days.
        </caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{metricLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.day}</th>
              <td>{formatValue ? formatValue(point.value) : point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
