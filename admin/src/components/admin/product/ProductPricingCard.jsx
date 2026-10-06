import FormCard from './FormCard';
import ProductPriceFields from '../ProductPriceFields';

const RupeeIcon = ({ className, style }) => (
  <span className={className} style={{ ...style, fontSize: '0.875rem', fontWeight: 800 }}>₹</span>
);

/**
 * Pricing — website (online) and store (offline) panels side by side on
 * wide screens, stacked below. All field names, trade-pricing flow and the
 * billing note are untouched; this only arranges the shared fields.
 */
const ProductPricingCard = ({ formData, errors, onFieldChange, onMarkTouched }) => (
  <FormCard
    icon={RupeeIcon}
    title="Pricing"
    subtitle="Website prices drive the storefront. Store prices drive billing."
  >
    <div className="grid flex-1 gap-3 xl:grid-cols-2">
      <ProductPriceFields formData={formData} onChange={onFieldChange} onBlur={onMarkTouched} errors={errors} />
    </div>
  </FormCard>
);

export default ProductPricingCard;
