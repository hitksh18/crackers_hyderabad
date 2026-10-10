/**
 * Google Analytics 4 — the storefront's single GA4 setup.
 *
 * One script tag (client/index.html loader), one `gtag('config')` issued
 * exactly once from initGA4() below using VITE_GA_MEASUREMENT_ID. Related
 * pieces, all untouched by the measurement-ID change:
 * - lib/analytics.js `trackGaPageview` fires manual page_view on SPA route
 *   changes (that call fans out to the configured property on its own).
 * - utils/siteTracker.js posts first-party pageviews/funnel to /api/site/*.
 *
 * This module also sends the standard ecommerce events. gtag.js is already
 * on the page, so no second script tag exists or is needed.
 *
 * Safety rules:
 * - No measurement id -> every export is a silent no-op. The shop works
 *   exactly as before, custom analytics included.
 * - No `window.gtag` (blocked/failed library) -> silent no-op.
 * - Nothing here ever throws into calling code.
 * - Never pass PII: only catalogue fields (id/name/category/brand/price/qty),
 *   totals, currency and the server-minted order id as transaction_id.
 */

const MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();

const DEBUG =
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

const CURRENCY = 'INR';

/* Short-window dedupe for render-driven call sites (StrictMode double
   effects, remounts). Key -> epoch ms of the last accepted send. A human
   cannot repeat the same action inside the window; a duplicate React effect
   always lands inside it. */
const recentSends = new Map();
const DEDUPE_WINDOW_MS = 5000;
const MAX_TRACKED_KEYS = 200;

const hitRecently = (key) => {
  const now = Date.now();
  const last = recentSends.get(key);
  if (last != null && now - last < DEDUPE_WINDOW_MS) return true;
  recentSends.set(key, now);
  if (recentSends.size > MAX_TRACKED_KEYS) {
    const oldest = recentSends.keys().next().value;
    recentSends.delete(oldest);
  }
  return false;
};

/* Purchase dedupe is permanent per order id: the confirmation page may be
   refreshed, and a retried order request mints a NEW id (tracked separately).
   sessionStorage survives refreshes; the in-memory set covers same-tick
   double calls when storage is unavailable. */
const purchaseSentMemory = new Set();
const purchaseKeyOf = (transactionId) => `ga4_purchase_${transactionId}`;

const purchaseAlreadySent = (transactionId) => {
  if (purchaseSentMemory.has(transactionId)) return true;
  try {
    if (sessionStorage.getItem(purchaseKeyOf(transactionId))) {
      purchaseSentMemory.add(transactionId);
      return true;
    }
  } catch {
    /* Storage blocked — memory set is the fallback. */
  }
  return false;
};

const markPurchaseSent = (transactionId) => {
  purchaseSentMemory.add(transactionId);
  try {
    sessionStorage.setItem(purchaseKeyOf(transactionId), '1');
  } catch {
    /* Storage blocked — memory set still guards this tab's lifetime. */
  }
};

let configured = false;

/**
 * Register the GA4 property exactly once. Safe to call on every mount:
 * re-entry is a no-op. The gtag stub in index.html queues the command if
 * the library is still downloading.
 */
export const initGA4 = () => {
  if (configured || !MEASUREMENT_ID) return false;
  /* Mark first: the id present means "enabled intent". The config call is
     attempted when the stub exists (it is inline in index.html, so it
     normally does); if the library is still downloading, the stub queues it.
     Every send re-checks window.gtag, so a blocked library degrades to
     silent no-ops instead of breaking the shop. */
  configured = true;
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('config', MEASUREMENT_ID);
      if (DEBUG) console.debug('[ga4] configured', MEASUREMENT_ID);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const isGA4Enabled = () => Boolean(MEASUREMENT_ID) && configured;

const sendEvent = (name, params) => {
  if (!MEASUREMENT_ID || !configured) return false;
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return false;
    window.gtag('event', name, params);
    if (DEBUG) console.debug(`[ga4] ${name}`, params);
    return true;
  } catch {
    return false;
  }
};

const numberOf = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const unitPriceOf = (product) =>
  numberOf(
    product?.discountPrice ?? product?.onlinePrice ?? product?.price ?? 0,
  );

/**
 * Map the shop's product shape to a GA4 item. Only catalogue fields —
 * never customer data. Missing fields are omitted, never invented.
 */
export const toGAItem = (product, quantity = 1) => {
  const item = {
    item_id: String(product?.id ?? ''),
    item_name: String(product?.name ?? 'Item').slice(0, 100),
    price: Math.round(numberOf(unitPriceOf(product)) * 100) / 100,
    quantity: Math.max(1, Math.floor(numberOf(quantity)) || 1),
  };
  const categories = Array.isArray(product?.categories)
    ? product.categories.filter(Boolean).map(String)
    : [];
  const firstCategory = categories[0] || (product?.category ? String(product.category) : '');
  if (firstCategory) item.item_category = firstCategory.slice(0, 100);
  if (categories[1]) item.item_category2 = String(categories[1]).slice(0, 100);
  const brand =
    typeof product?.brand === 'string' ? product.brand : product?.brand?.name;
  if (brand) item.item_brand = String(brand).slice(0, 100);
  return item;
};

const itemsValue = (items) =>
  Math.round(
    items.reduce((sum, it) => sum + numberOf(it.price) * numberOf(it.quantity), 0) * 100,
  ) / 100;

/** Customer actually opened a product detail page (call once per product). */
export const trackViewItem = (product) => {
  if (!product?.id) return false;
  if (hitRecently(`view_item:${product.id}`)) return false;
  const item = toGAItem(product, 1);
  return sendEvent('view_item', {
    currency: CURRENCY,
    value: item.price,
    items: [item],
  });
};

/** Customer submitted a real search (navbar/mobile search -> ?q=). */
export const trackSearch = (searchTerm) => {
  const term = String(searchTerm || '').trim().slice(0, 100);
  if (!term) return false;
  if (hitRecently(`search:${term.toLowerCase()}`)) return false;
  return sendEvent('search', { search_term: term });
};

/** One successful add-to-cart user action (called from CartContext). */
export const trackAddToCart = (product, quantity = 1) => {
  if (!product?.id) return false;
  const item = toGAItem(product, quantity);
  return sendEvent('add_to_cart', {
    currency: CURRENCY,
    value: itemsValue([item]),
    items: [item],
  });
};

/** One successful remove-from-cart user action (called from CartContext). */
export const trackRemoveFromCart = (product, quantity = 1) => {
  if (!product?.id) return false;
  const item = toGAItem(product, quantity);
  return sendEvent('remove_from_cart', {
    currency: CURRENCY,
    value: itemsValue([item]),
    items: [item],
  });
};

/** Customer opened the cart page with items in it (call once per visit). */
export const trackViewCart = (cartItems) => {
  const list = Array.isArray(cartItems) ? cartItems : [];
  if (list.length === 0) return false;
  if (hitRecently('view_cart')) return false;
  const items = list.map((it) => toGAItem(it, it.quantity));
  return sendEvent('view_cart', {
    currency: CURRENCY,
    value: itemsValue(items),
    items,
  });
};

/** Customer passed checkout validation and reached the review step. */
export const trackBeginCheckout = (cartItems, total) => {
  const list = Array.isArray(cartItems) ? cartItems : [];
  if (list.length === 0) return false;
  if (hitRecently('begin_checkout')) return false;
  const items = list.map((it) => toGAItem(it, it.quantity));
  return sendEvent('begin_checkout', {
    currency: CURRENCY,
    value: Math.round(numberOf(total) * 100) / 100,
    items,
  });
};

/**
 * Fire ONCE per successfully created order, from the order-creation success
 * path (NOT from the order-success page, which can be refreshed). Same
 * transaction_id never sends twice: sessionStorage + in-memory guard.
 */
export const trackPurchase = ({ transactionId, value, items }) => {
  const id = String(transactionId || '').trim();
  if (!id) return false;
  if (purchaseAlreadySent(id)) return false;
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return false;
  const sent = sendEvent('purchase', {
    transaction_id: id,
    currency: CURRENCY,
    value: Math.round(numberOf(value) * 100) / 100,
    items: list,
  });
  /* Mark before/after alike: a failed dispatch must not retry-loopsend on a
     later render, and GA4 itself dedupes server-side by transaction_id. */
  markPurchaseSent(id);
  return sent;
};
