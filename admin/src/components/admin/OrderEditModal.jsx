import { motion } from 'framer-motion';
import { Minus, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { modalVariants } from '../../lib/motion';

/**
 * Order editor.
 *
 * Purely presentational — every mutation is handed back to the Orders page,
 * which owns the Firestore write, the minimum-order rule and the totals maths.
 */

const lineTotal = (item) => (item.discountPrice || item.price) * item.quantity;

const OrderEditModal = ({
  order,
  orderCode,
  items,
  note,
  onNoteChange,
  showProductSearch,
  onToggleProductSearch,
  productSearchQuery,
  onProductSearchChange,
  filteredProducts,
  onAddProduct,
  onQuantityChange,
  onRemoveItem,
  onCancel,
  onSave,
}) => {
  const reduced = useReducedMotion();
  const newTotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const totalChanged = order.total !== newTotal;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.001 : 0.18 }}
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-edit-title"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={modalVariants(reduced)}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden"
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
        >
          <div className="min-w-0">
            <span className="label-caps">Edit order</span>
            <h2 id="order-edit-title" className="subsection-title tabular mt-1 truncate">
              #{orderCode}
            </h2>
            <p className="mt-1 truncate text-sm" style={{ color: 'var(--text-muted)' }}>
              {order.customer?.name} &middot; <span className="tabular">{order.customer?.phone}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close the order editor"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--hairline)] bg-[var(--surface-card)] text-[var(--text-body)] transition-colors hover:border-[var(--hairline-strong)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="card-title">Order items</h3>
            <button
              type="button"
              onClick={onToggleProductSearch}
              aria-expanded={showProductSearch}
              className="btn-outline min-h-[44px] px-4 text-sm"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add product
            </button>
          </div>

          {showProductSearch && (
            <div
              className="mt-4 rounded-[var(--r-md)] border p-3"
              style={{ borderColor: 'var(--hairline-strong)', background: 'var(--surface-sunken)' }}
            >
              <label htmlFor="order-edit-product-search" className="sr-only">
                Search products to add
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  aria-hidden="true"
                  style={{ color: 'var(--text-subtle)' }}
                />
                <input
                  id="order-edit-product-search"
                  type="text"
                  placeholder="Search products..."
                  value={productSearchQuery}
                  onChange={(e) => onProductSearchChange(e.target.value)}
                  className="input-premium pl-10"
                  autoFocus
                />
              </div>

              <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                {filteredProducts.slice(0, 10).map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => onAddProduct(product)}
                      className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[var(--r-sm)] border border-[var(--hairline)] bg-[var(--surface-card)] px-3 py-2 text-left transition-[background-color,border-color] hover:border-[rgba(195,58,20,0.32)] hover:bg-[var(--surface-sunken)]"
                    >
                      <span className="min-w-0 truncate text-sm font-medium" style={{ color: 'var(--text-strong)' }}>
                        {product.name}
                      </span>
                      <span className="tabular shrink-0 text-sm font-bold" style={{ color: 'var(--ember-600)' }}>
                        &#8377;{product.discountPrice || product.onlinePrice || product.price || 0}
                      </span>
                    </button>
                  </li>
                ))}
                {filteredProducts.length === 0 && (
                  <li className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    No products found
                  </li>
                )}
              </ul>
            </div>
          )}

          <ul className="mt-4 space-y-2">
            {items.map((item, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border p-3"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
              >
                <div className="min-w-[8rem] flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                    {item.name}
                  </p>
                  <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                    &#8377;{item.discountPrice || item.price} each
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onQuantityChange(index, -1)}
                    aria-label={`Decrease quantity of ${item.name}`}
                    className="grid h-11 w-11 place-items-center rounded-[var(--r-sm)] border border-[var(--hairline-strong)] bg-[var(--surface-card)] text-[var(--text-body)] transition-transform active:scale-[0.95]"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span
                    className="tabular w-9 text-center text-base font-bold"
                    style={{ color: 'var(--text-strong)' }}
                    aria-label={`Quantity ${item.quantity}`}
                  >
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuantityChange(index, 1)}
                    aria-label={`Increase quantity of ${item.name}`}
                    className="grid h-11 w-11 place-items-center rounded-[var(--r-sm)] border border-[var(--hairline-strong)] bg-[var(--surface-card)] text-[var(--text-body)] transition-transform active:scale-[0.95]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    aria-label={`Remove ${item.name} from the order`}
                    className="ml-1 grid h-11 w-11 place-items-center rounded-[var(--r-sm)] border transition-colors"
                    style={{
                      borderColor: 'rgba(203, 42, 42, 0.32)',
                      background: 'rgba(203, 42, 42, 0.10)',
                      color: '#E14848',
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <p
                  className="tabular ml-auto min-w-[5rem] text-right text-sm font-bold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  &#8377;{lineTotal(item).toFixed(0)}
                </p>
              </li>
            ))}
          </ul>

          {items.length === 0 && (
            <p className="py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No items in order. Add products to continue.
            </p>
          )}

          <div
            className="mt-5 rounded-[var(--r-md)] border p-4"
            style={{ borderColor: 'rgba(210, 166, 79, 0.40)', background: 'rgba(210, 166, 79, 0.12)' }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="label-caps">New total</span>
              <span className="tabular text-xl font-bold" style={{ color: 'var(--text-strong)' }}>
                &#8377;{newTotal.toFixed(0)}
              </span>
            </div>
            {totalChanged && (
              <p className="tabular mt-1 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                Original total &#8377;{order.total}
              </p>
            )}
          </div>

          <div className="mt-5">
            <label htmlFor="order-edit-note" className="block text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
              Internal note{' '}
              <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                (staff only &mdash; never shown to customer)
              </span>
            </label>
            <textarea
              id="order-edit-note"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Add a note for your team about this order..."
              rows={3}
              className="input-premium mt-2 resize-y"
            />
          </div>
        </div>

        <footer
          className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:px-6"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
        >
          <button type="button" onClick={onCancel} className="btn-outline flex-1">
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={items.length === 0} className="btn-primary flex-1">
            <Save className="h-4 w-4" aria-hidden="true" />
            Save changes
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
};

export default OrderEditModal;
