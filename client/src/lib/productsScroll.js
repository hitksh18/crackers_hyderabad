/**
 * Customer Products → Product Details → Back scroll restoration.
 *
 * Temporary navigation state only — sessionStorage, never localStorage, under
 * a Products-specific key so no other page can read or disturb it. The
 * storefront scrolls the window (see ScrollToTop), so window.scrollY is the
 * correct position here.
 *
 * Protocol: ProductCard saves on every product open; the Products page
 * restores once when it mounts via a Back navigation (POP) after the
 * catalogue has rendered, then clears the key. Fresh visits, navbar-link
 * visits (PUSH) and stale saves never restore.
 */

const PRODUCTS_SCROLL_KEY = 'customerProductsScrollPosition';
const PRODUCTS_SCROLL_TTL_MS = 30 * 60 * 1000;

export function saveCustomerProductsScroll() {
  try {
    sessionStorage.setItem(
      PRODUCTS_SCROLL_KEY,
      JSON.stringify({ scrollY: window.scrollY, savedAt: Date.now() })
    );
  } catch {
    /* Storage unavailable (private mode) — skip silently. */
  }
}

export function readCustomerProductsScroll() {
  try {
    const raw = sessionStorage.getItem(PRODUCTS_SCROLL_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      typeof parsed.savedAt === 'number' &&
      Date.now() - parsed.savedAt > PRODUCTS_SCROLL_TTL_MS
    ) {
      sessionStorage.removeItem(PRODUCTS_SCROLL_KEY);
      return null;
    }
    const scrollY = parsed.scrollY;
    return typeof scrollY === 'number' && Number.isFinite(scrollY) && scrollY > 0
      ? { scrollY }
      : null;
  } catch {
    /* Storage unavailable or corrupt — treat as no saved position. */
    return null;
  }
}

export function clearCustomerProductsScroll() {
  try {
    sessionStorage.removeItem(PRODUCTS_SCROLL_KEY);
  } catch {
    /* ignore */
  }
}
