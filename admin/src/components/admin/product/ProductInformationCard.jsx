import { Tag } from 'lucide-react';
import FormCard from './FormCard';
import FormField from '../FormField';
import DarkSelect from '../DarkSelect';

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

/**
 * Product Information — name (full width, prominent), brand + Add Brand,
 * description (3 rows, natural height). Field names and validation wiring
 * match what AddProduct/EditProduct have always submitted.
 */
const ProductInformationCard = ({ formData, errors, brands, onFieldChange, onBrandChange, onShowAddBrand, onMarkTouched }) => (
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
            value={formData.brand}
            onChange={(brand) => onBrandChange({ target: { name: 'brand', value: brand } })}
            options={[
              { value: '', label: 'Select Brand (Optional)' },
              ...brands.map((brand) => ({ value: brand.name, label: brand.name })),
            ]}
            placeholder="Select Brand (Optional)"
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

export default ProductInformationCard;
