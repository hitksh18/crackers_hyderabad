import { AlertCircle } from 'lucide-react';

/**
 * Label + control + one message slot.
 *
 * The caller wires `aria-invalid` and `aria-describedby` onto the control
 * itself, using the ids this component emits:
 *   `${id}-error` when `error` is set, otherwise `${id}-hint`.
 */
const FormField = ({ id, label, required = false, hint, error, className = '', children }) => (
  <div className={className}>
    <label
      htmlFor={id}
      className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold"
      style={{ color: 'var(--text-strong)' }}
    >
      {label}
      {required && (
        <span
          className="text-[0.625rem] font-bold uppercase tracking-[0.16em]"
          style={{ color: 'var(--crimson-600)' }}
        >
          Required
        </span>
      )}
    </label>

    {children}

    {error ? (
      <p
        id={`${id}-error`}
        role="alert"
        className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--crimson-600)' }}
      >
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {error}
      </p>
    ) : hint ? (
      <p id={`${id}-hint`} className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        {hint}
      </p>
    ) : null}
  </div>
);

export default FormField;
