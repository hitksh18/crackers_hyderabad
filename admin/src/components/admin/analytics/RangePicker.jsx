import { useEffect, useState } from 'react';
import { CalendarRange, Check } from 'lucide-react';

const PRESETS = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 28, label: '28 days' },
];

const MAX_DAYS = 92;

const todayKey = () => {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

/**
 * Range control: three presets plus a custom from/to pair.
 *
 * The custom range is only applied on submit. Applying on every keystroke would
 * fire a request for each half-typed date, and a partially typed year is a
 * request for the wrong decade.
 */
export default function RangePicker({ range, onChange, disabled = false, compact = false }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range?.from || '');
  const [to, setTo] = useState(range?.to || '');
  const [error, setError] = useState('');

  // Keep the inputs honest when the range is changed by a preset instead.
  useEffect(() => {
    setFrom(range?.from || '');
    setTo(range?.to || '');
  }, [range?.from, range?.to]);

  const isCustom = Boolean(range?.custom);
  const max = todayKey();
  /* Compact mode is the analytics-navbar variant: same behaviour, smaller
     pills so the 54px bar keeps its title centered. */
  const btnHeight = compact ? 32 : 40;
  const btnPad = compact ? '0 11px' : undefined;

  const apply = (event) => {
    event.preventDefault();
    if (!from || !to) {
      setError('Pick both a start and an end date.');
      return;
    }
    if (from > to) {
      setError('The start date must come before the end date.');
      return;
    }
    const span = Math.round((new Date(to) - new Date(from)) / 86_400_000) + 1;
    if (span > MAX_DAYS) {
      setError(`Ranges are limited to ${MAX_DAYS} days.`);
      return;
    }
    setError('');
    setOpen(false);
    onChange({ from, to, custom: true });
  };

  const inputStyle = {
    borderColor: 'var(--hairline)',
    background: 'var(--surface-card)',
    color: 'var(--text-strong)',
    borderRadius: 'var(--r-md)',
    minHeight: 44,
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => {
        const active = !isCustom && range?.days === preset.days;
        return (
          <button
            key={preset.days}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ days: preset.days, custom: false })}
            aria-pressed={active}
            className="rounded-full border px-3.5 text-xs font-semibold transition-colors disabled:opacity-60"
            style={{
              minHeight: btnHeight,
              padding: btnPad,
              borderColor: active ? 'transparent' : 'var(--hairline)',
              background: active ? 'var(--grad-ember)' : 'var(--surface-card)',
              color: active ? 'var(--text-on-dark)' : 'var(--text-body)',
            }}
          >
            {preset.label}
          </button>
        );
      })}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors disabled:opacity-60"
          style={{
            minHeight: btnHeight,
            padding: btnPad,
            borderColor: isCustom ? 'transparent' : 'var(--hairline)',
            background: isCustom ? 'var(--grad-ember)' : 'var(--surface-card)',
            color: isCustom ? 'var(--text-on-dark)' : 'var(--text-body)',
          }}
        >
          <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
          {isCustom ? `${range.from} to ${range.to}` : 'Custom'}
        </button>

        {open && (
          <form
            onSubmit={apply}
            className="absolute right-0 z-20 mt-2 w-[17rem] space-y-3 rounded-2xl border p-4 shadow-lift"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <label className="block">
              <span
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                From
              </span>
              <input
                type="date"
                value={from}
                max={to || max}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full border px-3 text-sm"
                style={inputStyle}
              />
            </label>

            <label className="block">
              <span
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                To
              </span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                max={max}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border px-3 text-sm"
                style={inputStyle}
              />
            </label>

            {error && (
              <p className="text-[11px] font-medium" style={{ color: 'var(--delta-down)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 text-xs font-bold"
              style={{
                minHeight: 44,
                borderRadius: 'var(--r-md)',
                background: 'var(--grad-ember)',
                color: 'var(--text-on-dark)',
              }}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Apply range
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
