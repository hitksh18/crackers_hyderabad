import FormField from './FormField';

/**
 * The two pricing panels shared by Add Product and Edit Product.
 *
 * Field names, step values, placeholders and the billing note are the ones the
 * pages already wrote to Firestore — this component only arranges them.
 */
const describe = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

const panelStyle = {
  background: 'var(--surface-sunken)',
  borderColor: 'var(--hairline)',
};

const ProductPriceFields = ({ formData, onChange, onBlur, errors }) => (
  <>
    <div className="rounded-[var(--r-sm)] border p-4" style={panelStyle}>
      <h3 className="label-caps mb-3">Website Prices (Online)</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="online-price"
          label="Online Price"
          required
          hint="Regular website price"
          error={errors.onlinePrice}
        >
          <input
            id="online-price"
            type="number"
            step="0.01"
            name="onlinePrice"
            value={formData.onlinePrice}
            onChange={onChange}
            onBlur={onBlur}
            placeholder="₹376"
            aria-invalid={errors.onlinePrice ? 'true' : undefined}
            aria-describedby={describe('online-price', errors.onlinePrice, 'Regular website price')}
            className="input-premium tabular"
            required
          />
        </FormField>

        <FormField id="discount-price" label="Discount Price" hint="Sale price (optional)">
          <input
            id="discount-price"
            type="number"
            step="0.01"
            name="discountPrice"
            value={formData.discountPrice}
            onChange={onChange}
            placeholder="₹347"
            aria-describedby="discount-price-hint"
            className="input-premium tabular"
          />
        </FormField>
      </div>
    </div>

    <div className="rounded-[var(--r-sm)] border p-4" style={panelStyle}>
      <h3 className="label-caps mb-3">Store Prices (Offline)</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="offline-mrp"
          label="MRP (Offline)"
          required
          hint="Regular store price"
          error={errors.offlineMRP}
        >
          <input
            id="offline-mrp"
            type="number"
            step="0.01"
            name="offlineMRP"
            value={formData.offlineMRP}
            onChange={onChange}
            onBlur={onBlur}
            placeholder="₹400"
            aria-invalid={errors.offlineMRP ? 'true' : undefined}
            aria-describedby={describe('offline-mrp', errors.offlineMRP, 'Regular store price')}
            className="input-premium tabular"
            required
          />
        </FormField>

        <FormField
          id="offline-discount-price"
          label="Discount Price (Offline)"
          hint="Store sale price (optional)"
        >
          <input
            id="offline-discount-price"
            type="number"
            step="0.01"
            name="offlineDiscountPrice"
            value={formData.offlineDiscountPrice}
            onChange={onChange}
            placeholder="₹350"
            aria-describedby="offline-discount-price-hint"
            className="input-premium tabular"
          />
        </FormField>
      </div>
      <p className="mt-3 text-xs font-semibold" style={{ color: 'var(--gold-600)' }}>
        Used in billing system for in-store sales
      </p>
    </div>
  </>
);

export default ProductPriceFields;
