import { Layers } from 'lucide-react';
import FormCard from './FormCard';
import CategoryPicker from '../CategoryPicker';
import { PRODUCT_CATEGORIES } from '../../../config/categories';

/**
 * Product Organization — the canonical 12 store categories in storefront
 * order (single source of truth: config/categories.js), in a compact
 * two-column grid of identical cards. The count pins to the card bottom.
 */
const ProductOrganizationCard = ({ selected, onToggle, error }) => (
  <FormCard
    icon={Layers}
    title="Product Organization"
    subtitle={`Same ${PRODUCT_CATEGORIES.length} categories as the storefront`}
    action={(
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
        style={{ color: 'var(--crimson-600)' }}
      >
        Required
      </span>
    )}
  >
    <CategoryPicker
      options={PRODUCT_CATEGORIES}
      selected={selected}
      onToggle={onToggle}
      invalid={!!error}
      describedBy={error ? 'categories-error' : undefined}
      gridClassName="grid grid-cols-2 gap-2"
    />
    {error ? (
      <p id="categories-error" role="alert" className="mt-auto pt-1.5 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }}>
        {error}
      </p>
    ) : (
      <p className="mt-auto pt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        Multiple categories allowed
      </p>
    )}
  </FormCard>
);

export default ProductOrganizationCard;
