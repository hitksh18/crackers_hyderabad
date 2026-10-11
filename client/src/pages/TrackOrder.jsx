import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from '../utils/toast';
import {
  Search,
  ArrowLeft,
  Package,
  Check,
  X,
  Truck,
  MapPin,
  PackageOpen,
  PackageSearch,
  ClipboardCheck,
  Copy,
  Download,
  Loader2,
  TriangleAlert,
  Home,
  ShoppingBag,
} from 'lucide-react';
import { downloadInvoicePDF } from '../utils/pdfGenerator';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent, DURATION, EASE_OUT_EXPO } from '../lib/motion';
import EmptyState from '../components/ui/EmptyState';
import Seo from '../components/Seo';
import { orderIdOf, normalizeOrderIdInput, orderIdCarriesOwnEntropy } from '../lib/orderId';

/* The timeline begins at Confirmed — successfully placed orders are born
   confirmed, so there is no Pending step. Legacy Pending orders (if any are
   still in the database) resolve to the first step. */
const statusSteps = ['Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];

const stepIcons = [Check, Package, Truck, MapPin, PackageOpen];

/* What each step means in plain words, so the timeline reads without colour. */
const stepNotes = [
  'Order confirmed by our team',
  'Items packed for dispatch',
  'Handed over for transit',
  'On the way to your address',
  'Order delivered',
];

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

/**
 * `isComplete` is only true when the order really sits on the terminal status,
 * so the last step reads as finished rather than merely in progress. Every
 * other status keeps the original "current step is not yet done" behaviour.
 */
const OrderTimeline = ({ activeIndex, reduced, isComplete = false }) => {
  const lastIndex = statusSteps.length - 1;
  const finished = isComplete && activeIndex === lastIndex;

  return (
  <ol className="relative">
    {statusSteps.map((step, index) => {
      const Icon = stepIcons[index];
      const isLast = index === lastIndex;
      const isCurrent = !finished && index === activeIndex;
      const isDone = finished ? index <= activeIndex : index < activeIndex;
      const state = isCurrent ? 'current' : isDone ? 'done' : 'pending';
      const reached = isCurrent || isDone;

      return (
        <li
          key={step}
          className="relative flex gap-4 pb-7 last:pb-0"
          aria-current={isCurrent ? 'step' : undefined}
        >
          {!isLast && (
            <>
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-[21px] top-12 w-0.5 rounded-full"
                style={{ background: 'var(--hairline-strong)' }}
              />
              <motion.span
                aria-hidden="true"
                className="absolute bottom-0 left-[21px] top-12 w-0.5 origin-top rounded-full"
                style={{ background: 'var(--grad-ember)' }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: isDone ? 1 : 0 }}
                transition={
                  reduced
                    ? { duration: 0.001 }
                    : { duration: DURATION.slow, delay: 0.1 + index * 0.09, ease: EASE_OUT_EXPO }
                }
              />
            </>
          )}

          <span
            aria-hidden="true"
            className="relative z-raised flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={dotStyle(state)}
          >
            <Icon className="h-5 w-5" strokeWidth={2.1} />
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
              {step}
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
  );
};

const InfoPanel = ({ title, children }) => (
  <div
    className="rounded-[var(--r-lg)] p-4"
    style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)' }}
  >
    <p className="label-caps mb-2">{title}</p>
    {children}
  </div>
);

/**
 * Formats whatever the order carries as its placed-at date.
 * Admin screens read Firestore directly and get a Timestamp; this page gets an
 * ISO string from /api/orders/track. Both, or neither.
 */
const formatPlacedAt = (value) => {
  if (!value) return 'N/A';
  const date = value?.toDate?.() ?? new Date(value);
  return Number.isNaN(date?.getTime?.()) ? 'N/A' : date.toLocaleString();
};

/**
 * Whether a code is unguessable on its own, and so needs no phone digits.
 *
 * Delegates to lib/orderId.js, which mirrors the server's rule (`carriesOwnEntropy`
 * in api/lib/orderId.js, applied by trackOrder in api/lib/orders.js). Shared by the
 * form and by the arrive-and-look-up effect so the two cannot disagree about what a
 * code needs.
 *
 * Note what is NOT evidence of entropy: a hyphen. The configured default format is
 * `CH-20261008-000001`, which is strictly sequential, so treating a hyphen as proof
 * would skip the phone check on every new order. Only a Firestore auto-id and the
 * legacy `CH1042-K7QMX3` qualify.
 */
const codeCarriesOwnEntropy = orderIdCarriesOwnEntropy;

const TrackOrder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = useReducedMotion();
  const { user, isStaff, authReady } = useAuth();
  const [searchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get('id') || '');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  /* Only demand the digits when the server will actually check them. This decides
     what the form asks for — the server decides what it accepts, and disagreeing
     with it costs a round trip, not access. */
  const typedCode = normalizeOrderIdInput(orderId);
  const codeNeedsPhone = !isStaff && typedCode.length > 0 && !codeCarriesOwnEntropy(typedCode);

  /* Shown before anything is typed rather than after a rejected attempt: the
     digits are simply part of what tracking asks for now, and revealing the
     field only once the code looks bare would make it flicker mid-keystroke. It
     hides only for the two shapes that carry their own entropy. */
  const showPhoneField = !isStaff && (typedCode.length === 0 || codeNeedsPhone || phoneRequired);

  const handleDownloadInvoice = async () => {
    if (!order) return;
    setDownloadingInvoice(true);
    try {
      const customerInfo = order.customer || {
        name: 'N/A',
        phone: 'N/A',
        email: '',
        address: '',
        city: '',
        pincode: ''
      };
      downloadInvoicePDF({ orderId: order.id, ...order }, customerInfo, { isAdmin: false });
      toast.success('Invoice downloaded successfully!');
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error('Failed to generate invoice');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  /**
   * Tracking goes through the API rather than reading Firestore directly.
   *
   * Codes are plain running numbers now, so anyone could walk CH01, CH02,
   * ... — the last four digits of the phone number on the order is what stands
   * between that and every customer's address. Only the server can check it,
   * and `trackingCodes` is staff-only in the rules so the browser cannot resolve
   * a code to an order id by itself. Staff skip the digits: their token proves
   * who they are.
   *
   * Plain `fetch`, not `authFetch`, which throws when nobody is signed in —
   * guests are the main audience here. Same optional-header shape as checkout.
   */
  const fetchOrder = async (rawId, digits) => {
    /* Upper-cased and de-decorated before it leaves the browser: the server
       stores codes upper-case, so this is exactly what it will look up. */
    const code = normalizeOrderIdInput(rawId);
    if (!code) return;
    setLoading(true);
    setNotFound(false);
    setLookupFailed(false);
    setPhoneRequired(false);
    setOrder(null);
    try {
      const response = await fetch('/api/orders/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}),
        },
        body: JSON.stringify({ code, phoneLast4: String(digits || '').replace(/\D/g, '') }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.order) {
        setOrder(result.order);
        return;
      }

      // The server sets this flag rather than us matching on its wording.
      if (result.needsPhone) {
        setPhoneRequired(true);
        toast.error('Please enter the last 4 digits of the phone number on the order');
        return;
      }

      /* 429 is the per-code lockout speaking. Worth saying plainly so someone
         who mistyped knows to wait rather than keep hammering. */
      if (response.status === 429) {
        setLookupFailed(true);
        toast.error('Too many attempts. Please wait a few minutes and try again.');
        return;
      }

      /* 404 is the deliberate single answer to "no such code", "wrong digits"
         and "locked out" alike — telling them apart would confirm which order
         numbers exist. It is the ONLY status that means "check what you typed". */
      if (response.status === 404) {
        setNotFound(true);
        return;
      }

      // A rejected code shape: say what the server said, but do not imply the
      // order is missing.
      if (response.status === 400) {
        toast.error(result.error || 'Please check the tracking code and try again.');
        return;
      }

      /* Anything else is our problem, not theirs. Treating a 500 or an
         unreachable API as "order not found" tells a customer their order does
         not exist, which is both wrong and alarming. */
      setLookupFailed(true);
    } catch (error) {
      // Diagnostics stay in the console; the customer only ever sees plain words.
      console.error('Error fetching order:', error);
      setLookupFailed(true);
      toast.error('Unable to fetch order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * A tracking code is a bearer credential — holding it is what grants access
   * to the order. Keeping it in the query string put it into browser history,
   * referrer headers and any analytics on the page, so codes arrive by router
   * state now. The `?id=` form is still honoured for links already in the wild,
   * but it is stripped from the address bar as soon as it has been read.
   *
   * Waits for auth to settle first: firing before the token is restored would
   * look like a guest to the API and ask a staff member for phone digits they
   * should not need.
   */
  useEffect(() => {
    if (!authReady) return;

    /* A bare code arriving without digits cannot succeed, so prefill the form and
       ask for them rather than spending a round trip to greet the customer with
       an error. The home-page tracking box sends exactly this: a code and nothing
       else. Staff need no digits, so they are looked up straight away. */
    const lookupOrAsk = (code, digits) => {
      setOrderId(code);
      setPhoneLast4(digits);
      if (!isStaff && !digits && !codeCarriesOwnEntropy(code)) {
        setPhoneRequired(true);
        return;
      }
      fetchOrder(code, digits);
    };

    const fromState = location.state?.code;
    if (fromState) {
      /* Checkout knows the phone number the order was placed with and passes
         its last four digits along, so the customer is not asked to re-type
         what they typed a moment ago. Router state, never the URL. */
      const digits = String(location.state?.phoneLast4 || '').replace(/\D/g, '');
      lookupOrAsk(fromState, digits);
      navigate('/track-order', { replace: true, state: null });
      return;
    }

    const legacyId = searchParams.get('id');
    if (legacyId) {
      lookupOrAsk(legacyId, '');
      navigate('/track-order', { replace: true });
    }
    // fetchOrder is stable for this purpose; re-running on it would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, isStaff, location.state, searchParams]);

  const handleTrack = (e) => {
    e.preventDefault();
    const id = normalizeOrderIdInput(orderId);
    if (!id) {
      toast.error('Please enter your tracking code');
      return;
    }
    const digits = phoneLast4.replace(/\D/g, '');
    if (codeNeedsPhone && digits.length !== 4) {
      setPhoneRequired(true);
      toast.error('Please enter the last 4 digits of the phone number on the order');
      return;
    }
    // Look up in place rather than routing the code through the URL.
    fetchOrder(id, digits);
  };

  /* Copies the tracking code, which is what the shop asks for and what is
     printed above — not the raw document id, which is a bearer credential the
     customer has no use for. */
  const copyTrackingCode = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(orderIdOf(order));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy tracking code');
    }
  };

  const statusIndex = order ? statusSteps.indexOf(order.status) : -1;
  const isCancelled = order?.status === 'Cancelled';
  /* Unknown statuses fall back to the last step (never a fake Delivered —
     see isDelivered below). Legacy 'Pending' orders predate auto-confirm and
     resolve to the first step instead of the end of the line. */
  const legacyPending = order && String(order.status || '').trim().toLowerCase() === 'pending';
  const effectiveIndex = statusIndex === -1 && order ? (legacyPending ? 0 : statusSteps.length - 1) : statusIndex;
  // Terminal state only — an unrecognised status still falls back to the last
  // step, but must not be presented as a completed delivery.
  const isDelivered = order?.status === statusSteps[statusSteps.length - 1];

  return (
    <div className="min-h-screen">
      <Seo
        title="Track Your Fireworks Order | Crackers Hyderabad"
        description="Track your Crackers Hyderabad order by order ID — from packing through dispatch to doorstep delivery."
        canonical="/track-order"
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

        <motion.div
          variants={staggerParent(reduced, 0.07)}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={revealVariants(reduced, 16)} className="text-center">
            <span className="section-eyebrow">Order Tracking</span>
            <h1 className="section-title mt-4" style={{ color: 'var(--text-strong)' }}>
              Track Your Order
            </h1>
            <p className="mt-3 text-base" style={{ color: 'var(--text-muted)' }}>
              {isStaff
                ? 'Enter a tracking code to see the current status'
                : 'Enter your tracking code and phone number to see the current status'}
            </p>
          </motion.div>

          {/* Search Input */}
          <motion.form
            variants={revealVariants(reduced, 16)}
            onSubmit={handleTrack}
            className="panel-editorial glass-card mt-8 p-5 sm:p-6"
          >
            <label htmlFor="track-order-id" className="label-caps">
              Tracking code or Order ID
            </label>
            <div className="mt-2 space-y-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2"
                  strokeWidth={2.2}
                  style={{ color: 'var(--text-subtle)' }}
                  aria-hidden="true"
                />
                <input
                  id="track-order-id"
                  type="text"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="Enter tracking code (e.g. CH01)"
                  className="input-premium tabular pl-12"
                />
              </div>

              {showPhoneField && (
                <div>
                  <label htmlFor="track-phone-last4" className="label-caps">
                    Last 4 digits of phone number
                  </label>
                  <input
                    id="track-phone-last4"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    value={phoneLast4}
                    onChange={(e) => {
                      setPhoneLast4(e.target.value.replace(/\D/g, '').slice(0, 4));
                      setPhoneRequired(false);
                    }}
                    placeholder="1234"
                    aria-describedby="track-phone-hint"
                    aria-invalid={phoneRequired || undefined}
                    className="input-premium tabular mt-2 sm:max-w-[12rem]"
                    style={phoneRequired ? { borderColor: 'var(--crimson-600)' } : undefined}
                  />
                  <p id="track-phone-hint" className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    The phone number the order was placed with. This is what confirms the order is
                    yours.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary btn-shine w-full sm:w-auto sm:px-8"
              >
                {loading ? 'Tracking...' : 'Track Order'}
              </button>
            </div>
            <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              Tip: your tracking code is on the order confirmation page and on your invoice (e.g.
              CH01).
            </p>
          </motion.form>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="panel-editorial glass-card mt-8 flex items-center justify-center gap-3 px-6 py-14"
          >
            <Loader2
              className="h-5 w-5 animate-spin"
              strokeWidth={2.2}
              style={{ color: 'var(--ember-600)' }}
              aria-hidden="true"
            />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
              Looking up your order...
            </span>
          </div>
        )}

        {/* Lookup failed — plain language only, never a raw error string. */}
        {lookupFailed && !loading && (
          <div className="mt-8">
            <EmptyState
              icon={TriangleAlert}
              tone="alert"
              title="We couldn't complete the lookup"
              description="Something went wrong while reaching our order system. Please check your connection and try again in a moment."
              action={
                <button type="button" onClick={() => fetchOrder(orderId, phoneLast4)} className="btn-primary">
                  Try again
                </button>
              }
            />
          </div>
        )}

        {/* Not Found */}
        {notFound && !loading && (
          <div className="mt-8">
            <EmptyState
              icon={PackageSearch}
              title="Order not found"
              description={
                isStaff
                  ? "We couldn't find an order with that tracking code. Please double-check it and try again."
                  : "We couldn't find an order matching that tracking code and phone number. Please check both and try again. Your tracking code (for example CH01) is on the order confirmation page, and the digits must match the phone number the order was placed with."
              }
            />
          </div>
        )}

        {/* Order Details */}
        {order && !loading && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={revealVariants(reduced, 20)}
            className="panel-editorial glass-card mt-8 overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 sm:p-6" style={{ background: 'var(--grad-maroon)' }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p
                    className="label-caps"
                    style={{ color: 'rgba(255, 255, 255, 0.72)' }}
                  >
                    Tracking Code
                  </p>
                  <p
                    className="tabular mt-1 break-all text-xl font-bold"
                    style={{ color: 'var(--white-soft)', fontFamily: 'var(--font-body)' }}
                  >
                    #{orderIdOf(order)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copyTrackingCode}
                    className="inline-flex items-center gap-2 rounded-[var(--r-md)] px-4 text-sm font-semibold transition-colors"
                    style={{
                      minHeight: '44px',
                      background: 'rgba(255, 255, 255, 0.16)',
                      border: '1px solid rgba(255, 255, 255, 0.28)',
                      color: 'var(--white-soft)',
                    }}
                    aria-label={copied ? 'Tracking code copied to clipboard' : 'Copy tracking code'}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                    ) : (
                      <Copy className="h-4 w-4" strokeWidth={2.2} />
                    )}
                    {copied ? 'Copied!' : 'Copy code'}
                  </button>
                  <span
                    className="inline-flex items-center gap-2 rounded-[var(--r-md)] px-4 text-sm font-bold"
                    style={{
                      minHeight: '44px',
                      background: isCancelled ? 'var(--crimson-600)' : 'rgba(255, 255, 255, 0.16)',
                      border: `1px solid ${isCancelled ? 'var(--crimson-600)' : 'rgba(255, 255, 255, 0.28)'}`,
                      color: 'var(--white-soft)',
                    }}
                  >
                    {isCancelled ? (
                      <X className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
                    ) : (
                      <ClipboardCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    )}
                    {order.status || 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {/* Timeline */}
              {isCancelled ? (
                <div
                  className="mb-8 rounded-[var(--r-lg)] p-5 text-center"
                  style={{
                    background: 'rgba(203, 42, 42, 0.08)',
                    border: '1px solid rgba(203, 42, 42, 0.28)',
                  }}
                >
                  <X
                    className="mx-auto mb-2 h-10 w-10"
                    strokeWidth={2}
                    style={{ color: 'var(--crimson-600)' }}
                    aria-hidden="true"
                  />
                  <p className="subsection-title" style={{ color: 'var(--crimson-600)' }}>
                    This order was cancelled
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                    If you have any questions, please contact us.
                  </p>
                </div>
              ) : (
                <div className="mb-8">
                  <p className="label-caps mb-4">Order Progress</p>
                  <OrderTimeline
                    activeIndex={effectiveIndex}
                    reduced={reduced}
                    isComplete={isDelivered}
                  />
                </div>
              )}

              <hr className="rule-gold mb-6" />

              {/* Customer & Order Info */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoPanel title="Customer">
                  <p className="card-title" style={{ color: 'var(--text-strong)' }}>
                    {order.customer?.name || 'N/A'}
                  </p>
                  <p className="tabular text-sm" style={{ color: 'var(--text-body)' }}>
                    {order.customer?.phone || ''}
                  </p>
                  {order.customer?.email && (
                    <p className="break-all text-sm" style={{ color: 'var(--text-body)' }}>
                      {order.customer.email}
                    </p>
                  )}
                  {order.customer?.address && (
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {order.customer.address}, {order.customer.city} - {order.customer.pincode}
                    </p>
                  )}
                  {order.delivery && !order.delivery.sameAsBilling && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                      <p className="label-caps">Delivery Address</p>
                      <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                        {order.delivery.flatNo && <>{order.delivery.flatNo}, </>}
                        {order.delivery.streetNo && <>{order.delivery.streetNo}, </>}
                        {order.delivery.area && <>{order.delivery.area}, </>}
                        {order.delivery.city} - {order.delivery.pincode}
                      </p>
                      {order.delivery.altPhone && (
                        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                          <span className="font-semibold">Alt Phone:</span>{' '}
                          <span className="tabular">{order.delivery.altPhone}</span>
                        </p>
                      )}
                    </div>
                  )}
                </InfoPanel>

                <InfoPanel title="Order Info">
                  <p className="text-sm" style={{ color: 'var(--text-body)' }}>
                    <span className="font-semibold">Placed:</span>{' '}
                    {formatPlacedAt(order.createdAt)}
                  </p>
                  {order.paymentMode && (
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-body)' }}>
                      <span className="font-semibold">Payment:</span> {order.paymentMode}
                    </p>
                  )}
                  {order.discount > 0 && (
                    <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--leaf-600)' }}>
                      <span>Discount:</span> <span className="price">-₹{order.discount}</span>
                    </p>
                  )}
                </InfoPanel>
              </div>

              {/* Items */}
              <p className="label-caps mb-2">Order Items</p>
              <div
                className="mb-4 overflow-hidden rounded-[var(--r-lg)]"
                style={{ border: '1px solid var(--hairline)' }}
              >
                {order.items?.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 p-3"
                    style={{ borderTop: index === 0 ? 'none' : '1px solid var(--hairline)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                        {item.name}
                      </p>
                      <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                        Qty: {item.quantity}
                      </p>
                    </div>
                    <p
                      className="price shrink-0 text-sm font-bold"
                      style={{ color: 'var(--text-strong)' }}
                    >
                      ₹{((item.discountPrice || item.price || 0) * item.quantity).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
                {(!order.items || order.items.length === 0) && (
                  <p className="p-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    No items in this order
                  </p>
                )}
              </div>

              {/* Total */}
              <div
                className="flex items-center justify-between gap-3 rounded-[var(--r-lg)] p-4"
                style={{ background: 'var(--grad-ember)', color: 'var(--white-soft)' }}
              >
                <span className="subsection-title" style={{ color: 'var(--white-soft)' }}>
                  Total
                </span>
                <span className="price text-xl font-bold">
                  ₹{Number(order.total || 0).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link to="/products" className="btn-primary w-full sm:w-auto">
                  <ShoppingBag className="h-5 w-5" strokeWidth={2.2} />
                  Continue Shopping
                </Link>
                <button
                  type="button"
                  onClick={handleDownloadInvoice}
                  disabled={downloadingInvoice}
                  className="btn-gold w-full px-6 sm:w-auto"
                >
                  {downloadingInvoice ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                      Download Invoice
                    </>
                  )}
                </button>
                <Link to="/" className="btn-outline w-full sm:w-auto">
                  <Home className="h-5 w-5" strokeWidth={2.2} />
                  Back to Home
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default TrackOrder;
