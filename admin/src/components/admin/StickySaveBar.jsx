import { Loader2 } from 'lucide-react';

/**
 * Sticky commit bar for the product form workspace.
 *
 * Renders the form's single submit control. The busy state is carried by the
 * disabled attribute, the label text and the spinner together, so it still
 * reads correctly when motion is switched off.
 */
const StickySaveBar = ({ loading, label, loadingLabel, hint, icon: Icon }) => (
  <div
    className="sticky bottom-0 z-sticky -mx-1 mt-2 rounded-t-[var(--r-lg)] border-t px-4 py-3 sm:px-5"
    style={{
      background: 'var(--surface-raised)',
      borderColor: 'var(--hairline-strong)',
      boxShadow: 'var(--shadow-lg)',
    }}
  >
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p
        className="text-xs leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
        role="status"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading ? loadingLabel : hint}
      </p>

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full shrink-0 sm:w-auto"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : Icon ? (
          <Icon className="h-4 w-4" aria-hidden="true" />
        ) : null}
        {loading ? loadingLabel : label}
      </button>
    </div>
  </div>
);

export default StickySaveBar;
