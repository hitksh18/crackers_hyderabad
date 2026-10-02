import { AlertCircle } from 'lucide-react';

/**
 * One labelled checkout field.
 *
 * Always renders a real <label htmlFor>, and on failure pairs `aria-invalid`
 * with a visible text message wired through `aria-describedby` — colour is
 * never the only signal.
 */
const CheckoutField = ({
  id,
  label,
  value,
  onChange,
  onBlur,
  error = '',
  hint = '',
  type = 'text',
  name,
  placeholder,
  required = false,
  rows,
  inputMode,
  autoComplete,
  className = '',
}) => {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const shared = {
    id,
    name,
    value,
    onChange,
    onBlur,
    placeholder,
    required,
    inputMode,
    autoComplete,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
  };

  return (
    <div className={`min-w-0 ${className}`}>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-semibold"
        style={{ color: 'var(--text-body)' }}
      >
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: 'var(--ember-600)' }}> *</span>
        ) : (
          <span className="ml-1 font-normal" style={{ color: 'var(--text-subtle)' }}>(optional)</span>
        )}
      </label>

      {rows ? (
        <textarea {...shared} rows={rows} className="input-premium resize-y text-sm" />
      ) : (
        <input {...shared} type={type} className="input-premium text-sm" />
      )}

      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1 flex items-start gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--crimson-600)' }}
        >
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default CheckoutField;
