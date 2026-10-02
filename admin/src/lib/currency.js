/**
 * Single source of truth for rupee formatting across the storefront.
 * Keeps ProductCard, ProductDetail, Cart and Checkout rendering the same
 * value identically. Formatting only — never derive or adjust the amount here.
 *
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export const inr = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
