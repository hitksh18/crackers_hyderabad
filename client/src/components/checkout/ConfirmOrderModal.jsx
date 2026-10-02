import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Trash2, Minus, Plus, Banknote, MapPin } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { modalVariants, DURATION } from '../../lib/motion';
import { inr } from '../../lib/currency';
import { formatCoords } from '../../utils/deliveryLocation';

const unitPriceOf = (item) => item.discountPrice || item.onlinePrice || item.price || 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Final review dialog. Presentation only — every control here calls straight
 * back into the cart / checkout handlers it was handed.
 */
const ConfirmOrderModal = ({
  cart,
  formData,
  deliveryAddress,
  sameAsBilling,
  pin,
  total,
  loading,
  onClose,
  onConfirm,
  onAddMore,
  onQuantityChange,
  onRemove,
  paymentMethod = 'cod',
}) => {
  const reduced = useReducedMotion();
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  // Every dismissal path funnels through here. While the order write is in
  // flight the dialog cannot be closed — the submit is not cancellable.
  const handleDismiss = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  // Lock the checkout form behind the dialog, remember focus, restore on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusFirst = window.setTimeout(() => {
      const node = panelRef.current?.querySelector(FOCUSABLE);
      node?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusFirst);
      document.body.style.overflow = overflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, []);

  // Escape closes (unless submitting); Tab stays inside the dialog.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        handleDismiss();
        return;
      }

      if (event.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [handleDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.001 : DURATION.fast }}
      className="fixed inset-0 z-modal flex items-center justify-center p-4"
      style={{ background: 'rgba(26, 23, 20, 0.66)' }}
      onClick={handleDismiss}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-order-title"
        variants={modalVariants(reduced)}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(event) => event.stopPropagation()}
        className="glass-strong flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden"
      >
        <header className="shrink-0 px-5 py-4 sm:px-6" style={{ background: 'var(--grad-maroon)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="confirm-order-title" className="subsection-title" style={{ color: '#FFFFFF' }}>
                Confirm Your Order
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'rgba(255, 255, 255, 0.78)' }}>
                Please review your order before confirming
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={loading}
              aria-label="Close order confirmation"
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-50"
              style={{ color: '#FFFFFF' }}
            >
              <X className="h-5 w-5" strokeWidth={2.4} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="label-caps">Items</p>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Adjust quantities below</p>
          </div>

          <ul
            className="mb-5 overflow-hidden"
            style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)' }}
          >
            {cart.map((item, index) => (
              <li
                key={item.id}
                className="p-3"
                style={{ borderTop: index === 0 ? 'none' : '1px solid var(--hairline)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {item.name}
                    </p>
                    <p className="price text-xs" style={{ color: 'var(--text-muted)' }}>
                      {inr(unitPriceOf(item))} each
                    </p>
                  </div>
                  <p
                    className="price shrink-0 text-sm font-bold"
                    style={{ color: 'var(--text-strong)' }}
                  >
                    {inr(unitPriceOf(item) * item.quantity)}
                  </p>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <div
                    className="inline-flex items-center"
                    style={{
                      border: '1px solid var(--hairline-strong)',
                      borderRadius: 'var(--r-pill)',
                      background: 'var(--surface-card)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                      aria-label={`Decrease quantity of ${item.name}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                    >
                      <Minus className="h-4 w-4" strokeWidth={2.6} style={{ color: 'var(--maroon-700)' }} />
                    </button>
                    <span
                      className="tabular w-8 text-center text-sm font-bold"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                      aria-label={`Increase quantity of ${item.name}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.6} style={{ color: 'var(--maroon-700)' }} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label={`Remove ${item.name} from order`}
                    title="Remove item"
                    className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-vermilion-50 dark:hover:bg-white/5"
                    style={{ color: 'var(--crimson-600)' }}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.4} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div
            className="mb-4 p-4"
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <p className="label-caps mb-1.5">Deliver To</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {formData.name} · <span className="tabular">{formData.phone}</span>
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {sameAsBilling ? (
                <>{formData.address}, {formData.city} - {formData.pincode}</>
              ) : (
                <>{deliveryAddress.flatNo}, {deliveryAddress.streetNo}, {deliveryAddress.area}, {deliveryAddress.city} - {deliveryAddress.pincode}</>
              )}
            </p>
            {/* Last chance to notice the pin is missing, while going back still
                costs nothing. Stated either way rather than only when absent —
                silence reads as "fine" and this is worth confirming. */}
            <p
              className="mt-2 flex items-start gap-1.5 text-xs"
              style={{ color: pin ? 'var(--leaf-600)' : 'var(--text-subtle)' }}
            >
              <MapPin className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
              <span>
                {pin ? (
                  <>Location pinned · <span className="tabular">{formatCoords(pin)}</span></>
                ) : (
                  'No map pin — our team will navigate by the address above.'
                )}
              </span>
            </p>
          </div>

          <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: 'var(--text-body)' }}>
            <Banknote className="h-5 w-5 shrink-0" strokeWidth={2.2} style={{ color: 'var(--gold-600)' }} />
            <span>{paymentMethod === 'upi' ? 'UPI on Delivery' : 'Cash on Delivery'}</span>
          </div>

          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ background: 'var(--grad-ember)', borderRadius: 'var(--r-md)', color: '#FFFFFF' }}
          >
            <span className="font-bold">Total</span>
            <span className="price text-lg font-bold">{inr(total)}</span>
          </div>
        </div>

        <footer
          className="shrink-0 px-5 py-4 sm:px-6"
          style={{ borderTop: '1px solid var(--hairline)', background: 'var(--surface-raised)' }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={onClose} disabled={loading} className="btn-outline w-full disabled:opacity-50">
              Edit Details
            </button>
            <button type="button" onClick={onAddMore} disabled={loading} className="btn-outline w-full disabled:opacity-50">
              Add More Products
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 font-semibold transition-colors disabled:opacity-50"
              style={{
                background: 'var(--surface-sunken)',
                color: 'var(--text-body)',
                border: '1px solid var(--hairline)',
              }}
            >
              Cancel
            </button>
            <motion.button
              type="button"
              whileTap={reduced ? undefined : { scale: 0.98 }}
              onClick={onConfirm}
              disabled={loading}
              aria-busy={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Placing Order...</span>
                </>
              ) : (
                'Confirm & Place Order'
              )}
            </motion.button>
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
};

export default ConfirmOrderModal;
