import { Activity, PackageX, Star } from 'lucide-react';
import FormCard from './FormCard';

/**
 * Status — compact visibility banner, Featured and Out of Stock as two
 * stacked full-width rows (never side by side), Sort Order pinned at the
 * bottom of the natural flow. The card tightly wraps its content.
 *
 * No schema change: visibility is derived from `outOfStock`.
 */
const StatusRow = ({ id, icon: Icon, tone, label, description, checked, onChange }) => (
  <label
    htmlFor={id}
    className="flex min-h-[48px] w-full cursor-pointer items-center gap-2.5 rounded-[var(--r-sm)] border px-3 py-2 transition-colors"
    style={{
      background: checked ? tone.on : 'var(--surface-card)',
      borderColor: checked ? tone.border : 'var(--hairline-strong)',
      boxSizing: 'border-box',
    }}
  >
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--ember-600)]"
    />
    {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: checked ? tone.ink : 'var(--text-muted)' }} /> : null}
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-strong)' }}>
        {label}
      </span>
      {description ? (
        <span className="block truncate text-xs leading-tight" style={{ color: 'var(--text-muted)' }}>
          {description}
        </span>
      ) : null}
    </span>
  </label>
);

const TONES = {
  gold: { on: 'rgba(210, 166, 79, 0.12)', border: 'rgba(210, 166, 79, 0.5)', ink: 'var(--gold-600)' },
  crimson: { on: 'rgba(203, 42, 42, 0.08)', border: 'rgba(203, 42, 42, 0.38)', ink: 'var(--crimson-600)' },
};

const ProductStatusCard = ({ formData, onFieldChange }) => {
  const hidden = !!formData.outOfStock;

  return (
    <FormCard icon={Activity} title="Status" subtitle="Visibility and storefront placement.">
      <div
        className="flex items-center gap-2 rounded-[var(--r-sm)] border px-3 py-2"
        style={{
          background: hidden ? 'rgba(203, 42, 42, 0.08)' : 'rgba(44, 122, 83, 0.10)',
          borderColor: hidden ? 'rgba(203, 42, 42, 0.35)' : 'rgba(44, 122, 83, 0.35)',
        }}
        role="status"
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: hidden ? 'var(--crimson-600)' : 'var(--leaf-600)' }}
        />
        <p className="truncate text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>
          {hidden ? 'Hidden — out of stock' : 'Active — visible on storefront'}
        </p>
      </div>

      <div className="mt-2.5 space-y-2.5">
        <StatusRow
          id="isFeatured"
          icon={Star}
          tone={TONES.gold}
          label="Featured"
          description="Storefront highlights."
          checked={formData.isFeatured}
          onChange={(e) => onFieldChange({ target: { name: 'isFeatured', value: e.target.checked } })}
        />
        <StatusRow
          id="outOfStock"
          icon={PackageX}
          tone={TONES.crimson}
          label="Out of Stock"
          description="Hides buy action."
          checked={formData.outOfStock}
          onChange={(e) => onFieldChange({ target: { name: 'outOfStock', value: e.target.checked } })}
        />
      </div>

      <div className="mt-auto flex items-center gap-2 pt-2.5">
        <label htmlFor="sortOrder" className="shrink-0 text-xs font-semibold" style={{ color: 'var(--text-strong)' }}>
          Sort Order
        </label>
        <input
          id="sortOrder"
          type="number"
          name="sortOrder"
          value={formData.sortOrder}
          onChange={onFieldChange}
          placeholder="0"
          className="input-premium h-11 min-w-0 flex-1 tabular"
        />
      </div>
    </FormCard>
  );
};

export default ProductStatusCard;
