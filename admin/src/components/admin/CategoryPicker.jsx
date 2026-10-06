import { Check } from 'lucide-react';
import { entryMatchesValue } from '../../config/categories';

/**
 * Multi-select category grid.
 *
 * `options` are canonical entries from config/categories.js
 * ({ name, value, slug, aliases }); plain strings are still accepted for
 * backwards compatibility. `selected` is the array of stored category
 * strings — matching is alias-aware, so legacy spellings (e.g. a stored
 * "Threads & Pencils") still light up the canonical card.
 *
 * Real checkboxes inside real labels — the visual card is only chrome, so
 * keyboard and screen-reader behaviour is the browser's own. `onToggle`
 * receives the canonical entry (or the raw string for unknown options).
 */
const normalizeOptions = (options) =>
  (options || []).map((opt) =>
    typeof opt === 'string'
      ? { name: opt, value: opt, slug: '', aliases: [opt], legacy: true }
      : opt,
  );

const isSelected = (entry, selected) => {
  const list = Array.isArray(selected) ? selected : [];
  if (entry.legacy) return list.includes(entry.value);
  return list.some((stored) => entryMatchesValue(entry, stored) || stored === entry.name);
};

const CategoryPicker = ({ options, selected, onToggle, invalid = false, describedBy, gridClassName }) => {
  const entries = normalizeOptions(options);
  const count = entries.filter((e) => isSelected(e, selected)).length;

  return (
    <div>
      <div
        role="group"
        aria-label="Product categories"
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        className={gridClassName || 'grid grid-cols-2 gap-2 md:grid-cols-3'}
      >
        {entries.map((entry) => {
          const isOn = isSelected(entry, selected);
          return (
            <label
              key={entry.value}
              title={entry.name}
              className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--r-sm)] border px-2.5 py-2 transition-colors hover:border-[var(--ember-600)]"
              style={{
                background: isOn ? 'rgba(195, 58, 20, 0.10)' : 'var(--surface-card)',
                borderColor: isOn
                  ? 'var(--ember-600)'
                  : invalid
                    ? 'rgba(203, 42, 42, 0.4)'
                    : 'var(--hairline-strong)',
                boxShadow: isOn ? 'inset 0 0 0 1px var(--ember-600)' : 'none',
              }}
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(entry.legacy ? entry.value : entry)}
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
                className="min-w-0 flex-1 truncate text-[13px] font-medium"
                style={{ color: isOn ? 'var(--text-strong)' : 'var(--text-body)' }}
              >
                {entry.name}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs tabular" style={{ color: 'var(--text-muted)' }} aria-live="polite">
        {count === 0
          ? 'No categories selected'
          : `${count} categor${count === 1 ? 'y' : 'ies'} selected`}
      </p>
    </div>
  );
};

export default CategoryPicker;
