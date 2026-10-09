'use strict';

/**
 * Coupon / discount system.
 *
 * Money rules (enforced here, never in the browser):
 * - Coupons live in the `coupons` collection. The browser never reads them;
 *   checkout validates through POST /api/coupons/validate and sends only the
 *   CODE with the order. The server re-validates inside order creation.
 * - Discounts are computed from server-priced cart totals only.
 * - Usage is consumed atomically inside the same transaction that writes the
 *   order (see couponBurn in commitSequencedOrder): one successful order ==
 *   exactly one redemption. Retries, refreshes and duplicate posts cannot
 *   double-count because the redemption document is created (never
 *   overwritten) alongside the order.
 * - Historical orders keep their own coupon snapshot ({ code, type, value,
 *   amount }); editing or deleting a coupon never rewrites them.
 */

const COUPONS_COLLECTION = 'coupons';
const REDEMPTIONS_COLLECTION = 'couponRedemptions';
const CUSTOMER_COUNTERS_COLLECTION = 'couponCustomers';

const CODE_MAX_LENGTH = 24;
const DESCRIPTION_MAX_LENGTH = 200;

const DISCOUNT_TYPES = Object.freeze(['percentage', 'fixed']);

/** Canonical code form: trimmed, upper-cased, single internal spaces. */
function normalizeCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .slice(0, CODE_MAX_LENGTH);
}

function isValidCodeShape(code) {
  if (!code || code.length > CODE_MAX_LENGTH) return false;
  // Letters, digits, spaces, hyphens and underscores only — URL/email safe.
  return /^[A-Z0-9][A-Z0-9 _-]*$/.test(code);
}

/**
 * Discount in rupees for a subtotal. Pure math, no database:
 * - percentage: 0-100, rounded to paise, optionally capped by maximumDiscount
 * - fixed: positive, clamped to the eligible subtotal (never negative totals)
 */
function computeDiscountAmount(coupon, subtotal) {
  const base = Math.max(0, Number(subtotal) || 0);
  if (coupon.discountType === 'percentage') {
    const pct = Math.min(100, Math.max(0, Number(coupon.discountValue) || 0));
    let amount = Math.round(base * (pct / 100) * 100) / 100;
    if (coupon.maximumDiscount != null && Number.isFinite(Number(coupon.maximumDiscount))) {
      amount = Math.min(amount, Math.max(0, Number(coupon.maximumDiscount)));
    }
    return Math.min(amount, base);
  }
  return Math.min(Math.max(0, Number(coupon.discountValue) || 0), base);
}

/** Time-window check. Missing start = already started; missing expiry = never expires. */
function isInWindow(coupon, now = Date.now()) {
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (coupon.startsAt) {
    const start = new Date(coupon.startsAt).getTime();
    if (Number.isFinite(start) && at < start) return { ok: false, reason: 'not-started' };
  }
  if (coupon.expiresAt) {
    const end = new Date(coupon.expiresAt).getTime();
    if (Number.isFinite(end) && at > end) return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}

/** Shape validation for admin create/update payloads. */
function validateCouponInput(input) {
  const errors = {};
  const code = normalizeCode(input?.code);
  if (!code) errors.code = 'Coupon code is required.';
  else if (!isValidCodeShape(code)) errors.code = 'Code may use letters, numbers, spaces, hyphens and underscores.';

  const description = String(input?.description ?? '').trim().slice(0, DESCRIPTION_MAX_LENGTH);

  const discountType = String(input?.discountType || '').trim();
  if (!DISCOUNT_TYPES.includes(discountType)) errors.discountType = 'Discount type must be percentage or fixed.';

  const discountValue = Number(input?.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    errors.discountValue = 'Discount value must be a positive number.';
  } else if (discountType === 'percentage' && discountValue > 100) {
    errors.discountValue = 'Percentage discount cannot exceed 100.';
  }

  const minimumOrderValue = input?.minimumOrderValue == null || input?.minimumOrderValue === ''
    ? 0
    : Number(input.minimumOrderValue);
  if (!Number.isFinite(minimumOrderValue) || minimumOrderValue < 0) {
    errors.minimumOrderValue = 'Minimum order value must be zero or more.';
  }

  const maximumDiscount = input?.maximumDiscount == null || input?.maximumDiscount === ''
    ? null
    : Number(input.maximumDiscount);
  if (maximumDiscount !== null && (!Number.isFinite(maximumDiscount) || maximumDiscount <= 0)) {
    errors.maximumDiscount = 'Maximum discount must be a positive number or empty.';
  }

  const usageLimit = input?.usageLimit == null || input?.usageLimit === ''
    ? null
    : Number(input.usageLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
    errors.usageLimit = 'Usage limit must be a whole number of at least 1, or empty for unlimited.';
  }

  const perCustomerLimit = input?.perCustomerLimit == null || input?.perCustomerLimit === ''
    ? null
    : Number(input.perCustomerLimit);
  if (perCustomerLimit !== null && (!Number.isInteger(perCustomerLimit) || perCustomerLimit < 1)) {
    errors.perCustomerLimit = 'Per-customer limit must be a whole number of at least 1, or empty.';
  }

  let startsAt = null;
  if (input?.startsAt) {
    const t = new Date(input.startsAt).getTime();
    if (!Number.isFinite(t)) errors.startsAt = 'Start date is not a valid date.';
    else startsAt = new Date(t).toISOString();
  }
  let expiresAt = null;
  if (input?.expiresAt) {
    const t = new Date(input.expiresAt).getTime();
    if (!Number.isFinite(t)) errors.expiresAt = 'Expiry date is not a valid date.';
    else expiresAt = new Date(t).toISOString();
  }
  if (startsAt && expiresAt && new Date(expiresAt) <= new Date(startsAt)) {
    errors.expiresAt = 'Expiry must be after the start date.';
  }

  const status = String(input?.status || 'active').trim();
  if (!['active', 'inactive'].includes(status)) errors.status = 'Status must be active or inactive.';

  const applicableProductIds = Array.isArray(input?.applicableProductIds)
    ? input.applicableProductIds.map(String).filter(Boolean).slice(0, 200)
    : [];
  const applicableCategoryIds = Array.isArray(input?.applicableCategoryIds)
    ? input.applicableCategoryIds.map(String).filter(Boolean).slice(0, 100)
    : [];

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: null,
    value: {
      code,
      normalizedCode: code,
      description,
      discountType,
      discountValue,
      minimumOrderValue,
      maximumDiscount,
      usageLimit,
      perCustomerLimit,
      startsAt,
      expiresAt,
      status,
      applicableProductIds,
      applicableCategoryIds,
    },
  };
}

/** Eligible subtotal: whole cart, or only restricted products/categories. */
function eligibleSubtotal(coupon, pricedItems) {
  const hasProducts = Array.isArray(coupon.applicableProductIds) && coupon.applicableProductIds.length > 0;
  const hasCats = Array.isArray(coupon.applicableCategoryIds) && coupon.applicableCategoryIds.length > 0;
  if (!hasProducts && !hasCats) {
    return pricedItems.reduce((sum, it) => sum + Number(it.price || 0) * (Number(it.quantity) || 0), 0);
  }
  const prodSet = new Set((coupon.applicableProductIds || []).map(String));
  const catSet = new Set((coupon.applicableCategoryIds || []).map((c) => String(c).toLowerCase()));
  return pricedItems.reduce((sum, it) => {
    const inProducts = hasProducts && prodSet.has(String(it.id));
    const cats = Array.isArray(it.categories) ? it.categories : (it.category ? [it.category] : []);
    const inCats = hasCats && cats.some((c) => catSet.has(String(c).toLowerCase()));
    if ((hasProducts && inProducts) || (hasCats && inCats)) {
      return sum + Number(it.price || 0) * (Number(it.quantity) || 0);
    }
    return sum;
  }, 0);
}

async function getCouponByCode(db, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const snap = await db.collection(COUPONS_COLLECTION).where('normalizedCode', '==', normalized).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Full server-side validation against a priced cart. Returns either
 * { ok:true, coupon, discountAmount, eligibleSubtotal } or
 * { ok:false, error } with a customer-safe message.
 */
async function validateCouponForCart(db, { code, pricedItems, customerKey, now } = {}) {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, error: 'Enter a coupon code.' };
  const coupon = await getCouponByCode(db, normalized);
  if (!coupon) return { ok: false, error: 'This coupon code is not valid.' };
  if (coupon.status !== 'active') return { ok: false, error: 'This coupon is no longer active.' };

  const window = isInWindow(coupon, now ?? Date.now());
  if (!window.ok) {
    return { ok: false, error: window.reason === 'expired' ? 'This coupon has expired.' : 'This coupon is not active yet.' };
  }
  if (coupon.usageLimit != null && Number(coupon.usageCount || 0) >= Number(coupon.usageLimit)) {
    return { ok: false, error: 'This coupon has reached its usage limit.' };
  }

  const eligible = Math.round(eligibleSubtotal(coupon, pricedItems) * 100) / 100;
  if (eligible <= 0) return { ok: false, error: 'This coupon does not apply to the items in your cart.' };
  if (Number(coupon.minimumOrderValue || 0) > 0 && eligible < Number(coupon.minimumOrderValue)) {
    return { ok: false, error: `This coupon needs a minimum order of ₹${Number(coupon.minimumOrderValue).toLocaleString('en-IN')}.` };
  }

  if (coupon.perCustomerLimit != null && customerKey) {
    try {
      const counter = await db.collection(CUSTOMER_COUNTERS_COLLECTION).doc(`${coupon.id}_${customerKey}`).get();
      const used = counter.exists ? Number(counter.data().count) || 0 : 0;
      if (used >= Number(coupon.perCustomerLimit)) {
        return { ok: false, error: 'You have already used this coupon the maximum number of times.' };
      }
    } catch {
      // Counter unreadable — allow the attempt; the order transaction
      // re-checks limits atomically before anything is written.
    }
  }

  const discountAmount = computeDiscountAmount(coupon, eligible);
  if (discountAmount <= 0) return { ok: false, error: 'This coupon gives no discount on the current cart.' };
  return { ok: true, coupon, discountAmount, eligibleSubtotal: eligible };
}

module.exports = {
  COUPONS_COLLECTION,
  REDEMPTIONS_COLLECTION,
  CUSTOMER_COUNTERS_COLLECTION,
  CODE_MAX_LENGTH,
  DISCOUNT_TYPES,
  normalizeCode,
  isValidCodeShape,
  computeDiscountAmount,
  isInWindow,
  validateCouponInput,
  eligibleSubtotal,
  getCouponByCode,
  validateCouponForCart,
};
