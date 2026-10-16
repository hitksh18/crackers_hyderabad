import { Minus, Plus, ShoppingCart } from 'lucide-react';
import QuantityInput from '../QuantityInput';
import { inr } from '../../lib/currency';

/**
 * Docked purchase bar for the product detail page — phones and tablets only.
 *
 * There is exactly one cart path on this page: the bar is handed the same
 * `quantity` state and the same `onAddToCart` handler as the inline controls in
 * the buy column, so a change in either place is instantly reflected in the
 * other. It never touches the cart itself.
 *
 * Desktop keeps the inline quantity + Add to Cart controls and hides this bar
 * in CSS (min-width: 1024px), which is why `visible` is simply always true —
 * the bar is either on screen or display:none, never a stale offscreen tab
 * stop.
 */
const StickyCartBar = ({
  displayPrice,
  outOfStock,
  quantity,
  setQuantity,
  onAddToCart,
  visible,
}) => (
  <div
    className={`sticky-cart-bar ${visible ? 'visible' : ''}`}
    inert={!visible}
    aria-hidden={!visible || undefined}
    aria-label="Quick add to cart"
  >
    <div className="sticky-cart-bar-inner">
      <div className="pd-qty pd-qty--bar">
        <button
          type="button"
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          aria-label="Decrease quantity"
          className="pd-qty-btn"
        >
          <Minus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
        </button>
        <QuantityInput
          value={quantity}
          onChange={setQuantity}
          ariaLabel="Quantity"
          className="pd-qty-input tabular"
        />
        <button
          type="button"
          onClick={() => setQuantity(quantity + 1)}
          aria-label="Increase quantity"
          className="pd-qty-btn"
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={onAddToCart}
        disabled={outOfStock}
        className="btn-primary nav-login-btn pd-atc pd-atc--bar"
      >
        <ShoppingCart className="h-5 w-5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
        <span className="truncate">{outOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
        {!outOfStock && (
          <span className="price shrink-0 opacity-90" aria-hidden="true">
            {inr(displayPrice)}
          </span>
        )}
      </button>
    </div>
  </div>
);

export default StickyCartBar;