import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  ShoppingBag,
  Check,
  Copy,
  Package,
  PackageOpen,
  MessageSquareText,
  ChevronDown,
  Star,
  CheckCircle2,
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import toast from '../utils/toast';
import Seo from '../components/Seo';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants, staggerParent, DURATION, EASE_OUT_EXPO, SPRING } from '../lib/motion';
import FireworksCanvas from '../components/ui/FireworksCanvas';
import { RangoliDivider } from '../components/ui/Ornaments';

/* Sixteen decorative rays around the seal. Static geometry, one grouped fade. */
const SEAL_RAYS = Array.from({ length: 16 }, (_, i) => i * 22.5);

/**
 * The focal moment: a wax-seal that draws itself once, then holds.
 * Every stage collapses to its finished state when motion is reduced.
 */
const CompletionSeal = ({ reduced }) => {
  const ease = (duration, delay) =>
    reduced ? { duration: 0.001, delay: 0 } : { duration, delay, ease: EASE_OUT_EXPO };

  return (
    <div className="relative mx-auto h-36 w-36 sm:h-40 sm:w-40">
      <motion.span
        aria-hidden="true"
        className="absolute inset-[-30%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(210,166,79,0.38) 0%, rgba(195,58,20,0.16) 42%, transparent 72%)',
        }}
        initial={{ opacity: 0, scale: reduced ? 1 : 0.4 }}
        animate={{ opacity: reduced ? 0.55 : [0, 0.9, 0.5], scale: 1 }}
        transition={ease(0.7, 0.35)}
      />

      <svg viewBox="0 0 120 120" className="relative block h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="order-seal-ember" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--maroon-700)' }} />
            <stop offset="55%" style={{ stopColor: 'var(--ember-600)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--ember-500)' }} />
          </linearGradient>
        </defs>

        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={ease(DURATION.slow, 0.2)}
        >
          {SEAL_RAYS.map((angle) => (
            <line
              key={angle}
              x1="60"
              y1="4"
              x2="60"
              y2="11"
              stroke="var(--gold-400)"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.7"
              transform={`rotate(${angle} 60 60)`}
            />
          ))}
        </motion.g>

        <motion.circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="var(--gold-400)"
          strokeWidth="1.4"
          strokeLinecap="round"
          initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0.2 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={ease(0.62, 0.05)}
        />

        <motion.circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="var(--gold-400)"
          strokeWidth="0.8"
          strokeDasharray="3 6"
          opacity="0.6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={ease(DURATION.base, 0.3)}
        />

        <motion.circle
          cx="60"
          cy="60"
          r="38"
          fill="url(#order-seal-ember)"
          initial={{ scale: reduced ? 1 : 0.2, opacity: reduced ? 1 : 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ transformOrigin: '60px 60px' }}
          transition={reduced ? { duration: 0.001 } : SPRING.soft}
        />

        <motion.path
          d="M42 61 L54 74 L79 47"
          fill="none"
          stroke="var(--white-soft)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={ease(0.42, 0.5)}
        />
      </svg>
    </div>
  );
};

/** A code the customer needs to keep. Big, tabular, one tap to copy. */
const CodeRow = ({ label, display, value, copied, onCopy }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-left">
    <div className="min-w-0">
      <p className="label-caps">{label}</p>
      <p
        className="tabular mt-1 break-all text-xl font-bold sm:text-2xl"
        style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-body)' }}
      >
        {display}
      </p>
    </div>
    <button
      type="button"
      onClick={() => onCopy(label, value)}
      className="btn-quiet shrink-0"
      style={{ minHeight: '44px', paddingInline: '0.9rem' }}
      aria-label={copied ? `${label} copied to clipboard` : `Copy ${label.toLowerCase()}`}
    >
      {copied ? (
        <Check className="h-4 w-4" strokeWidth={2.6} style={{ color: 'var(--leaf-600)' }} />
      ) : (
        <Copy className="h-4 w-4" strokeWidth={2} />
      )}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  </div>
);

const OrderSuccess = () => {
  const location = useLocation();
  const reduced = useReducedMotion();
  const orderId = location.state?.orderId;
  const shortCode = location.state?.shortCode;
  const [showContent, setShowContent] = useState(reduced);
  const [showConfetti, setShowConfetti] = useState(!reduced);

  const [copiedField, setCopiedField] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (reduced) {
      setShowContent(true);
      setShowConfetti(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      setShowContent(true);
    }, 800);

    const confettiTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 4000);

    return () => {
      clearTimeout(timer);
      clearTimeout(confettiTimer);
    };
  }, [reduced]);

  useEffect(() => {
    if (!orderId) return;
    const checkExisting = async () => {
      try {
        // Keyed by order id, so this is a direct get. Querying the collection
        // required list permission, and a listable feedback collection that
        // carried order ids handed an attacker every order in the shop.
        const snap = await getDoc(doc(db, 'feedback', orderId));
        if (snap.exists()) setSubmitted(true);
      } catch (err) {
        console.error('Failed to check feedback:', err);
      }
    };
    checkExisting();
  }, [orderId]);

  const handleSubmitFeedback = async () => {
    if (!orderId) return;
    if (rating === 0) {
      toast.error('Please select a star rating');
      return;
    }
    setSubmitting(true);
    try {
      // The order id is the document id, so it is never stored in the body —
      // and the tracking code is not stored at all. Both are bearer
      // identifiers for the order and must not sit in a readable field.
      await setDoc(doc(db, 'feedback', orderId), {
        rating,
        comment: comment.trim().slice(0, 1000),
        createdAt: serverTimestamp()
      });
      setSubmitted(true);
      toast.success('Thank you for your feedback!');
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      toast.error('Could not submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (field, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Could not copy. Please select the code and copy it manually.');
    }
  };

  const trackingCode = shortCode || (orderId ? orderId.slice(-8).toUpperCase() : '');

  /* Summary numbers ride along on navigation state. They are absent on a
     refresh or a direct visit, in which case the line is not rendered at all. */
  const summaryTotal = location.state?.total;
  const summaryItemCount = location.state?.itemCount;
  const hasSummary =
    typeof summaryTotal === 'number' &&
    Number.isFinite(summaryTotal) &&
    typeof summaryItemCount === 'number' &&
    summaryItemCount > 0;

  return (
    <div className="relative flex min-h-screen items-center overflow-hidden">
      <Seo title="Order Confirmed | Crackers Hyderabad" noindex />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[62vh]">
        <div className="gradient-mesh absolute inset-0 opacity-70" />
        {showConfetti && <FireworksCanvas density={0.55} opacity={0.6} />}
      </div>

      <div className="shell-narrow section-pad-sm relative z-raised w-full">
        <div className="mx-auto text-center">
          <CompletionSeal reduced={reduced} />

          <motion.div
            variants={staggerParent(reduced, 0.07)}
            initial="hidden"
            animate={showContent ? 'visible' : 'hidden'}
            className="mt-8"
          >
            <motion.div variants={revealVariants(reduced, 18)}>
              <span className="section-eyebrow">Order Confirmed</span>
              <h1 className="section-title mt-4 text-balance" style={{ color: 'var(--text-strong)' }}>
                Thank You for Your Purchase
              </h1>
              <p className="mt-3 text-base" style={{ color: 'var(--text-muted)' }}>
                We appreciate your order.
              </p>
            </motion.div>

            {orderId && (
              <motion.div variants={revealVariants(reduced, 18)} className="mt-8">
                <div className="panel-editorial glass-card px-5 py-2 sm:px-7">
                  <CodeRow
                    label="Tracking Code"
                    display={`#${trackingCode}`}
                    value={trackingCode}
                    copied={copiedField === 'Tracking Code'}
                    onCopy={handleCopy}
                  />

                  {hasSummary && (
                    <>
                      <div className="h-px w-full" style={{ background: 'var(--hairline)' }} />

                      <div className="flex flex-wrap items-end justify-between gap-3 py-4 text-left">
                        <div className="min-w-0">
                          <p className="label-caps">Order Total</p>
                          <p className="tabular mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                            {summaryItemCount} item{summaryItemCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <p
                          className="price shrink-0 text-xl font-bold sm:text-2xl"
                          style={{ color: 'var(--text-strong)' }}
                        >
                          ₹{summaryTotal.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </>
                  )}

                  <RangoliDivider className="pt-1" />

                  <p
                    className="px-1 pb-5 pt-4 text-sm leading-relaxed text-pretty"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    We&apos;ll contact you soon for confirmation. Save your{' '}
                    <strong style={{ color: 'var(--gold-600)' }}>tracking code</strong> to follow
                    your order&apos;s status.
                  </p>

                  {shortCode && (
                    <>
                      <div className="h-px w-full" style={{ background: 'var(--hairline)' }} />
                      <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-4 text-left">
                        <p
                          className="tabular text-sm font-bold"
                          style={{ color: 'var(--text-strong)' }}
                        >
                          Order #{trackingCode}
                        </p>
                        <Link
                          to={`/track/${trackingCode}`}
                          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold"
                          style={{ color: 'var(--gold-600)' }}
                        >
                          Track Your Order
                          <span aria-hidden="true">→</span>
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            <motion.div
              variants={revealVariants(reduced, 18)}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center"
            >
              <Link
                to="/track-order"
                // Carried in router state rather than the URL — the code is a
                // bearer credential for the order, and tracking now also needs
                // the last four digits of the phone number it was placed with.
                state={
                  trackingCode ? { code: trackingCode, phoneLast4: location.state?.phoneLast4 } : undefined
                }
                className="btn-primary btn-shine w-full sm:w-auto"
              >
                <Package className="h-5 w-5" strokeWidth={2.2} />
                Track Order
              </Link>

              <Link to="/my-orders" className="btn-gold w-full px-6 sm:w-auto">
                <PackageOpen className="h-5 w-5" strokeWidth={2.2} />
                View My Orders
              </Link>

              <Link to="/products" className="btn-outline w-full sm:w-auto">
                <ShoppingBag className="h-5 w-5" strokeWidth={2.2} />
                Continue Shopping
              </Link>
            </motion.div>

            {/* ============ FEEDBACK TAB ============ */}
            <motion.div variants={revealVariants(reduced, 18)} className="mt-8 text-left">
              <button
                type="button"
                onClick={() => setFeedbackOpen(!feedbackOpen)}
                aria-expanded={feedbackOpen}
                aria-controls="order-feedback-panel"
                className="card-premium glass-card flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                style={{ minHeight: '44px' }}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--grad-gold)' }}
                  >
                    <MessageSquareText
                      className="h-5 w-5"
                      strokeWidth={2.2}
                      style={{ color: 'var(--maroon-900)' }}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="card-title block" style={{ color: 'var(--text-strong)' }}>
                      Share Your Feedback
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                      {submitted ? 'Feedback submitted' : 'Tell us how your order experience was'}
                    </span>
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 transition-transform duration-300 ${feedbackOpen ? 'rotate-180' : ''}`}
                  strokeWidth={2.4}
                  style={{ color: 'var(--gold-600)' }}
                  aria-hidden="true"
                />
              </button>

              <AnimatePresence initial={false}>
                {feedbackOpen && (
                  <motion.div
                    id="order-feedback-panel"
                    initial={{ opacity: 0, y: reduced ? 0 : -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduced ? 0 : -6 }}
                    transition={{ duration: reduced ? 0.001 : DURATION.base, ease: EASE_OUT_EXPO }}
                    className="panel-editorial glass-card mt-3 px-5 py-6"
                  >
                    {submitted ? (
                      <div className="py-2 text-center">
                        <CheckCircle2
                          className="mx-auto mb-3 h-11 w-11"
                          strokeWidth={2}
                          style={{ color: 'var(--leaf-600)' }}
                          aria-hidden="true"
                        />
                        <p className="card-title" style={{ color: 'var(--text-strong)' }}>
                          Thank you for your feedback!
                        </p>
                        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                          {rating > 0 && `You rated us ${rating} star${rating > 1 ? 's' : ''}`}
                          {comment && ' and shared your thoughts.'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="label-caps text-center">Rate your experience</p>
                        <div className="mt-3 flex items-center justify-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => {
                            const lit = (hoverRating || rating) >= star;
                            return (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                onFocus={() => setHoverRating(star)}
                                onBlur={() => setHoverRating(0)}
                                className="flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110"
                                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                                aria-pressed={rating === star}
                              >
                                <Star
                                  className={`h-8 w-8 transition-colors ${lit ? 'fill-current' : ''}`}
                                  strokeWidth={1.8}
                                  style={{ color: lit ? 'var(--gold-400)' : 'var(--hairline-strong)' }}
                                />
                              </button>
                            );
                          })}
                        </div>
                        <p className="mb-4 mt-2 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                          {rating > 0
                            ? `You selected ${rating} star${rating > 1 ? 's' : ''}`
                            : 'Tap a star to rate your experience'}
                        </p>

                        <label htmlFor="order-feedback-comment" className="label-caps">
                          Your comments (optional)
                        </label>
                        <textarea
                          id="order-feedback-comment"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          rows={3}
                          placeholder="Tell us what you liked or how we can improve..."
                          className="input-premium mt-2 resize-none text-sm"
                        />

                        <button
                          type="button"
                          onClick={handleSubmitFeedback}
                          disabled={submitting}
                          className="btn-primary mt-4 w-full"
                        >
                          <MessageSquareText className="h-4 w-4" strokeWidth={2.4} />
                          {submitting ? 'Submitting...' : 'Submit Feedback'}
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <motion.div variants={revealVariants(reduced, 12)} className="mt-8">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-sm font-semibold transition-colors"
                style={{ color: 'var(--text-muted)', minHeight: '44px' }}
              >
                <Home className="h-4 w-4" strokeWidth={2.2} />
                Back to Home
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default OrderSuccess;
