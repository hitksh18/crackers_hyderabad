import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Loader2,
  MapPin,
  Package,
  PackageOpen,
  PackageSearch,
  RefreshCw,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent } from '../lib/motion';
import { inr } from '../lib/currency';
import EmptyState from '../components/ui/EmptyState';
import Seo from '../components/Seo';

/* Five customer-facing milestones. A fresh order ("Pending") sits before the
   first milestone — shown as "order received, awaiting confirmation" with
   every step upcoming. "Completed" (counter sales) reads as Delivered. */
const timelineSteps = [
  { label: 'Confirmed', statuses: ['Confirmed'] },
  { label: 'Packed', statuses: ['Packed', 'Processing', 'In Transit'] },
  { label: 'Shipped', statuses: ['Shipped'] },
  { label: 'Out for Delivery', statuses: ['Out for Delivery'] },
  { label: 'Delivered', statuses: ['Delivered', 'Completed'] },
];

const stepIcons = [Check, Package, Truck, MapPin, PackageOpen];

const stepNotes = [
  'Order confirmed by our team',
  'Items packed for dispatch',
  'Handed over for transit',
  'On the way to your address',
  'Order delivered',
];

/* Index of the current milestone, or -1 when the order hasn't reached the
   tracker yet (Pending) or left it (Cancelled — rendered separately). */
const indexForStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'pending' || normalized === 'cancelled' || !normalized) return -1;
  const index = timelineSteps.findIndex((step) =>
    step.statuses.some((s) => s.toLowerCase() === normalized)
  );
  return index;
};

/** Disc treatment per state. Never colour alone — shape and label carry it too. */
const dotStyle = (state) => {
  if (state === 'current') {
    return {
      background: 'var(--grad-ember)',
      color: 'var(--white-soft)',
      border: '2px solid var(--gold-400)',
      boxShadow: 'var(--shadow-ember)',
    };
  }
  if (state === 'done') {
    return {
      background: 'var(--grad-maroon)',
      color: 'var(--white-soft)',
      border: '2px solid transparent',
    };
  }
  return {
    background: 'var(--surface-sunken)',
    color: 'var(--text-subtle)',
    border: '1.5px dashed var(--hairline-strong)',
  };
};

const TrackingTimeline = ({ activeIndex, isComplete = false }) => {
  const lastIndex = timelineSteps.length - 1;
  const finished = isComplete && activeIndex === lastIndex;

  const stateFor = (index) => {
    const isCurrent = !finished && index === activeIndex;
    const isDone = finished ? index <= activeIndex : index < activeIndex;
    return isCurrent ? 'current' : isDone ? 'done' : 'pending';
  };

  /* Rail fill for the desktop timeline: 0% before Confirmed, 100% at Delivered. */
  const fillPct = activeIndex < 0 ? 0 : Math.min(100, (activeIndex / lastIndex) * 100);

  return (
    <>
      {/* Mobile: vertical stepper. */}
      <ol className="relative sm:hidden">
        {timelineSteps.map((step, index) => {
          const Icon = stepIcons[index];
          const isLast = index === lastIndex;
          const state = stateFor(index);
          const isCurrent = state === 'current';
          const isDone = state === 'done';
          const reached = isCurrent || isDone;

          return (
            <li
              key={step.label}
              className="relative flex gap-4 pb-7 last:pb-0"
              aria-current={isCurrent ? 'step' : undefined}
            >
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[21px] top-12 w-0.5 rounded-full"
                  style={{ background: isDone ? 'var(--ember-600)' : 'var(--hairline-strong)' }}
                />
              )}

              <span
                aria-hidden="true"
                className="relative z-raised flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={dotStyle(state)}
              >
                {isCurrent ? (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--white-soft)' }} />
                ) : (
                  <Icon className="h-5 w-5" strokeWidth={2.1} />
                )}
                {isDone && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full"
                    style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)' }}
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3.4} style={{ color: 'var(--leaf-600)' }} />
                  </span>
                )}
              </span>

              <div className="min-w-0 pt-1">
                <p
                  className="card-title"
                  style={{ color: reached ? 'var(--text-strong)' : 'var(--text-muted)' }}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {stepNotes[index]}
                </p>
                <p
                  className="mt-1 text-[0.6875rem] font-bold uppercase tracking-[0.14em]"
                  style={{
                    color: isCurrent
                      ? 'var(--ember-600)'
                      : isDone
                        ? 'var(--leaf-600)'
                        : 'var(--text-subtle)',
                  }}
                >
                  {isCurrent ? 'Current status' : isDone ? 'Completed' : 'Not yet reached'}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop: horizontal milestone rail. */}
      <ol className="relative hidden sm:block" aria-label="Order progress">
        <div className="relative px-6 pt-1">
          <div
            aria-hidden="true"
            className="absolute left-10 right-10 top-[22px] h-0.5 rounded-full"
            style={{ background: 'var(--hairline-strong)' }}
          />
          <div
            aria-hidden="true"
            className="absolute left-10 top-[22px] h-0.5 rounded-full transition-all duration-500"
            style={{ width: `calc((100% - 5rem) * ${fillPct / 100})`, background: 'var(--ember-600)' }}
          />
          <div className="relative grid grid-cols-5">
            {timelineSteps.map((step, index) => {
              const state = stateFor(index);
              const isCurrent = state === 'current';
              const isDone = state === 'done';
              return (
                <li key={step.label} className="flex flex-col items-center text-center" aria-current={isCurrent ? 'step' : undefined}>
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-full"
                    style={dotStyle(state)}
                  >
                    {isDone ? (
                      <Check className="h-5 w-5" strokeWidth={2.6} />
                    ) : isCurrent ? (
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--white-soft)' }} />
                    ) : (
                      <span className="h-2 w-2 rounded-full" style={{ background: 'var(--text-subtle)' }} />
                    )}
                  </span>
                  <p
                    className="mt-2 text-xs font-bold leading-tight"
                    style={{ color: isCurrent || isDone ? 'var(--text-strong)' : 'var(--text-muted)' }}
                  >
                    {step.label}
                  </p>
                  <p
                    className="mt-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em]"
                    style={{
                      color: isCurrent ? 'var(--ember-600)' : isDone ? 'var(--leaf-600)' : 'var(--text-subtle)',
                    }}
                  >
                    {isCurrent ? 'Current' : isDone ? 'Done' : 'Pending'}
                  </p>
                </li>
              );
            })}
          </div>
        </div>
      </ol>
    </>
  );
};

/** Order date for the details card; the API sends an ISO string or null. */
const formatOrderDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

/**
 * Public order tracking: /track/:orderCode.
 *
 * Reads live from GET /api/orders/track/:orderCode on every visit, on manual
 * refresh and once a minute while visible — never hardcoded. The payload is
 * the minimal customer-safe subset (code, status, quantity, total, payment
 * method, note, dates — no names, no items, no tokens); the itemised invoice
 * stays behind the phone-gated /track-order page.
 */
const OrderTracking = () => {
  const { orderCode } = useParams();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState('loading');
  const [order, setOrder] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const code = String(orderCode || '').trim().replace(/^#/, '').toUpperCase();

  const load = useCallback(async (signal) => {
    setPhase('loading');
    try {
      const response = await fetch(`/api/orders/track/${encodeURIComponent(code)}`, {
        headers: { Accept: 'application/json' },
        signal,
      });
      if (response.status === 404 || response.status === 400) {
        setOrder(null);
        setPhase('not-found');
        return;
      }
      if (!response.ok) {
        setOrder(null);
        setPhase('error');
        return;
      }
      const data = await response.json();
      if (!data || !data.orderCode) {
        setOrder(null);
        setPhase('not-found');
        return;
      }
      setOrder(data);
      setPhase('ready');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      console.error('Order tracking lookup failed:', error);
      setOrder(null);
      setPhase('error');
    }
  }, [code]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  /* Live order-status tracking: re-read the status every minute while the tab
     is visible. This is status polling, not courier GPS. */
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const timer = window.setInterval(() => {
      if (!document.hidden) setRefreshKey((k) => k + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const isCancelled = order?.status === 'Cancelled';
  const activeIndex = order ? indexForStatus(order.status) : -1;
  const isReceived = phase === 'ready' && !!order && !isCancelled && activeIndex === -1;
  const isDelivered = order?.status === 'Delivered' || order?.status === 'Completed';

  return (
    <div className="min-h-screen">
      <Seo
        title={code ? `Track Order ${code} | Crackers Hyderabad` : 'Track Order | Crackers Hyderabad'}
        description="Follow your Crackers Hyderabad order from confirmation to doorstep delivery."
        canonical={code ? `/track/${code}` : '/track-order'}
        noindex
      />
      <div className="shell-narrow section-pad-sm">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold"
          style={{ color: 'var(--text-muted)', minHeight: '44px' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          Back to Home
        </Link>

        <motion.div variants={staggerParent(reduced, 0.07)} initial="hidden" animate="visible">
          <motion.div variants={revealVariants(reduced, 16)} className="text-center">
            <span className="section-eyebrow">Crackers Hyderabad</span>
            <h1 className="section-title mt-4" style={{ color: 'var(--text-strong)' }}>
              Order #{code || '—'}
            </h1>
          </motion.div>

          {phase === 'loading' && (
            <motion.div
              variants={revealVariants(reduced, 16)}
              className="panel-editorial glass-card mt-8 flex items-center justify-center gap-3 px-6 py-14"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2
                className="h-5 w-5 animate-spin"
                strokeWidth={2.2}
                style={{ color: 'var(--ember-600)' }}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                Loading your order...
              </span>
            </motion.div>
          )}

          {phase === 'not-found' && (
            <motion.div variants={revealVariants(reduced, 16)} className="mt-8">
              <EmptyState
                icon={PackageSearch}
                title="Order not found"
                description="We couldn't find an order with that code. Please check the code on your confirmation message and try again."
                action={
                  <Link to="/track-order" className="btn-primary w-full sm:w-auto">
                    <Package className="h-5 w-5" strokeWidth={2.2} />
                    Track Your Order
                  </Link>
                }
              />
            </motion.div>
          )}

          {phase === 'error' && (
            <motion.div variants={revealVariants(reduced, 16)} className="mt-8">
              <EmptyState
                icon={TriangleAlert}
                tone="alert"
                title="Something went wrong"
                description="Unable to load your order. Please try again."
                action={
                  <button
                    type="button"
                    onClick={() => setRefreshKey((k) => k + 1)}
                    className="btn-primary w-full sm:w-auto"
                  >
                    <RefreshCw className="h-5 w-5" strokeWidth={2.2} />
                    Try again
                  </button>
                }
              />
            </motion.div>
          )}

          {phase === 'ready' && order && (
            <>
              <motion.div
                variants={revealVariants(reduced, 16)}
                className="panel-editorial glass-card mt-8 p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="label-caps">Current status</p>
                  <button
                    type="button"
                    onClick={() => setRefreshKey((k) => k + 1)}
                    className="btn-outline inline-flex min-h-[44px] items-center gap-2 px-4 text-sm"
                  >
                    <RefreshCw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Refresh
                  </button>
                </div>
                <p
                  className="price mt-2 text-2xl font-bold"
                  style={{ color: isCancelled ? 'var(--crimson-600)' : 'var(--text-strong)' }}
                >
                  {isCancelled ? 'Cancelled' : isReceived ? 'Order received' : order.status}
                </p>
                <hr className="rule-gold my-5" />

                {isCancelled ? (
                  <div
                    className="flex items-start gap-3 p-4 text-sm"
                    style={{
                      background: 'rgba(203, 42, 42, 0.08)',
                      border: '1px solid rgba(203, 42, 42, 0.32)',
                      borderRadius: 'var(--r-md)',
                      color: 'var(--text-body)',
                    }}
                    role="status"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ background: 'var(--crimson-600)', color: '#FFFFFF' }}
                      aria-hidden="true"
                    >
                      <X className="h-4 w-4" strokeWidth={2.6} />
                    </span>
                    <span>
                      <strong style={{ color: 'var(--crimson-600)' }}>This order was cancelled.</strong>
                      <br />
                      If this looks wrong, please contact our team and quote order #{order.orderCode}.
                    </span>
                  </div>
                ) : (
                  <>
                    {isReceived && (
                      <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }} role="status">
                        We have received your order and our team will confirm it shortly.
                      </p>
                    )}
                    <TrackingTimeline activeIndex={activeIndex} isComplete={isDelivered} />
                  </>
                )}
              </motion.div>

              <motion.div
                variants={revealVariants(reduced, 16)}
                className="panel-editorial glass-card mt-6 p-5 sm:p-6"
                aria-label="Order details"
              >
                <h2 className="subsection-title" style={{ color: 'var(--text-strong)' }}>
                  Order Details
                </h2>
                <hr className="rule-gold my-4" />
                <dl>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="label-caps">Order ID</dt>
                    <dd
                      className="tabular text-sm font-bold"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      #{order.orderCode}
                    </dd>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <dt className="label-caps">Quantity</dt>
                    <dd
                      className="tabular text-sm font-semibold"
                      style={{ color: 'var(--text-body)' }}
                    >
                      {order.quantity} item{order.quantity === 1 ? '' : 's'}
                    </dd>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <dt className="label-caps">Total Bill</dt>
                    <dd
                      className="price text-2xl font-bold"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      {inr(order.total)}
                    </dd>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <dt className="label-caps">Payment</dt>
                    <dd
                      className="text-sm font-semibold"
                      style={{ color: 'var(--text-body)' }}
                    >
                      {order.paymentMethod || 'Cash on Delivery'}
                    </dd>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <dt className="label-caps">Order Date</dt>
                    <dd
                      className="tabular text-sm font-semibold"
                      style={{ color: 'var(--text-body)' }}
                    >
                      {formatOrderDate(order.createdAt)}
                    </dd>
                  </div>
                </dl>
              </motion.div>

              {order.note && (
                <motion.div
                  variants={revealVariants(reduced, 16)}
                  className="panel-editorial glass-card mt-6 p-5 sm:p-6"
                  aria-label="Order note"
                >
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
                    <strong style={{ color: 'var(--text-strong)' }}>Note: </strong>
                    {order.note}
                  </p>
                </motion.div>
              )}

              <motion.div variants={revealVariants(reduced, 16)} className="mt-6">
                <Link
                  to={`/track-order?id=${encodeURIComponent(code)}`}
                  className="btn-primary w-full sm:w-auto"
                >
                  <Package className="h-5 w-5" strokeWidth={2.2} />
                  Download Invoice
                </Link>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Verify your phone number on the next page to download the detailed
                  itemised invoice for order #{order.orderCode}.
                </p>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default OrderTracking;
