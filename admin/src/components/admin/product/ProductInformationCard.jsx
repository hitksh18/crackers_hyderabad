import { useMemo } from 'react';
import { Tag } from 'lucide-react';
import FormCard from './FormCard';
import FormField from '../FormField';
import DarkSelect from '../DarkSelect';
import { normalizeBrandName } from '../../../lib/brands';

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

/**
 * Product Information — name (full width, prominent), brand + Add Brand,
 * description (3 rows, natural height). Field names and validation wiring
 * match what AddProduct/EditProduct have always submitted.
 *
 * Brand is stored as a stable `brandId` (source of truth) with the name kept
 * as denormalized `brand` text for legacy compatibility. A legacy brand
 * string with no managed record stays selectable as "(unmapped)" so existing
 * products never lose their displayed value.
 */
const ProductInformationCard = ({ formData, errors, brands, onFieldChange, onBrandSelect, onShowAddBrand, onMarkTouched }) => {
  const brandOptions = useMemo(() => {
    const sorted = [...(Array.isArray(brands) ? brands : [])].sort((a, b) =>
      normalizeBrandName(a.name).localeCompare(normalizeBrandName(b.name), undefined, { sensitivity: 'base' }),
    );
    const options = [
      { value: '', label: 'Select Brand (Optional)' },
      ...sorted.map((brand) => ({
        value: String(brand.id),
        label: brand.active === false ? `${normalizeBrandName(brand.name)} (inactive)` : normalizeBrandName(brand.name),
      })),
    ];
    /* Legacy text fallback: the product carries a brand name that matches no
       managed record — keep it visible instead of blanking the field. */
    const brandId = formData.brandId ? String(formData.brandId) : '';
    const brandName = normalizeBrandName(formData.brand);
    if (brandName && !brandId && !sorted.some((b) => normalizeBrandName(b.name).toLowerCase() === brandName.toLowerCase())) {
      options.push({ value: '__legacy__', label: `${brandName} (unmapped)` });
    }
    return options;
  }, [brands, formData.brandId, formData.brand]);

  const selectedBrandValue = formData.brandId ? String(formData.brandId) : (
    normalizeBrandName(formData.brand)
      && (Array.isArray(brands) ? brands : []).some((b) => normalizeBrandName(b.name).toLowerCase() === normalizeBrandName(formData.brand).toLowerCase())
      ? String(brands.find((b) => normalizeBrandName(b.name).toLowerCase() === normalizeBrandName(formData.brand).toLowerCase()).id)
      : (normalizeBrandName(formData.brand) ? '__legacy__' : '')
  );

  const handleBrandChange = (value) => {
    if (typeof onBrandSelect !== 'function') return;
    if (!value || value === '__legacy__') {
      /* Clearing keeps any legacy text the product already had; the
         "(unmapped)" row itself is display-only. */
      if (value === '__legacy__') return;
      onBrandSelect(null);
      return;
    }
    const match = (Array.isArray(brands) ? brands : []).find((b) => String(b.id) === String(value));
    onBrandSelect(match ? { id: match.id, name: normalizeBrandName(match.name) } : null);
  };

  return (
    <FormCard icon={Tag} title="Product Information" subtitle="Name, brand and short description.">
      <div className="flex flex-1 flex-col gap-3">
        <FormField id="product-name" label="Product Name" required error={errors.name}>
          <input
            id="product-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={onFieldChange}
            onBlur={onMarkTouched}
            aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={describedBy('product-name', errors.name, null)}
            className="input-premium"
            placeholder="e.g. 12 Shots Multicolour Sky Shot"
            required
          />
        </FormField>

        <FormField id="product-brand" label="Product Brand" hint="Optional. Pick an existing brand or create a new one.">
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <DarkSelect
              id="product-brand"
              className="sm:flex-1"
              value={selectedBrandValue}
              onChange={handleBrandChange}
              options={brandOptions}
              placeholder="Select Brand (Optional)"
              searchable
              searchPlaceholder="Search brands..."
            />
            <button type="button" onClick={onShowAddBrand} className="btn-outline shrink-0">
              Add Brand
            </button>
          </div>
        </FormField>

        <FormField id="product-description" label="Description" className="flex flex-1 flex-col">
          <textarea
            id="product-description"
            name="description"
            value={formData.description}
            onChange={onFieldChange}
            rows="3"
            className="input-premium min-h-[88px] flex-1 resize-none"
            placeholder="Short description for the product card"
          />
        </FormField>
      </div>
    </FormCard>
  );
};

export default ProductInformationCard;
