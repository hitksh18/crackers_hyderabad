import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trash2, Minus, Plus, ShoppingBag, Truck, ArrowRight, PackageSearch } from 'lucide-react';
import { useCart } from '../context/CartContext';
import QuantityInput from '../components/QuantityInput';
import ImagePlaceholder from '../components/ImagePlaceholder';
import { displayNameForCategory } from '../lib/categoryIcons';
import EmptyState from '../components/ui/EmptyState';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { inr } from '../lib/currency';
import { MINIMUM_ORDER_VALUE } from '../lib/orderThresholds';
import {
  staggerParent,
  DURATION,
  EASE_OUT_EXPO,
  EASE_IN_SOFT,
} from '../lib/motion';
import Seo from '../components/Seo';

/* Single source of truth lives in lib/orderThresholds — same floor the
   checkout gate and the backend fallback enforce. */
const FREE_SHIPPING_THRESHOLD = MINIMUM_ORDER_VALUE;

const unitPriceOf = (item) => item.discountPrice || item.onlinePrice || item.price || 0;

/** Line item: slides in on mount, slides out on removal. Transform + opacity only. */
const rowVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.001 : DURATION.base, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    x: reduced ? 0 : -18,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_IN_SOFT },
  },
});

const Cart = () => {
  const reduced = useReducedMotion();
  const { cart, hydrated, removeFromCart, updateQuantity, getCartTotal } = useCart();
  const total = getCartTotal();

  /* Table scrollbar visibility: hidden at rest, thin gold while the user is
     actively scrolling the rows, then fades out after a short idle beat. */
  const [tableScrolling, setTableScrolling] = useState(false);
  const scrollIdleRef = useRef(null);
  const handleTableScroll = () => {
    setTableScrolling(true);
    if (scrollIdleRef.current) window.clearTimeout(scrollIdleRef.current);
    scrollIdleRef.current = window.setTimeout(() => setTableScrolling(false), 900);
  };
  useEffect(() => () => {
    if (scrollIdleRef.current) window.clearTimeout(scrollIdleRef.current);
  }, []);

  /* Before the cart is read from storage it is indistinguishable from an empty
     one, and "Your cart is empty" flashed on every refresh of a full cart. */
  if (!hydrated) {
    return (
      <div className="min-h-screen section-pad-sm" role="status" aria-live="polite" aria-busy="true">
        <Seo title="Your Cart | Crackers Hyderabad" noindex />
        <div className="shell-narrow flex justify-center py-24">
          <div
            className="h-14 w-14 animate-spin rounded-full"
            style={{ border: '3px solid var(--hairline-strong)', borderTopColor: 'var(--ember-600)' }}
          />
          <span className="sr-only">Loading your cart</span>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen section-pad-sm">
        <Seo title="Your Cart | Crackers Hyderabad" noindex />
        <div className="shell-narrow">
          <EmptyState
            icon={ShoppingBag}
            title="Your cart is empty"
            description="Celebrations are better with crackers — start shopping!"
            action={
              <Link to="/products" className="btn-primary btn-shine w-full sm:w-auto">
                Continue shopping
                <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              </Link>
            }
            secondaryAction={
              <Link to="/track-order" className="btn-outline w-full sm:w-auto">
                <PackageSearch className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Track an order
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const remaining = FREE_SHIPPING_THRESHOLD - total;
  const progress = Math.min(100, (total / FREE_SHIPPING_THRESHOLD) * 100);

  /* Shared quantity pill (desktop table + mobile rows render the same
     control — one definition, one behaviour). */
  const qtyControl = (item) => (
    <div
      className="inline-flex items-center"
      style={{
        border: '1px solid var(--hairline-strong)',
        borderRadius: 'var(--r-pill)',
        background: 'var(--surface-card)',
      }}
    >
      <motion.button
        type="button"
        whileTap={reduced ? undefined : { scale: 0.9 }}
        onClick={() => updateQuantity(item.id, item.quantity - 1)}
        aria-label={`Decrease quantity of ${item.name}`}
        className="inline-flex h-10 w-9 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <Minus className="h-4 w-4" strokeWidth={2.6} style={{ color: 'var(--maroon-700)' }} />
      </motion.button>

      <QuantityInput
        value={item.quantity}
        onChange={(quantity) => updateQuantity(item.id, quantity)}
        ariaLabel={`Quantity for ${item.name}`}
        className="tabular h-11 w-10 border-0 bg-transparent text-center text-base font-bold focus:outline-none"
        style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}
      />

      <motion.button
        type="button"
        whileTap={reduced ? undefined : { scale: 0.9 }}
        onClick={() => updateQuantity(item.id, item.quantity + 1)}
        aria-label={`Increase quantity of ${item.name}`}
        className="inline-flex h-10 w-9 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <Plus className="h-4 w-4" strokeWidth={2.6} style={{ color: 'var(--maroon-700)' }} />
      </motion.button>
    </div>
  );

  return (
    <div className="section-pad-sm cart-fit pb-24 lg:h-[calc(100dvh-88px-52px)] lg:min-h-[540px] lg:overflow-hidden lg:pb-0">
      <Seo title="Your Cart | Crackers Hyderabad" noindex />
      <div className="shell shell-checkout lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        {/* Compact shipping status — the single banner, same logic. */}
        <div className="panel-editorial glass-card mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2 sm:px-4">
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'rgba(210, 166, 79, 0.14)', border: '1px solid rgba(190, 140, 54, 0.32)' }}
          >
            <Truck className="h-3.5 w-3.5" strokeWidth={2.2} style={{ color: 'var(--gold-600)' }} />
          </span>
          <p className="min-w-[200px] flex-1 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
            {total >= FREE_SHIPPING_THRESHOLD
              ? "✓ You've unlocked FREE SHIPPING & COD!"
              : `Add ₹${remaining.toLocaleString('en-IN')} more for FREE SHIPPING & COD`}
          </p>
          <div
            aria-hidden="true"
            className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--surface-sunken)' }}
          >
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: progress / 100 }}
              transition={{ duration: reduced ? 0.001 : DURATION.slow, ease: EASE_OUT_EXPO }}
              className="h-full w-full origin-left rounded-full"
              style={{ background: 'var(--grad-gold)' }}
            />
          </div>
        </div>

        {/* Workspace: one full-width table card. The rows scroll inside on
            desktop; everything below stays put. Natural page scroll below lg. */}
        <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          {/* ---- Single cart table card ---- */}
          <section className="panel-editorial glass-card min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden" aria-label="Cart items">
            <div
              className="flex shrink-0 items-center justify-between gap-3 px-3.5 py-2 sm:px-4"
              style={{ borderBottom: '1px solid var(--hairline)' }}
            >
              <span className="label-caps">Cart Items</span>
              <span className="badge badge-gold tabular" aria-label={`${cart.length} items`}>
                {cart.length}
              </span>
            </div>

            {/* Desktop: real table in its own scroll viewport with a sticky
                head — only the rows move, the card never grows the page. */}
            <div
              className={`cart-table-scroll hidden min-h-0 md:block lg:flex-1 lg:overflow-y-auto${tableScrolling ? ' is-scrolling' : ''}`}
              onScroll={handleTableScroll}
            >
            <table className="w-full">
              <colgroup>
                <col style={{ width: '6%' }} />
                <col style={{ width: '50%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '7%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <th scope="col" className="label-caps px-4 py-2 text-left font-semibold">No.</th>
                  <th scope="col" className="label-caps px-2 py-2 text-left font-semibold">Product</th>
                  <th scope="col" className="label-caps px-2 py-2 text-center font-semibold">Quantity</th>
                  <th scope="col" className="label-caps px-2 py-2 text-right font-semibold">Price</th>
                  <th scope="col" className="label-caps px-2 py-2 text-right font-semibold">Total</th>
                  <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <motion.tbody
                initial="hidden"
                animate="visible"
                variants={staggerParent(reduced, 0.05)}
              >
                <AnimatePresence>
                  {cart.map((item, index) => {
                    const unit = unitPriceOf(item);

                    return (
                      <motion.tr
                        key={item.id}
                        layout={!reduced}
                        variants={rowVariants(reduced)}
                        exit="exit"
                        className="transition-colors duration-150 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                        style={{ borderTop: index === 0 ? 'none' : '1px solid var(--hairline)' }}
                      >
                        <td className="tabular whitespace-nowrap px-4 py-2 align-middle text-sm font-semibold" style={{ color: 'var(--text-subtle)' }}>
                          {String(index + 1).padStart(2, '0')}
                        </td>
                        <td className="min-w-0 px-2 py-2 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className="product-img-panel h-12 w-12 shrink-0 overflow-hidden"
                              style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--hairline)', background: 'var(--surface-sunken)' }}
                            >
                              {item.imageURL ? (
                                <img
                                  src={item.imageURL}
                                  alt={item.name}
                                  loading="lazy"
                                  className="h-full w-full object-contain p-1"
                                />
                              ) : (
                                <ImagePlaceholder compact />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-semibold leading-snug" style={{ color: 'var(--text-strong)' }}>
                                {item.name}
                              </p>
                              {item.category && <p className="label-caps mt-0.5">{displayNameForCategory(item.category)}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-center align-middle">
                          {qtyControl(item)}
                        </td>
                        <td className="price tabular whitespace-nowrap px-2 py-2 text-right align-middle text-sm" style={{ color: 'var(--text-muted)' }}>
                          {inr(unit)}
                        </td>
                        <td className="price tabular whitespace-nowrap px-2 py-2 text-right align-middle text-sm font-bold" style={{ color: 'var(--ember-600)' }}>
                          {inr(unit * item.quantity)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right align-middle">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            aria-label={`Remove ${item.name} from cart`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full opacity-60 transition-all duration-150 hover:bg-vermilion-50 hover:opacity-100 dark:hover:bg-white/5"
                            style={{ color: 'var(--crimson-600)' }}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2.2} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </motion.tbody>
            </table>
            </div>

            {/* Mobile: compact structured rows — same data, same controls. */}
            <motion.ul
              initial="hidden"
              animate="visible"
              variants={staggerParent(reduced, 0.05)}
              className="list-none md:hidden"
            >
              <AnimatePresence>
                {cart.map((item, index) => {
                  const unit = unitPriceOf(item);

                  return (
                    <motion.li
                      key={item.id}
                      layout={!reduced}
                      variants={rowVariants(reduced)}
                      exit="exit"
                      className="px-3.5 py-3"
                      style={{ borderTop: index === 0 ? 'none' : '1px solid var(--hairline)' }}
                    >
                      <div className="flex gap-3">
                        <div
                          className="product-img-panel h-16 w-16 shrink-0 overflow-hidden"
                          style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--hairline)' }}
                        >
                          {item.imageURL ? (
                            <img
                              src={item.imageURL}
                              alt={item.name}
                              loading="lazy"
                              className="h-full w-full object-contain p-1.5"
                            />
                          ) : (
                            <ImagePlaceholder compact />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-semibold leading-snug" style={{ color: 'var(--text-strong)' }}>
                                {item.name}
                              </p>
                              {item.category && <p className="label-caps mt-0.5">{displayNameForCategory(item.category)}</p>}
                            </div>

                            <button
                              type="button"
                              onClick={() => removeFromCart(item.id)}
                              aria-label={`Remove ${item.name} from cart`}
                              className="-mr-2 -mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full opacity-70 transition-all duration-150 hover:bg-vermilion-50 hover:opacity-100 dark:hover:bg-white/5"
                              style={{ color: 'var(--crimson-600)' }}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={2.2} />
                            </button>
                          </div>

                          <p className="price tabular mt-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
                            {inr(unit)} each
                          </p>

                          <div className="mt-2 flex items-center justify-between gap-3">
                            {qtyControl(item)}
                            <p className="price tabular shrink-0 text-base font-bold" style={{ color: 'var(--ember-600)' }}>
                              {inr(unit * item.quantity)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>

            {/* Totals + actions footer — pinned to the card bottom. */}
            <div
              className="flex shrink-0 flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
              style={{ borderTop: '1px solid var(--hairline)' }}
            >
              <Link to="/products" className="btn-outline w-full shrink-0 sm:w-auto">
                Add More Products
              </Link>

              <div className="min-w-0 sm:text-right">
                <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide sm:justify-end" style={{ color: 'var(--text-muted)' }} aria-live="polite">
                  <ShoppingBag className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  <span className="tabular">{cart.length} {cart.length === 1 ? 'ITEM' : 'ITEMS'}</span>
                </p>
                <div className="mt-1.5 flex items-baseline justify-between gap-6 text-sm sm:justify-end">
                  <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                  <span className="price tabular font-semibold" style={{ color: 'var(--text-body)' }}>
                    {inr(getCartTotal())}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-6 sm:justify-end">
                  <span className="label-caps">Total</span>
                  <span className="price tabular text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>
                    {inr(getCartTotal())}
                  </span>
                </div>
                <Link to="/checkout" className="btn-primary btn-shine mt-3 w-full text-base sm:w-auto sm:min-w-[260px]" style={{ minHeight: 50 }}>
                  Proceed to Checkout
                  <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* ---- Mobile sticky checkout bar ----
          Always visible while scrolling so checkout never requires scrolling
          to the bottom of the line-item list. Desktop uses the fixed rail. */}
      <div className="fixed inset-x-0 bottom-0 z-sticky lg:hidden">
        <div
          className="glass-nav border-t"
          style={{ borderColor: 'var(--hairline)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div
            aria-hidden="true"
            className="h-1 origin-left"
            style={{ background: 'var(--grad-gold)', transform: `scaleX(${progress / 100})` }}
          />
          <div className="shell flex items-center gap-4 py-3">
            <div className="min-w-0">
              <p className="label-caps">
                {cart.length} {cart.length === 1 ? 'item' : 'items'}
              </p>
              <p
                className="price text-xl font-bold"
                style={{ color: 'var(--text-strong)' }}
              >
                {inr(total)}
              </p>
            </div>
            <Link to="/checkout" className="btn-primary btn-shine ml-auto shrink-0 px-5">
              Proceed to Checkout
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;
