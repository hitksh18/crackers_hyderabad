/**
 * Stand-in for a product image that has not been uploaded yet.
 *
 * The mark is a rangoli starburst drawn in SVG — never a glyph, never an
 * emoji — so it scales cleanly at every card size and inherits the gold
 * ornament tokens in both themes.
 */

const BurstMark = ({ className = '' }) => (
  <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
    <circle cx="32" cy="32" r="30" stroke="var(--gold-400)" strokeWidth="1" opacity="0.45" />
    <circle
      cx="32"
      cy="32"
      r="22"
      stroke="var(--gold-500)"
      strokeWidth="0.9"
      strokeDasharray="3 5"
      opacity="0.65"
    />
    <path
      d="M32 8 L35.8 26.2 L54 30 L35.8 33.8 L32 52 L28.2 33.8 L10 30 L28.2 26.2 Z"
      fill="var(--gold-400)"
      opacity="0.22"
    />
    <path
      d="M32 8 L35.8 26.2 L54 30 L35.8 33.8 L32 52 L28.2 33.8 L10 30 L28.2 26.2 Z"
      stroke="var(--gold-500)"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <circle cx="32" cy="30" r="4.5" fill="var(--ember-600)" opacity="0.8" />
  </svg>
);

const ImagePlaceholder = ({ label = 'Crackers Hyderabad', compact = false }) => {
  if (compact) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="sr-only">No product image</span>
        <BurstMark className="h-9 w-9" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 p-4 text-center">
      <BurstMark className="h-16 w-16 shrink-0" />
      <p
        className="text-sm font-semibold leading-tight"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--text-strong)' }}
      >
        {label}
      </p>
      <span className="label-caps">Image coming soon</span>
    </div>
  );
};

export default ImagePlaceholder;
