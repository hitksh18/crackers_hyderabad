import { useState, useEffect, useMemo } from 'react';
import { Tag, ChevronDown } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { inr } from '../lib/currency';

const OFFERS_KEY = 'coupon_offers_expanded';

const unitPriceOf = (item) => item.discountPrice || item.onlinePrice || item.price || 0;

/* Mirrors the server's eligible-subtotal rule (api/lib/coupons.js) for display
   only — Apply always revalidates server-side, so this can never grant a
   discount, only explain one. */
const eligibleValueOf = (offer, items) => {
  const hasProducts = Array.isArray(offer.applicableProductIds) && offer.applicableProductIds.length > 0;
  const hasCats = Array.isArray(offer.applicableCategoryIds) && offer.applicableCategoryIds.length > 0;
  const lineTotal = (item) => unitPriceOf(item) * (Number(item.quantity) || 0);
  if (!hasProducts && !hasCats) {
    return items.reduce((sum, item) => sum + lineTotal(item), 0);
  }
  const prodSet = new Set((offer.applicableProductIds || []).map(String));
  const catSet = new Set((offer.applicableCategoryIds || []).map((c) => String(c).toLowerCase()));
  return items.reduce((sum, item) => {
    const inProducts = hasProducts && prodSet.has(String(item.id));
    const cats = Array.isArray(item.categories) ? item.categories : (item.category ? [item.category] : []);
    const inCats = hasCats && cats.some((c) => catSet.has(String(c).toLowerCase()));
    return (hasProducts && inProducts) || (hasCats && inCats) ? sum + lineTotal(item) : sum;
  }, 0);
};

const estimatedSavings = (offer, eligible) => {
  if (offer.discountType === 'percentage') {
    const pct = Math.min(100, Math.max(0, Number(offer.discountValue) || 0));
    const amount = (eligible * pct) / 100;
    return offer.maximumDiscount != null ? Math.min(amount, Number(offer.maximumDiscount)) : amount;
  }
  return Math.min(Math.max(0, Number(offer.discountValue) || 0), eligible);
};

const discountLabel = (offer) => (
  offer.discountType === 'percentage' ? `${offer.discountValue}% OFF` : `${inr(offer.discountValue)} OFF`
);

/**
 * Offers & Coupons panel for the cart. Manual entry and offer cards share the
 * single applyCoupon() from CartContext — one validation path, one applied
 * state, server-authoritative amounts.
 *
 * `fill`: stretch to the parent flex column so the coupon list (and only the
 * list) scrolls internally. Used inside the locked cart layout.
 */
const CouponOffers = ({ fill = false } = {}) => {
  const {
    cart,
    coupon, couponInput, setCouponInput, couponError, setCouponError,
    couponApplying, applyCoupon, removeCoupon,
  } = useCart();
  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => {
    try {
      return sessionStorage.getItem(OFFERS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/coupons/active')
      .then((res) => (res.ok ? res.json() : { offers: [] }))
      .then((data) => {
        if (!cancelled) setOffers(Array.isArray(data.offers) ? data.offers : []);
      })
      .catch(() => {
        if (!cancelled) setOffers([]);
      })
      .finally(() => {
        if (!cancelled) setOffersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleExpanded = () => {
    setExpanded((v) => {
      try {
        sessionStorage.setItem(OFFERS_KEY, v ? '0' : '1');
      } catch {
        // Storage unavailable — expansion simply resets on reload.
      }
      return !v;
    });
  };

  const ranked = useMemo(() => {
    const rows = offers.map((offer) => {
      const eligible = eligibleValueOf(offer, cart);
      const minimum = Number(offer.minimumOrderValue) || 0;
      const meets = eligible >= minimum && eligible > 0;
      return { offer, eligible, minimum, meets, savings: meets ? estimatedSavings(offer, eligible) : 0 };
    });
    rows.sort((a, b) => {
      if (a.meets !== b.meets) return a.meets ? -1 : 1;
      if (b.savings !== a.savings) return b.savings - a.savings;
      return a.minimum - b.minimum;
    });
    return rows;
  }, [offers, cart]);

  const applyOffer = async (code) => {
    const applied = await applyCoupon(code);
    if (applied) setExpanded(false);
  };

  return (
    <div className={`text-left${fill ? ' flex min-h-0 flex-1 flex-col' : ''}`}>
      <p className="label-caps mb-1.5 flex items-center gap-1.5">
        <Tag className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        Offers &amp; Coupons
      </p>

      {!coupon ? (
        <form onSubmit={(e) => { e.preventDefault(); applyCoupon(); }}>
          <label htmlFor="cart-coupon" className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            Have a coupon code?
          </label>
          <div className="flex flex-col gap-2 min-[420px]:flex-row">
            <input
              id="cart-coupon"
              type="text"
              value={couponInput}
              onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
              placeholder="Enter coupon code"
              disabled={couponApplying}
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-[var(--r-md)] border bg-[var(--surface-sunken)] px-3 text-sm font-semibold tabular placeholder:font-normal placeholder:text-[var(--text-subtle)] focus:outline-none"
              style={{ borderColor: 'var(--hairline)', color: 'var(--text-strong)' }}
            />
            <button
              type="submit"
              disabled={couponApplying || !couponInput.trim()}
              className="btn-primary h-10 shrink-0 px-4 text-sm font-semibold disabled:opacity-50 min-[420px]:w-auto w-full"
            >
              {couponApplying ? 'Applying…' : 'Apply'}
            </button>
          </div>
          {couponError && (
            <p className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--crimson-600)' }} role="alert">
              {couponError}
            </p>
          )}
        </form>
      ) : (
        <div className="rounded-[var(--r-md)] border p-2.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
          <div className="flex items-center justify-between gap-2">
            <p className="tabular text-sm font-bold" style={{ color: 'var(--leaf-600)' }}>
              ✓ {coupon.code} applied
            </p>
            <button
              type="button"
              onClick={removeCoupon}
              className="text-xs font-semibold underline"
              style={{ color: 'var(--text-muted)' }}
            >
              Remove
            </button>
          </div>
          <p className="tabular mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            {coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `${inr(coupon.discountValue)} OFF`}
            {' '}· You save {inr(coupon.discountAmount)}
          </p>
        </div>
      )}

      {offersLoading ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-subtle)' }}>Checking available offers…</p>
      ) : offers.length === 0 ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-subtle)' }}>No offers available right now.</p>
      ) : (
        <>
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold"
            style={{ color: 'var(--text-strong)' }}
          >
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform duration-200"
              aria-hidden="true"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
            />
            View available offers
            <span className="tabular rounded-full px-1.5 py-0.5 text-[11px]" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--hairline)', color: 'var(--text-muted)' }}>
              {offers.length}
            </span>
          </button>

          {expanded && (
            /* Vertical stack with its own scroll — many coupons never push
               checkout off-screen. Only this list scrolls. */
            <ul className={`mt-2 flex flex-col gap-2 overflow-y-auto pr-0.5${fill ? ' min-h-0 flex-1' : ' max-h-[300px]'}`}>
              {ranked.map(({ offer, eligible, minimum, meets, savings }) => {
                const applied = coupon?.code === offer.code;
                const progress = minimum > 0 ? Math.min(1, eligible / minimum) : 1;
                return (
                  <li
                    key={offer.code}
                    className="w-full shrink-0 rounded-[var(--r-md)] border p-3"
                    style={{
                      borderColor: applied ? 'var(--leaf-600)' : 'var(--hairline)',
                      background: 'var(--surface-sunken)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="tabular text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                        {offer.code}
                      </p>
                      {applied ? (
                        <span className="tabular shrink-0 text-xs font-bold" style={{ color: 'var(--leaf-600)' }}>
                          Applied
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => applyOffer(offer.code)}
                          disabled={couponApplying || !meets}
                          className="btn-primary h-8 shrink-0 px-3.5 text-xs font-bold disabled:opacity-50"
                        >
                          {couponApplying ? 'Applying…' : 'Apply'}
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13px] font-bold" style={{ color: 'var(--ember-600)' }}>
                      {discountLabel(offer)}
                    </p>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {minimum > 0 ? `Spend ${inr(minimum)} on eligible products` : 'No minimum order'}
                      {offer.expiresAt && ` · Ends ${new Date(offer.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                    </p>
                    {minimum > 0 && (
                      <>
                        <p className="tabular mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                          {inr(eligible)} / {inr(minimum)}
                        </p>
                        <div
                          className="mt-1 h-1 overflow-hidden rounded-full"
                          style={{ background: 'var(--surface-raised)' }}
                          role="progressbar"
                          aria-valuenow={Math.round(progress * 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${offer.code} eligibility`}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.round(progress * 100)}%`, background: meets ? 'var(--leaf-600)' : 'var(--gold-500)' }}
                          />
                        </div>
                      </>
                    )}
                    <p className="mt-1.5 text-xs font-semibold" style={{ color: meets ? 'var(--leaf-600)' : 'var(--text-muted)' }}>
                      {applied
                        ? `Saving ${inr(coupon.discountAmount)} on this order`
                        : meets
                          ? `Ready to apply${savings > 0 ? ` — save ${inr(Math.round(savings * 100) / 100)}` : ''}`
                          : `Add ${inr(minimum - eligible)} more to use this coupon`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};

export default CouponOffers;
