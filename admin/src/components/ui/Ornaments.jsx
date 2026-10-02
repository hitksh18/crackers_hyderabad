/**
 * Restrained Indian ornament set.
 *
 * All decorative, all aria-hidden, all pure SVG so they scale and theme with
 * currentColor. House rule: at most one ornament per section.
 */

/** Oil lamp. The flame flickers only when motion is allowed (CSS handles that). */
export const Diya = ({ className = '', delay = '0s', flame = true }) => (
  <span className={`diya relative block ${className}`} aria-hidden="true">
    {flame && (
      <span
        className="animate-flicker absolute left-1/2 top-0 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: 'var(--saffron-400)',
          boxShadow: '0 0 14px 4px rgba(247, 174, 44, 0.75)',
          animationDelay: delay,
        }}
      />
    )}
    <svg viewBox="0 0 48 28" className="block h-full w-full">
      <path
        d="M6 26 C 4 18 8 12 14 10 C 12 14 13 18 17 20 C 19 14 24 8 30 8 C 27 13 28 17 31 19 C 37 15 42 19 42 26 Z"
        fill="var(--gold-600)"
      />
      <path d="M8 22 C 10 16 13 12 19 11 C 17 15 17 18 20 19 Z" fill="var(--gold-400)" opacity="0.7" />
      <path
        d="M10 26 C 8 18 12 12 20 10"
        fill="none"
        stroke="var(--saffron-400)"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  </span>
);

/** Horizontal gold rule with a centred rangoli medallion. */
export const RangoliDivider = ({ className = '' }) => (
  <div className={`flex items-center justify-center gap-4 ${className}`} aria-hidden="true">
    <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, var(--gold-400))' }} />
    <svg viewBox="0 0 48 48" className="h-7 w-7 shrink-0" fill="none">
      <g stroke="var(--gold-400)" strokeWidth="1.2">
        <circle cx="24" cy="24" r="6" />
        <circle cx="24" cy="24" r="12" opacity="0.65" />
        <path
          d="M24 4 L27 18 L41 21 L27 24 L24 38 L21 24 L7 21 L21 18 Z"
          opacity="0.85"
        />
      </g>
    </svg>
    <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, var(--gold-400), transparent)' }} />
  </div>
);

/** Corner filigree. Drop into a panel with `position: relative`. */
export const CornerFiligree = ({ position = 'top-left', className = '' }) => {
  const rotation = {
    'top-left': 'rotate(0deg)',
    'top-right': 'rotate(90deg)',
    'bottom-right': 'rotate(180deg)',
    'bottom-left': 'rotate(270deg)',
  }[position];

  const anchor = {
    'top-left': 'left-0 top-0',
    'top-right': 'right-0 top-0',
    'bottom-right': 'bottom-0 right-0',
    'bottom-left': 'bottom-0 left-0',
  }[position];

  return (
    <svg
      viewBox="0 0 80 80"
      aria-hidden="true"
      className={`pointer-events-none absolute h-16 w-16 ${anchor} ${className}`}
      style={{ transform: rotation }}
      fill="none"
    >
      <g stroke="var(--gold-400)" strokeWidth="1" opacity="0.42">
        <path d="M6 34 C 6 16 16 6 34 6" />
        <path d="M6 48 C 6 22 22 6 48 6" opacity="0.6" />
        <circle cx="14" cy="14" r="2.5" />
      </g>
    </svg>
  );
};

/** Arch frame used behind hero and category imagery. */
export const ArchFrame = ({ className = '' }) => (
  <svg
    viewBox="0 0 200 260"
    aria-hidden="true"
    preserveAspectRatio="none"
    className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    fill="none"
  >
    <path
      d="M12 252 V110 C12 56 51 14 100 14 C149 14 188 56 188 110 V252"
      stroke="var(--gold-400)"
      strokeWidth="1.2"
      opacity="0.35"
    />
    <path
      d="M24 252 V112 C24 64 58 26 100 26 C142 26 176 64 176 112 V252"
      stroke="var(--gold-400)"
      strokeWidth="0.8"
      opacity="0.2"
    />
  </svg>
);

export default { Diya, RangoliDivider, CornerFiligree, ArchFrame };
