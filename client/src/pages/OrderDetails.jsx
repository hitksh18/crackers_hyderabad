import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Link, useParams } from 'react-router-dom';
import Seo from '../components/Seo';
import {
  ArrowLeft,
  Package,
  Check,
  Loader2,
  X,
  Download,
  RefreshCw,
  TriangleAlert,
  PackageSearch,
  CreditCard,
  MapPin,
  XCircle,
} from 'lucide-react';
import { generateInvoicePDFBlob } from '../utils/pdfGenerator';
import toast from '../utils/toast';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent } from '../lib/motion';
import { Skeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { getDisplayOrderId } from '../lib/orderId';
import { inr } from '../lib/currency';
import { fetchOrderThumbnails } from '../lib/orderThumbs';

/* Six customer-facing milestones. `statuses` lists every stored status at or
   past that milestone (server vocabulary + legacy spellings). "Pending"
   sits before the first step; "Cancelled" renders its own terminal card. */
const STEPS = [
  { label: 'Order Placed', statuses: [] },
  { label: 'Order Confirmed', statuses: ['confirmed', 'processing', 'packed', 'shipped', 'out for delivery', 'in transit', 'delivered', 'completed'] },
  { label: 'Processing', statuses: ['processing', 'packed', 'shipped', 'out for delivery', 'in transit', 'delivered', 'completed'] },
  { label: 'Packed', statuses: ['packed', 'shipped', 'out for delivery', 'in transit', 'delivered', 'completed'] },
  { label: 'Shipped', statuses: ['shipped', 'out for delivery', 'in transit', 'delivered', 'completed'] },
  { label: 'Delivered', statuses: ['delivered', 'completed'] },
];

const stepIndexFor = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'cancelled') return -1;
  if (!normalized || normalized === 'pending') return 0;
  let index = 0;
  STEPS.forEach((step, i) => {
    if (step.statuses.includes(normalized)) index = i;
  });
  return index;
};

const fmtDate = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return null;
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
};

/* ---- Tracking timeline ----
   Desktop (sm+): compact horizontal progress strip — dots on a single line
   with centered labels, progress fill up to the current step. Mobile: the
   same steps as a tight vertical stack (no page-wide horizontal scroll).
   Cancelled orders keep a compact terminal stack. All status logic
   (done/current/pending) is unchanged. */
const TrackingTimeline = ({ status, createdAt, cancelledAt }) => {
  const normalized = String(status || '').trim().toLowerCase();
  const cancelled = normalized === 'cancelled';
  const activeIndex = stepIndexFor(status);
  const delivered = normalized === 'delivered' || normalized === 'completed';

  const stateFor = (index) => {
    if (index < activeIndex) return 'done';
    if (index === activeIndex) return delivered ? 'done' : 'current';
    return 'pending';
  };

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

  const stepDate = (index) => (index === 0 ? fmtDate(createdAt) : null);

  const stepSub = (index, state) => {
    if (state === 'current') return 'Current';
    if (state === 'done' && delivered && index === STEPS.length - 1) return 'Delivered';
    return null;
  };

  const subColor = (index, state) => {
    if (state === 'current') return 'var(--ember-600)';
    if (state === 'done' && delivered && index === STEPS.length - 1) return 'var(--leaf-600)';
    return 'var(--text-muted)';
  };

  const dotNode = (state, size = 'h-7 w-7', icon = 'h-3.5 w-3.5') => (
    <span
      aria-hidden="true"
      className={`relative z-raised flex ${size} shrink-0 items-center justify-center rounded-full`}
      style={dotStyle(state)}
    >
      {state === 'done' ? (
        <Check className={icon} strokeWidth={2.8} />
      ) : state === 'current' ? (
        <span className="h-2 w-2 rounded-full" style={{ background: 'var(--white-soft)' }} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--text-subtle)' }} />
      )}
    </span>
  );

  if (cancelled) {
    return (
      <ol className="relative">
        {[0, 1].map((index) => (
          <li key={STEPS[index].label} className="relative flex gap-3 pb-3">
            <span
              aria-hidden="true"
              className="relative z-raised flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={dotStyle('done')}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: 'var(--text-strong)' }}>{STEPS[index].label}</p>
              {stepDate(index) && (
                <p className="tabular mt-px text-[11px]" style={{ color: 'var(--text-muted)' }}>{stepDate(index)}</p>
              )}
            </div>
          </li>
        ))}
        <li className="relative flex gap-3" aria-current="step">
          <span
            aria-hidden="true"
            className="relative z-raised flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--crimson-600)', color: '#FFFFFF', border: '2px solid transparent' }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: 'var(--crimson-600)' }}>Cancelled</p>
            {fmtDate(cancelledAt) && (
              <p className="tabular mt-px text-[11px]" style={{ color: 'var(--text-muted)' }}>{fmtDate(cancelledAt)}</p>
            )}
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--crimson-600)' }}>
              Current status
            </p>
          </div>
        </li>
      </ol>
    );
  }

  return (
    <>
      {/* Horizontal progress strip (sm and up). */}
      <ol aria-label="Order progress" className="relative hidden sm:flex">
        {/* Track: dot centers sit at 1/12 and 11/12 of the row. */}
        <span
          aria-hidden="true"
          className="absolute top-[13px] h-0.5 rounded-full"
          style={{ left: 'calc(100% / 12)', right: 'calc(100% / 12)', background: 'var(--hairline-strong)' }}
        />
        <span
          aria-hidden="true"
          className="absolute top-[13px] h-0.5 rounded-full"
          style={{
            left: 'calc(100% / 12)',
            width: `calc(${(Math.max(0, activeIndex) / (STEPS.length - 1)) * 100}% * 10 / 12)`,
            background: 'var(--ember-600)',
          }}
        />
        {STEPS.map((step, index) => {
          const state = stateFor(index);
          const sub = stepSub(index, state);
          return (
            <li
              key={step.label}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 px-1 text-center"
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {dotNode(state)}
              <p
                className="text-[11px] font-semibold leading-tight"
                style={{ color: state === 'pending' ? 'var(--text-muted)' : 'var(--text-strong)' }}
              >
                {step.label}
              </p>
              {index === 0 && stepDate(0) && (
                <p className="tabular -mt-1 text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>{stepDate(0)}</p>
              )}
              {sub && (
                <p
                  className="tabular text-[10px] font-bold uppercase leading-tight tracking-[0.1em]"
                  style={{ color: subColor(index, state) }}
                >
                  {sub}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {/* Compact vertical stack (phones — no horizontal overflow). */}
      <ol aria-label="Order progress" className="relative sm:hidden">
        {STEPS.map((step, index) => {
          const state = stateFor(index);
          const isLast = index === STEPS.length - 1;
          const sub = stepSub(index, state);
          return (
            <li
              key={step.label}
              className={`relative flex gap-3 ${isLast ? '' : 'pb-3'}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-[13px] top-7 w-0.5 rounded-full"
                  style={{ background: state === 'done' ? 'var(--ember-600)' : 'var(--hairline-strong)' }}
                />
              )}
              {dotNode(state)}
              <div className="min-w-0">
                <p
                  className="text-[13px] font-semibold"
                  style={{ color: state === 'pending' ? 'var(--text-muted)' : 'var(--text-strong)' }}
                >
                  {step.label}
                </p>
                {index === 0 && stepDate(0) && (
                  <p className="tabular mt-px text-[11px]" style={{ color: 'var(--text-muted)' }}>{stepDate(0)}</p>
                )}
                {sub && (
                  <p
                    className="tabular mt-px text-[10px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: subColor(index, state) }}
                  >
                    {sub}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
};

const DetailsSkeleton = () => (
  <div className="mt-6 space-y-4" aria-hidden="true">
    <div className="panel-editorial glass-card p-5">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="mt-2 h-3.5 w-36" />
    </div>
    <div className="panel-editorial glass-card p-5">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10" rounded="999px" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        ))}
      </div>
    </div>
    <div className="panel-editorial glass-card p-5">
      <Skeleton className="h-4 w-36" />
      <div className="mt-4 space-y-3">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  </div>
);

/**
 * Dedicated order page — /my-orders/:orderId.
 *
 * Reads ONLY the selected order (one targeted doc read; the thumbnail helper
 * adds at most one bounded products query per 10 unique item ids). All
 * amounts come straight from the saved order document — never recalculated —
 * so admin order edits (items, discount, total) are reflected on load.
 */
const OrderDetails = () => {
  const { orderId } = useParams();
  const { user } = useAuth();
  const reduced = useReducedMotion();

  const [phase, setPhase] = useState('loading');
  const [order, setOrder] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [downloading, setDownloading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  /* Same ownership predicate the list + rules use — uid, then verified
     email / userEmail (Firestore `orders.get` is public by design for
     guest tracking, so the render gate lives here). */
  const isOwner = useCallback((docData) => {
    if (!user) return false;
    const ownerUid = docData?.userId;
    if (ownerUid && ownerUid === user.uid) return true;
    const email = String(docData?.customer?.email || '').toLowerCase();
    const userEmail = String(docData?.userEmail || '').toLowerCase();
    const mine = String(user.email || '').toLowerCase();
    if (mine && (email === mine || userEmail === mine)) return true;
    return false;
  }, [user]);

  useEffect(() => {
    if (!user || !orderId) return undefined;
    let cancelled = false;
    setPhase('loading');

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'orders', orderId));
        if (cancelled) return;
        if (!snap.exists()) {
          setOrder(null);
          setPhase('not-found');
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        if (!isOwner(data)) {
          setOrder(null);
          setPhase('not-found');
          return;
        }
        setOrder(data);
        setPhase('ready');
        fetchOrderThumbnails((data.items || []).map((it) => it.id))
          .then((map) => { if (!cancelled) setThumbs(map); })
          .catch(() => {});
      } catch (error) {
        if (cancelled) return;
        console.error('Order details load failed:', error?.message || error);
        setOrder(null);
        setPhase('error');
      }
    })();

    return () => { cancelled = true; };
  }, [user, orderId, isOwner, retryKey]);

  const downloadInvoice = async () => {
    if (!order || downloading) return;
    setDownloading(true);
    try {
      /* Order passes through untouched — the generator reads the canonical
         shortCode itself; order.id stays internal (keys only). */
      const pdfBlob = generateInvoicePDFBlob({ ...order, items: order.items }, order.customer);
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${getDisplayOrderId(order) || 'ORDER'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Invoice downloaded successfully!');
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error('Failed to generate invoice');
    } finally {
      setDownloading(false);
    }
  };

  const statusLower = String(order?.status || '').toLowerCase();
  const canCancel = phase === 'ready' && statusLower !== 'delivered' && statusLower !== 'cancelled' && statusLower !== 'completed';

  const cancelOrder = async () => {
    if (!order || !canCancel || cancelling) return;
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    setCancelling(true);
    try {
      /* Same server call the list used — ownership re-checked server-side and
         exactly one cancellation email fires. */
      const token = await user.getIdToken();
      const response = await fetch('/api/orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, status: 'Cancelled' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to cancel order');
      setOrder((o) => ({ ...o, status: 'Cancelled' }));
      toast.success('Order cancelled successfully');
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error(error.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  const code = getDisplayOrderId(order) || 'N/A';
  const items = order?.items || [];
  const itemCount = items.reduce((n, it) => n + (Number(it.quantity) || 1), 0);
  const coupon = order?.coupon && typeof order.coupon === 'object' ? order.coupon : null;
  const discountValue = Number(order?.discount) || 0;
  const couponLabel = coupon
    ? [coupon.code, coupon.percent ? `${coupon.percent}% OFF` : null].filter(Boolean).join(' · ')
    : null;
  const shippingRaw = order?.shipping ?? order?.shippingFee ?? order?.deliveryFee;
  const hasShipping = shippingRaw !== null && shippingRaw !== undefined && Number.isFinite(Number(shippingRaw));
  const paymentMethod = order?.paymentMode || order?.paymentStatus || 'Cash on Delivery';

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <Seo title={code !== 'N/A' ? `Order #${code} | Crackers Hyderabad` : 'Order | Crackers Hyderabad'} noindex />
      <div className="mx-auto w-full py-6" style={{ maxWidth: 1440, paddingInline: 'clamp(16px, 4vw, 40px)' }}>
        <Link
          to="/my-orders"
          className="inline-flex min-h-[40px] items-center gap-2 text-sm font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          Back to My Orders
        </Link>

        {phase === 'loading' && <DetailsSkeleton />}

        {phase === 'not-found' && (
          <div className="mt-8">
            <EmptyState
              icon={PackageSearch}
              title="Order not found"
              description="We couldn't find this order on your account."
              action={<Link to="/my-orders" className="btn-primary">Back to My Orders</Link>}
            />
          </div>
        )}

        {phase === 'error' && (
          <div className="mt-8">
            <EmptyState
              icon={TriangleAlert}
              tone="alert"
              title="Unable to load this order"
              description="Something went wrong while loading your order. Please try again."
              action={(
                <button type="button" onClick={() => setRetryKey((k) => k + 1)} className="btn-primary">
                  <RefreshCw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  Try Again
                </button>
              )}
            />
          </div>
        )}

        {phase === 'ready' && order && (
          <motion.div initial="hidden" animate="visible" variants={staggerParent(reduced, 0.06)}>
            {/* ---- Compact header ---- */}
            <motion.header variants={revealVariants(reduced, 14)} className="mt-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="section-eyebrow">Order</p>
                  <h1 className="mt-1 text-2xl font-bold sm:text-[28px]" style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}>
                    #<span className="tabular">{code}</span>
                  </h1>
                  <p className="tabular mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {fmtDateTime(order.createdAt) || '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadInvoice}
                  disabled={downloading}
                  aria-busy={downloading}
                  className="btn-outline inline-flex items-center gap-2 px-4 text-sm"
                  style={{ minHeight: 42 }}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  )}
                  Download Invoice
                </button>
              </div>
            </motion.header>

            <div className="mt-4 flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start lg:grid-cols-[minmax(0,1.9fr)_minmax(300px,0.8fr)] lg:gap-5">
              {/* Mobile reading order: tracking → summary → items → info →
                  actions. Tablet: tracking then items full width, summary +
                  info side by side. Desktop: tracking full width, items left,
                  summary + info + actions right (explicit placement). */}
              <motion.section
                variants={revealVariants(reduced, 14)}
                className="order-1 panel-editorial glass-card p-4 sm:p-5 md:col-span-2 lg:col-span-2 lg:row-start-1"
                aria-label="Order tracking"
              >
                <h2 className="label-caps">Order Tracking</h2>
                <hr className="rule-gold my-3" />
                <TrackingTimeline
                  status={order.status}
                  createdAt={order.createdAt}
                  cancelledAt={order.cancelledAt}
                />
              </motion.section>

              <motion.section
                variants={revealVariants(reduced, 14)}
                className="order-3 panel-editorial glass-card p-4 sm:p-5 md:col-span-2 md:row-start-2 lg:col-span-1 lg:col-start-1 lg:row-start-2"
                aria-label="Items in your order"
              >
                <h2 className="label-caps">
                  Items in Your Order · <span className="tabular">{itemCount}</span>
                </h2>
                <hr className="rule-gold my-3" />
                <div
                  aria-hidden="true"
                  className="mb-1 hidden grid-cols-[64px_minmax(0,1fr)_72px_96px] items-center gap-3 px-1 pb-1 sm:grid"
                >
                  <span />
                  <span className="label-caps">Product</span>
                  <span className="label-caps text-center">Qty</span>
                  <span className="label-caps text-right">Price</span>
                </div>
                <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                    {items.map((item, i) => {
                      const unit = Number(item.discountPrice || item.price || 0);
                      const line = unit * (Number(item.quantity) || 1);
                      const url = thumbs[String(item.id)];
                      return (
                        <li key={`${item.id}-${i}`} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 sm:grid-cols-[64px_minmax(0,1fr)_72px_96px]">
                          <span
                            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] sm:h-16 sm:w-16"
                            style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
                            aria-hidden="true"
                          >
                            {url ? (
                              <img src={url} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
                            ) : (
                              <Package className="h-4 w-4" style={{ color: 'var(--text-subtle)' }} />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                              {item.name}
                            </p>
                            <p className="tabular mt-0.5 text-xs sm:hidden" style={{ color: 'var(--text-muted)' }}>
                              Qty {item.quantity} × {inr(unit)}
                            </p>
                          </div>
                          <p className="tabular hidden text-center text-sm font-semibold sm:block" style={{ color: 'var(--text-body)' }}>
                            {item.quantity}
                          </p>
                          <p className="price shrink-0 text-sm font-bold" style={{ color: 'var(--text-strong)', textAlign: 'right' }}>
                            {inr(line)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
              </motion.section>

              <motion.section
                variants={revealVariants(reduced, 14)}
                className="order-2 panel-editorial glass-card p-4 sm:p-5 md:col-start-1 md:row-start-3 lg:col-start-2 lg:row-start-2"
                aria-label="Order summary"
              >
                <h2 className="label-caps">Order Summary</h2>
                <hr className="rule-gold my-3" />
                {/* Saved server-side values only — never recalculated. */}
                <dl className="space-y-2 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt style={{ color: 'var(--text-muted)' }}>Subtotal</dt>
                      <dd className="tabular font-semibold" style={{ color: 'var(--text-body)' }}>
                        {inr(order.subtotal ?? 0)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt style={{ color: 'var(--text-muted)' }}>
                        Discount{couponLabel ? <span className="block text-xs">{couponLabel}</span> : null}
                      </dt>
                      <dd
                        className="tabular font-semibold"
                        style={{ color: discountValue > 0 ? 'var(--leaf-600)' : 'var(--text-subtle)' }}
                      >
                        {discountValue > 0 ? `-${inr(discountValue)}` : inr(0)}
                      </dd>
                    </div>
                    {hasShipping ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt style={{ color: 'var(--text-muted)' }}>Shipping</dt>
                        <dd className="tabular font-semibold" style={{ color: 'var(--text-body)' }}>
                          {inr(shippingRaw)}
                        </dd>
                      </div>
                    ) : (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt style={{ color: 'var(--text-muted)' }}>Shipping</dt>
                        <dd className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                          Free
                        </dd>
                      </div>
                    )}
                    <div
                      className="mt-2 flex items-baseline justify-between gap-3 pt-3"
                      style={{ borderTop: '1px solid var(--hairline)' }}
                    >
                      <dt className="font-bold" style={{ color: 'var(--text-strong)' }}>Total</dt>
                      <dd className="price text-xl font-bold" style={{ color: 'var(--text-strong)' }}>
                        {inr(order.total)}
                      </dd>
                    </div>
                  </dl>
                </motion.section>

                <motion.section
                  variants={revealVariants(reduced, 14)}
                  className="order-4 panel-editorial glass-card p-4 sm:p-5 md:col-start-2 md:row-start-3 lg:col-span-1 lg:col-start-2 lg:row-start-2"
                  aria-label="Order information"
                >
                  <h2 className="label-caps">Order Information</h2>
                  <hr className="rule-gold my-3" />
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                        <Package className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        Order ID
                      </dt>
                      <dd className="tabular font-semibold" style={{ color: 'var(--text-strong)' }}>{code}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt style={{ color: 'var(--text-muted)' }}>Order date</dt>
                      <dd className="tabular font-semibold" style={{ color: 'var(--text-body)' }}>
                        {fmtDateTime(order.createdAt) || '—'}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                        <CreditCard className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        Payment
                      </dt>
                      <dd className="font-semibold" style={{ color: 'var(--text-body)' }}>{paymentMethod}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt style={{ color: 'var(--text-muted)' }}>Customer</dt>
                      <dd className="min-w-0 truncate font-semibold" style={{ color: 'var(--text-body)' }}>
                        {order.customer?.name || '—'}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt style={{ color: 'var(--text-muted)' }}>Phone</dt>
                      <dd className="tabular font-semibold" style={{ color: 'var(--text-body)' }}>
                        {order.customer?.phone || '—'}
                      </dd>
                    </div>
                    {order.customer?.address && (
                      <div className="flex justify-between gap-3">
                        <dt className="flex shrink-0 items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                          <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                          Delivery address
                        </dt>
                        <dd className="min-w-0 text-right text-xs" style={{ color: 'var(--text-body)' }}>
                          {order.customer.address}
                          {order.customer.city ? `, ${order.customer.city}` : ''}
                          {order.customer.pincode ? ` - ${order.customer.pincode}` : ''}
                        </dd>
                      </div>
                    )}
                  </dl>
                </motion.section>

                {canCancel && (
                  <motion.div variants={revealVariants(reduced, 14)} className="order-5 md:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-3">
                    <button
                      type="button"
                      onClick={cancelOrder}
                      disabled={cancelling}
                      aria-busy={cancelling}
                      className="btn-outline w-full"
                      style={{ minHeight: 44, color: 'var(--crimson-600)', borderColor: 'rgba(203, 42, 42, 0.4)' }}
                    >
                      {cancelling ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                          Cancelling...
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                          Cancel Order
                        </>
                      )}
                    </button>
                  </motion.div>
                )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default OrderDetails;
