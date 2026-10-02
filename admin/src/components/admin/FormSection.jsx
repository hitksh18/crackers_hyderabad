/**
 * A grouped fieldset in the product form workspace.
 *
 * Operational register: neutral ink surface, no ornament, no gold field.
 * Presentational only — it owns no state.
 */
const FormSection = ({ index, icon: Icon, title, description, children, className = '' }) => (
  <fieldset
    className={`rounded-[var(--r-lg)] border px-4 py-5 sm:px-6 sm:py-6 ${className}`}
    style={{
      background: 'var(--surface-card)',
      borderColor: 'var(--hairline)',
      boxShadow: 'var(--shadow-xs)',
    }}
  >
    <legend className="sr-only">{title}</legend>

    <div className="mb-5 flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-sm)]"
        style={{
          background: 'var(--surface-sunken)',
          border: '1px solid var(--hairline)',
          color: 'var(--text-muted)',
        }}
      >
        {Icon ? <Icon className="h-5 w-5" strokeWidth={1.8} /> : null}
      </span>

      <div className="min-w-0">
        <p className="label-caps">
          Section <span className="tabular">{index}</span>
        </p>
        <h2 className="card-title" style={{ color: 'var(--text-strong)' }}>
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        )}
      </div>
    </div>

    <div className="space-y-5">{children}</div>
  </fieldset>
);

export default FormSection;
