/**
 * Authoritative order-total recalculation — the tests that matter.
 *
 * Run: node --test tests/order-totals.test.js
 *
 * Covers POST /api/admin/orders/:orderId/items' shared math
 * (recalculateOrderTotals in api/lib/orders.js): the subtotal is ALWAYS
 * derived from the CURRENT lines, discounts recompute against the NEW
 * eligible subtotal under the existing coupon rules, and rounding is
 * paise-exact so database, admin, invoice, email and customer page agree.
 */
'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const { recalculateOrderTotals, adminPercentDiscount } = require('../api/lib/orders');
const { computeDiscountAmount } = require('../api/lib/coupons');

const line = (id, price, quantity = 1, extra = {}) => ({ id, name: id, quantity, price, ...extra });
const pctCoupon = (over = {}) => ({
  code: 'DIWALI5', couponId: 'c1', discountType: 'percentage', discountValue: 5,
  maximumDiscount: null, minimumOrderValue: 0, applicableProductIds: [], applicableCategoryIds: [],
  ...over,
});

describe('recalculateOrderTotals', () => {
  test('TEST 1 — subtotal sums EVERY current line (3450 + 500 = 3950)', () => {
    const r = recalculateOrderTotals({
      lines: [line('A', 3450), line('B', 500)],
      coupon: null,
    });
    assert.equal(r.subtotal, 3950);
    assert.equal(r.discount, 0);
    assert.equal(r.total, 3950);
    assert.equal(r.coupon, null);
    assert.equal(r.couponRemoved, null);
  });

  test('TEST 2 — add product changes the persisted subtotal, not just items', () => {
    const before = recalculateOrderTotals({ lines: [line('A', 3450)], coupon: null });
    assert.equal(before.subtotal, 3450);
    const after = recalculateOrderTotals({ lines: [line('A', 3450), line('B', 500)], coupon: null });
    assert.equal(after.subtotal, 3950);
    assert.equal(after.total, 3950);
    assert.equal(after.items.length, 2);
  });

  test('TEST 3 — remove product drops the subtotal back (3950 -> 3450)', () => {
    const r = recalculateOrderTotals({ lines: [line('A', 3450)], coupon: null });
    assert.equal(r.subtotal, 3450);
    assert.equal(r.total, 3450);
  });

  test('TEST 4 — quantity multiplies the line (500 x 2 = 1000)', () => {
    const r = recalculateOrderTotals({ lines: [line('A', 500, 2)], coupon: null });
    assert.equal(r.subtotal, 1000);
    assert.equal(r.total, 1000);
  });

  test('TEST 5 — percentage coupon recomputes on the NEW subtotal (5% of 3950 = 197.50)', () => {
    const before = recalculateOrderTotals({ lines: [line('A', 3450)], coupon: pctCoupon() });
    assert.equal(before.discount, 172.5);
    assert.equal(before.total, 3277.5);
    const after = recalculateOrderTotals({ lines: [line('A', 3450), line('B', 500)], coupon: pctCoupon() });
    assert.equal(after.discount, 197.5);
    assert.equal(after.total, 3752.5);
    assert.equal(after.coupon.discountAmount, 197.5);
    assert.equal(after.coupon.code, 'DIWALI5');
  });

  test('TEST 6 — fixed coupon clamps to the subtotal, maximum cap honoured', () => {
    const capped = recalculateOrderTotals({
      lines: [line('A', 3950)],
      coupon: pctCoupon({ discountType: 'percentage', discountValue: 50, maximumDiscount: 500 }),
    });
    assert.equal(capped.discount, 500);
    assert.equal(capped.total, 3450);
    const fixed = recalculateOrderTotals({
      lines: [line('A', 300)],
      coupon: pctCoupon({ discountType: 'fixed', discountValue: 500 }),
    });
    assert.equal(fixed.discount, 300);
    assert.equal(fixed.total, 0);
  });

  test('TEST 7 — minimum order value drops an ineligible coupon with a reason', () => {
    const r = recalculateOrderTotals({
      lines: [line('A', 300)],
      coupon: pctCoupon({ minimumOrderValue: 1000 }),
    });
    assert.equal(r.discount, 0);
    assert.equal(r.total, 300);
    assert.equal(r.coupon, null);
    assert.equal(r.couponRemoved.code, 'DIWALI5');
    assert.match(r.couponRemoved.reason, /minimum order/);
  });

  test('TEST 8 — product/category restrictions scope the eligible subtotal', () => {
    const restricted = pctCoupon({ discountType: 'fixed', discountValue: 100, applicableProductIds: ['B'] });
    const r = recalculateOrderTotals({
      lines: [line('A', 3450), line('B', 500)],
      coupon: restricted,
    });
    // Only B's 500 is eligible; the fixed 100 survives, clamped to eligibility.
    assert.equal(r.discount, 100);
    assert.equal(r.total, 3850);
    const noneEligible = recalculateOrderTotals({
      lines: [line('A', 3450)],
      coupon: restricted,
    });
    assert.equal(noneEligible.discount, 0);
    assert.equal(noneEligible.couponRemoved.code, 'DIWALI5');
  });

  test('rounding — no floating-point artifacts leak into money fields', () => {
    const r = recalculateOrderTotals({
      lines: [line('A', 199.99, 3)],
      coupon: pctCoupon({ discountValue: 5 }),
    });
    assert.equal(r.subtotal, 599.97);
    assert.equal(r.discount, 30);
    assert.equal(r.total, 569.97);
    for (const n of [r.subtotal, r.discount, r.total]) {
      assert.ok(Number.isFinite(n));
      assert.equal(Math.round(n * 100) / 100, n);
    }
  });

  test('empty/zero-quantity lines never contribute', () => {
    const r = recalculateOrderTotals({
      lines: [line('A', 3450), line('B', 500, 0), { id: '', name: 'ghost', quantity: 1, price: 99 }],
      coupon: null,
    });
    assert.equal(r.subtotal, 3450);
    assert.equal(r.items.length, 1);
  });

  test('TEST B/C — no coupon passed means NO discount, even when one would qualify (never auto-apply)', () => {
    // Order grew 2000 -> 2700 and now clears a 2500 minimum: the math layer
    // still applies nothing. Applying is an explicit admin decision that
    // travels as a coupon CODE to POST /api/admin/orders/:id/coupon.
    const r = recalculateOrderTotals({ lines: [line('A', 2700)], coupon: null });
    assert.equal(r.discount, 0);
    assert.equal(r.total, 2700);
    assert.equal(r.coupon, null);
  });

  test('TEST D — exactly the coupon passed is applied; no selection happens here', () => {
    const five = pctCoupon({ code: 'CHYD5', discountValue: 5 });
    const ten = pctCoupon({ code: 'FESTIVE10', discountValue: 10 });
    const withFive = recalculateOrderTotals({ lines: [line('A', 6000)], coupon: five });
    assert.equal(withFive.discount, 300);
    assert.equal(withFive.coupon.code, 'CHYD5');
    const withTen = recalculateOrderTotals({ lines: [line('A', 6000)], coupon: ten });
    assert.equal(withTen.discount, 600);
    assert.equal(withTen.coupon.code, 'FESTIVE10');
  });

  test('TEST E — a coupon that no longer fits is dropped with a reason, never left active', () => {
    //minimum 5000 against a 2700 order: discount 0, coupon cleared, reason set.
    const r = recalculateOrderTotals({
      lines: [line('A', 2700)],
      coupon: pctCoupon({ minimumOrderValue: 5000 }),
    });
    assert.equal(r.discount, 0);
    assert.equal(r.total, 2700);
    assert.equal(r.coupon, null);
    assert.equal(r.couponRemoved.code, 'DIWALI5');
    assert.match(r.couponRemoved.reason, /minimum order/);
  });
});

describe('admin discount override + custom percent', () => {
  test('TEST 1 — override math ignores the minimum: 10% of 4500 = 450, total 4050', () => {
    // The override path skips validateCouponForCart and uses the existing
    // amount math directly — same function checkout uses.
    const amount = computeDiscountAmount(
      { discountType: 'percentage', discountValue: 10 },
      4500
    );
    assert.equal(amount, 450);
    assert.equal(Math.max(0, 4500 - amount), 4050);
  });

  test('TEST 2 — 10% of 5500 = 550, total 4950', () => {
    const r = recalculateOrderTotals({
      lines: [line('A', 5500)],
      coupon: pctCoupon({ code: 'CHYD10', discountValue: 10 }),
    });
    assert.equal(r.discount, 550);
    assert.equal(r.total, 4950);
    assert.equal(r.coupon.code, 'CHYD10');
  });

  test('TEST 3 — custom 15% of 10000 = 1500, total 8500', () => {
    const r = adminPercentDiscount(10000, 15);
    assert.equal(r.ok, true);
    assert.equal(r.percent, 15);
    assert.equal(r.discount, 1500);
    assert.equal(r.total, 8500);
  });

  test('TEST 3b — custom 10% of 11200 = 1120, total 10080', () => {
    const r = adminPercentDiscount(11200, 10);
    assert.equal(r.ok, true);
    assert.equal(r.discount, 1120);
    assert.equal(r.total, 10080);
  });

  test('custom percent validation: 0 rejected, >100 rejected, non-numeric rejected', () => {
    assert.equal(adminPercentDiscount(5000, 0).ok, false);
    assert.match(adminPercentDiscount(5000, 0).error, /Remove discount/);
    assert.equal(adminPercentDiscount(5000, 101).ok, false);
    assert.equal(adminPercentDiscount(5000, 'abc').ok, false);
    assert.equal(adminPercentDiscount(5000, -5).ok, false);
  });

  test('custom percent edge cases: 100% zeroes the total, never negative', () => {
    const full = adminPercentDiscount(3450, 100);
    assert.equal(full.ok, true);
    assert.equal(full.discount, 3450);
    assert.equal(full.total, 0);
  });

  test('custom percent rounding is paise-exact', () => {
    const r = adminPercentDiscount(999, 15);
    assert.equal(r.ok, true);
    assert.equal(r.discount, 149.85);
    assert.equal(r.total, 849.15);
  });

  test('TEST 4/23 — replacement is structural: one coupon field means no stacking', () => {
    // The order document carries a single `coupon` snapshot; applying CHYD10
    // after CHYD5 overwrites it. At the math layer this is just "the passed
    // coupon is the only one applied".
    const r = recalculateOrderTotals({
      lines: [line('A', 6000)],
      coupon: pctCoupon({ code: 'CHYD10', discountValue: 10 }),
    });
    assert.equal(r.discount, 600);
    assert.equal(r.coupon.code, 'CHYD10');
    assert.equal(Object.keys(r.coupon).includes('secondCoupon'), false);
  });

  test('TEST 5 — removing means coupon null: discount 0, total equals subtotal', () => {
    const r = recalculateOrderTotals({ lines: [line('A', 3450), line('B', 500)], coupon: null });
    assert.equal(r.discount, 0);
    assert.equal(r.total, 3950);
    assert.equal(r.coupon, null);
  });
});
