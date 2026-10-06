import { IndianRupee, Star } from 'lucide-react';
import FormCard from './FormCard';
import FormField from '../FormField';
import ToggleCard from '../ToggleCard';

/**
 * Product Highlights — 2x2 attribute grid, then equal COD / Premium Quality
 * toggle cards. Stored `highlights` shape is unchanged.
 */
const ProductHighlightsCard = ({ formData, onFieldChange }) => (
  <FormCard icon={Star} iconColor="var(--gold-500)" title="Product Highlights" subtitle="Optional. Shown on the customer product page.">
    <div className="grid gap-3 md:grid-cols-2">
      <FormField id="highlight-brand" label="Brand">
        <input
          id="highlight-brand"
          type="text"
          name="highlightBrand"
          value={formData.highlightBrand || ''}
          onChange={onFieldChange}
          placeholder="e.g. Standard Fireworks"
          className="input-premium"
        />
      </FormField>
      <FormField id="highlight-quantity" label="Quantity">
        <input
          id="highlight-quantity"
          type="text"
          name="highlightQuantity"
          value={formData.highlightQuantity || ''}
          onChange={onFieldChange}
          placeholder="e.g. 1 Box (10 Pieces)"
          className="input-premium"
        />
      </FormField>
      <FormField id="highlight-effect" label="Effect">
        <textarea
          id="highlight-effect"
          name="highlightEffect"
          value={formData.highlightEffect || ''}
          onChange={onFieldChange}
          rows="2"
          className="input-premium min-h-[68px] resize-none"
          placeholder="e.g. Tall, bright, glittering fountain"
        />
      </FormField>
      <FormField id="highlight-ideal-for" label="Ideal For">
        <textarea
          id="highlight-ideal-for"
          name="highlightIdealFor"
          value={formData.highlightIdealFor || ''}
          onChange={onFieldChange}
          rows="2"
          className="input-premium min-h-[68px] resize-none"
          placeholder="e.g. Weddings, Diwali and family celebrations"
        />
      </FormField>
    </div>
    <div className="mt-auto grid gap-3 pt-3 md:grid-cols-2">
      <ToggleCard
        id="highlight-cod"
        icon={IndianRupee}
        tone="gold"
        label="COD Available"
        description="Shows the cash-on-delivery badge bar."
        checked={formData.highlightCod !== false}
        onChange={(e) => onFieldChange({ target: { name: 'highlightCod', value: e.target.checked } })}
      />
      <ToggleCard
        id="highlight-premium"
        icon={Star}
        tone="gold"
        label="Premium Quality"
        description="Shows the premium-quality note beside COD."
        checked={formData.highlightPremium !== false}
        onChange={(e) => onFieldChange({ target: { name: 'highlightPremium', value: e.target.checked } })}
      />
    </div>
  </FormCard>
);

export default ProductHighlightsCard;
