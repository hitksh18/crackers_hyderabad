'use strict';

/**
 * Coupon math + validation tests (pure functions only — no Firebase).
 *
 * Run: node --test tests/coupons.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const coupons = require('../api/lib/coupons');

test('normalizeCode trims, uppercases and collapses spaces', () => {
  assert.equal(coupons.normalizeCode('  mela10 '), 'MELA10');
  assert.equal(coupons.normalizeCode('mela  10'), 'MELA 10');
  assert.equal(coupons.normalizeCode('mela10-copy'), 'MELA10-COPY');
});

test('percentage discount with cap', () => {
  const c = { discountType: 'percentage', discountValue: 10, maximumDiscount: 2000 };
  assert.equal(coupons.computeDiscountAmount(c, 10000), 1000);
  assert.equal(coupons.computeDiscountAmount(c, 50000), 2000);
  assert.equal(coupons.computeDiscountAmount({ discountType: 'percentage', discountValue: 10 }, 999), 99.9);
});

test('percentage over 100 is clamped', () => {
  assert.equal(coupons.computeDiscountAmount({ discountType: 'percentage', discountValue: 150 }, 1000), 1000);
});

test('fixed discount clamps to subtotal', () => {
  assert.equal(coupons.computeDiscountAmount({ discountType: 'fixed', discountValue: 500 }, 10000), 500);
  assert.equal(coupons.computeDiscountAmount({ discountType: 'fixed', discountValue: 500 }, 200), 200);
  assert.equal(coupons.computeDiscountAmount({ discountType: 'fixed', discountValue: -5 }, 200), 0);
});

test('shape validation rejects bad payloads', () => {
  assert.equal(coupons.validateCouponInput({}).ok, false);
  const over = coupons.validateCouponInput({ code: 'X', discountType: 'percentage', discountValue: 150 });
  assert.equal(over.ok, false);
  assert.ok(over.errors.discountValue);
  const badWindow = coupons.validateCouponInput({
    code: 'X', discountType: 'fixed', discountValue: 5,
    startsAt: '2026-10-01T00:00:00Z', expiresAt: '2026-09-01T00:00:00Z',
  });
  assert.equal(badWindow.ok, false);
  const good = coupons.validateCouponInput({
    code: 'mela10', description: '10% off', discountType: 'percentage', discountValue: 10,
    minimumOrderValue: 5001, maximumDiscount: 2000, usageLimit: 100,
    startsAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-31T00:00:00Z', status: 'active',
  });
  assert.equal(good.ok, true);
  assert.equal(good.value.code, 'MELA10');
  assert.equal(good.value.normalizedCode, 'MELA10');
});

test('window checks: future, expired, open', () => {
  const now = new Date('2026-10-09T12:00:00Z').getTime();
  assert.equal(coupons.isInWindow({ startsAt: '2026-10-10T00:00:00Z' }, now).ok, false);
  assert.equal(coupons.isInWindow({ expiresAt: '2026-10-01T00:00:00Z' }, now).ok, false);
  assert.equal(coupons.isInWindow({}, now).ok, true);
});

test('eligible subtotal respects product restrictions', () => {
  const items = [
    { id: 'a', price: 100, quantity: 2, categories: ['Sparkles'] },
    { id: 'b', price: 50, quantity: 1, categories: ['Bombs'] },
  ];
  assert.equal(coupons.eligibleSubtotal({}, items), 250);
  assert.equal(coupons.eligibleSubtotal({ applicableProductIds: ['a'] }, items), 200);
  assert.equal(
    coupons.eligibleSubtotal({ applicableProductIds: [], applicableCategoryIds: ['bombs'] }, items),
    50
  );
  assert.equal(coupons.eligibleSubtotal({ applicableProductIds: ['zzz'] }, items), 0);
});
