import { motion } from 'framer-motion';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { DURATION, EASE_OUT_EXPO, EASE_IN_SOFT } from '../../lib/motion';

const rowVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : -6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    x: reduced ? 0 : -16,
    transition: { duration: reduced ? 0.001 : DURATION.fast, ease: EASE_IN_SOFT },
  },
});

/**
 * One compact line of the current bill.
 *
 * Divider-separated row (not a card): name + remove on top, unit price below,
 * stepper + line total pinned right. The unit price uses the same offline
 * fallback chain as the totals so the row and the invoice can never disagree.
 */
const BillLineRow = ({ item, index, onStep, onSetQuantity, onRemove, reduced }) => {
  const unitPrice =
    item.offlineDiscountPrice ||
    item.offlineMRP ||
    item.offlinePrice ||
    item.onlinePrice ||
    0;

  return (
    <motion.div
      variants={rowVariants(reduced)}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="pos-bill-row flex items-center gap-2 px-1 py-2"
    >
      <span
        className="tabular w-6 shrink-0 text-[0.6875rem] font-bold"
        style={{ color: 'var(--text-subtle)' }}
        aria-hidden="true"
      >
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold leading-snug" style={{ color: 'var(--text-strong)' }}>
            {item.name}
          </p>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.name} from bill`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] transition-colors hover:bg-[color:var(--surface-raised)]"
            style={{ color: 'var(--text-subtle)' }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="tabular mt-0.5 text-[0.6875rem]" style={{ color: 'var(--text-muted)' }}>
          ₹{Number(unitPrice).toLocaleString('en-IN')} each
          {item.offlineDiscountPrice && (
            <span className="ml-1.5 line-through" style={{ color: 'var(--text-subtle)' }}>
              ₹{Number(item.offlineMRP).toLocaleString('en-IN')}
            </span>
          )}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onStep(item.id, -1)}
              aria-label={`Decrease quantity of ${item.name}`}
              className="pos-qty-btn"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <label htmlFor={`qty-${item.id}`} className="sr-only">
              Quantity of {item.name}
            </label>
            <input
              id={`qty-${item.id}`}
              type="number"
              min="1"
              value={item.quantity}
              onChange={(e) => onSetQuantity(item.id, e.target.value)}
              className="tabular h-7 w-12 rounded-[7px] border border-[color:var(--hairline-strong)] bg-[color:var(--surface-sunken)] text-center text-[0.8125rem] font-bold text-[color:var(--text-strong)]"
            />
            <button
              type="button"
              onClick={() => onStep(item.id, 1)}
              aria-label={`Increase quantity of ${item.name}`}
              className="pos-qty-btn"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <p
            className="tabular shrink-0 text-[0.8125rem] font-bold"
            style={{ color: 'var(--text-strong)' }}
          >
            ₹{(unitPrice * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default BillLineRow;
