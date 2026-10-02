import { Check } from 'lucide-react';

/**
 * Multi-select category grid.
 *
 * Real checkboxes inside real labels — the visual card is only chrome, so
 * keyboard and screen-reader behaviour is the browser's own.
 */
const CategoryPicker = ({ options, selected, onToggle, invalid = false, describedBy }) => (
  <div
    role="group"
    aria-label="Product categories"
    aria-invalid={invalid ? 'true' : undefined}
    aria-describedby={describedBy}
    className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
  >
    {options.map((cat) => {
      const isOn = selected.includes(cat);
      return (
        <label
          key={cat}
          className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[var(--r-sm)] border px-3 py-2 transition-colors"
          style={{
            background: isOn ? 'rgba(195, 58, 20, 0.08)' : 'var(--surface-card)',
            borderColor: isOn
              ? 'var(--ember-600)'
              : invalid
                ? 'rgba(203, 42, 42, 0.4)'
                : 'var(--hairline-strong)',
          }}
        >
          <input
            type="checkbox"
            checked={isOn}
            onChange={() => onToggle(cat)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ember-600)]"
            style={{
              background: isOn ? 'var(--ember-600)' : 'transparent',
              borderColor: isOn ? 'var(--ember-600)' : 'var(--hairline-strong)',
            }}
          >
            {isOn && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
          </span>
          <span
            className="min-w-0 text-sm font-medium"
            style={{ color: isOn ? 'var(--text-strong)' : 'var(--text-body)' }}
          >
            {cat}
          </span>
        </label>
      );
    })}
  </div>
);

export default CategoryPicker;
