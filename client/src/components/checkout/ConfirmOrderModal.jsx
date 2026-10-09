import { useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Trash2, Minus, Plus, Banknote, MapPin } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { modalVariants, DURATION } from '../../lib/motion';
import { inr } from '../../lib/currency';
import { formatCoords } from '../../utils/deliveryLocation';

const unitPriceOf = (item) => item.discountPrice || item.onlinePrice || item.price || 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"]):not([disabled])';

/**
 * Final review dialog. Presentation only — cart, coupon and totals all come
 * from the shared CartContext through Checkout props (single source of
 * truth), so +/-/delete inside the dialog updates every figure live.
 * Confirm is gated on the same minimum-order rule checkout enforces.
 */
const ConfirmOrderModal = ({
  cart,
  formData,
  deliveryAddress,
  sameAsBilling,
  pin,
  total,
  subtotal,
  coupon,
  minimumValue = 0,
  minimumMet = true,
  loading,
  submitError,
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

  const shownSubtotal = coupon ? coupon.subtotal : (subtotal ?? total);
  /* Shortfall against the RAW cart total — the same pre-discount figure the
     minimum gate, checkout and the backend enforce. */
  const rawTotal = cart.reduce((s, it) => s + unitPriceOf(it) * (Number(it.quantity) || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.001 : DURATION.fast }}
      className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-6"
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
        className="glass-strong flex max-h-[92dvh] w-full flex-col overflow-hidden"
        style={{ maxWidth: 'min(960px, calc(100vw - 2rem))' }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 py-4 sm:px-6" style={{ background: 'var(--grad-maroon)' }}>
          <div className="min-w-0">
            <h2 id="confirm-order-title" className="subsection-title" style={{ color: '#FFFFFF' }}>
              Confirm Your Order
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: 'rgba(255, 255, 255, 0.78)' }}>
              Please review your order before confirming
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={loading}
            aria-label="Close order confirmation"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-50"
            style={{ color: '#FFFFFF' }}
          >
            <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="label-caps">Items · {cart.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Adjust quantities below</p>
          </div>

          <ul
            className="grid grid-cols-1 gap-2 lg:grid-cols-2"
            style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--r-md)', padding: 6 }}
          >
            {cart.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold" style={{ color: 'var(--text-strong)' }} title={item.name}>
                    {item.name}
                  </p>
                  <p className="price tabular text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {inr(unitPriceOf(item))} each
                  </p>
                </div>
                <div
                  className="inline-flex shrink-0 items-center"
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full"
                  >
                    <Minus className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: 'var(--maroon-700)' }} />
                  </button>
                  <span
                    className="tabular w-6 text-center text-[13px] font-bold"
                    style={{ color: 'var(--text-strong)' }}
                    aria-live="polite"
                  >
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                    aria-label={`Increase quantity of ${item.name}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: 'var(--maroon-700)' }} />
                  </button>
                </div>
                <p
                  className="price tabular w-[72px] shrink-0 text-right text-[13px] font-bold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  {inr(unitPriceOf(item) * item.quantity)}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.name} from order`}
                  title="Remove item"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-vermilion-50 dark:hover:bg-white/5"
                  style={{ color: 'var(--crimson-600)' }}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>

          <div
            className="mt-3 p-3.5"
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
            <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {sameAsBilling ? (
                <>{formData.address}, {formData.city} - {formData.pincode}</>
              ) : (
                <>{deliveryAddress.flatNo}, {deliveryAddress.streetNo}, {deliveryAddress.area}, {deliveryAddress.city} - {deliveryAddress.pincode}</>
              )}
            </p>
            <p
              className="mt-1.5 flex items-start gap-1.5 text-xs"
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

          <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text-body)' }}>
            <Banknote className="h-5 w-5 shrink-0" strokeWidth={2.2} style={{ color: 'var(--gold-600)' }} />
            <span>{paymentMethod === 'upi' ? 'UPI on Delivery' : 'Cash on Delivery'}</span>
          </div>

          <div
            className="mt-3 px-4 py-3"
            style={{ background: 'var(--grad-ember)', borderRadius: 'var(--r-md)', color: '#FFFFFF' }}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>Subtotal</span>
              <span className="price tabular font-semibold">{inr(shownSubtotal)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 text-sm">
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>
                {coupon ? `Discount (${coupon.code})` : 'Discount'}
              </span>
              <span className="price tabular font-semibold">
                {coupon ? `−${inr(coupon.discountAmount)}` : inr(0)}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-white/25 pt-2">
              <span className="font-bold">Total</span>
              <span className="price text-xl font-bold">{inr(total)}</span>
            </div>
            {coupon && (
              <p className="tabular mt-1 text-right text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                ✓ {coupon.code} applied — you save {inr(coupon.discountAmount)}
              </p>
            )}
          </div>
        </div>

        <footer
          className="shrink-0 px-5 py-4 sm:px-6"
          style={{ borderTop: '1px solid var(--hairline)', background: 'var(--surface-raised)' }}
        >
          {submitError && (
            <p
              role="alert"
              className="mb-3 rounded-xl border px-3.5 py-2.5 text-sm font-semibold"
              style={{ borderColor: 'var(--crimson-600)', background: 'rgba(203, 42, 42, 0.08)', color: 'var(--crimson-600)' }}
            >
              Unable to place your order right now. Please try again.
            </p>
          )}
          {!minimumMet && (
            <p
              role="status"
              className="tabular mb-3 rounded-xl border px-3.5 py-2.5 text-sm font-semibold"
              style={{ borderColor: 'var(--gold-500)', background: 'rgba(210,166,79,0.10)', color: 'var(--gold-600)' }}
            >
              Minimum order {inr(minimumValue)} — add {inr(Math.max(0, minimumValue - rawTotal))} more to proceed to checkout.
            </p>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button type="button" onClick={onClose} disabled={loading} className="btn-outline min-h-[48px] w-full disabled:opacity-50">
              Edit Details
            </button>
            <button type="button" onClick={onAddMore} disabled={loading} className="btn-outline min-h-[48px] w-full disabled:opacity-50">
              Add More Products
            </button>
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[1fr_1.4fr]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl px-4 font-semibold transition-colors disabled:opacity-50"
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
              disabled={loading || !minimumMet}
              aria-busy={loading}
              title={!minimumMet ? `Minimum order ${inr(minimumValue)} not reached` : undefined}              className="btn-primary min-h-[48px] w-full whitespace-nowrap text-[15px] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 disabled:hover:transform-none"
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
