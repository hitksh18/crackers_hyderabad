/**
 * Price-list column selectors + section definitions (pure, no imports).
 *
 * These mirror the fallback chains the app already uses everywhere else —
 * nothing here invents a price, it only reads the same fields the canonical
 * consumers read:
 *
 * ONLINE mirrors the storefront (ProductDetail / Products / cart):
 *   original = onlinePrice || price, sale = discountPrice.
 * OFFLINE mirrors the counter register (Billing BillPrintSheet /
 * ProductPickerPanel / Billing unit price):
 *   mrp = offlineMRP || offlinePrice || onlinePrice, sale = offlineDiscountPrice.
 *
 * `formatINR` is display-only: integers render without decimals, genuine
 * paise keep up to 2 trimmed decimals. Values are never rounded or altered.
 */

import { CATEGORY_VALUES, categoryDisplayName, productCategoryValues } from '../config/categories.js';

export const onlineMrpOf = (product) => product?.onlinePrice || product?.price || 0;

export const onlineSaleOf = (product) => product?.discountPrice || null;

export const offlineMrpOf = (product) =>
  product?.offlineMRP || product?.offlinePrice || product?.onlinePrice || product?.price || 0;

export const offlineSaleOf = (product) => product?.offlineDiscountPrice || null;

/* Availability display only — reads the existing stock state, never invents
   one. A product is out of stock only when the catalogue says so; every
   other record (including ones that predate the flag) lists as in stock,
   exactly as the status filter already treats them. */
export const availabilityOf = (product) => (product?.outOfStock ? 'Out of Stock' : 'In Stock');

/* Print-document status wording: the customer-facing catalogue says
   Available / Out of Stock (same flag, catalogue voice). */
export const printStatusOf = (product) => (product?.outOfStock ? 'Out of Stock' : 'Available');

/* Indian currency display only — values are untouched. Integers render
   without decimals (₹1,493); genuine paise keep up to 2 trimmed decimals. */
export const formatINR = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

/**
 * Group products into print catalogue sections, in canonical category order.
 *
 * - Categories come from the existing product data via the canonical helpers
 *   (alias-aware, legacy single-field aware) — never hardcoded here.
 * - A multi-category product appears ONCE, under its first canonical group.
 * - Products with no recognised category collect under 'Uncategorised' last.
 * - Within-group order is the input order, so callers pass the already-sorted
 *   filtered list and the catalogue order is preserved exactly.
 */
const UNCATEGORISED_KEY = '__uncategorised';

const RANK_BY_VALUE = new Map(CATEGORY_VALUES.map((value, i) => [value, i]));

/* First canonical group of a product (its print group and its screen
   separator group alike). Shared so the screen bands and the PDF groups can
   never disagree about which category a row belongs to. */
const bestKeyOf = (product) => {
  let best = null;
  let bestRank = RANK_BY_VALUE.size;
  for (const value of productCategoryValues(product)) {
    const rank = RANK_BY_VALUE.get(value);
    if (rank !== undefined && rank < bestRank) {
      bestRank = rank;
      best = value;
    }
  }
  return best ?? UNCATEGORISED_KEY;
};

const labelOfGroupKey = (key) => (key === UNCATEGORISED_KEY ? 'Uncategorised' : categoryDisplayName(key));

/* Screen separator group for one product: { key, label }. Same rule as the
   print grouping — the band above a row always names the group the PDF
   would file it under. */
export const screenGroupOf = (product) => {
  const key = bestKeyOf(product);
  return { key, label: labelOfGroupKey(key) };
};

export const groupProductsForPrint = (products) => {
  const rankByValue = RANK_BY_VALUE;
  const groups = new Map();
  for (const product of products || []) {
    const key = bestKeyOf(product);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const rankOf = (key) => (key === UNCATEGORISED_KEY ? Number.POSITIVE_INFINITY : rankByValue.get(key));
      return rankOf(a) - rankOf(b);
    })
    .map(([key, items]) => ({
      key,
      label: labelOfGroupKey(key),
      items,
    }));
};

/**
 * The two printed sections. Each owns its branding, logo, table values and
 * print page (footer + forced section break come from the stylesheet).
 * `valueOf` maps a product to its { mrp, sale } pair for the section.
 */
export const PRICE_LIST_SECTIONS = [
  {
    key: 'online',
    brand: 'CRACKERS HYDERABAD',
    title: 'ONLINE STORE PRICE LIST',
    printTitle: 'PRICE LIST',
    subtitle: 'Prices listed from the online store',
    mrpLabel: 'MRP',
    priceLabel: 'ONLINE PRICE',
    logo: '/images/website/crackerhyderabadlogo.png',
    logoAlt: 'Crackers Hyderabad logo',
    fileName: 'Crackers Hyderabad PriceList',
    valueOf: (product) => ({ mrp: onlineMrpOf(product), sale: onlineSaleOf(product) }),
  },
  {
    key: 'offline',
    brand: 'AYYAPA FIREWORKS',
    title: 'OFFLINE STORE PRICE LIST',
    printTitle: 'OFFLINE STORE PRICE LIST',
    subtitle: 'Prices for offline/store sales',
    mrpLabel: 'OFFLINE MRP',
    priceLabel: 'STORE PRICE',
    logo: '/images/website/ayyappa-fireworks-logo.png',
    logoAlt: 'Ayyappa Fireworks logo',
    fileName: 'Ayyappa Fireworks PriceList',
    valueOf: (product) => ({ mrp: offlineMrpOf(product), sale: offlineSaleOf(product) }),
  },
];
