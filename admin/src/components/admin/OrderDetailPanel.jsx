import { motion } from 'framer-motion';
import { IndianRupee, StickyNote, Truck, User, MapPin, Navigation } from 'lucide-react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { revealVariants } from '../../lib/motion';
import { pinOf, navUrlFor, formatCoords, QR_LABEL } from '../../utils/deliveryLocation';
import { qrSvgDataUrl } from '../../utils/qr';

/**
 * Everything about one order that does not belong in the dense row:
 * customer, delivery, the full item ledger, discount and the internal note.
 *
 * Nothing here is new data — it is the same fields the old stacked card
 * printed, reorganised into three readable columns.
 */

const Block = ({ icon: Icon, title, children }) => (
  <section className="min-w-0">
    <h4 className="label-caps flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.2} />
      {title}
    </h4>
    <div className="mt-2.5 space-y-1">{children}</div>
  </section>
);

const Line = ({ label, value, strong = false }) => {
  if (value === null || value === undefined || value === '') return null;

  return (
    <p className="text-sm leading-relaxed" style={{ color: strong ? 'var(--text-strong)' : 'var(--text-muted)' }}>
      {label && (
        <span className="font-semibold" style={{ color: 'var(--text-body)' }}>
          {label}:{' '}
        </span>
      )}
      {value}
    </p>
  );
};

const OrderDetailPanel = ({ order }) => {
  const reduced = useReducedMotion();
  const delivery = order.delivery;
  const pin = pinOf(order);
  const navUrl = navUrlFor(pin);
  /* Rendered from the stored coordinates every time the panel opens, so it
     cannot drift from the invoice's copy — both read the same field. */
  const qr = pin ? qrSvgDataUrl(navUrl) : '';

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={revealVariants(reduced, 8)}
      className="grid gap-6 rounded-[var(--r-md)] border p-4 lg:grid-cols-3"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
    >
      <div className="min-w-0 space-y-6">
        <Block icon={User} title="Customer details">
          <Line value={order.customer?.name} strong />
          <p className="tabular text-sm" style={{ color: 'var(--text-muted)' }}>
            {order.customer?.phone}
          </p>
          <Line value={order.customer?.email} />
          {order.customer?.address && (
            <Line value={`${order.customer?.address}, ${order.customer?.city} - ${order.customer?.pincode}`} />
          )}
          <Line label="Payment" value={order.paymentMode} />
        </Block>

        {delivery && (
          <Block icon={Truck} title="Delivery address">
            {delivery.sameAsBilling ? (
              <Line value="Same as billing address" />
            ) : (
              <>
                <Line label="Flat/Door No" value={delivery.flatNo} />
                <Line label="Street" value={delivery.streetNo} />
                <Line label="Area" value={delivery.area} />
                <Line value={`${delivery.city}${delivery.state ? `, ${delivery.state}` : ''} - ${delivery.pincode}`} />
                <Line label="Alt Phone" value={delivery.altPhone} />
              </>
            )}
          </Block>
        )}

        {pin && (
          <Block icon={MapPin} title="Delivery location pin">
            <div className="flex flex-wrap items-start gap-3">
              <img
                src={qr}
                alt={QR_LABEL}
                width={104}
                height={104}
                className="shrink-0 rounded-[var(--r-sm)] border"
                style={{ borderColor: 'var(--hairline)', background: '#FFFFFF' }}
              />
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                  {QR_LABEL}
                </p>
                <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatCoords(pin)}
                </p>
                {/* The same link the QR carries, for staff already at a screen. */}
                <a
                  href={navUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline min-h-[36px] px-3 text-xs"
                >
                  <Navigation className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
                  Navigate
                </a>
              </div>
            </div>
          </Block>
        )}
      </div>

      <Block icon={IndianRupee} title={`Order items (${order.items?.length || 0})`}>
        <ul className="divide-y [&>li]:border-[color:var(--hairline)]">
          {order.items?.map((item, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate text-sm" style={{ color: 'var(--text-body)' }}>
                {item.name}
                <span className="tabular" style={{ color: 'var(--text-subtle)' }}>
                  {' '}
                  &times; {item.quantity}
                </span>
              </span>
              <span className="tabular shrink-0 text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                &#8377;{((item.discountPrice || item.price) * item.quantity).toLocaleString('en-IN')}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <div className="min-w-0 space-y-4">
        <div
          className="rounded-[var(--r-md)] border p-3"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
        >
          <p className="label-caps">Order total</p>
          <p className="tabular mt-1 text-xl font-semibold" style={{ color: 'var(--text-strong)' }}>
            &#8377;{(order.total || 0).toLocaleString('en-IN')}
          </p>
          {order.discount > 0 && (
            <p className="tabular mt-1 text-sm font-semibold" style={{ color: '#3E9A6B' }}>
              Discount applied &#8377;{order.discount}
            </p>
          )}
        </div>

        {order.adminNote && (
          <div
            className="rounded-[var(--r-md)] border p-3"
            style={{ borderColor: 'rgba(210, 166, 79, 0.40)', background: 'rgba(210, 166, 79, 0.12)' }}
          >
            <p className="label-caps flex items-center gap-1.5" style={{ color: 'var(--gold-600)' }}>
              <StickyNote className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.2} />
              Internal note
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm" style={{ color: 'var(--text-body)' }}>
              {order.adminNote}
            </p>
            {order.adminNoteUpdatedAt?.toDate && (
              <p className="tabular mt-1.5 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {order.adminNoteUpdatedAt.toDate().toLocaleString()}
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default OrderDetailPanel;
