import { useId, useMemo, useRef, useState } from 'react';

const VIEW_W = 720;
const VIEW_H = 260;
const PAD = { top: 16, right: 52, bottom: 28, left: 48 };

/* Round the axis top up to something a person would choose. */
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
  const parts = String(key).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : key;
};

/**
 * Two metrics on one time axis, hand-drawn SVG like TrendChart.
 *
 * `lines` is [{ key, label, color, format(value), axisFormat(value) }].
 * With `dualAxis` the second line gets its own right-hand scale — used for
 * orders vs revenue, whose magnitudes differ by orders of magnitude. Zero
 * series render as flat lines at the baseline; nothing is fabricated.
 */
export default function DualTrendChart({ series, lines, dualAxis = false }) {
  const gid = useId();
  const frameRef = useRef(null);
  const [hover, setHover] = useState(null);

  const model = useMemo(() => {
    if (!series?.length || !lines?.length) return null;
    const first = lines[0];
    const second = lines[1] || null;
    const valsA = series.map((row) => Number(row[first.key]) || 0);
    const valsB = second ? series.map((row) => Number(row[second.key]) || 0) : [];
    const maxA = niceMax(Math.max(...valsA, 0));
    const maxB = niceMax(second ? Math.max(...valsB, 0) : 0);
    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;
    const step = series.length > 1 ? plotW / (series.length - 1) : 0;
    const xAt = (i) => (series.length > 1 ? PAD.left + i * step : PAD.left + plotW / 2);
    const yA = (v) => PAD.top + plotH - (v / maxA) * plotH;
    const yB = (v) => PAD.top + plotH - (v / (dualAxis ? maxB : maxA)) * plotH;

    const rows = series.map((row, i) => ({
      day: row.day,
      x: xAt(i),
      a: valsA[i],
      b: second ? valsB[i] : 0,
    }));
    const pathOf = (pick) =>
      rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${r.x.toFixed(1)} ${(pick === 'a' ? yA(r.a) : yB(r.b)).toFixed(1)}`).join(' ');
    const baseline = PAD.top + plotH;

    return {
      rows,
      pathA: pathOf('a'),
      pathB: second ? pathOf('b') : '',
      areaA: rows.length ? `${pathOf('a')} L${rows[rows.length - 1].x.toFixed(1)} ${baseline} L${rows[0].x.toFixed(1)} ${baseline} Z` : '',
      leftGrid: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: maxA * f, y: PAD.top + plotH - f * plotH })),
      rightGrid: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: (dualAxis ? maxB : maxA) * f, y: PAD.top + plotH - f * plotH })),
    };
  }, [series, lines, dualAxis]);

  if (!model) return <p className="ana-empty">No data for this period.</p>;

  const { rows, pathA, pathB, areaA, leftGrid, rightGrid } = model;
  const [first, second] = lines;

  const onMove = (event) => {
    const frame = frameRef.current;
    if (!frame || !rows.length) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = rows[0];
    for (const row of rows) {
      if (Math.abs(row.x - svgX) < Math.abs(nearest.x - svgX)) nearest = row;
    }
    setHover(nearest);
  };

  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
  const ariaSummary = second
    ? `${first.label} and ${second.label} per day across ${rows.length} days.`
    : `${first.label} per day across ${rows.length} days.`;

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
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, minHeight: 200 }}
        role="img"
        aria-label={ariaSummary}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={first.color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={first.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {leftGrid.map((grid) => (
          <g key={grid.y}>
            <line x1={PAD.left} y1={grid.y} x2={VIEW_W - PAD.right} y2={grid.y} stroke="var(--hairline)" strokeWidth="1" />
            <text x={PAD.left - 8} y={grid.y + 3.5} textAnchor="end" fontSize="10" fill="var(--text-subtle)">
              {first.axisFormat ? first.axisFormat(grid.value) : Math.round(grid.value)}
            </text>
          </g>
        ))}

        {dualAxis && second && rightGrid.map((grid, i) => (
          <text
            key={grid.y}
            x={VIEW_W - PAD.right + 8}
            y={grid.y + 3.5}
            textAnchor="start"
            fontSize="10"
            fill="var(--text-subtle)"
          >
            {i % 2 === 0 ? (second.axisFormat ? second.axisFormat(grid.value) : Math.round(grid.value)) : ''}
          </text>
        ))}

        {areaA && <path d={areaA} fill={`url(#${gid})`} />}
        {pathA && (
          <path d={pathA} fill="none" stroke={first.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
        {pathB && second && (
          <path d={pathB} fill="none" stroke={second.color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dualAxis ? 'none' : '1 0'} vectorEffect="non-scaling-stroke" />
        )}

        {rows.map((row, i) =>
          i % labelEvery === 0 || i === rows.length - 1 ? (
            <text key={row.day} x={row.x} y={VIEW_H - 8} textAnchor="middle" fontSize="10" fill="var(--text-subtle)">
              {shortDay(row.day)}
            </text>
          ) : null,
        )}

        {hover && (
          <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={VIEW_H - PAD.bottom} stroke="var(--hairline-strong)" strokeWidth="1" />
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-xl border px-3 py-2"
          style={{
            left: `${Math.min(88, Math.max(4, (hover.x / VIEW_W) * 100))}%`,
            transform: 'translateX(-50%)',
            borderColor: 'var(--hairline)',
            background: 'var(--surface-raised)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          }}
        >
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{hover.day}</p>
          <p className="tabular flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: first.color }} />
            {first.format ? first.format(hover.a) : hover.a}
          </p>
          {second && (
            <p className="tabular flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: second.color }} />
              {second.format ? second.format(hover.b) : hover.b}
            </p>
          )}
        </div>
      )}

      <table className="sr-only">
        <caption>{ariaSummary}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{first.label}</th>
            {second && <th scope="col">{second.label}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day}>
              <th scope="row">{row.day}</th>
              <td>{first.format ? first.format(row.a) : row.a}</td>
              {second && <td>{second.format ? second.format(row.b) : row.b}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
